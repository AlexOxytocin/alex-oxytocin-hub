import assert from 'node:assert/strict';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const budgets = JSON.parse(await readFile(path.join(root, 'config/performance-budgets.json'), 'utf8'));

async function filesBelow(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(fullPath));
    else result.push(fullPath);
  }
  return result;
}

test('every route stays inside the HTML gzip budget', async () => {
  const htmlFiles = (await filesBelow(dist)).filter((file) => file.endsWith('.html'));
  assert.equal(htmlFiles.length, 11);
  for (const file of htmlFiles) {
    const compressed = gzipSync(await readFile(file)).length;
    assert.ok(compressed <= budgets.assets.htmlGzipBytes, `${path.relative(dist, file)} is ${(compressed / 1024).toFixed(1)} KB gzip`);
  }
});

test('critical CSS is inline without a render-blocking local stylesheet request', async () => {
  const htmlFiles = (await filesBelow(dist)).filter((file) => file.endsWith('.html'));
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    const inlineCss = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
    const stylesheetLinks = [...html.matchAll(/<link\b[^>]*>/gi)]
      .map((match) => match[0])
      .filter((link) => /\brel=["'][^"']*\bstylesheet\b[^"']*["']/i.test(link));
    const localStylesheets = stylesheetLinks.filter((link) => /\bhref=["'](?:\/|\.\/|\.\.\/)[^"']+["']/i.test(link));

    assert.ok(inlineCss.length > 0, `${path.relative(dist, file)} has no inline critical CSS`);
    assert.match(inlineCss, /--surface-page:/, `${path.relative(dist, file)} is missing shared design tokens`);
    assert.equal(localStylesheets.length, 0, `${path.relative(dist, file)} has a render-blocking local stylesheet`);
    const compressed = gzipSync(inlineCss).length;
    assert.ok(compressed <= budgets.assets.cssGzipBytes, `${path.relative(dist, file)} inline CSS is ${(compressed / 1024).toFixed(1)} KB gzip`);
  }

  const cssFiles = (await filesBelow(path.join(dist, '_astro'))).filter((file) => file.endsWith('.css'));
  assert.equal(cssFiles.length, 0, 'inlined project CSS must not leave an unused CSS asset');
});

test('simple-page JavaScript stays inside its budget', async () => {
  for (const route of ['ru/experience', 'ru/projects', 'ru/learning', 'ru/community']) {
    const html = await readFile(path.join(dist, route, 'index.html'), 'utf8');
    const inlineJs = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join('\n');
    assert.ok(gzipSync(inlineJs).length <= budgets.assets.simpleJsGzipBytes, `${route} exceeds the simple-page JS budget`);
    assert.doesNotMatch(html, /<script[^>]+src=/i, `${route} unexpectedly loads a JS bundle`);
  }
});

test('responsive image candidates and fallbacks meet mobile and desktop budgets', async () => {
  const pages = [
    path.join(dist, 'ru', 'index.html'),
    path.join(dist, 'en', 'index.html'),
  ];
  let candidates = 0;
  for (const page of pages) {
    const html = await readFile(page, 'utf8');
    for (const srcset of html.matchAll(/\bsrcset="([^"]+)"/gi)) {
      for (const candidate of srcset[1].split(',')) {
        const match = candidate.trim().match(/^(\S+)\s+(\d+)w$/);
        assert.ok(match, candidate);
        const [, url, widthText] = match;
        const file = path.join(dist, url.replace(/^\//, ''));
        const size = (await stat(file)).size;
        const width = Number(widthText);
        const budget = width <= 480 ? budgets.images.mobileBytes : budgets.images.desktopBytes;
        assert.ok(size <= budget, `${url} (${width}w) is ${(size / 1024).toFixed(1)} KB`);
        candidates += 1;
      }
    }
    for (const source of html.matchAll(/<img[^>]+\bsrc="(\/_astro\/[^"]+)"/gi)) {
      const size = (await stat(path.join(dist, source[1].replace(/^\//, '')))).size;
      assert.ok(size <= budgets.images.desktopBytes, `${source[1]} fallback is ${(size / 1024).toFixed(1)} KB`);
    }
  }
  assert.ok(candidates >= 6, `expected responsive candidates, found ${candidates}`);
});

test('every built asset reference exists and optimized assets are fingerprinted', async () => {
  const htmlFiles = (await filesBelow(dist)).filter((file) => file.endsWith('.html'));
  const references = new Set();
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    for (const match of html.matchAll(/\/_astro\/[A-Za-z0-9._-]+/g)) references.add(match[0]);
    assert.doesNotMatch(html, /\/media\/showcase\//, file);
    assert.doesNotMatch(html, /rel="preload"[^>]+as="font"/i, 'system-font stack should not preload fonts');
  }
  assert.ok(references.size > 0);
  for (const reference of references) {
    assert.match(reference, /\.[A-Za-z0-9_-]{6,}(?:_[A-Za-z0-9_-]+)?\.(?:avif|webp|png|jpe?g|css|js)$/);
    await access(path.join(dist, reference.replace(/^\//, '')));
  }
  const fontFiles = (await filesBelow(dist)).filter((file) => /\.(?:woff2?|ttf|otf)$/i.test(file));
  assert.equal(fontFiles.length, 0, 'the system-font strategy must remain zero-request');
});

test('Nginx policy keeps fingerprints immutable and HTML revalidated', async () => {
  const cache = await readFile(path.join(root, 'infra/nginx/conf.d/_includes/site-cache.inc'), 'utf8');
  assert.match(cache, /location \^~ \/_astro\//);
  assert.match(cache, /max-age=31536000, immutable/);
  assert.match(cache, /Cache-Control "no-cache"/);
  assert.match(cache, /try_files \$uri \$uri\/ \$uri\/index\.html =404/);
});
