import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SITE_PREVIEW_URL ?? 'http://127.0.0.1:4321';
const html = await readFile(new URL('../dist/ru/index.html', import.meta.url), 'utf8');
const stylePattern = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const styles = [...html.matchAll(stylePattern)].map((match) => match[1]);
assert.ok(styles.length > 0, 'built /ru/ must contain inline critical CSS');

const stylesheetPath = '/__critical-css-regression.css';
const externalizedHtml = html
  .replace(stylePattern, '')
  .replace('</head>', `<link rel="stylesheet" href="${stylesheetPath}"></head>`);

function installPaintObservers(context) {
  return context.addInitScript(() => {
    window.__criticalCssPaint = { fcp: 0, lcp: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') window.__criticalCssPaint.fcp = entry.startTime;
      }
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__criticalCssPaint.lcp = Math.max(window.__criticalCssPaint.lcp, entry.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
}

async function waitForLcp(page) {
  await page.waitForFunction(() => window.__criticalCssPaint?.lcp > 0, undefined, { timeout: 5000 });
  return page.evaluate(() => window.__criticalCssPaint);
}

const browser = await chromium.launch();
let releaseStylesheet;
try {
  const inlineContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installPaintObservers(inlineContext);
  const inlinePage = await inlineContext.newPage();
  await inlinePage.bringToFront();
  const stylesheetRequests = [];
  inlinePage.on('request', (request) => {
    if (request.resourceType() === 'stylesheet') stylesheetRequests.push(request.url());
  });
  await inlinePage.goto(`${baseUrl}/ru/`, { waitUntil: 'networkidle' });
  const inlinePaint = await waitForLcp(inlinePage);
  assert.deepEqual(stylesheetRequests, [], 'the built page must paint without a stylesheet request');
  await inlineContext.close();

  const externalContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installPaintObservers(externalContext);
  const externalPage = await externalContext.newPage();
  await externalPage.bringToFront();
  let markStylesheetRequested;
  const stylesheetRequested = new Promise((resolve) => { markStylesheetRequested = resolve; });
  const stylesheetGate = new Promise((resolve) => { releaseStylesheet = resolve; });

  await externalContext.route(`${baseUrl}/ru/`, (route) => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: externalizedHtml,
  }));
  await externalContext.route(`${baseUrl}${stylesheetPath}`, async (route) => {
    markStylesheetRequested();
    await stylesheetGate;
    await route.fulfill({
      status: 200,
      contentType: 'text/css; charset=utf-8',
      body: styles.join('\n'),
    });
  });

  const navigation = externalPage.goto(`${baseUrl}/ru/`, { waitUntil: 'load' });
  await stylesheetRequested;
  await externalPage.waitForFunction(() => document.querySelector('h1'));
  await externalPage.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  assert.deepEqual(
    await externalPage.evaluate(() => window.__criticalCssPaint),
    { fcp: 0, lcp: 0 },
    'a pending render-blocking stylesheet must hold back the text LCP',
  );

  releaseStylesheet();
  await navigation;
  const releasedPaint = await waitForLcp(externalPage);
  assert.ok(releasedPaint.fcp > 0, 'the externalized control must paint after CSS is released');
  console.log(`Controlled CSS gate: inline LCP ${inlinePaint.lcp.toFixed(0)} ms; externalized text stayed unpainted until CSS release.`);
  await externalContext.close();
} finally {
  releaseStylesheet?.();
  await browser.close();
}
