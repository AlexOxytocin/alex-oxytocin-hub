#!/usr/bin/env node
import { constants as fsConstants, copyFile, cp, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = '/opt/app/frontend';
const SOURCE_RELEASES = resolve(FRONTEND_ROOT, 'sites/releases');
const SOURCE_CURRENT = resolve(FRONTEND_ROOT, 'sites/current');
const REFERENCE_ROOT = resolve(FRONTEND_ROOT, 'legacy-reference');
const REFERENCE_RELEASES = resolve(REFERENCE_ROOT, 'releases');
const REFERENCE_BACKUPS = resolve(REFERENCE_ROOT, 'backups');
const NGINX_DEFAULT = '/opt/app/nginx/conf.d/default.conf';
const NGINX_CONTAINER = 'nginx';
const PUBLIC_NAMESPACE = '/__legacy-reference';
const releaseIdPattern = /^\d{8}-\d{6}-[a-z0-9][a-z0-9._-]{2,95}$/u;
const requiredFiles = ['hub/index.html', 'cv/index.html', 'cv/showcase/index.html', 'ai/index.html', 'allo/index.html'];

function command(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${program} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return (result.stdout ?? '').trim();
}

export function parseArgs(argv) {
  const options = { action: argv[0] ?? 'preflight', apply: false };
  for (let index = argv[0] ? 1 : 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (['--release-id', '--source-release-id', '--confirm'].includes(arg)) {
      const value = argv[++index];
      if (!value) throw new Error(`${arg} requires a value`);
      options[arg.slice(2).replaceAll('-', '')] = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['preflight', 'deploy', 'rollback'].includes(options.action)) throw new Error(`Unknown action: ${options.action}`);
  if (options.action !== 'preflight' && !options.apply) throw new Error(`${options.action} requires --apply`);
  return options;
}

export function validateReleaseId(value, label = 'release id') {
  if (!releaseIdPattern.test(value ?? '')) throw new Error(`A valid ${label} is required`);
  return value;
}

function directChild(root, value, label) {
  const id = validateReleaseId(value, label);
  const pathname = resolve(root, id);
  if (relative(root, pathname) !== id || basename(pathname) !== id) throw new Error(`${label} escaped its root`);
  return pathname;
}

function sourcePath(sourceReleaseId) { return directChild(SOURCE_RELEASES, sourceReleaseId, 'source release id'); }
function releasePath(releaseId) { return directChild(REFERENCE_RELEASES, releaseId, 'reference release id'); }
function backupPath(releaseId) { return resolve(directChild(REFERENCE_BACKUPS, releaseId, 'reference release id'), 'default.conf.before'); }

export function publicPrefix(releaseId) { return `${PUBLIC_NAMESPACE}/${validateReleaseId(releaseId)}`; }

async function exists(pathname) {
  try { await lstat(pathname); return true; }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}

async function assertRegularFile(pathname, label) {
  const item = await lstat(pathname);
  if (!item.isFile() || item.isSymbolicLink()) throw new Error(`${label} must be a regular file: ${pathname}`);
}

async function sha256(pathname) { return createHash('sha256').update(await readFile(pathname)).digest('hex'); }

async function walk(directory, base = directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const pathname = resolve(directory, item.name);
    const relativePath = relative(base, pathname).split(sep).join('/');
    if (item.isSymbolicLink()) throw new Error(`Snapshot contains a symlink: ${relativePath}`);
    if (item.isDirectory()) files.push(...await walk(pathname, base));
    else if (item.isFile()) files.push(relativePath);
    else throw new Error(`Unsupported snapshot entry: ${relativePath}`);
  }
  return files.sort();
}

async function inventory(directory) {
  const entries = [];
  for (const path of await walk(directory)) {
    const pathname = resolve(directory, path);
    const item = await stat(pathname);
    entries.push({ path, bytes: item.size, sha256: await sha256(pathname) });
  }
  return { fileCount: entries.length, entries };
}

function rewriteKnownAbsoluteUrl(value, prefix) {
  let url;
  try { url = new URL(value); } catch { return value; }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') return url.toString();
  const tail = `${url.pathname}${url.search}${url.hash}`;
  if (['godmodetools.com', 'www.godmodetools.com'].includes(url.hostname)) return `${prefix}/home${tail}`;
  if (url.hostname === 'cv.godmodetools.com') {
    if (url.pathname === '/showcase' || url.pathname.startsWith('/showcase/')) {
      const remainder = url.pathname.slice('/showcase'.length) || '/';
      return `${prefix}/projects${remainder}${url.search}${url.hash}`;
    }
    return `${prefix}/experience${tail}`;
  }
  if (url.hostname === 'ai.godmodetools.com') return `${prefix}/learning${tail}`;
  if (url.hostname === 'allo.godmodetools.com') return `${prefix}/community${tail}`;
  return url.toString();
}

export function rewriteReferenceUrl(value, { releaseId, surface }) {
  const prefix = publicPrefix(releaseId);
  if (!value || value.startsWith('#') || value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('tel:')) return value;
  if (/^https?:\/\//iu.test(value)) return rewriteKnownAbsoluteUrl(value, prefix);
  if (!value.startsWith('/') || value.startsWith('//')) return value;
  if (surface === 'experience' || surface === 'projects') {
    if (value === '/showcase' || value.startsWith('/showcase/')) return `${prefix}/projects${value.slice('/showcase'.length) || '/'}`;
    return `${prefix}/experience${value}`;
  }
  return `${prefix}/${surface}${value}`;
}

export function rewriteLegacyHtml(content, { releaseId, surface }) {
  let output = content
    .replace(/<link\b(?=[^>]*\brel\s*=\s*["'][^"']*\bcanonical\b[^"']*["'])[^>]*>\s*/giu, '')
    .replace(/<meta\b(?=[^>]*\b(?:property|name)\s*=\s*["']og:url["'])[^>]*>\s*/giu, '');
  output = output.replace(/\b(href|src|action|poster)\s*=\s*("([^"]*)"|'([^']*)')/giu, (match, attribute, quoted, doubleValue, singleValue) => {
    const quote = quoted[0];
    return `${attribute}=${quote}${rewriteReferenceUrl(doubleValue ?? singleValue ?? '', { releaseId, surface })}${quote}`;
  });
  const robots = '<meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex">';
  if (!/<\/head>/iu.test(output)) throw new Error(`Legacy HTML has no closing head element: ${surface}`);
  return output.replace(/<\/head>/iu, `  ${robots}\n</head>`);
}

function rewriteCss(content, options) {
  return content.replace(/url\(\s*(["']?)([^)'"\s]+)\1\s*\)/giu, (match, quote, value) => `url(${quote}${rewriteReferenceUrl(value, options)}${quote})`);
}

function assertNoExternalHttp(content, path) {
  if (/\b(?:href|src|action|poster)\s*=\s*["']http:\/\//iu.test(content) || /url\(\s*["']?http:\/\//iu.test(content)) throw new Error(`External HTTP reference survived in ${path}`);
}

async function transformTree(directory, releaseId, surface) {
  for (const path of await walk(directory)) {
    const extension = path.toLowerCase().split('.').pop();
    if (!['html', 'css'].includes(extension)) continue;
    const pathname = resolve(directory, path);
    let content = await readFile(pathname, 'utf8');
    if (extension === 'html') content = rewriteLegacyHtml(content, { releaseId, surface });
    if (extension === 'css') content = rewriteCss(content, { releaseId, surface });
    assertNoExternalHttp(content, path);
    await writeFile(pathname, content);
  }
}

export async function createPublicTree(source, publicRoot, releaseId) {
  const routeRoot = resolve(publicRoot, PUBLIC_NAMESPACE.slice(1), releaseId);
  await mkdir(routeRoot, { recursive: true });
  for (const [tree, surface] of [['hub', 'home'], ['cv', 'experience'], ['cv/showcase', 'projects'], ['ai', 'learning'], ['allo', 'community']]) {
    const destination = resolve(routeRoot, surface);
    await cp(resolve(source, tree), destination, { recursive: true, force: false, errorOnExist: true });
    await transformTree(destination, releaseId, surface);
  }
  await writeFile(resolve(routeRoot, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  return routeRoot;
}

export function renderLocationInclude(releaseId) {
  const id = validateReleaseId(releaseId);
  const prefix = publicPrefix(id);
  const root = `/usr/share/nginx/html/legacy-reference/releases/${id}/public`;
  return `    # Temporary frozen legacy visual reference: ${id}\n`
    + `    location = ${prefix} { return 308 $scheme://$host$request_uri/; }\n\n`
    + `    location ^~ ${prefix}/ {\n`
    + `        root ${root};\n`
    + '        index index.html;\n'
    + '        try_files $uri $uri/ $uri/index.html =404;\n'
    + '        add_header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet, noimageindex" always;\n'
    + '        add_header Cache-Control "no-store" always;\n'
    + '        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n'
    + '    }\n\n'
    + `    location ^~ ${PUBLIC_NAMESPACE}/ {\n`
    + '        add_header X-Robots-Tag "noindex, nofollow" always;\n'
    + '        return 404;\n'
    + '    }\n';
}

export function injectReferenceInclude(currentConfig, releaseId) {
  if (currentConfig.includes(PUBLIC_NAMESPACE)) throw new Error('default.conf already contains a legacy reference location');
  const anchor = '    root /usr/share/nginx/html/sites/current/hub;\n    index index.html;\n';
  if (currentConfig.split(anchor).length !== 2) throw new Error('Exact apex HTTPS insertion anchor changed');
  return currentConfig.replace(anchor, `${anchor}\n${renderLocationInclude(releaseId)}\n`);
}

async function preflight(options) {
  const releaseId = validateReleaseId(options.releaseid, 'reference release id');
  const sourceReleaseId = validateReleaseId(options.sourcereleaseid, 'source release id');
  const source = sourcePath(sourceReleaseId);
  const current = await lstat(SOURCE_CURRENT);
  if (!current.isSymbolicLink() || await realpath(SOURCE_CURRENT) !== await realpath(source)) throw new Error('sites/current no longer points to the requested legacy release');
  for (const path of requiredFiles) await assertRegularFile(resolve(source, path), path);
  await assertRegularFile(NGINX_DEFAULT, 'default.conf');
  command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-t']);
  const config = await readFile(NGINX_DEFAULT, 'utf8');
  return { schema: 'legacy-reference.preflight.v1', result: 'pass', releaseId, sourceReleaseId, sourceTarget: await realpath(source), nginxSha256: await sha256(NGINX_DEFAULT), referencePresent: await exists(releasePath(releaseId)), configAlreadyActive: config.includes(publicPrefix(releaseId)) };
}

async function copyAtomic(source, destination) {
  const temporary = `${destination}.tmp-${process.pid}`;
  await copyFile(source, temporary, fsConstants.COPYFILE_EXCL);
  await rename(temporary, destination);
}

function directProbe(url) {
  const parsed = new URL(url);
  return Number(command('curl', ['-ksS', '--resolve', `${parsed.hostname}:443:127.0.0.1`, '-o', '/dev/null', '-w', '%{http_code}', url]));
}

async function deploy(options) {
  const releaseId = validateReleaseId(options.releaseid, 'reference release id');
  const sourceReleaseId = validateReleaseId(options.sourcereleaseid, 'source release id');
  if (options.confirm !== `DEPLOY-${releaseId}`) throw new Error('deploy requires --confirm DEPLOY-<release-id>');
  const before = await preflight(options);
  if (before.referencePresent || before.configAlreadyActive) throw new Error('Reference path or Nginx location already exists');
  const final = releasePath(releaseId);
  const temporary = resolve(REFERENCE_RELEASES, `.prepare-${releaseId}-${process.pid}`);
  const backup = backupPath(releaseId);
  if (await exists(temporary) || await exists(backup)) throw new Error('Temporary path or backup already exists');
  await mkdir(REFERENCE_RELEASES, { recursive: true });
  await mkdir(temporary);
  try {
    const routeRoot = await createPublicTree(sourcePath(sourceReleaseId), resolve(temporary, 'public'), releaseId);
    const publicInventory = await inventory(routeRoot);
    const manifest = { schema: 'legacy-reference.release.v1', releaseId, sourceReleaseId, publicOrigin: 'https://godmodetools.com', publicPrefix: publicPrefix(releaseId), routes: ['home', 'experience', 'projects', 'learning', 'community'].map((surface) => `${publicPrefix(releaseId)}/${surface}/`), createdAtUtc: new Date().toISOString(), public: publicInventory };
    await writeFile(resolve(temporary, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(resolve(temporary, 'default.conf.candidate'), injectReferenceInclude(await readFile(NGINX_DEFAULT, 'utf8'), releaseId));
    await rename(temporary, final);

    command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-t']);
    await mkdir(resolve(REFERENCE_BACKUPS, releaseId), { recursive: true });
    await copyFile(NGINX_DEFAULT, backup, fsConstants.COPYFILE_EXCL);
    await copyAtomic(resolve(final, 'default.conf.candidate'), NGINX_DEFAULT);
    try {
      command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-t']);
      command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-s', 'reload']);
      const probes = manifest.routes.map((path) => ({ url: `${manifest.publicOrigin}${path}`, status: directProbe(`${manifest.publicOrigin}${path}`) }));
      if (probes.some(({ status }) => status !== 200)) throw new Error(`Reference probe failed: ${JSON.stringify(probes)}`);
      return { ...before, mode: 'deploy', result: 'pass', backup, probes, manifest: resolve(final, 'release-manifest.json') };
    } catch (error) {
      await copyAtomic(backup, NGINX_DEFAULT);
      command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-t']);
      command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-s', 'reload']);
      throw error;
    }
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function rollback(options) {
  const releaseId = validateReleaseId(options.releaseid, 'reference release id');
  if (options.confirm !== `ROLLBACK-${releaseId}`) throw new Error('rollback requires --confirm ROLLBACK-<release-id>');
  const backup = backupPath(releaseId);
  await assertRegularFile(backup, 'default.conf backup');
  command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-t']);
  await copyAtomic(backup, NGINX_DEFAULT);
  command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-t']);
  command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-s', 'reload']);
  await rm(releasePath(releaseId), { recursive: true, force: true });
  return { schema: 'legacy-reference.rollback.v1', result: 'pass', releaseId, restoredSha256: await sha256(NGINX_DEFAULT), snapshotRemoved: true };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = await ({ preflight, deploy, rollback })[options.action](options);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
