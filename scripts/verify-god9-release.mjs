import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const inventory = JSON.parse(await readFile(resolve(root, 'docs/url-migration-inventory.json'), 'utf8'));
const releaseIdPattern = /^\d{8}-\d{6}-[a-z0-9][a-z0-9._-]{2,63}$/u;
const browserScripts = [
  'tests/design-browser.mjs',
  'tests/content-browser.mjs',
  'tests/performance-browser.mjs',
  'tests/god7-browser-contract.mjs',
];

function validatePort(value, flag) {
  if (value !== undefined && (!/^\d+$/u.test(value) || Number(value) < 1 || Number(value) > 65535)) throw new Error(`Invalid ${flag}`);
}

export function parseArgs(argv) {
  const options = { phase: 'staging', browser: false, insecure: false, signedlocalperformance: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--browser') options.browser = true;
    else if (arg === '--insecure') options.insecure = true;
    else if (arg === '--signed-local-performance') options.signedlocalperformance = true;
    else if (['--phase', '--release-id', '--connect-address', '--connect-port', '--connect-http-port', '--browser-origin', '--release-manifest', '--output'].includes(arg)) options[arg.slice(2).replaceAll('-', '')] = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['staging', 'production'].includes(options.phase)) throw new Error('--phase must be staging or production');
  if (!releaseIdPattern.test(options.releaseid ?? '')) throw new Error('A valid --release-id is required');
  validatePort(options.connectport, '--connect-port');
  validatePort(options.connecthttpport, '--connect-http-port');
  if (Number(options.connectport ?? 443) === Number(options.connecthttpport ?? 80)) throw new Error('HTTPS and plain HTTP connect ports must be different');
  if (options.connectaddress && /[/:\\]/u.test(options.connectaddress) && !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(options.connectaddress)) throw new Error('--connect-address must be a hostname or IPv4 address without a scheme');
  if (options.phase === 'staging' && !options.connectaddress) throw new Error('Staging verification requires an explicit loopback --connect-address');
  if (options.phase === 'staging' && options.connecthttpport === undefined) throw new Error('Staging verification requires an explicit plain HTTP --connect-http-port');
  if (options.signedlocalperformance && options.phase !== 'staging') throw new Error('--signed-local-performance is only valid during staging verification');
  if (options.signedlocalperformance && !options.browser) throw new Error('--signed-local-performance requires --browser');
  if (options.signedlocalperformance && !options.releasemanifest) throw new Error('--signed-local-performance requires --release-manifest');
  return options;
}

const contentTypes = new Map([
  ['.avif', 'image/avif'], ['.css', 'text/css; charset=utf-8'], ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.html', 'text/html; charset=utf-8'], ['.ico', 'image/x-icon'], ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.pdf', 'application/pdf'],
  ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.txt', 'text/plain; charset=utf-8'], ['.webmanifest', 'application/manifest+json'],
  ['.webp', 'image/webp'], ['.woff2', 'font/woff2'],
]);

function extension(pathname) {
  const basename = pathname.slice(pathname.lastIndexOf('/') + 1);
  const index = basename.lastIndexOf('.');
  return index < 0 ? '' : basename.slice(index).toLowerCase();
}

function releaseRequestPath(rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl ?? '/', 'http://127.0.0.1').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\\') || pathname.includes('\0')) return null;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '..' || segment === '.')) return null;
  if (pathname.endsWith('/')) segments.push('index.html');
  if (segments.length === 0) segments.push('index.html');
  return segments.join('/');
}

export async function startSignedReleasePreview(options) {
  const manifestPath = resolve(options.releasemanifest);
  const manifestStat = await lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error('Release manifest must be a regular file');
  const manifestBody = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBody.toString('utf8'));
  if (manifest.schema !== 'god9.release.v1' || manifest.releaseId !== options.releaseid || !Array.isArray(manifest.payload)) throw new Error('Release manifest identity mismatch');

  const siteRoot = resolve(dirname(manifestPath), 'site');
  const siteStat = await lstat(siteRoot);
  if (!siteStat.isDirectory() || siteStat.isSymbolicLink()) throw new Error('Signed release site must be a real directory');
  const signedFiles = new Map();
  for (const entry of manifest.payload) {
    if (typeof entry.path !== 'string' || !entry.path.startsWith('site/') || typeof entry.sha256 !== 'string') continue;
    signedFiles.set(entry.path.slice('site/'.length), entry.sha256);
  }
  if (signedFiles.size === 0) throw new Error('Release manifest has no signed site payload');

  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const requestPathname = releaseRequestPath(request.url);
      const expectedSha = requestPathname ? signedFiles.get(requestPathname) : undefined;
      if (!requestPathname || !expectedSha) {
        response.writeHead(404).end();
        return;
      }
      const pathname = resolve(siteRoot, ...requestPathname.split('/'));
      const contained = relative(siteRoot, pathname);
      if (contained.startsWith('..') || isAbsolute(contained)) {
        response.writeHead(404).end();
        return;
      }
      const fileStat = await lstat(pathname);
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
        response.writeHead(404).end();
        return;
      }
      const body = await readFile(pathname);
      const actualSha = createHash('sha256').update(body).digest('hex');
      if (actualSha !== expectedSha) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Signed release payload mismatch');
        return;
      }
      response.writeHead(200, {
        'Content-Length': body.length,
        'Content-Type': contentTypes.get(extension(requestPathname)) ?? 'application/octet-stream',
        'X-God9-Release-Id': options.releaseid,
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise((resolveListen, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Signed release preview did not bind to loopback TCP');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    manifestSha256: createHash('sha256').update(manifestBody).digest('hex'),
    signedFiles: signedFiles.size,
    close: () => new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())),
  };
}

function requestPath(url) {
  const copy = new URL(url);
  copy.searchParams.set('god9_query', 'preserved');
  copy.searchParams.set('source', 'release-verifier');
  return `${copy.pathname}${copy.search}`;
}

function requestTarget(options, source, pathname = requestPath(source)) {
  const url = new URL(source);
  const secure = url.protocol === 'https:';
  if (!secure && url.protocol !== 'http:') throw new Error(`Unsupported request protocol: ${url.protocol}`);
  const transport = secure ? httpsRequest : httpRequest;
  const connectPort = secure ? options.connectport : options.connecthttpport;
  return new Promise((resolveRequest, reject) => {
    const request = transport({
      hostname: options.connectaddress ?? url.hostname,
      port: connectPort ? Number(connectPort) : (url.port || undefined),
      path: pathname,
      method: 'GET',
      headers: { Host: url.host, 'User-Agent': 'god9-release-verifier/1' },
      ...(secure ? { servername: url.hostname, rejectUnauthorized: !options.insecure } : {}),
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => resolveRequest({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.setTimeout(20_000, () => request.destroy(new Error(`Timeout requesting ${source}`)));
    request.once('error', reject);
    request.end();
  });
}

function header(response, name) {
  const value = response.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function targetWithVerificationQuery(source) {
  const url = new URL(source);
  url.searchParams.set('god9_query', 'preserved');
  url.searchParams.set('source', 'release-verifier');
  return url.toString();
}

async function verifyHttpsInventory(options) {
  const checks = [];
  for (const record of inventory.records) {
    const response = await requestTarget(options, record.source);
    if (response.status !== record.final.status) throw new Error(`${record.source}: expected ${record.final.status}, received ${response.status}`);
    const location = header(response, 'location');
    if (record.final.action === 'redirect') {
      const expected = targetWithVerificationQuery(record.final.target);
      if (location !== expected) throw new Error(`${record.source}: expected Location ${expected}, received ${location}`);
      const final = await requestTarget(options, expected, new URL(expected).pathname + new URL(expected).search);
      if (final.status >= 300 && final.status < 400) throw new Error(`${record.source}: redirect chain exceeds one hop`);
      if (final.status !== 200) throw new Error(`${record.source}: final target returned ${final.status}`);
      checks.push({ source: record.source, status: response.status, hops: 1, finalStatus: final.status });
    } else {
      if (location !== undefined) throw new Error(`${record.source}: terminal contract unexpectedly returned Location`);
      checks.push({ source: record.source, status: response.status, hops: 0 });
    }
  }

  return {
    result: 'pass',
    checks: checks.length,
    oneHopRedirects: checks.filter(({ hops }) => hops === 1).length,
    terminalChecks: checks.filter(({ hops }) => hops === 0).length,
  };
}

function applicableHttpRecords() {
  const policy = inventory.http_policy;
  if (!policy || policy.mode !== 'direct-to-final-contract' || policy.status !== 301 || policy.query !== 'preserve' || !Array.isArray(policy.hosts) || policy.hosts.length === 0 || new Set(policy.hosts).size !== policy.hosts.length) {
    throw new Error('Invalid HTTP policy structure');
  }
  const hosts = new Set(policy.hosts);
  const records = inventory.records.filter((record) => hosts.has(new URL(record.source).hostname));
  if (records.length === 0) throw new Error('HTTP policy does not apply to any inventory records');
  return records;
}

export function expectedHttpContract(record) {
  if (record.final.action === 'redirect' || record.final.action === 'serve') {
    if (typeof record.final.target !== 'string' || new URL(record.final.target).protocol !== 'https:') throw new Error(`HTTP policy requires an HTTPS final target for ${record.source}`);
    return { status: inventory.http_policy.status, location: targetWithVerificationQuery(record.final.target), hops: 1 };
  }
  if (record.final.action === 'gone') return { status: 410, location: undefined, hops: 0 };
  if (record.final.action === 'not_found') return { status: 404, location: undefined, hops: 0 };
  throw new Error(`Unsupported HTTP policy action: ${record.final.action}`);
}

async function verifyPlainHttpPolicy(options) {
  const checks = [];
  for (const record of applicableHttpRecords()) {
    const source = new URL(record.source);
    source.protocol = 'http:';
    const expected = expectedHttpContract(record);
    const response = await requestTarget(options, source.toString());
    const location = header(response, 'location');
    if (response.status !== expected.status) throw new Error(`${source}: HTTP policy expected ${expected.status}, received ${response.status}`);
    if (location !== expected.location) throw new Error(`${source}: HTTP policy expected Location ${expected.location ?? '<absent>'}, received ${location ?? '<absent>'}`);
    checks.push({ source: source.toString(), status: response.status, hops: expected.hops });
  }
  return {
    result: 'pass',
    checks: checks.length,
    oneHopRedirects: checks.filter(({ hops }) => hops === 1).length,
    terminalChecks: checks.filter(({ hops }) => hops === 0).length,
  };
}

async function verifyServices(options) {

  const api = await requestTarget(options, 'https://godmodetools.com/api/', '/api/');
  if (!/^application\/json\b/iu.test(header(api, 'content-type') ?? '')) throw new Error('/api/ content type is not JSON');
  if (/database_url|postgres(?:ql)?:\/\/|password|credential/iu.test(api.body.toString('utf8'))) throw new Error('/api/ leaked configuration-shaped data');
  const health = await requestTarget(options, 'https://godmodetools.com/api/health', '/api/health');
  let healthPayload;
  try {
    healthPayload = JSON.parse(health.body.toString('utf8'));
  } catch {
    throw new Error('/api/health stopped returning JSON');
  }
  if (JSON.stringify(healthPayload) !== '{"status":"healthy"}') throw new Error('/api/health body changed');
  const manifest = await requestTarget(options, 'https://godmodetools.com/voidplayer/void.webmanifest', '/voidplayer/void.webmanifest');
  if (!/application\/manifest\+json/iu.test(header(manifest, 'content-type') ?? '')) throw new Error('VoidPlayer manifest content type changed');
  return 3;
}

async function verifyHttp(options) {
  const httpsInventory = await verifyHttpsInventory(options);
  const httpPolicy = await verifyPlainHttpPolicy(options);
  const serviceChecks = await verifyServices(options);
  return { result: 'pass', httpsInventory, httpPolicy, serviceChecks };
}

function runBrowserScript(script, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [script], { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${script} failed (${signal ?? code})`));
    });
  });
}

async function verifyBrowser(options) {
  if (!options.browser) return { result: 'skipped', scripts: [] };
  const browserOrigin = options.browserorigin ?? (options.connectaddress
    ? `https://${options.connectaddress}:${options.connectport ?? 443}`
    : inventory.production_origin);
  const signedPreview = options.signedlocalperformance ? await startSignedReleasePreview(options) : null;
  const performanceOrigin = signedPreview?.origin ?? browserOrigin;
  try {
    for (const script of browserScripts) {
      const scriptOrigin = script === 'tests/performance-browser.mjs' ? performanceOrigin : browserOrigin;
      const env = {
        ...process.env,
        SITE_PREVIEW_URL: scriptOrigin.replace(/\/$/u, ''),
        HTTP_CONTRACT_URL: browserOrigin.replace(/\/$/u, ''),
        SITE_PREVIEW_INSECURE: scriptOrigin.startsWith('https:') && options.insecure ? '1' : '0',
        HTTP_CONTRACT_INSECURE: options.insecure ? '1' : '0',
      };
      await runBrowserScript(script, env);
    }
    return {
      result: 'pass',
      origin: browserOrigin,
      performance: signedPreview ? {
        mode: 'signed-release-loopback',
        origin: performanceOrigin,
        manifestSha256: signedPreview.manifestSha256,
        signedFiles: signedPreview.signedFiles,
      } : { mode: 'browser-origin', origin: performanceOrigin },
      scripts: browserScripts,
    };
  } finally {
    if (signedPreview) await signedPreview.close();
  }
}

async function manifestSha(options) {
  if (!options.releasemanifest) return null;
  const pathname = resolve(options.releasemanifest);
  const stat = await lstat(pathname);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Release manifest must be a regular file');
  const body = await readFile(pathname);
  const manifest = JSON.parse(body.toString('utf8'));
  if (manifest.schema !== 'god9.release.v1' || manifest.releaseId !== options.releaseid) throw new Error('Release manifest identity mismatch');
  return createHash('sha256').update(body).digest('hex');
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const startedAt = new Date().toISOString();
  const releaseManifestSha256 = await manifestSha(options);
  const http = await verifyHttp(options);
  const browser = await verifyBrowser(options);
  const evidence = {
    schema: 'god9.verification.v1',
    phase: options.phase,
    releaseId: options.releaseid,
    result: 'pass',
    startedAtUtc: startedAt,
    completedAtUtc: new Date().toISOString(),
    mode: options.connectaddress ? 'pinned-origin' : 'public-dns',
    connectAddress: options.connectaddress ?? null,
    connectPorts: { https: Number(options.connectport ?? 443), http: Number(options.connecthttpport ?? 80) },
    releaseManifestSha256,
    http,
    browser,
  };
  if (options.output) {
    const output = resolve(options.output);
    await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  }
  console.log(JSON.stringify(evidence, null, 2));
  return evidence;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`GOD-9 verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
