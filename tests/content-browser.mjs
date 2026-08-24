import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const baseUrl = (process.env.SITE_PREVIEW_URL ?? 'http://127.0.0.1:4321').replace(/\/$/u, '');
const ignoreHTTPSErrors = process.env.SITE_PREVIEW_INSECURE === '1';
const artifactRoot = resolve(root, process.env.PLACEHOLDER_QA_ARTIFACT_DIR ?? 'artifacts/placeholder-qa');
const viewports = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};
const locales = {
  ru: {
    alternate: 'en',
    headings: {
      experience: 'Опыт и резюме',
      projects: 'Проекты',
      learning: 'Обучение',
      community: 'Комьюнити',
    },
  },
  en: {
    alternate: 'ru',
    headings: {
      experience: 'Experience and résumé',
      projects: 'Projects',
      learning: 'Learning',
      community: 'Community',
    },
  },
};
const sections = ['experience', 'projects', 'learning', 'community'];
const navigationFor = (locale) => [
  `/${locale}/`,
  ...sections.map((section) => `/${locale}/${section}/`),
];

await mkdir(artifactRoot, { recursive: true });
const browser = await chromium.launch();
const report = [];

try {
  for (const [locale, localeConfig] of Object.entries(locales)) {
    for (const [viewportName, viewport] of Object.entries(viewports)) {
      const context = await browser.newContext({
        viewport,
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
        ignoreHTTPSErrors,
      });
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));

      try {
        const axeViolations = [];
        for (const section of sections) {
          const pathname = `/${locale}/${section}/`;
          const response = await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'networkidle' });
          assert.equal(response?.status(), 200, `${pathname} document status`);
          assert.equal(await page.locator('main h1').textContent(), localeConfig.headings[section], `${pathname} h1`);
          assert.equal(await page.locator('main h1').count(), 1, `${pathname} must expose one h1`);
          assert.equal(await page.locator('main p').count(), 1, `${pathname} must expose one migration status`);
          assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, follow', `${pathname} robots`);
          assert.equal(await page.locator('script').count(), 0, `${pathname} must stay zero-JS`);
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
            true,
            `${pathname} overflows horizontally`,
          );
          assert.deepEqual(
            await page.locator('header nav a').evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
            navigationFor(locale),
            `${pathname} navigation registry paths`,
          );
          assert.equal(
            await page.locator(`.locale-switcher a[lang="${localeConfig.alternate}"]`).getAttribute('href'),
            `/${localeConfig.alternate}/${section}/`,
            `${pathname} locale switch`,
          );

          const axe = await new AxeBuilder({ page }).analyze();
          const blocking = axe.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical');
          assert.deepEqual(blocking, [], `${pathname} serious/critical axe violations`);
          axeViolations.push(...axe.violations.map(({ id, impact }) => ({ route: pathname, id, impact })));
        }

        await page.goto(`${baseUrl}/${locale}/experience/`, { waitUntil: 'networkidle' });
        await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });

        if (viewportName === 'desktop') {
          await page.keyboard.press('Tab');
          assert.equal(await page.locator(':focus').getAttribute('href'), '#content', `${locale} first tab reaches skip link`);
          await page.keyboard.press('Tab');
          assert.equal(await page.locator(':focus').getAttribute('href'), `/${locale}/`, `${locale} second tab reaches brand`);
        } else {
          const lastNavigationLink = page.locator('header nav a').last();
          await page.locator('header nav').evaluate((navigation) => { navigation.scrollLeft = navigation.scrollWidth; });
          const bounds = await lastNavigationLink.boundingBox();
          assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 0.5, `${locale}/${viewportName} last nav item is reachable`);
        }

        for (const detailPath of [
          `/${locale}/experience/java/`,
          `/${locale}/experience/changelog/`,
          `/${locale}/projects/flatscanner/`,
        ]) {
          const detailResponse = await context.request.get(`${baseUrl}${detailPath}`);
          assert.equal(detailResponse.status(), 404, `${detailPath} detail contract`);
        }

        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          window.scrollTo(0, 0);
        });
        const screenshotPath = resolve(artifactRoot, `${locale}-${viewportName}.png`);
        await page.screenshot({ path: screenshotPath, animations: 'disabled', caret: 'hide' });
        assert.deepEqual(consoleErrors, [], `${locale}/${viewportName} console errors`);
        assert.deepEqual(pageErrors, [], `${locale}/${viewportName} page errors`);
        assert.deepEqual(failedRequests, [], `${locale}/${viewportName} failed requests`);

        report.push({
          locale,
          viewport: viewportName,
          dimensions: viewport,
          checkedRoutes: sections.map((section) => `/${locale}/${section}/`),
          screenshot: relative(root, screenshotPath).replaceAll('\\', '/'),
          axeViolations,
        });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(resolve(artifactRoot, 'report.json'), `${JSON.stringify({ contract: 'locale-first-placeholder-qa-v1', report }, null, 2)}\n`);
}

console.log(`Placeholder browser QA passed: ${report.length} locale/viewport cells, ${report.reduce((count, item) => count + item.checkedRoutes.length, 0)} route checks.`);
