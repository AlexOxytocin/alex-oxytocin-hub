import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const baseUrl = process.env.SITE_PREVIEW_URL ?? 'http://127.0.0.1:4321';
const ignoreHTTPSErrors = process.env.SITE_PREVIEW_INSECURE === '1';
const artifactRoot = resolve(root, process.env.HOME_VISUAL_ARTIFACT_DIR ?? 'artifacts/home-visual');
const releaseLimits = Object.freeze({
  desktop: 0.007,
  tablet: 0.0008,
  mobile: 0.004,
});
const manifestPath = resolve(root, 'docs/baseline-screenshots/home-release-baselines.json');
const baselineManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(baselineManifest.contract, 'home-release-baseline-v1', 'unexpected Home baseline contract');

const viewports = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};

const locales = {
  ru: {
    path: '/ru/',
    alternate: '/en/',
    baselines: {
      desktop: 'docs/baseline-screenshots/home-ru-desktop.png',
      tablet: 'docs/baseline-screenshots/home-ru-tablet.png',
      mobile: 'docs/baseline-screenshots/home-ru-mobile.png',
    },
  },
  en: {
    path: '/en/',
    alternate: '/ru/',
    baselines: {
      desktop: 'docs/baseline-screenshots/home-en-desktop.png',
      tablet: 'docs/baseline-screenshots/home-en-tablet.png',
      mobile: 'docs/baseline-screenshots/home-en-mobile.png',
    },
  },
};

await mkdir(artifactRoot, { recursive: true });
const browser = await chromium.launch();
const report = [];

try {
  for (const [locale, localeConfig] of Object.entries(locales)) {
    for (const [viewportName, viewport] of Object.entries(viewports)) {
      const baselinePath = resolve(root, localeConfig.baselines[viewportName]);
      const baselineBuffer = await readFile(baselinePath).catch((error) => {
        throw new Error(`Required ${locale}/${viewportName} visual baseline is missing: ${baselinePath}`, { cause: error });
      });
      const baseline = PNG.sync.read(baselineBuffer);
      const fixtureKey = `${locale}/${viewportName}`;
      const fixture = baselineManifest.fixtures[fixtureKey];
      assert.ok(fixture, `${fixtureKey} is missing from ${manifestPath}`);
      assert.equal(fixture.file, localeConfig.baselines[viewportName], `${fixtureKey} baseline path drifted`);
      assert.deepEqual(
        { width: fixture.width, height: fixture.height },
        viewport,
        `${fixtureKey} manifest dimensions drifted`,
      );
      assert.equal(
        createHash('sha256').update(baselineBuffer).digest('hex'),
        fixture.sha256,
        `${fixtureKey} baseline hash changed; baseline updates require owner review and a manifest update`,
      );
      assert.deepEqual(
        { width: baseline.width, height: baseline.height },
        viewport,
        `${locale}/${viewportName} baseline dimensions`,
      );

      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
        colorScheme: 'dark',
        serviceWorkers: 'block',
        ignoreHTTPSErrors,
      });
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];
      const badResponses = [];

      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
      page.on('response', (response) => {
        if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
      });

      try {
        const response = await page.goto(`${baseUrl}${localeConfig.path}`, { waitUntil: 'networkidle' });
        assert.equal(response?.status(), 200, `${locale}/${viewportName} document status`);
        await page.addStyleTag({ content: 'html{scrollbar-width:none}::-webkit-scrollbar{display:none}' });
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map((image) => image.complete ? undefined : image.decode()));
          window.scrollTo(0, 0);
        });

        assert.equal(await page.locator('h1').count(), 1, `${locale}/${viewportName} must expose one h1`);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
          true,
          `${locale}/${viewportName} overflows horizontally`,
        );
        assert.deepEqual(
          await page.locator('header nav a').evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
          [
            `/${locale}/`,
            `/${locale}/experience/`,
            `/${locale}/projects/`,
            `/${locale}/learning/`,
            `/${locale}/community/`,
          ],
          `${locale}/${viewportName} navigation routes`,
        );
        assert.equal(
          await page.locator(`.locale-switcher a[href="${localeConfig.alternate}"]`).count(),
          1,
          `${locale}/${viewportName} alternate locale route`,
        );
        const alternateResponse = await page.request.get(`${baseUrl}${localeConfig.alternate}`);
        assert.equal(alternateResponse.status(), 200, `${locale}/${viewportName} alternate locale status`);
        assert.equal(await page.locator('script').count(), 0, `${locale}/${viewportName} Home must stay zero-JS`);

        const actualPath = resolve(artifactRoot, `${locale}-${viewportName}-actual.png`);
        const diffPath = resolve(artifactRoot, `${locale}-${viewportName}-diff.png`);
        const actualBuffer = await page.screenshot({ path: actualPath, animations: 'disabled', caret: 'hide' });
        const actual = PNG.sync.read(actualBuffer);
        assert.deepEqual(
          { width: actual.width, height: actual.height },
          viewport,
          `${locale}/${viewportName} actual dimensions`,
        );
        const diff = new PNG({ width: viewport.width, height: viewport.height });
        const mismatchedPixels = pixelmatch(
          baseline.data,
          actual.data,
          diff.data,
          viewport.width,
          viewport.height,
          { threshold: 0.1, includeAA: false },
        );
        const mismatchRatio = mismatchedPixels / (viewport.width * viewport.height);
        await writeFile(diffPath, PNG.sync.write(diff));

        const axe = await new AxeBuilder({ page }).analyze();
        const blockingAxe = axe.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical');
        assert.deepEqual(blockingAxe, [], `${locale}/${viewportName} serious/critical axe violations`);

        if (viewportName === 'desktop') {
          await page.keyboard.press('Tab');
          assert.equal(await page.locator(':focus').getAttribute('href'), '#content', `${locale} first tab reaches skip link`);
          await page.keyboard.press('Tab');
          assert.equal(await page.locator(':focus').getAttribute('href'), `/${locale}/`, `${locale} second tab reaches brand`);
        }

        if (viewportName !== 'desktop') {
          const lastNavigationLink = page.locator('header nav a').last();
          await page.locator('header nav').evaluate((navigation) => { navigation.scrollLeft = navigation.scrollWidth; });
          const bounds = await lastNavigationLink.boundingBox();
          assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 0.5, `${locale}/${viewportName} last nav item is reachable`);
        }

        assert.deepEqual(consoleErrors, [], `${locale}/${viewportName} console errors`);
        assert.deepEqual(pageErrors, [], `${locale}/${viewportName} page errors`);
        assert.deepEqual(failedRequests, [], `${locale}/${viewportName} failed requests`);
        assert.deepEqual(badResponses, [], `${locale}/${viewportName} 4xx/5xx responses`);
        assert.ok(
          mismatchRatio <= releaseLimits[viewportName],
          `${locale}/${viewportName} visual mismatch ${(mismatchRatio * 100).toFixed(3)}% exceeds ${(releaseLimits[viewportName] * 100).toFixed(3)}%; diff: ${diffPath}`,
        );

        report.push({
          locale,
          viewport: viewportName,
          baseline: localeConfig.baselines[viewportName],
          actual: actualPath,
          diff: diffPath,
          mismatchedPixels,
          mismatchRatio,
          axeViolations: axe.violations.map(({ id, impact }) => ({ id, impact })),
        });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(resolve(artifactRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

for (const item of report) {
  console.log(`${item.locale}/${item.viewport}: ${(item.mismatchRatio * 100).toFixed(3)}% mismatch`);
}
console.log(`Home visual regression passed at ${Object.keys(locales).length * Object.keys(viewports).length} locale/viewports.`);
