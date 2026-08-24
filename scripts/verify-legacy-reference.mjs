#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const releaseIdPattern = /^\d{8}-\d{6}-[a-z0-9][a-z0-9._-]{2,95}$/u;
const surfaces = ['home', 'experience', 'projects', 'learning', 'community'];

export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (['--origin', '--release-id', '--release-manifest', '--connect-address', '--output'].includes(arg)) {
      const value = argv[++index];
      if (!value) throw new Error(`${arg} requires a value`);
      options[arg.slice(2).replaceAll('-', '')] = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!releaseIdPattern.test(options.releaseid ?? '')) throw new Error('A valid --release-id is required');
  if (!options.origin) throw new Error('--origin is required');
  const origin = new URL(options.origin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || origin.port) {
    throw new Error('--origin must be an HTTPS origin on the default port with no credentials or path');
  }
  options.origin = origin.origin;
  if (!options.releasemanifest) throw new Error('--release-manifest is required to verify every frozen file');
  return options;
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function request(url, { connectAddress } = {}) {
  const parsed = new URL(url);
  const client = parsed.protocol === 'https:' ? https : http;
  const options = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || undefined,
    path: `${parsed.pathname}${parsed.search}`,
    method: 'GET',
    headers: { Host: parsed.host, 'User-Agent': 'legacy-reference-verifier/1' },
    servername: parsed.hostname,
    rejectUnauthorized: true,
  };
  if (connectAddress) {
    options.lookup = (hostname, lookupOptions, callback) => {
      if (lookupOptions?.all) callback(null, [{ address: connectAddress, family: 4 }]);
      else callback(null, connectAddress, 4);
    };
  }
  return new Promise((fulfill, reject) => {
    const outgoing = client.request(options, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => fulfill({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    outgoing.setTimeout(20_000, () => outgoing.destroy(new Error(`Timed out fetching ${url}`)));
    outgoing.on('error', reject);
    outgoing.end();
  });
}

function assertSecurityHeaders(headers, url) {
  const robots = String(headers['x-robots-tag'] ?? '').toLowerCase();
  if (!robots.includes('noindex') || !robots.includes('nofollow')) throw new Error(`Missing noindex/nofollow X-Robots-Tag: ${url}`);
  if (!String(headers['strict-transport-security'] ?? '').toLowerCase().includes('max-age=')) throw new Error(`Missing HSTS: ${url}`);
  if (!String(headers['cache-control'] ?? '').toLowerCase().includes('no-store')) throw new Error(`Reference response may survive rollback in a shared cache: ${url}`);
  if (headers.link && /rel\s*=\s*["']?canonical/iu.test(String(headers.link))) throw new Error(`Canonical Link header is forbidden: ${url}`);
}

function activeHttpReferences(content) {
  const matches = [];
  const patterns = [
    /\b(?:href|src|action|poster)\s*=\s*["'](http:\/\/[^"']+)/giu,
    /url\(\s*["']?(http:\/\/[^)'"\s]+)/giu,
    /\b(?:fetch|importScripts)\s*\(\s*["'](http:\/\/[^"']+)/giu,
  ];
  for (const pattern of patterns) for (const match of content.matchAll(pattern)) matches.push(match[1]);
  return matches;
}

function assertHtmlContracts(content, url) {
  if (!/<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])(?=[^>]*\bcontent\s*=\s*["'][^"']*noindex[^"']*nofollow)[^>]*>/iu.test(content)) {
    throw new Error(`Robots meta is missing noindex/nofollow: ${url}`);
  }
  if (/<link\b(?=[^>]*\brel\s*=\s*["'][^"']*\bcanonical\b)/iu.test(content)) throw new Error(`Canonical tag is forbidden: ${url}`);
  if (/<meta\b(?=[^>]*\b(?:property|name)\s*=\s*["']og:url["'])/iu.test(content)) throw new Error(`og:url is forbidden: ${url}`);
  const insecure = activeHttpReferences(content);
  if (insecure.length > 0) throw new Error(`External HTTP reference found in ${url}: ${insecure[0]}`);
}

function encodedPath(path) {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

export async function verify(options) {
  const manifest = JSON.parse(await readFile(resolve(options.releasemanifest), 'utf8'));
  if (manifest.schema !== 'legacy-reference.release.v1' || manifest.releaseId !== options.releaseid) throw new Error('Release manifest identity mismatch');
  if (manifest.publicOrigin !== options.origin) throw new Error('Verifier origin differs from the immutable release manifest');
  if (!Array.isArray(manifest.public?.entries) || manifest.public.entries.length === 0) throw new Error('Manifest has no public file inventory');

  const prefix = `/__legacy-reference/${options.releaseid}`;
  if (manifest.publicPrefix !== prefix) throw new Error('Manifest public prefix mismatch');
  const expectedRoutes = surfaces.map((surface) => `${prefix}/${surface}/`);
  if (JSON.stringify(manifest.routes) !== JSON.stringify(expectedRoutes)) throw new Error('Manifest route list mismatch');

  const requested = new Map();
  for (const route of expectedRoutes) requested.set(`${options.origin}${route}`, { kind: 'route' });
  requested.set(`${options.origin}${prefix}/robots.txt`, { kind: 'robots' });
  for (const record of manifest.public.entries) {
    requested.set(`${options.origin}${prefix}/${encodedPath(record.path)}`, { kind: 'file', record });
  }

  const checks = [];
  let htmlCount = 0;
  let assetCount = 0;
  for (const [url, expected] of requested) {
    const response = await request(url, { connectAddress: options.connectaddress });
    if (response.status !== 200) throw new Error(`Expected 200 for ${url}, received ${response.status}`);
    assertSecurityHeaders(response.headers, url);
    const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
    const path = new URL(url).pathname.toLowerCase();
    if (expected.kind === 'robots') {
      if (response.body.toString('utf8') !== 'User-agent: *\nDisallow: /\n') throw new Error('Reference robots.txt must disallow every crawler');
    }
    if (contentType.includes('text/html') || path.endsWith('.html') || expected.kind === 'route') {
      assertHtmlContracts(response.body.toString('utf8'), url);
      htmlCount += 1;
    } else {
      assetCount += 1;
      if (/\.(?:css|js|mjs)$/iu.test(path)) {
        const insecure = activeHttpReferences(response.body.toString('utf8'));
        if (insecure.length > 0) throw new Error(`External HTTP reference found in ${url}: ${insecure[0]}`);
      }
    }
    if (expected.record) {
      if (response.body.length !== expected.record.bytes || sha256(response.body) !== expected.record.sha256) {
        throw new Error(`Public asset differs from immutable manifest: ${expected.record.path}`);
      }
    }
    checks.push({ url, status: response.status, bytes: response.body.length, sha256: sha256(response.body) });
  }

  for (const path of [`${prefix}-unknown/home/`, '/__legacy-reference/']) {
    const url = `${options.origin}${path}`;
    const response = await request(url, { connectAddress: options.connectaddress });
    if (response.status !== 404) throw new Error(`Unknown reference namespace must be 404, received ${response.status}: ${url}`);
    const robots = String(response.headers['x-robots-tag'] ?? '').toLowerCase();
    if (!robots.includes('noindex') || !robots.includes('nofollow')) throw new Error(`Unknown reference 404 is not crawl-safe: ${url}`);
    checks.push({ url, status: response.status, bytes: response.body.length, sha256: sha256(response.body) });
  }

  const httpUrl = `http://${new URL(options.origin).hostname}${expectedRoutes[0]}`;
  const httpResponse = await request(httpUrl, { connectAddress: options.connectaddress });
  const location = String(httpResponse.headers.location ?? '');
  if (![301, 308].includes(httpResponse.status) || location !== `${options.origin}${expectedRoutes[0]}`) {
    throw new Error(`Plain HTTP must not serve the reference and must redirect exactly to HTTPS: ${httpUrl}`);
  }

  return {
    schema: 'legacy-reference.verification.v1',
    result: 'pass',
    releaseId: options.releaseid,
    origin: options.origin,
    mode: options.connectaddress ? 'direct-origin' : 'public-dns',
    connectAddress: options.connectaddress,
    verifiedAtUtc: new Date().toISOString(),
    manifestSha256: sha256(await readFile(resolve(options.releasemanifest))),
    htmlCount,
    assetCount,
    http: { url: httpUrl, status: httpResponse.status, location },
    checks,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const evidence = await verify(options);
  const output = `${JSON.stringify(evidence, null, 2)}\n`;
  if (options.output) await writeFile(resolve(options.output), output, { flag: 'wx' });
  console.log(output.trimEnd());
  return evidence;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  });
}
