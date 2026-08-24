import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

import { inspectSite, isContained, main as prepareRelease, validateReleaseId } from '../scripts/prepare-god9-release.mjs';
import { expectedHttpContract, parseArgs as parseVerificationArgs } from '../scripts/verify-god9-release.mjs';
import { assertRollbackOpen, hasCompleteTransportEvidence, main as hostOperation, parseArgs as parseHostArgs, validateReleaseBundle } from '../infra/release/god9-host.mjs';
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
    ['nginx/_includes/compression.inc', 'gzip on;'],
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
  assert.ok(site.fileCount >= 300);
  assert.ok(site.htmlCount >= 40);
  assert.ok(site.bytes > 20 * 1024 * 1024);
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

test('host mutations require explicit apply before touching server state', async () => {
  await assert.rejects(
    hostOperation(['cutover', '--release-id', '20260824-123456-abcdef123456']),
    /requires --apply/u,
  );
  await assert.rejects(
    hostOperation(['rollback', '--apply', '--release-id', '20260824-123456-abcdef123456', '--confirm', 'wrong']),
    /--confirm exactly matching/u,
  );
  const source = await readFile(resolve(root, 'infra/release/god9-host.mjs'), 'utf8');
  assert.match(source, /httpsStatus\(port, pathname\)/u);
  for (const probe of ["['/', 200]", "['/api/health', 200]", "['/voidplayer/', 200]", "['/openclaw-voice/rollback-probe', 410]"]) {
    assert.ok(source.includes(probe), probe);
  }
  const cutover = source.slice(source.indexOf('async function cutover('), source.indexOf('async function rollback('));
  assert.ok(cutover.indexOf('await preflight();') > 0, 'cutover must run a fresh preflight');
  assert.ok(cutover.indexOf('await preflight();') < cutover.indexOf('await atomicSymlink('), 'preflight must precede the first cutover mutation');
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
  assert.match(nginx, /include \/etc\/nginx\/conf\.d\/_includes\/compression\.inc;/u);
  assert.match(nginx, /include \/etc\/nginx\/conf\.d\/_includes\/site-cache\.inc;/u);
  assert.doesNotMatch(nginx, /\/etc\/nginx\/includes|sites\/current\/site/u);
  assert.match(nginx, /location \^~ \/api\/\s*\{[\s\S]*proxy_pass http:\/\/backend:8000\//u);
  assert.match(nginx, /location \^~ \/voidplayer\/\s*\{[\s\S]*alias \/usr\/share\/nginx\/html\/voidplayer\//u);

  const includes = ['compression.inc', 'security-headers.inc', 'site-cache.inc'];
  for (const name of includes) assert.equal(await exists(`infra/nginx/conf.d/_includes/${name}`), true);
  for (const retired of ['compression.conf', 'security-headers.conf', 'site-cache.conf']) {
    assert.equal(await exists(`infra/nginx/includes/${retired}`), false);
  }
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
