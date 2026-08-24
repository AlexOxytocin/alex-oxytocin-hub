import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.SITE_PREVIEW_URL ?? 'http://127.0.0.1:4321';
const ignoreHTTPSErrors = process.env.SITE_PREVIEW_INSECURE === '1';
const browser = await chromium.launch();

try {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'no-preference',
    ignoreHTTPSErrors,
  });
  const desktopPage = await desktop.newPage();
  const homeResponse = await desktopPage.goto(`${baseUrl}/ru/`, { waitUntil: 'networkidle' });
  assert.equal(homeResponse?.status(), 200);
  assert.equal(await desktopPage.locator('h1').count(), 1);
  assert.equal(await desktopPage.locator('script').count(), 0);
  assert.equal(await desktopPage.locator('[data-motion-root]').count(), 0);
  assert.equal(await desktopPage.locator('.home-backdrop').count(), 1);

  const projectsResponse = await desktopPage.goto(`${baseUrl}/ru/projects/`, { waitUntil: 'networkidle' });
  assert.equal(projectsResponse?.status(), 200);
  assert.equal(await desktopPage.locator('script').count(), 0);
  await desktop.close();

  const reduced = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    reducedMotion: 'reduce',
    ignoreHTTPSErrors,
  });
  const reducedPage = await reduced.newPage();
  const reducedResponse = await reducedPage.goto(`${baseUrl}/en/`, { waitUntil: 'networkidle' });
  assert.equal(reducedResponse?.status(), 200);
  assert.equal(await reducedPage.locator('[data-motion-root]').count(), 0);
  assert.equal(await reducedPage.locator('script').count(), 0);
  const skipBounds = await reducedPage.locator('.skip-link').boundingBox();
  assert.ok(skipBounds && skipBounds.y + skipBounds.height <= 0, 'unfocused skip link must remain off-screen');
  await reduced.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors });
  const mobilePage = await mobile.newPage();
  const mobileResponse = await mobilePage.goto(`${baseUrl}/en/`, { waitUntil: 'networkidle' });
  assert.equal(mobileResponse?.status(), 200);
  assert.equal(await mobilePage.locator('[data-motion-root]').count(), 0);
  const mobileNavigation = mobilePage.locator('header nav');
  await mobileNavigation.evaluate((navigation) => { navigation.scrollLeft = navigation.scrollWidth; });
  const communityBounds = await mobilePage.getByRole('link', { name: 'Community', exact: true }).boundingBox();
  assert.ok(communityBounds && communityBounds.x >= 0 && communityBounds.x + communityBounds.width <= 390.5, 'mobile navigation must make Community reachable');
  const missingResponse = await mobilePage.goto(`${baseUrl}/not-a-page/`);
  assert.equal(missingResponse?.status(), 404);
  await mobile.close();

  console.log('Browser QA passed: Home zero-JS, reduced motion static, mobile navigation reachable, 404 correct.');
} finally {
  await browser.close();
}
