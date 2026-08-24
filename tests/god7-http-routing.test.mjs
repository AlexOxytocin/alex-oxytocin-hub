import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const inventory = JSON.parse(await readFile(new URL('docs/url-migration-inventory.json', root), 'utf8'));
const [nginxDefault, nginxCache, nginxSecurity] = await Promise.all([
  readFile(new URL('infra/nginx/default.conf', root), 'utf8'),
  readFile(new URL('infra/nginx/includes/site-cache.conf', root), 'utf8'),
  readFile(new URL('infra/nginx/includes/security-headers.conf', root), 'utf8'),
]);
const contractOrigin = process.env.HTTP_CONTRACT_URL?.replace(/\/$/u, '');
const redirectOrigin = process.env.HTTP_REDIRECT_URL?.replace(/\/$/u, '');
const query = 'god7_query=preserved&source=contract';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function nginxServerBlocks(config) {
  const blocks = [];
  let cursor = 0;
  while (cursor < config.length) {
    const start = config.indexOf('server {', cursor);
    if (start === -1) break;
    const openingBrace = config.indexOf('{', start);
    let depth = 0;
    for (let index = openingBrace; index < config.length; index += 1) {
      if (config[index] === '{') depth += 1;
      if (config[index] === '}') depth -= 1;
      if (depth === 0 && index > start) {
        blocks.push(config.slice(start, index + 1));
        cursor = index + 1;
        break;
      }
    }
  }
  return blocks;
}

const serverBlocks = nginxServerBlocks(nginxDefault);

function serverBlockFor(source) {
  const url = new URL(source);
  const candidates = serverBlocks.filter((block) => new RegExp(`server_name\\s+${escapeRegex(url.hostname)}\\s*;`, 'u').test(block));
  return candidates.find((block) => url.protocol !== 'https:' || /listen\s+443\s+ssl\s*;/u.test(block));
}

function pathAndQuery(source) {
  const url = new URL(source);
  url.searchParams.set('god7_query', 'preserved');
  url.searchParams.set('source', 'contract');
  return `${url.pathname}${url.search}`;
}

function redirectRecords() {
  return inventory.records.filter((record) => record.final?.action === 'redirect');
}

function requestTarget(baseOrigin, source, requestPath) {
  const base = new URL(baseOrigin);
  const sourceUrl = new URL(source);
  const secure = base.protocol === 'https:';
  const transport = secure ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const request = transport({
      hostname: base.hostname,
      port: base.port || undefined,
      path: requestPath,
      method: 'GET',
      headers: { Host: sourceUrl.host },
      ...(secure ? {
        servername: sourceUrl.hostname,
        rejectUnauthorized: process.env.HTTP_CONTRACT_INSECURE !== '1',
      } : {}),
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
          else if (value !== undefined) headers.set(name, value);
        }
        resolve({
          status: response.statusCode ?? 0,
          headers,
          text: async () => body,
          json: async () => JSON.parse(body),
        });
      });
    });
    request.once('error', reject);
    request.end();
  });
}

test('inventory declares a one-step, query-preserving HTTP contract', () => {
  assert.equal(inventory.http_policy.mode, 'direct-to-final-contract');
  assert.equal(inventory.http_policy.status, 301);
  assert.equal(inventory.http_policy.query, 'preserve');
  assert.equal(inventory.query_policy.redirect, 'preserve');

  for (const record of redirectRecords()) {
    assert.equal(record.final.status, 301, record.source);
    assert.equal(new URL(record.final.target).origin, inventory.production_origin, record.source);
  }
});

test('Nginx contains exact legacy redirect destinations with explicit query preservation', () => {
  const legacyRedirects = redirectRecords().filter((record) => {
    const host = new URL(record.source).hostname;
    return ['www.godmodetools.com', 'cv.godmodetools.com', 'ai.godmodetools.com', 'allo.godmodetools.com'].includes(host);
  });
  assert.ok(legacyRedirects.length > 0);

  for (const record of legacyRedirects) {
    const source = new URL(record.source);
    const target = new URL(record.final.target);
    const server = serverBlockFor(record.source);
    assert.ok(server, `missing Nginx server block for ${source.hostname}`);
    const location = `location\\s+=\\s+${escapeRegex(source.pathname)}\\s*\\{`;
    const directTarget = `return\\s+301\\s+${escapeRegex(target.origin + target.pathname)}\\$is_args\\$args\\s*;`;
    assert.match(
      server,
      new RegExp(`${location}[\\s\\S]*?${directTarget}`, 'u'),
      `${record.source} must redirect directly to ${record.final.target} and preserve the query`,
    );
  }
});

test('Nginx reserves service prefixes before static fallback and retires openclaw with 410', () => {
  const apex = serverBlockFor('https://godmodetools.com/');
  assert.ok(apex);
  assert.match(apex, /location\s+\^~\s+\/api\/\s*\{[\s\S]*?proxy_pass\s+http:\/\/backend:8000\//u);
  assert.match(apex, /location\s+\^~\s+\/voidplayer\/\s*\{[\s\S]*?alias\s+\/usr\/share\/nginx\/html\/voidplayer\//u);
  assert.match(apex, /location\s+\^~\s+\/openclaw-voice\/\s*\{[\s\S]*?return\s+410\s*;/u);
  assert.match(apex, /include\s+\/etc\/nginx\/includes\/site-cache\.conf\s*;/u);
  assert.match(nginxCache, /location\s+\/\s*\{[\s\S]*?try_files\s+\$uri\s+\$uri\/\s+\$uri\/index\.html\s+=404\s*;/u);
});

test('Nginx retains compression, cache, and security contracts from GOD-6', () => {
  assert.match(nginxDefault, /include\s+\/etc\/nginx\/includes\/compression\.conf\s*;/u);
  assert.match(nginxDefault, /include\s+\/etc\/nginx\/includes\/security-headers\.conf\s*;/u);
  assert.match(nginxCache, /location\s+\^~\s+\/_astro\//u);
  assert.match(nginxCache, /max-age=31536000, immutable/u);
  assert.match(nginxCache, /\(\?:ru\|en\)\/experience\(\?:\/java\)\?\/downloads/u);
  assert.equal((nginxCache.match(/include \/etc\/nginx\/includes\/security-headers\.conf;/gu) ?? []).length, 4);
  assert.match(nginxSecurity, /X-Content-Type-Options "nosniff" always/u);
});

test('configured HTTP target implements every inventory status, Location, and query contract', { skip: !contractOrigin }, async () => {
  for (const record of inventory.records) {
    const response = await requestTarget(contractOrigin, record.source, pathAndQuery(record.source));
    assert.equal(response.status, record.final.status, record.source);

    if (record.final.action === 'redirect') {
      assert.equal(response.headers.get('location'), `${record.final.target}?${query}`, record.source);
    } else {
      assert.equal(response.headers.get('location'), null, `${record.source} must not redirect`);
    }
  }
});

test('plain HTTP resolves directly to each final HTTPS or terminal contract', { skip: !redirectOrigin }, async () => {
  for (const record of inventory.records) {
    const response = await requestTarget(redirectOrigin, record.source, pathAndQuery(record.source));

    if (record.final.action === 'redirect' || record.final.action === 'serve') {
      assert.equal(response.status, 301, record.source);
      assert.equal(response.headers.get('location'), `${record.final.target}?${query}`, record.source);
    } else {
      assert.equal(response.status, record.final.status, record.source);
      assert.equal(response.headers.get('location'), null, `${record.source} must terminate on HTTP`);
    }
  }
});

test('configured HTTP target preserves API and VoidPlayer public contracts', { skip: !contractOrigin }, async () => {
  const apex = 'https://godmodetools.com/';
  const api = await requestTarget(contractOrigin, apex, '/api/');
  assert.equal(api.status, 200);
  assert.match(api.headers.get('content-type') ?? '', /^application\/json\b/iu);
  assert.doesNotMatch(await api.text(), /database_url|postgres(?:ql)?:\/\/|password|credential/iu);

  const health = await requestTarget(contractOrigin, apex, '/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'healthy' });

  const missingApi = await requestTarget(contractOrigin, apex, '/api/god7/deep/missing?god7_query=preserved&source=contract');
  assert.equal(missingApi.status, 404);
  assert.match(missingApi.headers.get('content-type') ?? '', /^application\/json\b/iu);
  assert.deepEqual(await missingApi.json(), { detail: 'Not Found' });

  const player = await requestTarget(contractOrigin, apex, '/voidplayer/');
  assert.equal(player.status, 200);
  assert.match(player.headers.get('content-type') ?? '', /^text\/html\b/iu);

  const manifest = await requestTarget(contractOrigin, apex, '/voidplayer/void.webmanifest');
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get('content-type') ?? '', /application\/manifest\+json/iu);

  const nestedAsset = await requestTarget(contractOrigin, apex, '/voidplayer/nested/probe.txt?god7_query=preserved&source=contract');
  assert.equal(nestedAsset.status, 200);
  assert.equal((await nestedAsset.text()).trim(), 'nested voidplayer route');

  const missingAsset = await requestTarget(contractOrigin, apex, '/voidplayer/nested/missing.js?god7_query=preserved&source=contract');
  assert.equal(missingAsset.status, 404);
  assert.equal(missingAsset.headers.get('location'), null);
});

test('plain HTTP preserves arbitrary service-prefix paths and queries in one hop', { skip: !redirectOrigin }, async () => {
  const apex = 'https://godmodetools.com/';
  for (const requestPath of [
    '/api/god7/deep/missing?god7_query=preserved&source=contract',
    '/voidplayer/nested/probe.txt?god7_query=preserved&source=contract',
  ]) {
    const response = await requestTarget(redirectOrigin, apex, requestPath);
    assert.equal(response.status, 301, requestPath);
    assert.equal(response.headers.get('location'), `https://godmodetools.com${requestPath}`, requestPath);
  }
});

test('configured HTTP target serves crawl artifacts and a noindex custom apex 404', { skip: !contractOrigin }, async () => {
  const apex = 'https://godmodetools.com/';
  const robots = await requestTarget(contractOrigin, apex, '/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get('content-type') ?? '', /^text\/plain\b/iu);
  assert.match(await robots.text(), /^Sitemap:\s*https:\/\/godmodetools\.com\/sitemap\.xml$/imu);

  const sitemap = await requestTarget(contractOrigin, apex, '/sitemap.xml');
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get('content-type') ?? '', /^(?:application|text)\/xml\b/iu);
  const sitemapBody = await sitemap.text();
  assert.match(sitemapBody, /<loc>https:\/\/godmodetools\.com\/ru\//u);
  assert.doesNotMatch(sitemapBody, /workers\.dev|\/es\//iu);

  const missing = await requestTarget(contractOrigin, apex, '/__god2_unknown__/');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('location'), null);
  assert.match(await missing.text(), /<meta name="robots" content="noindex, nofollow">/u);

  const localizedPage = await requestTarget(contractOrigin, apex, '/en/');
  assert.equal(localizedPage.status, 200);
  assert.equal(localizedPage.headers.get('cache-control'), 'no-cache');
  assert.equal(localizedPage.headers.get('x-content-type-options'), 'nosniff');
});
