import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the personal hub with the portrait hero", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Alex Oxytocin — ИИ, архитектура и инструменты<\/title>/i);
  assert.match(html, /class="brand-logo"[^>]*src="\/assets\/alex-oxytocin-logo\.png\?v=official-master-20260817"/);
  assert.doesNotMatch(html, /class="hero-canvas"/);
  assert.match(html, /class="direction-card-mark"[^>]*src="\/assets\/community-mark\.jpg"/);
  assert.match(html, /class="hero-portrait"/);
  assert.match(html, /src="\/assets\/alexey-grishchenko-about\.jpg\?v=natural-warm"/);
  assert.match(html, /<strong>10\+<\/strong>[\s\S]*лет в Java-разработке/);
  assert.match(html, /<strong>20\+<\/strong>[\s\S]*инженеров в командах/);
  assert.match(html, /href="https:\/\/cv\.godmodetools\.com\/showcase"/);
  assert.doesNotMatch(html, /class="hero-actions"|Хочу научиться|Написать мне ↗/);
  assert.match(html, /Смотреть проекты и подходы/);
  assert.doesNotMatch(html, /id="solutions"|Что я делаю для команд/);
  assert.doesNotMatch(html, /Проекты, опыт и работа с ИИ|class="section-heading"|<h2/);
  assert.match(html, /<section class="directions"[^>]*aria-label="Направления"/);
  assert.match(html, /alt="Логотип сообщества «Алло, Нейросеточная\?»"/);
  assert.match(html, /Разрабатываю[\s\S]*hero-accent-tools[^>]*>ИИ-инструменты<[\s\S]*автоматизирую процессы\./);
  assert.doesNotMatch(html, /Обучаю этому на|hero-accent-task/);
  assert.doesNotMatch(html, /Не продаю магию|Собираю технологии/);
  assert.match(html, /class="hero-summary"/);
  assert.match(html, /тёплое и безопасное[\s\S]*ИТ-сообщество профессионалов[\s\S]*взаимопомощи/);
  assert.match(html, /Индивидуально обучаю работе с ИИ на ваших задачах/);
  assert.match(html, /href="https:\/\/github\.com\/AlexOxytocin">GitHub<\/a>/);
  assert.doesNotMatch(html, /github\.com\/alexgoodman53/i);
  assert.match(html, /Смотрю на задачу целиком[\s\S]*применять его самостоятельно/);
  assert.match(html, /class="lang"[\s\S]*href="\/en\/"[\s\S]*>EN<[\s\S]*class="active"[^>]*href="\/"[^>]*>RU</);
  assert.doesNotMatch(html, /signal-core|signal-ring|codex-preview/);
});

test("renders a complete English home page", async () => {
  const response = await render("/en");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Alex Oxytocin — AI, architecture, and practical tools<\/title>/i);
  assert.match(html, /<main[^>]*lang="en"/);
  assert.match(html, /I build[\s\S]*hero-accent-tools[^>]*>AI tools<[\s\S]*automate processes/);
  assert.match(html, /I teach people to use AI on their own real tasks/);
  assert.match(html, /warm, safe community for IT professionals/);
  assert.match(html, /href="https:\/\/cv\.godmodetools\.com\/showcase\/en"/);
  assert.match(html, /class="lang"[\s\S]*class="active"[^>]*href="\/en\/"[^>]*>EN<[\s\S]*href="\/"[^>]*>RU</);
});

test("reuses the exact Alex Neon neural modules", async () => {
  const modules = ["field.js", "palette.js", "placement.js", "neural.js"];
  for (const name of modules) {
    const [source, publicCopy] = await Promise.all([
      readFile(new URL(`../sites/ai/website/src/js/${name}`, import.meta.url), "utf8"),
      readFile(new URL(`../public/assets/${name}`, import.meta.url), "utf8"),
    ]);
    assert.equal(publicCopy, source, `${name} diverged from alex-neon`);
  }

  const neural = await readFile(new URL("../public/assets/neural.js", import.meta.url), "utf8");
  assert.match(neural, /pointermove/);
  assert.match(neural, /prefers-reduced-motion/);
  assert.match(neural, /ambientEvery:\s*3400/);
});

test("static deployment carries both localized portrait pages", async () => {
  const [html, englishHtml, css, communityMark, portrait, brandLogo] = await Promise.all([
    readFile(new URL("../sites/hub/index.html", import.meta.url), "utf8"),
    readFile(new URL("../sites/hub/en/index.html", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/assets/community-mark.jpg", import.meta.url)),
    readFile(new URL("../public/assets/alexey-grishchenko-about.jpg", import.meta.url)),
    readFile(new URL("../public/assets/alex-oxytocin-logo.png", import.meta.url)),
  ]);

  assert.doesNotMatch(html, /<canvas class="hero-canvas"/);
  assert.doesNotMatch(html, /<script type="module" src="\/assets\/neural\.js"><\/script>/);
  assert.doesNotMatch(css, /\.hero-canvas\s*\{/);
  assert.doesNotMatch(css, /\.hero-portrait\s*\{[^}]*mask-image/);
  assert.match(css, /\.hero-portrait img[\s\S]*mask-image:[\s\S]*linear-gradient/);
  assert.match(css, /mask-composite:\s*intersect/);
  assert.doesNotMatch(css, /\.hero-portrait\s*\{[^}]*border:\s*1px solid/);
  assert.match(css, /\.hero-portrait\s*\{[^}]*aspect-ratio:\s*1122\s*\/\s*1402/);
  assert.match(css, /\.hero-portrait\s*\{[^}]*width:\s*min\(85\.846%,\s*394\.9px\)/);
  assert.match(css, /\.hero-portrait\s*\{[^}]*transform:\s*translateY\(clamp\(-32px,\s*-3vh,\s*-20px\)\)\s*scale\(1\.148\)/);
  assert.match(css, /\.hero-evidence\s*\{[^}]*margin-top:\s*calc\(clamp\(38px,\s*5vh,\s*48px\)\s*-\s*12\.5px\)/);
  assert.match(css, /@media \(min-width:\s*821px\) and \(max-height:\s*850px\)[\s\S]*\.hero-evidence\s*\{[^}]*margin-top:\s*calc\(clamp\(38px,\s*5vh,\s*48px\)\s*-\s*10\.1px\)/);
  assert.match(css, /\.directions\s*\{[^}]*padding:\s*calc\(50px\s*-\s*clamp\(12px,\s*1\.8vh,\s*19px\)\)\s*0\s*110px/);
  assert.match(css, /@media \(min-width:\s*821px\) and \(max-height:\s*850px\)[\s\S]*\.directions\s*\{[^}]*padding-top:\s*38px/);
  assert.match(css, /@media \(max-width:\s*820px\)[\s\S]*\.hero\s*\{[^}]*padding:\s*64px 0 24px/);
  assert.match(css, /@media \(max-width:\s*820px\)[\s\S]*\.directions\s*\{[^}]*padding-top:\s*32px/);
  assert.match(css, /\.hero-portrait img\s*\{[^}]*object-fit:\s*contain/);
  assert.doesNotMatch(css, /\.hero-portrait img\s*\{[^}]*object-fit:\s*cover/);
  assert.match(css, /\.hero-summary\s*\{[\s\S]*list-style:\s*none/);
  assert.match(html, /class="direction-card-mark"[^>]*community-mark\.jpg/);
  assert.ok(communityMark.byteLength > 8000, "community logo asset is missing or truncated");
  assert.match(html, /class="hero-portrait"/);
  assert.match(html, /alexey-grishchenko-about\.jpg\?v=natural-warm/);
  assert.ok(portrait.byteLength > 100000, "about portrait asset is missing or truncated");
  assert.match(html, /<strong>10\+<\/strong><span>лет в Java-разработке/);
  assert.match(html, /<strong>20\+<\/strong><span>инженеров в командах/);
  assert.match(html, /href="https:\/\/cv\.godmodetools\.com\/showcase"/);
  assert.doesNotMatch(html, /id="solutions"|Что я делаю для команд/);
  assert.match(html, /class="brand-logo"[^>]*alex-oxytocin-logo\.png/);
  assert.deepEqual([...brandLogo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(brandLogo.readUInt32BE(16), 2160, "wordmark canvas width changed");
  assert.equal(brandLogo.readUInt32BE(20), 300, "wordmark canvas height changed");
  assert.equal(brandLogo[25], 6, "wordmark must retain an alpha channel");
  assert.ok(brandLogo.byteLength > 100000, "official wordmark is missing or truncated");
  assert.doesNotMatch(css, /\.signal(?:-|\s*\{)/);
  assert.match(css, /\.directions\s*\{[^}]*border:\s*0/);
  assert.doesNotMatch(html, /Обучаю этому на|hero-accent-task/);
  assert.match(html, /href="\/styles\.css"/);
  assert.match(html, /hreflang="en" href="https:\/\/godmodetools\.com\/en\/"/);
  assert.match(englishHtml, /<html lang="en">/);
  assert.match(englishHtml, /<title>Alex Oxytocin — AI, architecture, and practical tools<\/title>/);
  assert.match(englishHtml, /class="active" href="\/en\/" lang="en" aria-current="page">EN<\/a>/);
  assert.match(englishHtml, /I look at the whole problem/);
  assert.match(englishHtml, /href="https:\/\/cv\.godmodetools\.com\/showcase\/en"/);
  assert.match(css, /\.header-tools\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.lang a\.active\s*\{[^}]*border-color:\s*var\(--line\)/);
});

test("all site headers use the canonical Alex Oxytocin wordmark", async () => {
  const [ai, ai404, cv, allo] = await Promise.all([
    readFile(new URL("../sites/ai/website/src/index.html", import.meta.url), "utf8"),
    readFile(new URL("../sites/ai/website/src/404.html", import.meta.url), "utf8"),
    readFile(new URL("../sites/cv/src/components/Layout.astro", import.meta.url), "utf8"),
    readFile(new URL("../sites/allo/index.html", import.meta.url), "utf8"),
  ]);

  const canonical = /alex-oxytocin-logo\.png\?v=official-master-20260817/;
  for (const source of [ai, ai404, cv, allo]) {
    assert.match(source, canonical);
    assert.match(source, /width="216" height="30"/);
  }
  assert.doesNotMatch(cv, />ALEX \/ CV</);
  assert.doesNotMatch(allo, /← экосистема Алексея/);
});
