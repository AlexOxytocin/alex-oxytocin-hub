import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SITE_PREVIEW_URL ?? 'http://127.0.0.1:4321';
const budgets = JSON.parse(await readFile(new URL('../config/performance-budgets.json', import.meta.url), 'utf8'));
const routes = Object.values(budgets.routes);

const browser = await chromium.launch();
try {
  for (const route of routes) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      serviceWorkers: 'block',
    });
    await context.addInitScript(() => {
      window.__godModeVitals = { cls: 0, lcp: 0, inp: 0, inpSupported: false };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__godModeVitals.lcp = Math.max(window.__godModeVitals.lcp, entry.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__godModeVitals.cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
      try {
        const inpObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.__godModeVitals.inp = Math.max(window.__godModeVitals.inp, entry.duration);
        });
        inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 });
        window.__godModeVitals.inpSupported = true;
      } catch {}
    });

    const page = await context.newPage();
    await page.bringToFront();
    const responses = [];
    page.on('response', (response) => responses.push(response));
    const documentResponse = await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle' });
    assert.equal(documentResponse?.status(), 200);
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 750)));

    let transfer = 0;
    const seen = new Set();
    for (const response of responses) {
      if (seen.has(response.url())) continue;
      seen.add(response.url());
      assert.ok(response.status() < 400, `${response.status()} ${response.url()}`);
      const body = await response.body();
      transfer += body.length;
      if (response.request().resourceType() === 'image' && !response.url().endsWith('favicon.svg')) {
        assert.ok(body.length <= budgets.images.mobileBytes, `${response.url()} is ${(body.length / 1024).toFixed(1)} KB on mobile`);
      }
    }

    assert.ok(transfer <= route.maxBytes, `${route.path} transferred ${(transfer / 1024).toFixed(1)} KB`);
    assert.ok(seen.size <= route.maxRequests, `${route.path} made ${seen.size} requests`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);

    try {
      await page.waitForFunction(() => window.__godModeVitals.lcp > 0, undefined, { timeout: 5000 });
    } catch (error) {
      console.error('LCP instrumentation state:', await page.evaluate(() => ({
        visibility: document.visibilityState,
        supported: PerformanceObserver.supportedEntryTypes,
        paints: performance.getEntriesByType('paint').map(({ name, startTime }) => ({ name, startTime })),
        lcp: window.__godModeVitals?.lcp,
        images: [...document.images].map(({ currentSrc, complete, naturalWidth }) => ({ currentSrc, complete, naturalWidth })),
      })));
      throw error;
    }

    const navigationLink = page.locator('header nav a:not([aria-current="page"])').first();
    assert.equal(await navigationLink.count(), 1, `${route.path} has no real navigation control for the INP probe`);
    await page.evaluate(() => document.addEventListener('click', (event) => event.preventDefault(), { capture: true, once: true }));
    await navigationLink.click();
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
    const vitals = await page.evaluate(() => window.__godModeVitals);
    assert.ok(Number.isFinite(vitals.lcp) && vitals.lcp > 0, `${route.path} did not produce an LCP measurement`);
    assert.ok(vitals.lcp <= budgets.mobileVitals.lcpMs, `${route.path} LCP ${vitals.lcp.toFixed(0)} ms`);
    assert.ok(vitals.cls <= budgets.mobileVitals.cls, `${route.path} CLS ${vitals.cls.toFixed(3)}`);
    assert.equal(vitals.inpSupported, true, `${route.path} browser does not support Event Timing`);
    assert.ok(Number.isFinite(vitals.inp), `${route.path} produced an invalid INP measurement`);
    assert.ok(vitals.inp <= budgets.mobileVitals.inpMs, `${route.path} INP ${vitals.inp.toFixed(0)} ms`);
    const inpLabel = vitals.inp === 0 ? '<16' : vitals.inp.toFixed(0);
    console.log(`${route.path}: ${(transfer / 1024).toFixed(1)} KB, ${seen.size} requests, LCP ${vitals.lcp.toFixed(0)} ms, CLS ${vitals.cls.toFixed(3)}, INP ${inpLabel} ms`);
    await context.close();
  }
} finally {
  await browser.close();
}
