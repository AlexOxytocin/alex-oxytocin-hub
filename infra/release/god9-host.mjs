#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import {
  chmod,
  copyFile,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  rmdir,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = '/opt/app/frontend';
const RELEASES_ROOT = '/opt/app/frontend/sites/releases';
const LEGACY_LINK = '/opt/app/frontend/sites/current';
const ACTIVE_LINK = '/opt/app/frontend/site-current';
const VOIDPLAYER_ROOT = '/opt/app/frontend/voidplayer';
const STATE_ROOT = '/opt/app/frontend/god9-state';
const NGINX_CONF_ROOT = '/opt/app/nginx/conf.d';
const NGINX_DEFAULT = '/opt/app/nginx/conf.d/default.conf';
const NGINX_INCLUDES = '/opt/app/nginx/conf.d/_includes';
const NGINX_SSL = '/opt/app/nginx/ssl';
const CERTBOT_ROOT = '/var/www/certbot';
const NGINX_CONTAINER = 'nginx';
const BACKEND_CONTAINER = 'backend';
const FLATSCANNER_CONFIG = '/opt/app/nginx/conf.d/flatscanner.godmodetools.com.conf';
const releaseIdPattern = /^\d{8}-\d{6}-[a-z0-9][a-z0-9._-]{2,63}$/u;
const mutatingActions = new Set(['staging-up', 'staging-down', 'prepare-cutover', 'test-rollback', 'cutover', 'rollback']);

function command(program, args, { quiet = false } = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' });
  if (result.status !== 0) throw new Error(`${program} ${args.join(' ')} failed with ${result.status}`);
  return (result.stdout ?? '').trim();
}

export function parseArgs(argv) {
  const options = { action: argv[0] ?? 'preflight', apply: false, port: 8443, httpPort: 8080 };
  for (let index = argv[0] ? 1 : 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (['--release-id', '--confirm', '--expected-nginx-sha', '--staging-evidence'].includes(arg)) options[arg.slice(2).replaceAll('-', '')] = argv[++index];
    else if (arg === '--port') options.port = Number(argv[++index]);
    else if (arg === '--http-port') options.httpPort = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['preflight', ...mutatingActions].includes(options.action)) throw new Error(`Unknown action: ${options.action}`);
  if (mutatingActions.has(options.action) && !options.apply) throw new Error(`${options.action} is mutation-capable and requires --apply`);
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error('Port must be an integer from 1024 through 65535');
  if (!Number.isInteger(options.httpPort) || options.httpPort < 1024 || options.httpPort > 65535) throw new Error('HTTP port must be an integer from 1024 through 65535');
  if (options.httpPort === options.port) throw new Error('TLS and plain HTTP staging ports must be different');
  return options;
}

function validateReleaseId(value) {
  if (!releaseIdPattern.test(value ?? '')) throw new Error('A valid --release-id is required');
  return value;
}

function releaseDirectory(releaseId) {
  const directory = resolve(RELEASES_ROOT, validateReleaseId(releaseId));
  if (relative(RELEASES_ROOT, directory).includes(sep)) throw new Error('Release path must be one direct child of releases root');
  return directory;
}

function stateDirectory(releaseId) {
  return resolve(STATE_ROOT, validateReleaseId(releaseId));
}

async function sha256(pathname) {
  return createHash('sha256').update(await readFile(pathname)).digest('hex');
}

async function entryExists(pathname) {
  try {
    await lstat(pathname);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function assertDirectory(pathname, label) {
  const stat = await lstat(pathname);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a real directory: ${pathname}`);
}

async function assertRegularFile(pathname, label) {
  const stat = await lstat(pathname);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file: ${pathname}`);
}

async function walk(directory, base = directory) {
  const paths = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const pathname = resolve(directory, item.name);
    const relativePath = relative(base, pathname).split(sep).join('/');
    if (item.isSymbolicLink()) throw new Error(`Release payload contains a symlink: ${relativePath}`);
    if (item.isDirectory()) paths.push(...await walk(pathname, base));
    else if (item.isFile()) paths.push(relativePath);
    else throw new Error(`Unsupported release payload entry: ${relativePath}`);
  }
  return paths.sort();
}

function validatePayloadPath(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._/-]+$/u.test(value) || value.startsWith('/')) {
    throw new Error(`${label} is not a safe relative path`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`${label} is not a normalized relative path`);
  }
  return value;
}

function validateManifestRecord(record, index) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`Release manifest payload[${index}] must be an object`);
  const keys = Object.keys(record).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['bytes', 'path', 'sha256'])) throw new Error(`Release manifest payload[${index}] has an invalid structure`);
  const path = validatePayloadPath(record.path, `Release manifest payload[${index}].path`);
  if (path === 'release-manifest.json' || path === 'SHA256SUMS') throw new Error(`Release manifest payload uses reserved path: ${path}`);
  if (!Number.isSafeInteger(record.bytes) || record.bytes < 0) throw new Error(`Release manifest payload[${index}].bytes is invalid`);
  if (typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(record.sha256)) throw new Error(`Release manifest payload[${index}].sha256 is invalid`);
  return { path, bytes: record.bytes, sha256: record.sha256 };
}

export async function validateReleaseBundle(directory, releaseId) {
  directory = resolve(directory);
  await assertDirectory(directory, 'Release');
  for (const pathname of ['site/ru/index.html', 'site/en/index.html', 'site/404.html', 'nginx/default.conf', 'nginx/_includes/compression.inc', 'nginx/_includes/security-headers.inc', 'nginx/_includes/site-cache.inc', 'ops/god9-host.mjs', 'ops/god9-cleanup.mjs', 'release-manifest.json', 'SHA256SUMS']) {
    await assertRegularFile(resolve(directory, pathname), `Release payload ${pathname}`);
  }

  const manifest = JSON.parse(await readFile(resolve(directory, 'release-manifest.json'), 'utf8'));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || manifest.schema !== 'god9.release.v1' || manifest.releaseId !== releaseId || !Array.isArray(manifest.payload) || manifest.payload.length === 0) {
    throw new Error('Release manifest identity or payload structure mismatch');
  }
  const records = manifest.payload.map(validateManifestRecord);
  const manifestPaths = records.map(({ path }) => path).sort();
  if (new Set(manifestPaths).size !== manifestPaths.length) throw new Error('Release manifest has duplicate paths');
  const checksums = new Map();
  for (const line of (await readFile(resolve(directory, 'SHA256SUMS'), 'utf8')).trim().split(/\r?\n/u)) {
    const match = /^([a-f0-9]{64})  ([a-zA-Z0-9._/-]+)$/u.exec(line);
    if (!match) throw new Error(`Unsafe SHA256SUMS line: ${line}`);
    validatePayloadPath(match[2], 'SHA256SUMS path');
    if (checksums.has(match[2])) throw new Error(`Duplicate SHA256SUMS path: ${match[2]}`);
    checksums.set(match[2], match[1]);
  }
  const expectedChecksumPaths = [...manifestPaths, 'release-manifest.json'].sort();
  if (JSON.stringify([...checksums.keys()].sort()) !== JSON.stringify(expectedChecksumPaths)) throw new Error('SHA256SUMS path set does not match the manifest');
  const actualPaths = (await walk(directory)).filter((pathname) => pathname !== 'SHA256SUMS').sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedChecksumPaths)) throw new Error('Release contains unmanifested or missing payload files');
  for (const record of records) {
    if (checksums.get(record.path) !== record.sha256) throw new Error(`SHA256SUMS hash does not match release manifest payload: ${record.path}`);
    const pathname = resolve(directory, record.path);
    const pathFromRelease = relative(directory, pathname);
    if (!pathFromRelease || pathFromRelease === '..' || pathFromRelease.startsWith(`..${sep}`)) throw new Error(`Release manifest path escaped its bundle: ${record.path}`);
    await assertRegularFile(pathname, `Release manifest payload ${record.path}`);
    const stat = await lstat(pathname);
    if (stat.size !== record.bytes) throw new Error(`Release payload size mismatch: ${record.path}`);
    if (await sha256(pathname) !== record.sha256) throw new Error(`Release payload checksum mismatch: ${record.path}`);
  }
  const manifestChecksum = checksums.get('release-manifest.json');
  if (await sha256(resolve(directory, 'release-manifest.json')) !== manifestChecksum) throw new Error('Release manifest checksum mismatch');
  return { directory, manifest, manifestSha256: await sha256(resolve(directory, 'release-manifest.json')) };
}

async function validateRelease(releaseId) {
  const directory = releaseDirectory(releaseId);
  if (await realpath(directory) !== directory) throw new Error('Release path resolved outside its exact versioned directory');
  return validateReleaseBundle(directory, releaseId);
}

function dockerInspect(container) {
  return JSON.parse(command('docker', ['inspect', container], { quiet: true }))[0];
}

function dockerContainerExists(container) {
  return spawnSync('docker', ['inspect', container], { stdio: 'ignore' }).status === 0;
}

function mountFor(inspect, destination) {
  return inspect.Mounts.find((mount) => mount.Destination === destination);
}

function sharedBackendNetwork() {
  const nginx = Object.keys(dockerInspect(NGINX_CONTAINER).NetworkSettings.Networks);
  const backend = new Set(Object.keys(dockerInspect(BACKEND_CONTAINER).NetworkSettings.Networks));
  const shared = nginx.filter((name) => backend.has(name));
  if (shared.length !== 1) throw new Error(`Expected exactly one Nginx/backend shared network, found ${shared.length}`);
  return shared[0];
}

async function preflight() {
  await Promise.all([
    assertDirectory(FRONTEND_ROOT, 'Frontend root'),
    assertDirectory(RELEASES_ROOT, 'Releases root'),
    assertDirectory(VOIDPLAYER_ROOT, 'VoidPlayer root'),
    assertDirectory(NGINX_CONF_ROOT, 'Nginx conf.d'),
    assertDirectory(NGINX_SSL, 'Nginx SSL root'),
    assertRegularFile(NGINX_DEFAULT, 'Nginx default config'),
    assertRegularFile(FLATSCANNER_CONFIG, 'Flatscanner config'),
  ]);
  const legacyStat = await lstat(LEGACY_LINK);
  if (!legacyStat.isSymbolicLink()) throw new Error('Legacy sites/current rollback boundary must remain a symlink');
  const flatscanner = await readFile(FLATSCANNER_CONFIG, 'utf8');
  if (!/server_name\s+flatscanner\.godmodetools\.com/u.test(flatscanner)) throw new Error('Flatscanner config ownership contract changed');

  const nginx = dockerInspect(NGINX_CONTAINER);
  const expectedMounts = new Map([
    ['/etc/nginx/nginx.conf', '/opt/app/nginx/nginx.conf'],
    ['/etc/nginx/conf.d', NGINX_CONF_ROOT],
    ['/usr/share/nginx/html', FRONTEND_ROOT],
    ['/etc/nginx/ssl', NGINX_SSL],
  ]);
  for (const [destination, source] of expectedMounts) {
    const mount = mountFor(nginx, destination);
    if (!mount || mount.Source !== source || mount.RW !== false) throw new Error(`Unexpected Nginx read-only mount contract for ${destination}`);
  }
  command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-t'], { quiet: true });
  let active = null;
  if (await entryExists(ACTIVE_LINK)) {
    const activeStat = await lstat(ACTIVE_LINK);
    if (!activeStat.isSymbolicLink()) throw new Error('site-current exists but is not a symlink');
    active = await readlink(ACTIVE_LINK);
  }
  const summary = {
    result: 'pass',
    currentLegacyTarget: await realpath(LEGACY_LINK),
    activeLinkTarget: active,
    nginxDefaultSha256: await sha256(NGINX_DEFAULT),
    nginxImage: nginx.Config.Image,
    backendNetwork: sharedBackendNetwork(),
    protectedPaths: [VOIDPLAYER_ROOT, FLATSCANNER_CONFIG],
  };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

function requireConfirmation(options) {
  const releaseId = validateReleaseId(options.releaseid);
  if (options.confirm !== releaseId) throw new Error('Mutation requires --confirm exactly matching --release-id');
  return releaseId;
}

function stagingContainer(releaseId) {
  return `god9-staging-${releaseId}`;
}

async function stagingUp(options) {
  const releaseId = requireConfirmation(options);
  await preflight();
  const release = await validateRelease(releaseId);
  const name = stagingContainer(releaseId);
  if (dockerContainerExists(name)) throw new Error(`Staging container already exists: ${name}`);
  const nginx = dockerInspect(NGINX_CONTAINER);
  command('docker', [
    'run', '-d', '--name', name,
    '--network', sharedBackendNetwork(),
    '--publish', `127.0.0.1:${options.port}:443`,
    '--publish', `127.0.0.1:${options.httpPort}:80`,
    '--read-only', '--security-opt', 'no-new-privileges',
    '--tmpfs', '/var/cache/nginx', '--tmpfs', '/var/run',
    '--volume', `${resolve(release.directory, 'nginx/default.conf')}:/etc/nginx/conf.d/default.conf:ro`,
    '--volume', `${resolve(release.directory, 'nginx/_includes')}:/etc/nginx/conf.d/_includes:ro`,
    '--volume', `${resolve(release.directory, 'site')}:/usr/share/nginx/html/site-current:ro`,
    '--volume', `${VOIDPLAYER_ROOT}:/usr/share/nginx/html/voidplayer:ro`,
    '--volume', `${NGINX_SSL}:/etc/nginx/ssl:ro`,
    '--volume', `${CERTBOT_ROOT}:/var/www/certbot:ro`,
    nginx.Config.Image,
  ]);
  try {
    command('docker', ['exec', name, 'nginx', '-t'], { quiet: true });
  } catch (error) {
    command('docker', ['rm', '-f', name], { quiet: true });
    throw error;
  }
  console.log(JSON.stringify({
    result: 'pass',
    releaseId,
    container: name,
    loopbackUrls: { https: `https://127.0.0.1:${options.port}`, http: `http://127.0.0.1:${options.httpPort}` },
  }, null, 2));
}

async function stagingDown(options) {
  const releaseId = requireConfirmation(options);
  command('docker', ['rm', '-f', stagingContainer(releaseId)], { quiet: true });
  console.log(JSON.stringify({ result: 'pass', releaseId, removedContainer: stagingContainer(releaseId) }, null, 2));
}

async function readJsonRegular(pathname, label) {
  await assertRegularFile(pathname, label);
  return JSON.parse(await readFile(pathname, 'utf8'));
}

export function hasCompleteTransportEvidence(http) {
  const complete = (matrix) => matrix?.result === 'pass'
    && Number.isSafeInteger(matrix.checks)
    && matrix.checks > 0
    && Number.isSafeInteger(matrix.oneHopRedirects)
    && Number.isSafeInteger(matrix.terminalChecks)
    && matrix.oneHopRedirects + matrix.terminalChecks === matrix.checks;
  return http?.result === 'pass'
    && complete(http.httpsInventory)
    && complete(http.httpPolicy)
    && http.httpsInventory.checks === http.httpPolicy.checks;
}

async function prepareCutover(options) {
  const releaseId = requireConfirmation(options);
  const release = await validateRelease(releaseId);
  await preflight();
  if (!/^[a-f0-9]{64}$/u.test(options.expectednginxsha ?? '')) throw new Error('--expected-nginx-sha is required');
  if (await sha256(NGINX_DEFAULT) !== options.expectednginxsha) throw new Error('Nginx config changed since the reviewed preflight');
  if (!options.stagingevidence) throw new Error('--staging-evidence is required');
  const evidence = await readJsonRegular(resolve(options.stagingevidence), 'Staging evidence');
  if (evidence.schema !== 'god9.verification.v1' || evidence.phase !== 'staging' || evidence.releaseId !== releaseId || evidence.result !== 'pass' || !hasCompleteTransportEvidence(evidence.http) || evidence.browser?.result !== 'pass' || evidence.releaseManifestSha256 !== release.manifestSha256) {
    throw new Error('Staging evidence does not satisfy the cutover gate');
  }

  const state = stateDirectory(releaseId);
  const temporaryState = resolve(STATE_ROOT, `.${releaseId}.${process.pid}.tmp`);
  if (await entryExists(state) || await entryExists(temporaryState)) throw new Error(`Refusing to overwrite existing rollback packet: ${state}`);
  await mkdir(STATE_ROOT, { recursive: true, mode: 0o700 });
  await mkdir(temporaryState, { mode: 0o700 });
  const hadIncludes = await entryExists(NGINX_INCLUDES);
  try {
    await copyFile(NGINX_DEFAULT, resolve(temporaryState, 'previous-default.conf'));
    await chmod(resolve(temporaryState, 'previous-default.conf'), 0o600);
    if (hadIncludes) {
      await assertDirectory(NGINX_INCLUDES, 'Nginx includes');
      await includeNames(NGINX_INCLUDES);
      await cp(NGINX_INCLUDES, resolve(temporaryState, 'previous-includes'), { recursive: true, errorOnExist: true, force: false });
    }
    let previousActiveLink = null;
    if (await entryExists(ACTIVE_LINK)) {
      const activeStat = await lstat(ACTIVE_LINK);
      if (!activeStat.isSymbolicLink()) throw new Error('site-current exists but is not a symlink');
      previousActiveLink = await readlink(ACTIVE_LINK);
    }
    const metadata = {
      schema: 'god9.rollback.v1',
      releaseId,
      preparedAtUtc: new Date().toISOString(),
      previousDefaultSha256: options.expectednginxsha,
      previousLegacyTarget: await realpath(LEGACY_LINK),
      previousActiveLink,
      hadIncludes,
      releaseManifestSha256: release.manifestSha256,
    };
    await writeFile(resolve(temporaryState, 'state.json'), `${JSON.stringify(metadata, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await copyFile(resolve(options.stagingevidence), resolve(temporaryState, 'staging-evidence.json'));
    await chmod(resolve(temporaryState, 'staging-evidence.json'), 0o600);
    await rename(temporaryState, state);
  } catch (error) {
    await rm(temporaryState, { recursive: true, force: true });
    throw error;
  }
  console.log(JSON.stringify({ result: 'pass', releaseId, rollbackPacket: state }, null, 2));
}

async function loadState(releaseId) {
  const directory = stateDirectory(releaseId);
  await assertDirectory(directory, 'Rollback packet');
  const metadata = await readJsonRegular(resolve(directory, 'state.json'), 'Rollback metadata');
  if (metadata.schema !== 'god9.rollback.v1' || metadata.releaseId !== releaseId) throw new Error('Rollback packet identity mismatch');
  if (await sha256(resolve(directory, 'previous-default.conf')) !== metadata.previousDefaultSha256) throw new Error('Rollback Nginx config checksum mismatch');
  return { directory, metadata };
}

export async function assertRollbackOpen(directory) {
  const retirementMarker = resolve(directory, 'legacy-link-retired.json');
  if (await entryExists(retirementMarker)) {
    throw new Error('Rollback is closed because legacy-link retirement has started');
  }
}

function httpsStatus(port, pathname) {
  return new Promise((resolveStatus, reject) => {
    const request = httpsRequest({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method: 'GET',
      servername: 'godmodetools.com',
      rejectUnauthorized: true,
      headers: { Host: 'godmodetools.com', 'User-Agent': 'god9-rollback-test/1' },
    }, (response) => {
      response.resume();
      response.once('end', () => resolveStatus(response.statusCode ?? 0));
    });
    request.setTimeout(5_000, () => request.destroy(new Error(`Rollback probe timeout: ${pathname}`)));
    request.once('error', reject);
    request.end();
  });
}

async function testRollback(options) {
  const releaseId = requireConfirmation(options);
  const state = await loadState(releaseId);
  await assertRollbackOpen(state.directory);
  const nginx = dockerInspect(NGINX_CONTAINER);
  const name = `god9-rollback-test-${releaseId}`;
  const volumes = [
    '--volume', `${resolve(state.directory, 'previous-default.conf')}:/etc/nginx/conf.d/default.conf:ro`,
    '--volume', `${FRONTEND_ROOT}:/usr/share/nginx/html:ro`,
    '--volume', `${NGINX_SSL}:/etc/nginx/ssl:ro`,
    '--volume', `${CERTBOT_ROOT}:/var/www/certbot:ro`,
  ];
  if (state.metadata.hadIncludes) volumes.push('--volume', `${resolve(state.directory, 'previous-includes')}:/etc/nginx/conf.d/_includes:ro`);
  command('docker', [
    'run', '-d', '--name', name,
    '--network', sharedBackendNetwork(), '--read-only', '--security-opt', 'no-new-privileges',
    '--publish', '127.0.0.1::443',
    '--tmpfs', '/var/cache/nginx', '--tmpfs', '/var/run',
    ...volumes,
    nginx.Config.Image,
  ], { quiet: true });
  const checks = [
    ['/', 200],
    ['/api/health', 200],
    ['/voidplayer/', 200],
    ['/openclaw-voice/rollback-probe', 410],
  ];
  try {
    command('docker', ['exec', name, 'nginx', '-t'], { quiet: true });
    const binding = command('docker', ['port', name, '443/tcp'], { quiet: true });
    const match = /127\.0\.0\.1:(\d+)$/u.exec(binding);
    if (!match) throw new Error(`Unexpected rollback test port binding: ${binding}`);
    const port = Number(match[1]);
    const deadline = Date.now() + 15_000;
    for (const [pathname, expected] of checks) {
      let status = 0;
      while (Date.now() < deadline) {
        try {
          status = await httpsStatus(port, pathname);
          break;
        } catch {
          await new Promise((resolveWait) => setTimeout(resolveWait, 250));
        }
      }
      if (status !== expected) throw new Error(`Rollback probe ${pathname} expected ${expected}, received ${status}`);
    }
  } finally {
    command('docker', ['rm', '-f', name], { quiet: true });
  }
  const marker = { schema: 'god9.rollback-test.v1', releaseId, result: 'pass', testedAtUtc: new Date().toISOString(), previousDefaultSha256: state.metadata.previousDefaultSha256, checks: Object.fromEntries(checks) };
  await writeFile(resolve(state.directory, 'rollback-tested.json'), `${JSON.stringify(marker, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(marker, null, 2));
}

async function atomicSymlink(target) {
  const temporary = resolve(FRONTEND_ROOT, `.site-current.${process.pid}.tmp`);
  if (await entryExists(temporary)) throw new Error(`Temporary symlink already exists: ${temporary}`);
  await symlink(target, temporary, 'dir');
  await rename(temporary, ACTIVE_LINK);
}

async function includeNames(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || !/^[a-z0-9-]+\.inc$/u.test(entry.name)) throw new Error(`Refusing unexpected include entry: ${entry.name}`);
  }
  return entries.map(({ name }) => name).sort();
}

async function replaceIncludes(sourceDirectory) {
  const sourceNames = sourceDirectory ? await includeNames(sourceDirectory) : [];
  for (const name of sourceNames) {
    await assertRegularFile(resolve(sourceDirectory, name), `Nginx include ${name}`);
  }
  if (!(await entryExists(NGINX_INCLUDES))) await mkdir(NGINX_INCLUDES, { mode: 0o755 });
  else await assertDirectory(NGINX_INCLUDES, 'Nginx includes');
  const existing = await includeNames(NGINX_INCLUDES);
  for (const name of existing) {
    if (!sourceNames.includes(name)) await unlink(resolve(NGINX_INCLUDES, name));
  }
  for (const name of sourceNames) {
    const temporary = resolve(NGINX_INCLUDES, `.${name}.${process.pid}.tmp`);
    await copyFile(resolve(sourceDirectory, name), temporary);
    await chmod(temporary, 0o644);
    await rename(temporary, resolve(NGINX_INCLUDES, name));
  }
  if (sourceNames.length === 0) await rmdir(NGINX_INCLUDES);
}

async function atomicConfig(source) {
  const temporary = resolve(NGINX_CONF_ROOT, `.default.conf.${process.pid}.tmp`);
  await copyFile(source, temporary);
  await chmod(temporary, 0o644);
  await rename(temporary, NGINX_DEFAULT);
}

async function restoreLink(previousActiveLink) {
  if (previousActiveLink === null) {
    if (await entryExists(ACTIVE_LINK)) {
      const stat = await lstat(ACTIVE_LINK);
      if (!stat.isSymbolicLink()) throw new Error('Refusing to remove non-symlink site-current during rollback');
      await unlink(ACTIVE_LINK);
    }
  } else {
    await atomicSymlink(previousActiveLink);
  }
}

async function restoreState(state) {
  await assertRollbackOpen(state.directory);
  await restoreLink(state.metadata.previousActiveLink);
  await replaceIncludes(state.metadata.hadIncludes ? resolve(state.directory, 'previous-includes') : null);
  await atomicConfig(resolve(state.directory, 'previous-default.conf'));
  command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-t'], { quiet: true });
  command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-s', 'reload'], { quiet: true });
}

async function cutover(options) {
  const releaseId = requireConfirmation(options);
  const release = await validateRelease(releaseId);
  const state = await loadState(releaseId);
  await assertRollbackOpen(state.directory);
  const rollbackTest = await readJsonRegular(resolve(state.directory, 'rollback-tested.json'), 'Rollback test marker');
  if (rollbackTest.result !== 'pass' || rollbackTest.releaseId !== releaseId || rollbackTest.previousDefaultSha256 !== state.metadata.previousDefaultSha256) throw new Error('Rollback was not tested against this rollback packet');
  await preflight();
  if (await sha256(NGINX_DEFAULT) !== state.metadata.previousDefaultSha256) throw new Error('Nginx config changed after rollback packet creation');
  if (await realpath(LEGACY_LINK) !== state.metadata.previousLegacyTarget) throw new Error('Legacy rollback symlink changed after rollback packet creation');
  if (release.manifestSha256 !== state.metadata.releaseManifestSha256) throw new Error('Release changed after staging acceptance');

  const relativeSiteTarget = `sites/releases/${releaseId}/site`;
  try {
    await atomicSymlink(relativeSiteTarget);
    await replaceIncludes(resolve(release.directory, 'nginx/_includes'));
    await atomicConfig(resolve(release.directory, 'nginx/default.conf'));
    command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-t'], { quiet: true });
    command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-s', 'reload'], { quiet: true });
  } catch (error) {
    try {
      await restoreState(state);
    } catch (rollbackError) {
      throw new Error(`Cutover failed (${error.message}); automatic rollback also failed (${rollbackError.message})`);
    }
    throw new Error(`Cutover failed and was rolled back: ${error.message}`);
  }
  const marker = { schema: 'god9.cutover.v1', releaseId, result: 'pass', cutoverAtUtc: new Date().toISOString(), activeTarget: await realpath(ACTIVE_LINK), legacyRollbackTarget: await realpath(LEGACY_LINK) };
  await writeFile(resolve(state.directory, 'cutover.json'), `${JSON.stringify(marker, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(marker, null, 2));
}

async function rollback(options) {
  const releaseId = requireConfirmation(options);
  const state = await loadState(releaseId);
  await restoreState(state);
  const marker = { schema: 'god9.rollback-result.v1', releaseId, result: 'pass', rolledBackAtUtc: new Date().toISOString(), restoredDefaultSha256: await sha256(NGINX_DEFAULT) };
  await writeFile(resolve(state.directory, `rollback-${Date.now()}.json`), `${JSON.stringify(marker, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(marker, null, 2));
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const actions = {
    preflight,
    'staging-up': stagingUp,
    'staging-down': stagingDown,
    'prepare-cutover': prepareCutover,
    'test-rollback': testRollback,
    cutover,
    rollback,
  };
  return actions[options.action](options);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`GOD-9 host operation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
