import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const output = "C:/Users/User/.codex/visualizations/2026/08/18/01a012a4-8d22-7600-80db-9de84cdd0f0c/ecosystem-nav";
await mkdir(output, { recursive: true });

const publicMode = process.argv.includes("--public");
const origins = publicMode
  ? {
      hub: "https://godmodetools.com",
      cv: "https://cv.godmodetools.com",
      ai: "https://ai.godmodetools.com",
      allo: "https://allo.godmodetools.com",
    }
  : {
      hub: "http://127.0.0.1:4173",
      cv: "http://127.0.0.1:4174",
      ai: "http://127.0.0.1:4175",
      allo: "http://127.0.0.1:4176",
    };

const pages = [
  { name: "hub-ru", url: `${origins.hub}/`, active: "Главная", locale: true },
  { name: "hub-en", url: `${origins.hub}/en/`, active: "Home", locale: true },
  { name: "cv-ru", url: `${origins.cv}/`, active: "Опыт", locale: true },
  { name: "cv-en", url: `${origins.cv}/en/`, active: "Experience", locale: true },
  { name: "projects-ru", url: `${origins.cv}/showcase/`, active: "Проекты", locale: true },
  { name: "projects-en", url: `${origins.cv}/showcase/en/`, active: "Projects", locale: true },
  { name: "training", url: `${origins.ai}/`, active: "Обучение", locale: false },
  { name: "community-ru", url: `${origins.allo}/`, active: "Комьюнити", locale: true },
  { name: "community-en", url: `${origins.allo}/en/`, active: "Community", locale: true },
];

const viewports = [
  { name: "mobile", width: 360, height: 800 },
  { name: "desktop", width: 1280, height: 900 },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    for (const target of pages) {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("requestfailed", (request) => errors.push(`${request.method()} ${request.url()}`));

      const response = await page.goto(target.url, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200, `${target.name} did not load`);
      assert.equal(await page.locator(".ecosystem-nav__link").count(), 5, `${target.name} link count`);
      assert.equal(
        (await page.locator('.ecosystem-nav__link[aria-current="page"]').textContent())?.trim(),
        target.active,
        `${target.name} active section`,
      );
      assert.equal(
        await page.locator(".ecosystem-nav__locale").count(),
        target.locale ? 1 : 0,
        `${target.name} locale visibility`,
      );
      const logo = await page.locator(".ecosystem-nav__brand img").evaluate((image) => {
        const rect = image.getBoundingClientRect();
        const style = getComputedStyle(image);
        return {
          naturalWidth: image.naturalWidth,
          width: rect.width,
          height: rect.height,
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
        };
      });
      assert.ok(logo.naturalWidth > 0 && logo.width > 100 && logo.height > 20 && logo.visibility === "visible" && logo.opacity !== "0", `${target.name} logo is not visible: ${JSON.stringify(logo)}`);
      if (target.name === "community" && viewport.name === "desktop") {
        await page.locator(".ecosystem-nav__brand").screenshot({ path: `${output}/community-logo-desktop.png` });
      }

      const geometry = await page.evaluate(() => {
        const header = document.querySelector(".ecosystem-header");
        const rect = header.getBoundingClientRect();
        return {
          position: getComputedStyle(header).position,
          top: rect.top,
          height: rect.height,
          bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          overflowElements: [...document.querySelectorAll("body *")]
            .map((element) => ({
              element: `${element.tagName.toLowerCase()}.${[...element.classList].join(".")}`,
              right: Math.round(element.getBoundingClientRect().right),
              width: Math.round(element.getBoundingClientRect().width),
            }))
            .filter((item) => item.right > document.documentElement.clientWidth + 1)
            .slice(0, 8),
        };
      });
      assert.equal(geometry.position, "fixed", `${target.name} header position`);
      assert.ok(Math.abs(geometry.top) < 1, `${target.name} header is not pinned`);
      assert.ok(geometry.height <= (viewport.width <= 900 ? 118 : 74), `${target.name} header is too tall`);
      assert.ok(geometry.bodyOverflow <= 1, `${target.name} causes horizontal page overflow: ${JSON.stringify(geometry)}`);

      await page.screenshot({ path: `${output}/${target.name}-${viewport.name}.png` });

      await page.evaluate(() => window.scrollTo(0, Math.min(700, document.body.scrollHeight)));
      await page.waitForTimeout(80);
      const scrolledTop = await page.locator(".ecosystem-header").evaluate((header) => header.getBoundingClientRect().top);
      assert.ok(Math.abs(scrolledTop) < 1, `${target.name} header moved after scroll`);
      assert.deepEqual(errors, [], `${target.name} browser errors`);

      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`Verified ${pages.length * viewports.length} ${publicMode ? "public" : "local"} ecosystem navigation views.`);
