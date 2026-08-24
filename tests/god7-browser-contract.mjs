import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = (process.env.SITE_PREVIEW_URL ?? process.env.HTTP_CONTRACT_URL ?? 'http://127.0.0.1:4321').replace(/\/$/u, '');
const httpContractUrl = process.env.HTTP_CONTRACT_URL?.replace(/\/$/u, '');
const ignoreHTTPSErrors = process.env.SITE_PREVIEW_INSECURE === '1';
const productionOrigin = 'https://godmodetools.com';
// Reject technical deployment hostnames only; prose may legitimately mention a worker.
const forbiddenOrigin = /https?:\/\/(?:[a-z0-9-]+\.)*[a-z0-9-]*(?:workers\.dev|(?:stage|staging|worker)[a-z0-9-]*\.[a-z0-9.-]+)/iu;

function absolute(pathname) {
  return `${baseUrl}${pathname}`;
}

function previewUrl(canonicalUrl) {
  const parsed = new URL(canonicalUrl);
  assert.equal(parsed.origin, productionOrigin, 'hreflang URLs must use the production origin');
  return `${baseUrl}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

async function metadata(page) {
  return page.evaluate(() => ({
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content'),
    alternates: Object.fromEntries([...document.querySelectorAll('link[rel="alternate"][hreflang]')]
      .map((link) => [link.getAttribute('hreflang'), link.getAttribute('href')])),
    html: document.documentElement.outerHTML,
  }));
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ ignoreHTTPSErrors });
  const page = await context.newPage();

  for (const route of ['/ru/', '/en/', '/ru/experience/', '/en/projects/']) {
    const response = await page.goto(absolute(route), { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200, route);
    const seo = await metadata(page);
    assert.equal(seo.ogUrl, seo.canonical, `${route}: canonical and og:url must match`);
    assert.ok(seo.canonical?.startsWith(productionOrigin), `${route}: canonical must use the production origin`);
    assert.deepEqual(Object.keys(seo.alternates).sort(), ['en', 'ru', 'x-default'], `${route}: published hreflang set`);
    assert.equal(seo.alternates['x-default'], seo.alternates.ru, `${route}: x-default must select Russian`);
    assert.doesNotMatch(seo.html, forbiddenOrigin, `${route}: browser document must not retain worker/staging origins`);

    const otherLocale = route.startsWith('/ru/') ? 'en' : 'ru';
    await page.goto(previewUrl(seo.alternates[otherLocale]), { waitUntil: 'domcontentloaded' });
    const reciprocal = await metadata(page);
    const currentLocale = route.startsWith('/ru/') ? 'ru' : 'en';
    assert.equal(reciprocal.alternates[currentLocale], seo.canonical, `${route}: hreflang must be reciprocal`);
  }

  const notFound = await page.goto(absolute('/__god7_unknown__/'), { waitUntil: 'domcontentloaded' });
  assert.equal(notFound?.status(), 404, 'unknown public route must be a real 404');

  if (httpContractUrl) {
    const root = await context.request.fetch(`${httpContractUrl}/?god7_query=preserved`, {
      maxRedirects: 0,
      headers: { host: 'godmodetools.com' },
    });
    assert.equal(root.status(), 301);
    assert.equal(root.headers()['location'], 'https://godmodetools.com/ru/?god7_query=preserved');
  }

  console.log(`GOD-7 browser contract passed against ${baseUrl}.`);
  await context.close();
} finally {
  await browser.close();
}
