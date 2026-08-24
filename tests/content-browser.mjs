import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.SITE_PREVIEW_URL ?? 'http://127.0.0.1:4321';
const sampleRoutes = [
  '/ru/',
  '/en/learning/',
  '/ru/community/',
  '/en/experience/java/',
  '/ru/projects/',
  '/en/projects/flatscanner/',
];

const browser = await chromium.launch();
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await desktop.newPage();
  for (const route of sampleRoutes) {
    const response = await desktopPage.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200, route);
    assert.equal(await desktopPage.locator('h1').count(), 1, `${route} needs one h1`);
    assert.equal(await desktopPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${route} overflows horizontally`);
    for (const src of await desktopPage.locator('main img').evaluateAll((images) => images.map((image) => image.getAttribute('src')).filter(Boolean))) {
      const imageResponse = await desktopPage.request.get(new URL(src, baseUrl).href);
      assert.equal(imageResponse.status(), 200, `broken image ${src} on ${route}`);
    }
  }
  await desktopPage.goto(`${baseUrl}/ru/learning/`, { waitUntil: 'networkidle' });
  await desktopPage.screenshot({ path: '.qa-god5-learning-desktop.png', fullPage: true });
  await desktopPage.goto(`${baseUrl}/en/projects/flatscanner/`, { waitUntil: 'networkidle' });
  assert.equal(await desktopPage.locator('.locale-switcher a[lang="ru"]').getAttribute('href'), '/ru/projects/flatscanner/');
  for (const extension of ['pdf', 'docx', 'txt']) {
    const response = await desktopPage.request.get(`${baseUrl}/en/experience/java/downloads/resume_en_java.${extension}`);
    assert.equal(response.status(), 200, extension);
  }
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  for (const route of ['/ru/', '/ru/projects/', '/en/learning/', '/en/community/', '/ru/experience/java/']) {
    const response = await mobilePage.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200, route);
    assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${route} overflows mobile`);
  }
  await mobilePage.goto(`${baseUrl}/en/projects/`, { waitUntil: 'networkidle' });
  await mobilePage.screenshot({ path: '.qa-god5-projects-mobile.png', fullPage: true });
  await mobile.close();

  console.log('Content browser QA passed: localized pages, media, downloads, detail locale switching, and responsive overflow.');
} finally {
  await browser.close();
}
