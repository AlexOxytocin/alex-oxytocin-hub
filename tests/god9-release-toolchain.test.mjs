import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import { inspectSite, isContained, main as prepareRelease, validateReleaseId } from '../scripts/prepare-god9-release.mjs';
import { expectedHttpContract, parseArgs as parseVerificationArgs, startSignedReleasePreview } from '../scripts/verify-god9-release.mjs';
import {
  attachedNetworkNames,
  assertNginxWorkerAccess,
  assertRollbackOpen,
  assertUnprivilegedNginxModes,
  commitDurableJson,
  hasCompleteTransportEvidence,
  main as hostOperation,
  normalizeReleasePermissions,
  parseArgs as parseHostArgs,
  writeDurableJsonExclusive,
  validateReleaseBundle,
  validateReleasePermissions,
} from '../infra/release/god9-host.mjs';
import { assertActiveReleaseIdentity, exactReleasePath } from '../infra/release/god9-cleanup.mjs';

const root = resolve(import.meta.dirname, '..');

async function exists(pathname) {
  try {
    await access(resolve(root, pathname));
    return true;
  } catch {
    return false;
  }
}

function hash(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function createReleaseFixture(releaseId) {
  const directory = await mkdtemp(resolve(tmpdir(), 'god9-release-bundle-'));
  const files = new Map([
    ['site/ru/index.html', '<h1>RU</h1>'],
    ['site/en/index.html', '<h1>EN</h1>'],
    ['site/404.html', '<h1>404</h1>'],
    ['nginx/default.conf', 'server {}'],
    ['nginx/_includes/security-headers.inc', 'add_header X-Test true;'],
    ['nginx/_includes/site-cache.inc', 'expires -1;'],
    ['ops/god9-host.mjs', 'export {};'],
    ['ops/god9-cleanup.mjs', 'export {};'],
  ]);
  const records = [];
  for (const [path, content] of files) {
    const pathname = resolve(directory, path);
    await mkdir(dirname(pathname), { recursive: true });
    await writeFile(pathname, content);
    records.push({ path, bytes: Buffer.byteLength(content), sha256: hash(content) });
  }
  const manifest = {
    schema: 'god9.release.v1',
    releaseId,
    gitCommit: 'a'.repeat(40),
    createdAtUtc: '2099-01-01T00:00:00.000Z',
    site: { fileCount: 3, htmlCount: 3, bytes: 30 },
    payload: records,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(resolve(directory, 'release-manifest.json'), manifestContent);
  const checksums = [...records, { path: 'release-manifest.json', sha256: hash(manifestContent) }]
    .map(({ sha256, path }) => `${sha256}  ${path}`).join('\n');
  await writeFile(resolve(directory, 'SHA256SUMS'), `${checksums}\n`);
  return { directory, manifest, records };
}

test('fresh Astro dist is a self-contained release site', async () => {
  const site = await inspectSite(resolve(root, 'dist'));
  assert.ok(site.fileCount >= 50);
  assert.equal(site.htmlCount, 11);
  assert.ok(site.bytes > 15 * 1024 * 1024);
  assert.equal(await exists('dist/index.html'), false);
  assert.equal(await exists('dist/ru/index.html'), true);
  assert.equal(await exists('dist/en/index.html'), true);
});

test('release ids and containment reject path traversal', () => {
  assert.equal(validateReleaseId('20260824-123456-abcdef123456'), '20260824-123456-abcdef123456');
  assert.throws(() => validateReleaseId('../../voidplayer'), /Release id/u);
  assert.equal(isContained(resolve(root, 'release'), resolve(root, 'release/20260824-123456-abcdef123456')), true);
  assert.equal(isContained(resolve(root, 'release'), resolve(root, 'public')), false);
});

test('release preparation is plan-only by default', async () => {
  const releaseId = '20990101-000000-contract-test';
  assert.equal(await exists(`release/${releaseId}`), false);
  const result = await prepareRelease(['--release-id', releaseId]);
  assert.equal(result.mode, 'plan');
  assert.equal(result.releaseId, releaseId);
  assert.equal(await exists(`release/${releaseId}`), false);
});

test('artifact apply rejects staged changes before allowing generated build outputs', async () => {
  const source = await readFile(resolve(root, 'scripts/prepare-god9-release.mjs'), 'utf8');
  assert.match(source, /git', \['diff', '--cached', '--quiet'\]/u);
  assert.match(source, /public\\\/downloads\\\/resume_/u);
});

test('artifact apply rejects untracked source and always replaces stale dist with a fresh build', async () => {
  const rejectedReleaseId = `20990101-000001-dirty-gate-${process.pid}`;
  const unexpectedSource = resolve(root, `god9-untracked-source-${process.pid}.tmp`);
  await writeFile(unexpectedSource, 'must fail closed');
  try {
    await assert.rejects(
      prepareRelease(['--apply', '--release-id', rejectedReleaseId, '--confirm', rejectedReleaseId]),
      /dirty Git worktree/u,
    );
  } finally {
    await rm(unexpectedSource, { force: true });
  }

  const releaseId = `20990101-000002-build-gate-${process.pid}`;
  const artifact = resolve(root, 'release', releaseId);
  const staleDistFile = resolve(root, 'dist', 'god9-stale-provenance.txt');
  await writeFile(staleDistFile, 'must not be packaged');
  try {
    const result = await prepareRelease(['--apply', '--release-id', releaseId, '--confirm', releaseId]);
    assert.equal(result.mode, 'apply');
    assert.equal(await exists('dist/god9-stale-provenance.txt'), false);
    await assert.rejects(access(resolve(artifact, 'site/god9-stale-provenance.txt')));
  } finally {
    await rm(artifact, { recursive: true, force: true });
  }
});

test('release validation binds SHA256SUMS to manifest hashes, sizes, and safe records', async () => {
  const releaseId = '20990101-000003-integrity-tamper';
  const fixture = await createReleaseFixture(releaseId);
  try {
    await validateReleaseBundle(fixture.directory, releaseId);
    const tamperedContent = '<h1>tampered after staging</h1>';
    await writeFile(resolve(fixture.directory, 'site/ru/index.html'), tamperedContent);
    const manifestContent = await readFile(resolve(fixture.directory, 'release-manifest.json'), 'utf8');
    const checksums = fixture.records
      .map((record) => `${record.path === 'site/ru/index.html' ? hash(tamperedContent) : record.sha256}  ${record.path}`)
      .concat(`${hash(manifestContent)}  release-manifest.json`)
      .join('\n');
    await writeFile(resolve(fixture.directory, 'SHA256SUMS'), `${checksums}\n`);
    await assert.rejects(
      validateReleaseBundle(fixture.directory, releaseId),
      /SHA256SUMS hash does not match release manifest payload: site\/ru\/index\.html/u,
    );
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('permission contract rejects the Windows scp 0700-directory and 0644-file case', () => {
  const scpModes = [
    { kind: 'directory', path: '.', mode: 0o700 },
    { kind: 'file', path: 'site/ru/index.html', mode: 0o644 },
  ];
  assert.throws(
    () => assertUnprivilegedNginxModes(scpModes),
    /directory is not traversable by an unprivileged Nginx worker: \. mode 0700/u,
  );
  assert.doesNotThrow(() => assertUnprivilegedNginxModes([
    { kind: 'directory', path: '.', mode: 0o755 },
    { kind: 'file', path: 'site/ru/index.html', mode: 0o644 },
  ]));
  assert.throws(
    () => assertUnprivilegedNginxModes([{ kind: 'file', path: 'site/ru/index.html', mode: 0o600 }]),
    /file is not readable by an unprivileged Nginx worker/u,
  );
  assert.throws(
    () => assertUnprivilegedNginxModes([{ kind: 'directory', path: '.', mode: 0o777 }]),
    /group\/other writable/u,
  );

  const releaseId = '20990101-000006-finalize-contract';
  assert.throws(
    () => parseHostArgs(['finalize-upload', '--release-id', releaseId, '--confirm', releaseId, '--upload-name', `.upload-${releaseId}-transfer-01`]),
    /requires --apply/u,
  );
  const options = parseHostArgs(['finalize-upload', '--apply', '--release-id', releaseId, '--confirm', releaseId, '--upload-name', `.upload-${releaseId}-transfer-01`]);
  assert.equal(options.uploadname, `.upload-${releaseId}-transfer-01`);
});

test('filesystem permission normalization repairs an actual 0700 release root on POSIX', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'god9-release-permissions-'));
  try {
    const file = resolve(directory, 'index.html');
    await writeFile(file, '<h1>release</h1>', { mode: 0o644 });
    await chmod(directory, 0o700);
    await chmod(file, 0o644);
    assert.equal((await lstat(directory)).mode & 0o777, 0o700);
    assert.equal((await lstat(file)).mode & 0o777, 0o644);
    await assert.rejects(validateReleasePermissions(directory), /mode 0700/u);
    await normalizeReleasePermissions(directory);
    assert.equal((await lstat(directory)).mode & 0o777, 0o755);
    assert.equal((await lstat(file)).mode & 0o777, 0o644);
    await assert.doesNotReject(validateReleasePermissions(directory));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('effective access probe executes as the Nginx worker against every release entry', () => {
  let invocation;
  const directory = '/opt/app/frontend/sites/releases/20990101-000006-permission-probe';
  assertNginxWorkerAccess(directory, [
    { kind: 'directory', path: '.', mode: 0o755 },
    { kind: 'directory', path: 'site/ru', mode: 0o755 },
    { kind: 'file', path: 'site/ru/index.html', mode: 0o644 },
  ], (program, args, options) => { invocation = { program, args, options }; });

  assert.equal(invocation.program, 'docker');
  assert.deepEqual(invocation.args.slice(0, 5), ['exec', '-i', '--user', 'nginx', 'nginx']);
  assert.deepEqual(invocation.args.slice(5, 7), ['sh', '-ceu']);
  assert.match(invocation.args[7], /test -x/u);
  assert.match(invocation.args[7], /test -r/u);
  assert.match(invocation.options.input, /^d \/usr\/share\/nginx\/html\/sites\/releases\/20990101-000006-permission-probe$/mu);
  assert.match(invocation.options.input, /^f \/usr\/share\/nginx\/html\/sites\/releases\/20990101-000006-permission-probe\/site\/ru\/index\.html$/mu);
});

test('host mutations require explicit apply before touching server state', async () => {
  await assert.rejects(
    hostOperation(['cutover', '--release-id', '20260824-123456-abcdef123456']),
    /requires --apply/u,
  );
  await assert.rejects(
    hostOperation(['rollback', '--apply', '--release-id', '20260824-123456-abcdef123456', '--confirm', 'wrong']),
    /--confirm exactly matching/u,
  );
  await assert.rejects(
    hostOperation(['finalize-upload', '--apply', '--release-id', '20260824-123456-abcdef123456', '--confirm', '20260824-123456-abcdef123456', '--upload-name', '../../release']),
    /--upload-name must be one direct temporary release child/u,
  );
  const source = await readFile(resolve(root, 'infra/release/god9-host.mjs'), 'utf8');
  assert.match(source, /httpsStatus\(port, pathname\)/u);
  for (const probe of ["['/', 200]", "['/api/health', 200]", "['/voidplayer/', 200]", "['/openclaw-voice/rollback-probe', 410]"]) {
    assert.ok(source.includes(probe), probe);
  }
  const cutover = source.slice(source.indexOf('async function cutover('), source.indexOf('async function rollback('));
  assert.ok(cutover.indexOf('await preflight(options)') > 0, 'cutover must run a fresh candidate preflight');
  assert.ok(cutover.indexOf('await preflight(options)') < cutover.indexOf('await atomicSymlink('), 'candidate preflight must precede the first cutover mutation');
  assert.ok(cutover.indexOf('await entryExists(cutoverMarkerPath)') < cutover.indexOf('await atomicSymlink('), 'an existing immutable cutover marker must fail before the first mutation');
  assert.ok(cutover.indexOf('await acquireCutoverLock(releaseId)') < cutover.indexOf('await writeDurableJsonExclusive(pendingPath'), 'the global cutover lock must precede the pending journal');
  assert.ok(cutover.indexOf('await writeDurableJsonExclusive(pendingPath') < cutover.indexOf('await atomicSymlink('), 'the durable pending journal must precede the first mutation');
  assert.ok(cutover.indexOf('await waitForProductionProbes(301)') < cutover.indexOf('await commitDurableJson(cutoverMarkerPath'), 'post-reload readiness probes must pass before committed evidence');
  const mutationCatch = cutover.indexOf('} catch (error)', cutover.indexOf('await atomicSymlink('));
  assert.ok(cutover.indexOf('await commitDurableJson(cutoverMarkerPath') < mutationCatch, 'committed evidence must stay inside the automatic rollback boundary');
  assert.match(cutover, /Live deployment is neither the exact previous nor candidate snapshot/u);
  assert.match(cutover, /marker\.result !== 'pass'/u);
  assert.match(cutover, /marker\.activeTarget !== activeTarget/u);
  assert.match(cutover, /marker\.legacyRollbackTarget !== legacyTarget/u);
  assert.match(cutover, /pendingError/u);

  const evidenceHelpers = source.slice(source.indexOf('export async function writeDurableJsonExclusive('), source.indexOf('async function rollback('));
  assert.match(evidenceHelpers, /await handle\.sync\(\)/u);
  assert.match(evidenceHelpers, /await syncDirectory\(dirname\(pathname\)\)/u);
  assert.match(evidenceHelpers, /await link\(temporary, pathname\)/u);
  assert.match(evidenceHelpers, /await syncDirectory\(dirname\(temporary\)\)/u);
  assert.match(source, /await symlink\(releaseId, CUTOVER_LOCK\);\s+await syncDirectory\(STATE_ROOT\)/u);
  assert.match(source, /await unlink\(CUTOVER_LOCK\);\s+await syncDirectory\(STATE_ROOT\)/u);
  const readiness = source.slice(source.indexOf('async function waitForProductionProbes('), source.indexOf('async function replaceIncludes('));
  assert.match(readiness, /timeoutMs = 15_000/u);
  assert.match(readiness, /await new Promise\(\(resolveDelay\) => setTimeout\(resolveDelay, intervalMs\)\)/u);
  assert.match(readiness, /Production did not reach the expected post-reload state/u);
  const rollback = source.slice(source.indexOf('async function rollback('), source.indexOf('export async function main('));
  assert.ok(rollback.indexOf('await restoreState(state)') < rollback.indexOf('await waitForProductionProbes(200)'), 'rollback evidence must wait for the restored workers');

  const staging = source.slice(source.indexOf('async function stagingUp('), source.indexOf('async function finalizeUpload('));
  assert.ok(staging.indexOf('await preflight(options)') > 0, 'staging must run the candidate permission preflight');
  assert.ok(staging.indexOf('await preflight(options)') < staging.indexOf("'run', '-d'"), 'candidate preflight must precede staging container creation');

  const finalize = source.slice(source.indexOf('async function finalizeUpload('), source.indexOf('async function stagingDown('));
  const firstIntegrityCheck = finalize.indexOf('await validateReleaseBundle(temporary, releaseId)');
  const normalize = finalize.indexOf('await normalizeReleasePermissions(temporary)');
  const secondIntegrityCheck = finalize.indexOf('await validateReleaseBundle(temporary, releaseId)', firstIntegrityCheck + 1);
  const workerProbe = finalize.indexOf('assertNginxWorkerAccess(temporary, permissionEntries)');
  const finalRename = finalize.indexOf('await rename(temporary, final)');
  assert.ok(firstIntegrityCheck > 0 && firstIntegrityCheck < normalize, 'temp bundle integrity must pass before permission normalization');
  assert.ok(normalize < secondIntegrityCheck && secondIntegrityCheck < workerProbe, 'checksums must be revalidated before the worker probe');
  assert.ok(workerProbe < finalRename, 'worker access must pass before atomic finalization');
  assert.equal(finalize.indexOf('chmod(', finalRename), -1, 'finalized releases must never be chmodded');
});

test('durable cutover evidence is parseable, exclusive, and race-safe', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'god9-cutover-evidence-'));
  try {
    const marker = resolve(directory, 'cutover.json');
    const payloads = [{ releaseId: 'release-a', result: 'pass' }, { releaseId: 'release-b', result: 'pass' }];
    const results = await Promise.allSettled([
      commitDurableJson(marker, resolve(directory, 'commit-a.tmp'), payloads[0]),
      commitDurableJson(marker, resolve(directory, 'commit-b.tmp'), payloads[1]),
    ]);
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
    const committed = JSON.parse(await readFile(marker, 'utf8'));
    assert.ok(payloads.some((payload) => JSON.stringify(payload) === JSON.stringify(committed)));
    await assert.rejects(writeDurableJsonExclusive(marker, { result: 'overwrite' }), /EEXIST/u);

    const partial = resolve(directory, 'partial.json');
    await writeFile(partial, '{', 'utf8');
    await assert.rejects(commitDurableJson(partial, resolve(directory, 'partial.tmp'), { result: 'pass' }), /EEXIST/u);
    assert.equal(await readFile(partial, 'utf8'), '{');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rollback harness mirrors every production Nginx network before startup', async () => {
  assert.deepEqual(attachedNetworkNames({ NetworkSettings: { Networks: { z_service: {}, app_app_network: {}, 'community-bot_default': {} } } }), [
    'app_app_network', 'community-bot_default', 'z_service',
  ]);
  assert.throws(() => attachedNetworkNames({ NetworkSettings: { Networks: {} } }, 'Nginx'), /not attached/u);
  assert.throws(() => attachedNetworkNames({ NetworkSettings: { Networks: { 'unsafe/network': {} } } }, 'Nginx'), /unsafe Docker network name/u);

  const source = await readFile(resolve(root, 'infra/release/god9-host.mjs'), 'utf8');
  const rollback = source.slice(source.indexOf('async function testRollback('), source.indexOf('async function atomicSymlink('));
  const create = rollback.indexOf("'create', '--name', name");
  const connect = rollback.indexOf("['network', 'connect', network, name]");
  const start = rollback.indexOf("['start', name]");
  const testConfig = rollback.indexOf("['exec', name, 'nginx', '-t']");
  assert.ok(create > 0 && create < connect, 'rollback container must be created before secondary networks attach');
  assert.ok(connect < start && start < testConfig, 'all production networks must attach before Nginx starts and is tested');
  assert.doesNotMatch(rollback, /'run', '-d'/u);
});

test('staging and verification keep TLS and plain HTTP ports separate', () => {
  const releaseId = '20990101-000004-transport-contract';
  const hostOptions = parseHostArgs(['staging-up', '--apply', '--release-id', releaseId, '--confirm', releaseId, '--port', '18443', '--http-port', '18080']);
  assert.equal(hostOptions.port, 18443);
  assert.equal(hostOptions.httpPort, 18080);
  assert.throws(
    () => parseHostArgs(['staging-up', '--apply', '--port', '18443', '--http-port', '18443']),
    /TLS and plain HTTP staging ports must be different/u,
  );

  assert.throws(
    () => parseVerificationArgs(['--phase', 'staging', '--release-id', releaseId, '--connect-address', '127.0.0.1', '--connect-port', '18443']),
    /explicit plain HTTP --connect-http-port/u,
  );
  assert.throws(
    () => parseVerificationArgs(['--phase', 'staging', '--release-id', releaseId, '--connect-address', '127.0.0.1', '--connect-port', '18443', '--connect-http-port', '18443']),
    /HTTPS and plain HTTP connect ports must be different/u,
  );
  const verifierOptions = parseVerificationArgs(['--phase', 'staging', '--release-id', releaseId, '--connect-address', '127.0.0.1', '--connect-port', '18443', '--connect-http-port', '18080']);
  assert.equal(verifierOptions.connectport, '18443');
  assert.equal(verifierOptions.connecthttpport, '18080');
});

test('staging can isolate signed bundle performance from SSH tunnel latency', async () => {
  const releaseId = '20990101-000004-signed-performance';
  const release = await mkdtemp(resolve(tmpdir(), 'god9-signed-performance-'));
  const html = '<!doctype html><html><body><h1>Signed candidate</h1></body></html>';
  const site = resolve(release, 'site');
  const manifestPath = resolve(release, 'release-manifest.json');
  await mkdir(resolve(site, 'ru'), { recursive: true });
  await writeFile(resolve(site, 'ru', 'index.html'), html);
  await writeFile(manifestPath, `${JSON.stringify({
    schema: 'god9.release.v1',
    releaseId,
    payload: [{ path: 'site/ru/index.html', bytes: Buffer.byteLength(html), sha256: hash(html) }],
  })}\n`);

  const options = parseVerificationArgs([
    '--phase', 'staging', '--release-id', releaseId,
    '--connect-address', '127.0.0.1', '--connect-port', '18443', '--connect-http-port', '18080',
    '--browser', '--signed-local-performance', '--release-manifest', manifestPath,
  ]);
  assert.equal(options.signedlocalperformance, true);
  const preview = await startSignedReleasePreview(options);
  try {
    const response = await fetch(`${preview.origin}/ru/`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-god9-release-id'), releaseId);
    assert.equal(await response.text(), html);

    await writeFile(resolve(site, 'ru', 'index.html'), `${html}\nchanged`);
    assert.equal((await fetch(`${preview.origin}/ru/`)).status, 500);
    assert.equal((await fetch(`${preview.origin}/unsigned/`)).status, 404);
  } finally {
    await preview.close();
    await rm(release, { recursive: true, force: true });
  }

  assert.throws(
    () => parseVerificationArgs(['--phase', 'production', '--release-id', releaseId, '--browser', '--signed-local-performance', '--release-manifest', manifestPath]),
    /only valid during staging/u,
  );
  assert.throws(
    () => parseVerificationArgs(['--phase', 'staging', '--release-id', releaseId, '--connect-address', '127.0.0.1', '--connect-http-port', '18080', '--signed-local-performance', '--release-manifest', manifestPath]),
    /requires --browser/u,
  );
});

test('HTTP policy maps serve and redirect directly to HTTPS, and terminal actions never redirect', () => {
  const redirect = expectedHttpContract({ source: 'https://cv.godmodetools.com/', final: { action: 'redirect', target: 'https://godmodetools.com/ru/experience/' } });
  assert.deepEqual(redirect, { status: 301, location: 'https://godmodetools.com/ru/experience/?god9_query=preserved&source=release-verifier', hops: 1 });
  const serve = expectedHttpContract({ source: 'https://godmodetools.com/en/', final: { action: 'serve', target: 'https://godmodetools.com/en/' } });
  assert.deepEqual(serve, { status: 301, location: 'https://godmodetools.com/en/?god9_query=preserved&source=release-verifier', hops: 1 });
  assert.deepEqual(expectedHttpContract({ source: 'https://godmodetools.com/old', final: { action: 'gone' } }), { status: 410, location: undefined, hops: 0 });
  assert.deepEqual(expectedHttpContract({ source: 'https://godmodetools.com/missing', final: { action: 'not_found' } }), { status: 404, location: undefined, hops: 0 });
  assert.throws(
    () => expectedHttpContract({ source: 'https://godmodetools.com/', final: { action: 'unexpected' } }),
    /Unsupported HTTP policy action/u,
  );
});

test('cutover rejects legacy or incomplete staging transport evidence', () => {
  assert.equal(hasCompleteTransportEvidence({ result: 'pass', inventoryChecks: 46, oneHopRedirects: 32 }), false);
  assert.equal(hasCompleteTransportEvidence({
    result: 'pass',
    httpsInventory: { result: 'pass', checks: 46, oneHopRedirects: 32, terminalChecks: 14 },
    httpPolicy: { result: 'pass', checks: 46, oneHopRedirects: 39, terminalChecks: 6 },
  }), false);
  assert.equal(hasCompleteTransportEvidence({
    result: 'pass',
    httpsInventory: { result: 'pass', checks: 46, oneHopRedirects: 32, terminalChecks: 14 },
    httpPolicy: { result: 'pass', checks: 46, oneHopRedirects: 39, terminalChecks: 7 },
  }), true);
});

test('rollback fails closed as soon as legacy-link retirement starts', async () => {
  const state = await mkdtemp(resolve(tmpdir(), 'god9-rollback-state-'));
  try {
    await assertRollbackOpen(state);
    await writeFile(resolve(state, 'legacy-link-retired.json'), '{"result":"rollback-closed"}\n');
    await assert.rejects(assertRollbackOpen(state), /Rollback is closed/u);
    const hostSource = await readFile(resolve(root, 'infra/release/god9-host.mjs'), 'utf8');
    const restoreState = hostSource.slice(hostSource.indexOf('async function restoreState('), hostSource.indexOf('async function cutover('));
    assert.ok(restoreState.indexOf('await assertRollbackOpen(') < restoreState.indexOf('await restoreLink('));
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});

test('Nginx contract matches the real production mounts and preserves protected services', async () => {
  const nginx = await readFile(resolve(root, 'infra/nginx/default.conf'), 'utf8');
  assert.match(nginx, /root \/usr\/share\/nginx\/html\/site-current;/u);
  assert.doesNotMatch(nginx, /\bgzip(?:_|\s)|compression\.inc/u);
  assert.match(nginx, /include \/etc\/nginx\/conf\.d\/_includes\/site-cache\.inc;/u);
  assert.doesNotMatch(nginx, /\/etc\/nginx\/includes|sites\/current\/site/u);
  assert.match(nginx, /location \^~ \/api\/\s*\{[\s\S]*proxy_pass http:\/\/backend:8000\//u);
  assert.match(nginx, /location \^~ \/voidplayer\/\s*\{[\s\S]*alias \/usr\/share\/nginx\/html\/voidplayer\//u);

  const includes = ['security-headers.inc', 'site-cache.inc'];
  for (const name of includes) assert.equal(await exists(`infra/nginx/conf.d/_includes/${name}`), true);
  for (const retired of ['compression.conf', 'security-headers.conf', 'site-cache.conf']) {
    assert.equal(await exists(`infra/nginx/includes/${retired}`), false);
  }
});

test('runbook finalizes a normalized temporary upload before candidate preflight', async () => {
  const runbook = await readFile(resolve(root, 'docs/runbooks/GOD-9-staging-cutover-cleanup.md'), 'utf8');
  const upload = runbook.slice(runbook.indexOf('Transport permissions считаются недоверенными'), runbook.indexOf('## 4. Isolated staging gate'));
  assert.match(upload, /GOD9_UPLOAD_NAME="\.upload-\$GOD9_RELEASE_ID-transfer-01"/u);
  assert.match(upload, /scp -r "release\/\$GOD9_RELEASE_ID" "\$GOD9_HOST:\$GOD9_UPLOAD_PATH"/u);
  assert.doesNotMatch(upload, /scp[^\n]+GOD9_FINAL_PATH/u);
  assert.ok(upload.indexOf('finalize-upload') < upload.indexOf('preflight --release-id'), 'finalization must precede candidate preflight');
  assert.match(upload, /exact `0755` всем directories и `0644` всем/u);
  assert.match(upload, /Не запускать `chmod` после finalization/u);
});

test('legacy frontend stacks and their build entrypoints are absent', async () => {
  const retired = [
    '.openai', 'app', 'db', 'drizzle', 'drizzle.config.ts', 'eslint.config.mjs',
    'examples', 'next-env.d.ts', 'next.config.ts', 'shared', 'sites', 'vite.config.ts', 'worker',
    'scripts/assemble-release.mjs', 'scripts/build-hub.mjs', 'scripts/sync-neural-assets.mjs',
  ];
  for (const pathname of retired) assert.equal(await exists(pathname), false, pathname);

  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['legacy:ai:build'], undefined);
  assert.equal(packageJson.scripts['test:legacy-ai'], undefined);
  assert.equal(packageJson.scripts['release:plan'], 'node scripts/prepare-god9-release.mjs');
  assert.equal(packageJson.scripts['release:prepare'], 'node scripts/prepare-god9-release.mjs --apply');
  assert.equal(packageJson.scripts['verify:god9'], 'node scripts/verify-god9-release.mjs');
});

test('cleanup tool requires exact manifests, observation evidence, and SHA confirmation', async () => {
  const source = await readFile(resolve(root, 'infra/release/god9-cleanup.mjs'), 'utf8');
  assert.match(source, /god9\.cleanup-manifest\.v1/u);
  assert.match(source, /options\.confirm !== packet\.sha256/u);
  assert.match(source, /god9\.observation\.v1/u);
  assert.match(source, /mountTargets\.some/u);
  assert.match(source, /protectedTargets\(\)/u);
  assert.match(source, /activeReleaseDirectory\(\)/u);
  assert.match(source, /verifiedReleaseEvidence/u);
  assert.match(source, /assertNoCutoverLock\(\)/u);
  assert.doesNotMatch(source, /rm\s+-rf|glob\s*\(/u);
  const retirement = source.slice(source.indexOf('async function retireLegacyLink('));
  assert.ok(retirement.indexOf('writeFile(markerPath') < retirement.indexOf('unlink(LEGACY_LINK)'), 'rollback-closed marker must be durable before legacy unlink');
});

test('cleanup inventory identity is bound to the active site-current release', () => {
  const activeReleaseId = '20990101-000005-active-release';
  const activeRelease = exactReleasePath(activeReleaseId);
  assert.equal(assertActiveReleaseIdentity(activeReleaseId, activeRelease), activeRelease);
  assert.throws(
    () => assertActiveReleaseIdentity('20990101-000006-wrong-release', activeRelease),
    /--release-id does not match active site-current release/u,
  );
});
