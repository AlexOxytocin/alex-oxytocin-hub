import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const distRoot = resolve(root, 'dist');
const releaseRoot = resolve(root, 'release');
const releaseIdPattern = /^\d{8}-\d{6}-[a-z0-9][a-z0-9._-]{2,63}$/u;
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.map', '.svg', '.txt', '.webmanifest', '.xml']);
const forbiddenOrigin = /https?:\/\/(?:localhost|127\.0\.0\.1|(?:[a-z0-9-]+\.)*[a-z0-9-]*workers\.dev|(?:[a-z0-9-]+\.)*(?:stage|staging)[a-z0-9-]*\.[a-z0-9.-]+)/iu;
const forbiddenRuntimePath = /(?:\/opt\/app\/|\/usr\/share\/nginx\/html\/sites\/|sites\/(?:hub|allo|ai|cv)\/)/iu;
const publishedLocales = ['ru', 'en'];
const shellSections = ['', 'experience', 'projects', 'learning', 'community'];
const expectedHtmlCount = 1 + (publishedLocales.length * shellSections.length);

const requiredSiteFiles = [
  '404.html',
  'robots.txt',
  'sitemap.xml',
  ...publishedLocales.flatMap((locale) => shellSections.map((section) => (
    section ? `${locale}/${section}/index.html` : `${locale}/index.html`
  ))),
  ...publishedLocales.flatMap((locale) => ['pdf', 'docx', 'txt'].flatMap((extension) => [
    `${locale}/experience/downloads/resume_${locale}.${extension}`,
    `${locale}/experience/java/downloads/resume_${locale}_java.${extension}`,
  ])),
];

function toPosix(pathname) {
  return pathname.split(sep).join('/');
}

export function validateReleaseId(value) {
  if (!releaseIdPattern.test(value ?? '')) {
    throw new Error('Release id must match YYYYMMDD-HHMMSS-<lowercase-label>');
  }
  return value;
}

export function isContained(parent, candidate) {
  const pathFromParent = relative(resolve(parent), resolve(candidate));
  return pathFromParent !== '' && pathFromParent !== '..' && !pathFromParent.startsWith(`..${sep}`) && !isAbsolute(pathFromParent);
}

async function hashFile(pathname) {
  return createHash('sha256').update(await readFile(pathname)).digest('hex');
}

async function walkFiles(directory, base = directory) {
  const entries = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const pathname = resolve(directory, item.name);
    const relativePath = toPosix(relative(base, pathname));
    if (item.isSymbolicLink()) throw new Error(`Symlinks are forbidden in release payloads: ${relativePath}`);
    if (item.isDirectory()) entries.push(...await walkFiles(pathname, base));
    else if (item.isFile()) entries.push({ pathname, relativePath });
    else throw new Error(`Unsupported release payload entry: ${relativePath}`);
  }
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function extension(pathname) {
  const match = /(?:^|\/)[^/]+(\.[^.\/]+)$/u.exec(pathname);
  return match?.[1].toLowerCase() ?? '';
}

async function assertRegularFile(pathname, label) {
  const stat = await lstat(pathname);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file: ${pathname}`);
}

export async function inspectSite(siteRoot = distRoot) {
  const rootStat = await lstat(siteRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error(`Site root must be a real directory: ${siteRoot}`);
  try {
    await access(resolve(siteRoot, 'index.html'));
    throw new Error('dist/index.html must stay absent; Nginx owns the locale-root redirect');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  for (const required of requiredSiteFiles) await assertRegularFile(resolve(siteRoot, required), `Required site file ${required}`);

  const files = await walkFiles(siteRoot);
  const records = [];
  let bytes = 0;
  let html = 0;
  for (const file of files) {
    const stat = await lstat(file.pathname);
    bytes += stat.size;
    if (file.relativePath.endsWith('.html')) html += 1;
    if (textExtensions.has(extension(file.relativePath))) {
      const content = await readFile(file.pathname, 'utf8');
      if (forbiddenOrigin.test(content)) throw new Error(`Technical origin leaked into ${file.relativePath}`);
      if (forbiddenRuntimePath.test(content)) throw new Error(`Legacy runtime path leaked into ${file.relativePath}`);
    }
    records.push({ path: file.relativePath, bytes: stat.size, sha256: await hashFile(file.pathname) });
  }

  if (html !== expectedHtmlCount) {
    throw new Error(`Site HTML contract mismatch: expected ${expectedHtmlCount}, found ${html}`);
  }
  return { files: records, fileCount: files.length, htmlCount: html, bytes };
}

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

function assertImmutableSourceState() {
  const staged = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: root, stdio: 'ignore' });
  if (staged.status !== 0) throw new Error('Refusing to prepare an immutable release with staged changes');
  const status = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
  if (status.status !== 0) throw new Error(status.stderr.trim() || 'git status failed');
  const dirty = (status.stdout ?? '').replace(/\r?\n$/u, '');
  const generatedOutput = /^(?: [MD]|\?\?) public\/downloads\/resume_(?:en|ru)(?:_java)?\.(?:docx|txt)$/u;
  const unexpectedDirty = dirty.split(/\r?\n/u).filter(Boolean).filter((line) => !generatedOutput.test(line));
  if (unexpectedDirty.length > 0) throw new Error(`Refusing to prepare an immutable release from a dirty Git worktree: ${unexpectedDirty.join(', ')}`);
}

async function runFreshBuild(expectedCommit) {
  assertImmutableSourceState();
  await rm(distRoot, { recursive: true, force: true });
  const buildCommand = process.platform === 'win32'
    ? { program: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', 'npm run build'] }
    : { program: 'npm', args: ['run', 'build'] };
  const result = spawnSync(buildCommand.program, buildCommand.args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm run build failed with ${result.status}`);
  if (git(['rev-parse', 'HEAD']) !== expectedCommit) throw new Error('Git HEAD changed while building the release');
  assertImmutableSourceState();
}

function defaultReleaseId(commit) {
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace('T', '-').slice(0, 15);
  return `${stamp}-${commit.slice(0, 12)}`;
}

function parseArgs(argv) {
  const options = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--release-id') options.releaseId = argv[++index];
    else if (arg === '--confirm') options.confirm = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function sourcePayload(site) {
  const sources = [
    { source: distRoot, target: 'site' },
    { source: resolve(root, 'infra/nginx/default.conf'), target: 'nginx/default.conf' },
    { source: resolve(root, 'infra/nginx/conf.d/_includes'), target: 'nginx/_includes' },
    { source: resolve(root, 'infra/release/god9-host.mjs'), target: 'ops/god9-host.mjs' },
    { source: resolve(root, 'infra/release/god9-cleanup.mjs'), target: 'ops/god9-cleanup.mjs' },
  ];
  for (const { source } of sources) await access(source);
  return { site, sources };
}

async function createArtifact(releaseId, commit, payload) {
  const finalDirectory = resolve(releaseRoot, releaseId);
  const temporaryDirectory = resolve(releaseRoot, `.${releaseId}.tmp`);
  if (!isContained(releaseRoot, finalDirectory) || !isContained(releaseRoot, temporaryDirectory)) throw new Error('Release path escaped repository release root');
  await mkdir(releaseRoot, { recursive: true });
  for (const pathname of [finalDirectory, temporaryDirectory]) {
    try {
      await access(pathname);
      throw new Error(`Refusing to overwrite existing release path: ${pathname}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  try {
    await mkdir(temporaryDirectory, { recursive: false });
    for (const { source, target } of payload.sources) {
      const destination = resolve(temporaryDirectory, target);
      if (!isContained(temporaryDirectory, destination)) throw new Error(`Artifact target escaped: ${target}`);
      await mkdir(dirname(destination), { recursive: true });
      await cp(source, destination, { recursive: true, errorOnExist: true, force: false });
    }

    const payloadFiles = await walkFiles(temporaryDirectory);
    const records = [];
    for (const file of payloadFiles) {
      const stat = await lstat(file.pathname);
      records.push({ path: file.relativePath, bytes: stat.size, sha256: await hashFile(file.pathname) });
    }
    const manifest = {
      schema: 'god9.release.v1',
      releaseId,
      gitCommit: commit,
      createdAtUtc: new Date().toISOString(),
      site: {
        fileCount: payload.site.fileCount,
        htmlCount: payload.site.htmlCount,
        bytes: payload.site.bytes,
      },
      payload: records,
    };
    const manifestPath = resolve(temporaryDirectory, 'release-manifest.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    const checksums = [...records, {
      path: 'release-manifest.json',
      sha256: await hashFile(manifestPath),
    }].map(({ sha256, path }) => `${sha256}  ${path}`).join('\n');
    await writeFile(resolve(temporaryDirectory, 'SHA256SUMS'), `${checksums}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryDirectory, finalDirectory);
    return { finalDirectory, manifestSha256: await hashFile(resolve(finalDirectory, 'release-manifest.json')) };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const commit = git(['rev-parse', 'HEAD']);
  const releaseId = validateReleaseId(options.releaseId ?? defaultReleaseId(commit));
  if (options.apply && options.confirm !== releaseId) throw new Error('Apply requires --confirm exactly matching --release-id');
  if (options.apply) await runFreshBuild(commit);
  const site = await inspectSite();
  const payload = await sourcePayload(site);
  const summary = {
    mode: options.apply ? 'apply' : 'plan',
    releaseId,
    gitCommit: commit,
    site: { fileCount: site.fileCount, htmlCount: site.htmlCount, bytes: site.bytes },
    target: toPosix(relative(root, resolve(releaseRoot, releaseId))),
  };

  if (!options.apply) {
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }
  const artifact = await createArtifact(releaseId, commit, payload);
  const result = { ...summary, ...artifact };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`GOD-9 release preparation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
