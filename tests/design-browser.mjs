import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.SITE_PREVIEW_URL ?? 'http://127.0.0.1:4321';
const browser = await chromium.launch();

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await desktop.newPage();
  const homeResponse = await desktopPage.goto(`${baseUrl}/ru/`, { waitUntil: 'networkidle' });
  assert.equal(homeResponse?.status(), 200);
  await desktopPage.waitForFunction(() => (
    document.querySelector('[data-motion-root]')?.getAttribute('data-motion-state') === 'active'
  ));
  await desktopPage.screenshot({ path: '.qa-god4-desktop.png', fullPage: true });
  await desktopPage.emulateMedia({ reducedMotion: 'reduce' });
  await desktopPage.waitForFunction(() => (
    document.querySelector('[data-motion-root]')?.getAttribute('data-motion-state') === 'static'
  ));
  await desktopPage.emulateMedia({ reducedMotion: 'no-preference' });
  await desktopPage.waitForFunction(() => (
    document.querySelector('[data-motion-root]')?.getAttribute('data-motion-state') === 'active'
  ));

  const projectsResponse = await desktopPage.goto(`${baseUrl}/ru/projects/`, { waitUntil: 'networkidle' });
  assert.equal(projectsResponse?.status(), 200);
  assert.equal(await desktopPage.locator('script').count(), 0);
  await desktop.close();

  const reduced = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    reducedMotion: 'reduce',
  });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(`${baseUrl}/en/`, { waitUntil: 'networkidle' });
  assert.equal(await reducedPage.locator('[data-motion-root]').getAttribute('data-motion-state'), 'static');
  const skipBounds = await reducedPage.locator('.skip-link').boundingBox();
  assert.ok(skipBounds && skipBounds.y + skipBounds.height <= 0, 'unfocused skip link must remain off-screen');
  await reducedPage.screenshot({ path: '.qa-god4-reduced.png', fullPage: true });
  await reduced.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${baseUrl}/en/`, { waitUntil: 'networkidle' });
  assert.equal(await mobilePage.locator('[data-motion-root]').getAttribute('data-motion-state'), 'static');
  const communityBounds = await mobilePage.getByRole('link', { name: 'Community' }).boundingBox();
  assert.ok(communityBounds && communityBounds.x + communityBounds.width <= 390, 'mobile navigation must not clip Community');
  await mobilePage.screenshot({ path: '.qa-god4-mobile.png', fullPage: true });
  const missingResponse = await mobilePage.goto(`${baseUrl}/not-a-page/`);
  assert.equal(missingResponse?.status(), 404);
  await mobile.close();

  console.log('Browser QA passed: desktop active, reduced/mobile static, content route zero-JS, 404 correct.');
} finally {
  await browser.close();
}
