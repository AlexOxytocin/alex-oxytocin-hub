#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  lstat,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = '/opt/app/frontend';
const RELEASES_ROOT = '/opt/app/frontend/sites/releases';
const LEGACY_LINK = '/opt/app/frontend/sites/current';
const ACTIVE_LINK = '/opt/app/frontend/site-current';
const VOIDPLAYER_ROOT = '/opt/app/frontend/voidplayer';
const STATE_ROOT = '/opt/app/frontend/god9-state';
const CUTOVER_LOCK = resolve(STATE_ROOT, '.cutover.lock');
const releaseIdPattern = /^\d{8}-\d{6}-[a-z0-9][a-z0-9._-]{2,63}$/u;
const releaseDirectoryPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u;

function command(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) throw new Error(`${program} ${args.join(' ')} failed with ${result.status}`);
  return result.stdout.trim();
}

async function exists(pathname) {
  try {
    await lstat(pathname);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function assertNoCutoverLock() {
  if (await exists(CUTOVER_LOCK)) throw new Error('Cleanup is blocked by an unresolved cutover lock; run reconcile-cutover first');
}

function validateReleaseId(value, label = 'release id') {
  if (!releaseIdPattern.test(value ?? '')) throw new Error(`Invalid ${label}`);
  return value;
}

function validateReleaseDirectoryName(value) {
  if (!releaseDirectoryPattern.test(value ?? '')) throw new Error(`Invalid release directory name: ${value}`);
  return value;
}

export function exactReleasePath(releaseId) {
  const target = resolve(RELEASES_ROOT, validateReleaseDirectoryName(releaseId));
  if (relative(RELEASES_ROOT, target).includes(sep)) throw new Error('Cleanup target must be one direct child of releases root');
  return target;
}

export function validateManifestTarget(target) {
  if (typeof target !== 'string' || target !== resolve(target)) throw new Error(`Cleanup target must be absolute and normalized: ${target}`);
  const releaseId = relative(RELEASES_ROOT, target);
  if (!releaseId || releaseId.includes(sep) || releaseId === '..' || releaseId.startsWith(`..${sep}`)) throw new Error(`Cleanup target escaped releases root: ${target}`);
  validateReleaseDirectoryName(releaseId);
  if (target === VOIDPLAYER_ROOT || target.startsWith(`${VOIDPLAYER_ROOT}${sep}`)) throw new Error('VoidPlayer can never be a cleanup target');
  return { target, releaseId };
}

async function sha256(pathname) {
  return createHash('sha256').update(await readFile(pathname)).digest('hex');
}

async function assertRegularFile(pathname, label) {
  const stat = await lstat(pathname);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file: ${pathname}`);
}

async function assertReleaseDirectory(pathname) {
  validateManifestTarget(pathname);
  const stat = await lstat(pathname);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Cleanup target must be a real directory: ${pathname}`);
  if (await realpath(pathname) !== pathname) throw new Error(`Cleanup target resolved unexpectedly: ${pathname}`);
  const mountTargets = command('findmnt', ['-rn', '-o', 'TARGET']).split('\n').filter(Boolean);
  if (mountTargets.some((mount) => mount === pathname || mount.startsWith(`${pathname}/`))) throw new Error(`Cleanup target contains a mountpoint: ${pathname}`);
}

async function protectedTargets() {
  const protectedPaths = new Set();
  for (const link of [ACTIVE_LINK, LEGACY_LINK]) {
    if (!(await exists(link))) continue;
    const stat = await lstat(link);
    if (!stat.isSymbolicLink()) throw new Error(`Protected pointer is not a symlink: ${link}`);
    const pointerTarget = await realpath(link);
    const pathFromReleases = relative(RELEASES_ROOT, pointerTarget).split(sep);
    if (pathFromReleases.length === 1) protectedPaths.add(pointerTarget);
    else if (pathFromReleases.length === 2 && pathFromReleases[1] === 'site') protectedPaths.add(dirname(pointerTarget));
    else throw new Error(`Protected pointer escaped a versioned release boundary: ${link}`);
  }
  return protectedPaths;
}

async function activeReleaseDirectory() {
  const target = await realpath(ACTIVE_LINK);
  const pathFromReleases = relative(RELEASES_ROOT, target).split(sep);
  if (pathFromReleases.length !== 2 || pathFromReleases[1] !== 'site') throw new Error('Active pointer is not a versioned release/site target');
  return dirname(target);
}

export function assertActiveReleaseIdentity(cutoverReleaseId, activeRelease) {
  const expected = exactReleasePath(validateReleaseId(cutoverReleaseId, 'cutover release id'));
  if (activeRelease !== expected) throw new Error(`--release-id does not match active site-current release: expected ${expected}, received ${activeRelease}`);
  return activeRelease;
}

function parseArgs(argv) {
  const options = { action: argv[0] ?? 'inventory', apply: false, keep: [] };
  for (let index = argv[0] ? 1 : 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--keep-release-id') options.keep.push(argv[++index]);
    else if (['--release-id', '--manifest', '--confirm', '--observation-evidence', '--public-evidence', '--direct-origin-evidence'].includes(arg)) options[arg.slice(2).replaceAll('-', '')] = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['inventory', 'plan', 'apply', 'retire-legacy-link'].includes(options.action)) throw new Error(`Unknown cleanup action: ${options.action}`);
  if (['apply', 'retire-legacy-link'].includes(options.action) && !options.apply) throw new Error(`${options.action} requires --apply`);
  return options;
}

async function inventory(options) {
  await assertNoCutoverLock();
  const cutoverReleaseId = validateReleaseId(options.releaseid, 'cutover release id');
  if (options.keep.length === 0) throw new Error('Inventory requires at least one explicit --keep-release-id rollback release');
  const keep = new Set(options.keep.map((id) => exactReleasePath(id)));
  const activeRelease = await activeReleaseDirectory();
  assertActiveReleaseIdentity(cutoverReleaseId, activeRelease);
  for (const path of keep) {
    if (path === activeRelease) throw new Error('--keep-release-id must name an additional rollback release, not the active release');
    await assertReleaseDirectory(path);
  }
  const protectedPaths = await protectedTargets();
  for (const path of keep) protectedPaths.add(path);
  const targets = [];
  for (const entry of await readdir(RELEASES_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    if (!releaseDirectoryPattern.test(entry.name)) continue;
    const target = exactReleasePath(entry.name);
    if (!protectedPaths.has(target)) targets.push(target);
  }
  const manifest = {
    schema: 'god9.cleanup-manifest.v1',
    cutoverReleaseId,
    generatedAtUtc: new Date().toISOString(),
    protected: [...protectedPaths].sort(),
    targets: targets.sort(),
  };
  console.log(JSON.stringify(manifest, null, 2));
  return manifest;
}

async function readManifest(pathname) {
  const resolved = resolve(pathname ?? '');
  await assertRegularFile(resolved, 'Cleanup manifest');
  const manifest = JSON.parse(await readFile(resolved, 'utf8'));
  validateReleaseId(manifest.cutoverReleaseId, 'manifest cutover release id');
  if (manifest.schema !== 'god9.cleanup-manifest.v1' || !Array.isArray(manifest.targets) || manifest.targets.length === 0) throw new Error('Invalid or empty cleanup manifest');
  if (new Set(manifest.targets).size !== manifest.targets.length) throw new Error('Cleanup manifest has duplicate targets');
  for (const target of manifest.targets) validateManifestTarget(target);
  return { pathname: resolved, manifest, sha256: await sha256(resolved) };
}

async function plan(options) {
  const packet = await readManifest(options.manifest);
  const protectedPaths = await protectedTargets();
  let kib = 0;
  for (const target of packet.manifest.targets) {
    if (protectedPaths.has(target)) throw new Error(`Manifest includes a currently protected release: ${target}`);
    await assertReleaseDirectory(target);
    kib += Number(command('du', ['-sk', '--', target]).split(/\s+/u)[0]);
  }
  const result = { result: 'pass', mode: 'plan', manifestSha256: packet.sha256, targetCount: packet.manifest.targets.length, reclaimableKiB: kib, targets: packet.manifest.targets };
  console.log(JSON.stringify(result, null, 2));
  return { ...packet, ...result };
}

async function verifiedReleaseEvidence(pathname, releaseId, expectedMode, expectedHash) {
  const resolved = resolve(pathname ?? '');
  await assertRegularFile(resolved, `${expectedMode} verification evidence`);
  if (await sha256(resolved) !== expectedHash) throw new Error(`${expectedMode} verification evidence hash mismatch`);
  const evidence = JSON.parse(await readFile(resolved, 'utf8'));
  const browserSatisfied = expectedMode === 'public-dns' ? evidence.browser?.result === 'pass' : true;
  if (evidence.schema !== 'god9.verification.v1' || evidence.phase !== 'production' || evidence.releaseId !== releaseId || evidence.result !== 'pass' || evidence.mode !== expectedMode || evidence.http?.result !== 'pass' || !browserSatisfied) {
    throw new Error(`${expectedMode} verification evidence failed its production contract`);
  }
}

async function readObservationEvidence(pathname, releaseId, publicEvidence, directOriginEvidence) {
  const resolved = resolve(pathname ?? '');
  await assertRegularFile(resolved, 'Observation evidence');
  const evidence = JSON.parse(await readFile(resolved, 'utf8'));
  const search = evidence.searchConsole;
  const searchSatisfied = search === 'pass' || (search === 'blocked' && evidence.fallbacks?.sitemap === 'pass' && evidence.fallbacks?.robots === 'pass' && evidence.fallbacks?.logs === 'pass');
  const startedAt = Date.parse(evidence.startedAtUtc);
  const endedAt = Date.parse(evidence.endedAtUtc);
  const approvedHours = Number(evidence.approvedWindowHours);
  const elapsedHours = (endedAt - startedAt) / 3_600_000;
  const evidenceHashesPresent = /^[a-f0-9]{64}$/u.test(evidence.public?.evidenceSha256 ?? '') && /^[a-f0-9]{64}$/u.test(evidence.directOrigin?.evidenceSha256 ?? '');
  if (evidence.schema !== 'god9.observation.v1' || evidence.releaseId !== releaseId || evidence.result !== 'pass' || evidence.public?.result !== 'pass' || evidence.directOrigin?.result !== 'pass' || evidence.logs?.result !== 'pass' || !searchSatisfied || !Number.isFinite(startedAt) || !Number.isFinite(endedAt) || !Number.isFinite(approvedHours) || approvedHours < 1 || elapsedHours < approvedHours || !evidenceHashesPresent) {
    throw new Error('Observation evidence does not satisfy the cleanup gate');
  }
  await verifiedReleaseEvidence(publicEvidence, releaseId, 'public-dns', evidence.public.evidenceSha256);
  await verifiedReleaseEvidence(directOriginEvidence, releaseId, 'pinned-origin', evidence.directOrigin.evidenceSha256);
  return evidence;
}

async function applyCleanup(options) {
  await assertNoCutoverLock();
  const packet = await plan(options);
  if (options.confirm !== packet.sha256) throw new Error('Cleanup apply requires --confirm equal to the exact manifest SHA-256');
  await readObservationEvidence(options.observationevidence, packet.manifest.cutoverReleaseId, options.publicevidence, options.directoriginevidence);
  const protectedPaths = await protectedTargets();
  for (const target of packet.manifest.targets) {
    if (protectedPaths.has(target)) throw new Error(`Cleanup target became protected after planning: ${target}`);
    await assertReleaseDirectory(target);
  }
  for (const target of packet.manifest.targets) await rm(target, { recursive: true, force: false, maxRetries: 0 });
  const result = { result: 'pass', mode: 'apply', manifestSha256: packet.sha256, removed: packet.manifest.targets };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function retireLegacyLink(options) {
  await assertNoCutoverLock();
  const releaseId = validateReleaseId(options.releaseid, 'cutover release id');
  if (options.confirm !== `RETIRE-${releaseId}`) throw new Error('Legacy retirement requires --confirm RETIRE-<release-id>');
  await readObservationEvidence(options.observationevidence, releaseId, options.publicevidence, options.directoriginevidence);
  const state = resolve(STATE_ROOT, releaseId);
  await assertRegularFile(resolve(state, 'cutover.json'), 'Cutover marker');
  const cutover = JSON.parse(await readFile(resolve(state, 'cutover.json'), 'utf8'));
  if (cutover.result !== 'pass' || cutover.releaseId !== releaseId) throw new Error('Cutover marker mismatch');
  const activeStat = await lstat(ACTIVE_LINK);
  const legacyStat = await lstat(LEGACY_LINK);
  if (!activeStat.isSymbolicLink() || !legacyStat.isSymbolicLink()) throw new Error('Active and legacy pointers must be symlinks');
  const activeTarget = await realpath(ACTIVE_LINK);
  if (activeTarget !== resolve(exactReleasePath(releaseId), 'site')) throw new Error('Cutover release is not active');
  const retiredTarget = await realpath(LEGACY_LINK);
  const markerPath = resolve(state, 'legacy-link-retired.json');
  const temporaryMarker = resolve(state, `.legacy-link-retired.${process.pid}.tmp`);
  const retirementStartedAtUtc = new Date().toISOString();
  const pendingMarker = { schema: 'god9.legacy-link-retirement.v1', releaseId, result: 'rollback-closed', retirementStartedAtUtc, retiredTarget };
  await writeFile(markerPath, `${JSON.stringify(pendingMarker, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  await unlink(LEGACY_LINK);
  const marker = { ...pendingMarker, result: 'pass', retiredAtUtc: new Date().toISOString() };
  await writeFile(temporaryMarker, `${JSON.stringify(marker, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  await rename(temporaryMarker, markerPath);
  console.log(JSON.stringify(marker, null, 2));
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.action === 'inventory') return inventory(options);
  if (options.action === 'plan') return plan(options);
  if (options.action === 'apply') return applyCleanup(options);
  return retireLegacyLink(options);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`GOD-9 cleanup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
