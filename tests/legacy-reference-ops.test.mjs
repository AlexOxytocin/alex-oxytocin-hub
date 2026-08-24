import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  injectReferenceInclude,
  parseArgs as parseHostArgs,
  publicPrefix,
  renderLocationInclude,
  rewriteLegacyHtml,
  rewriteReferenceUrl,
  validateReleaseId,
} from '../infra/legacy-reference/legacy-reference-host.mjs';
import { parseArgs as parseVerifierArgs } from '../scripts/verify-legacy-reference.mjs';

const root = resolve(import.meta.dirname, '..');
const releaseId = '20260819-211500-hub-coat-original-v6-reference-v1';
const sourceReleaseId = '20260819-211500-hub-coat-original-v6';

test('reference ids and CLI confirmations fail closed', () => {
  assert.equal(validateReleaseId(releaseId), releaseId);
  assert.throws(() => validateReleaseId('../../sites/current'), /valid reference id|valid release id/u);
  assert.throws(
    () => parseHostArgs(['deploy', '--release-id', releaseId, '--source-release-id', sourceReleaseId]),
    /requires --apply/u,
  );
  const options = parseHostArgs([
    'deploy', '--apply', '--release-id', releaseId, '--source-release-id', sourceReleaseId,
    '--confirm', `DEPLOY-${releaseId}`,
  ]);
  assert.equal(options.releaseid, releaseId);
  assert.equal(options.sourcereleaseid, sourceReleaseId);
});

test('legacy HTML becomes reference-local and crawl-safe without changing visual markup', () => {
  const source = `<!doctype html><html><head>
    <link rel="canonical" href="https://cv.godmodetools.com/showcase/">
    <meta property="og:url" content="https://cv.godmodetools.com/showcase/">
    <link rel="stylesheet" href="/_astro/site.css">
  </head><body>
    <a href="https://godmodetools.com/">Home</a>
    <a href="/showcase/en/">Projects EN</a>
    <img src="/media/showcase/example.jpg">
  </body></html>`;
  const output = rewriteLegacyHtml(source, { releaseId, surface: 'projects' });
  const prefix = publicPrefix(releaseId);
  assert.doesNotMatch(output, /canonical|og:url/iu);
  assert.match(output, /name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex"/u);
  assert.match(output, new RegExp(`href="${prefix}/home/"`, 'u'));
  assert.match(output, new RegExp(`href="${prefix}/projects/en/"`, 'u'));
  assert.match(output, new RegExp(`src="${prefix}/experience/media/showcase/example.jpg"`, 'u'));
  assert.match(output, /<body>/u);
});

test('known legacy origins, root assets, query, and fragments stay inside the immutable prefix', () => {
  const prefix = publicPrefix(releaseId);
  assert.equal(
    rewriteReferenceUrl('https://ai.godmodetools.com/?from=nav#top', { releaseId, surface: 'home' }),
    `${prefix}/learning/?from=nav#top`,
  );
  assert.equal(
    rewriteReferenceUrl('/assets/logo.png?v=1', { releaseId, surface: 'home' }),
    `${prefix}/home/assets/logo.png?v=1`,
  );
  assert.equal(
    rewriteReferenceUrl('/_astro/app.css', { releaseId, surface: 'projects' }),
    `${prefix}/experience/_astro/app.css`,
  );
  assert.equal(
    rewriteReferenceUrl('http://example.com/image.png', { releaseId, surface: 'home' }),
    'https://example.com/image.png',
  );
});

test('Nginx fragment is a path-only HTTPS integration with frozen and crawl-safe responses', () => {
  const fragment = renderLocationInclude(releaseId);
  const prefix = publicPrefix(releaseId);
  assert.match(fragment, new RegExp(`location \\^~ ${prefix.replaceAll('/', '\\/')}/`, 'u'));
  assert.match(fragment, /try_files \$uri \$uri\/ \$uri\/index\.html =404;/u);
  assert.match(fragment, /X-Robots-Tag "noindex, nofollow/u);
  assert.match(fragment, /Strict-Transport-Security "max-age=31536000; includeSubDomains"/u);
  assert.match(fragment, /Cache-Control "no-store"/u);
  assert.doesNotMatch(fragment, /\blisten\b|8443|proxy_pass/u);
  assert.match(fragment, /location \^~ \/__legacy-reference\/ \{[\s\S]*return 404;/u);
});

test('Nginx candidate changes only the exact apex HTTPS insertion anchor', () => {
  const current = `server {
    listen 80;
    server_name godmodetools.com;
    location / { return 301 https://$host$request_uri; }
}
server {
    listen 443 ssl;
    server_name godmodetools.com www.godmodetools.com;
    root /usr/share/nginx/html/sites/current/hub;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
server {
    listen 443 ssl;
    server_name cv.godmodetools.com;
    root /usr/share/nginx/html/sites/current/cv;
}`;
  const candidate = injectReferenceInclude(current, releaseId);
  assert.equal((candidate.match(/\/__legacy-reference\//gu) ?? []).length, 3);
  assert.equal((candidate.match(/listen 443 ssl;/gu) ?? []).length, 2);
  assert.match(candidate, new RegExp(`location \\^~ /__legacy-reference/${releaseId}/`, 'u'));
  assert.match(candidate, /server_name cv\.godmodetools\.com;[\s\S]*root \/usr\/share\/nginx\/html\/sites\/current\/cv;/u);
  assert.throws(() => injectReferenceInclude(candidate, releaseId), /already contains/u);
});

test('host apply keeps the simple nginx -t, exact backup, swap, reload, and rollback order', async () => {
  const source = await readFile(resolve(root, 'infra/legacy-reference/legacy-reference-host.mjs'), 'utf8');
  const deploy = source.slice(source.indexOf('async function deploy('), source.indexOf('async function rollback('));
  const rollback = source.slice(source.indexOf('async function rollback('), source.indexOf('export async function main('));
  const preSwapTest = deploy.indexOf("command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-t'])");
  const backup = deploy.indexOf('await copyFile(NGINX_DEFAULT, backup');
  const swap = deploy.indexOf("await copyAtomic(resolve(final, 'default.conf.candidate'), NGINX_DEFAULT)");
  const reload = deploy.indexOf("command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-s', 'reload'])");
  assert.ok(preSwapTest >= 0 && preSwapTest < backup && backup < swap && swap < reload);
  assert.match(deploy, /await copyAtomic\(backup, NGINX_DEFAULT\)/u);
  assert.ok(rollback.indexOf("command('docker', ['exec', NGINX_CONTAINER, 'nginx', '-t'])") < rollback.indexOf('await copyAtomic(backup, NGINX_DEFAULT)'));
  assert.match(rollback, /await rm\(releasePath\(releaseId\), \{ recursive: true, force: true \}\)/u);
  assert.doesNotMatch(source, /8443|docker[^\n]+(?:create|run|-p)/u);
});

test('verifier requires HTTPS/default 443, immutable manifest, and supports pinned origin checks', () => {
  const options = parseVerifierArgs([
    '--origin', 'https://godmodetools.com', '--release-id', releaseId,
    '--release-manifest', 'release-manifest.json', '--connect-address', '89.167.49.137',
  ]);
  assert.equal(options.origin, 'https://godmodetools.com');
  assert.equal(options.connectaddress, '89.167.49.137');
  assert.throws(
    () => parseVerifierArgs(['--origin', 'http://godmodetools.com', '--release-id', releaseId, '--release-manifest', 'manifest.json']),
    /HTTPS origin/u,
  );
  assert.throws(
    () => parseVerifierArgs(['--origin', 'https://godmodetools.com:8443', '--release-id', releaseId, '--release-manifest', 'manifest.json']),
    /default port/u,
  );
});
