import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const inventory = JSON.parse(await readFile(new URL('docs/url-migration-inventory.json', root), 'utf8'));
const productionOrigin = inventory.production_origin;
const publishedLocales = inventory.locale_policy.published;
// Reject technical deployment hostnames only; prose may legitimately mention a worker.
const forbiddenOrigin = /https?:\/\/(?:[a-z0-9-]+\.)*[a-z0-9-]*(?:workers\.dev|(?:stage|staging|worker)[a-z0-9-]*\.[a-z0-9.-]+)/iu;

async function filesBelow(relativeDirectory) {
  const directory = new URL(relativeDirectory, root);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const child = `${relativeDirectory}${entry.name}`;
    return entry.isDirectory() ? filesBelow(`${child}/`) : [child];
  }));
  return files.flat();
}

async function readBuiltPage(pathname) {
  const relativePath = pathname.endsWith('/')
    ? `dist${pathname}index.html`
    : `dist${pathname}`;
  return readFile(new URL(relativePath, root), 'utf8');
}

function attribute(html, selector) {
  const match = html.match(selector);
  assert.ok(match?.[1], `Missing metadata matching ${selector}`);
  return match[1];
}

function alternateLinks(html) {
  return Object.fromEntries(
    [...html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"\s*\/?\s*>/giu)]
      .map(([, locale, href]) => [locale, href]),
  );
}

function canonicalPath(url) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, productionOrigin, `Canonical must use ${productionOrigin}`);
  return parsed.pathname;
}

test('built localized pages publish canonical, Open Graph, and reciprocal language contracts', async () => {
  const htmlFiles = (await filesBelow('dist/'))
    .filter((file) => extname(file) === '.html' && /dist\/(?:ru|en)\//u.test(file));
  assert.ok(htmlFiles.length > 0, 'Expected localized HTML pages in dist/');

  for (const file of htmlFiles) {
    const html = await readFile(new URL(file, root), 'utf8');
    assert.doesNotMatch(html, forbiddenOrigin, `${file} must not retain worker or staging origins`);
    assert.doesNotMatch(html, /https?:\/\/[^"'\s>]*\/es(?:\/|["'\s>])/iu, `${file} must not publish Spanish URLs`);

    const canonical = attribute(html, /<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?\s*>/iu);
    const ogUrl = attribute(html, /<meta\s+property="og:url"\s+content="([^"]+)"\s*\/?\s*>/iu);
    assert.equal(ogUrl, canonical, `${file}: canonical and og:url must be identical`);

    const alternates = alternateLinks(html);
    assert.deepEqual(Object.keys(alternates).sort(), ['en', 'ru', 'x-default']);
    assert.equal(alternates['x-default'], alternates.ru, `${file}: x-default must be Russian`);

    const currentPath = canonicalPath(canonical);
    const locale = currentPath.split('/').filter(Boolean)[0];
    assert.ok(publishedLocales.includes(locale), `${file}: canonical locale must be published`);
    const otherLocale = locale === 'ru' ? 'en' : 'ru';
    assert.match(alternates[locale], new RegExp(`^${productionOrigin.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/${locale}(?:/|$)`, 'u'));
    assert.match(alternates[otherLocale], new RegExp(`^${productionOrigin.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/${otherLocale}(?:/|$)`, 'u'));

    const reciprocalHtml = await readBuiltPage(canonicalPath(alternates[otherLocale]));
    const reciprocal = alternateLinks(reciprocalHtml);
    assert.equal(reciprocal[locale], canonical, `${file}: ${otherLocale} alternate must point back to canonical`);
    assert.equal(reciprocal['x-default'], reciprocal.ru, `${file}: reciprocal x-default must be Russian`);
  }
});

test('built robots and sitemap are real production crawl artifacts', async () => {
  const robots = await readFile(new URL('dist/robots.txt', root), 'utf8');
  const sitemap = await readFile(new URL('dist/sitemap.xml', root), 'utf8');

  assert.match(robots, /^User-agent:\s*\*/imu);
  assert.match(robots, new RegExp(`^Sitemap:\\s*${productionOrigin.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/sitemap\\.xml\\s*$`, 'imu'));
  assert.doesNotMatch(robots, /<html|<!doctype|\/es\//iu);
  assert.doesNotMatch(robots, forbiddenOrigin);

  assert.match(sitemap, /^<\?xml\s+/iu);
  assert.match(sitemap, /<(?:urlset|sitemapindex)\b/iu);
  assert.match(sitemap, new RegExp(`<loc>${productionOrigin.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/(?:ru|en)/`, 'u'));
  assert.doesNotMatch(sitemap, /\/es\//iu);
  assert.doesNotMatch(sitemap, forbiddenOrigin);
});

test('the migration inventory itself does not send crawlers to unpublished or non-production origins', () => {
  for (const record of inventory.records) {
    const target = record.final?.target;
    if (!target) continue;
    assert.doesNotMatch(target, forbiddenOrigin, `${record.source} must not target a worker or staging origin`);
    if (target.startsWith(productionOrigin)) {
      assert.doesNotMatch(target, /\/es(?:\/|$)/u, `${record.source} must not target unpublished Spanish content`);
    }
  }
});
