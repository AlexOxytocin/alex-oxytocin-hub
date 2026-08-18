import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
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
  assert.match(html, /class="brand-logo"[^>]*src="\/assets\/alex-oxytocin-logo\.svg\?v=custom-wordmark-20260817"/);
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
  assert.doesNotMatch(html, /signal-core|signal-ring|codex-preview/);
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

test("static deployment carries the same portrait hero", async () => {
  const [html, css, communityMark, portrait, brandLogo] = await Promise.all([
    readFile(new URL("../sites/hub/index.html", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/assets/community-mark.jpg", import.meta.url)),
    readFile(new URL("../public/assets/alexey-grishchenko-about.jpg", import.meta.url)),
    readFile(new URL("../public/assets/alex-oxytocin-logo.svg", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(html, /<canvas class="hero-canvas"/);
  assert.doesNotMatch(html, /<script type="module" src="\/assets\/neural\.js"><\/script>/);
  assert.doesNotMatch(css, /\.hero-canvas\s*\{/);
  assert.doesNotMatch(css, /\.hero-portrait\s*\{[^}]*mask-image/);
  assert.match(css, /\.hero-portrait img[\s\S]*mask-image:[\s\S]*linear-gradient/);
  assert.match(css, /mask-composite:\s*intersect/);
  assert.doesNotMatch(css, /\.hero-portrait\s*\{[^}]*border:\s*1px solid/);
  assert.match(css, /\.hero-portrait\s*\{[^}]*aspect-ratio:\s*1122\s*\/\s*1402/);
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
  assert.match(html, /class="brand-logo"[^>]*alex-oxytocin-logo\.svg/);
  assert.match(brandLogo, /viewBox="0 0 216 30"/);
  assert.match(brandLogo, /width="216" height="30"/);
  assert.match(brandLogo, /id="custom-letterforms"/);
  assert.match(brandLogo, /width="211" height="13"/);
  assert.match(brandLogo, /mask="url\(#custom-letterforms\)"/);
  assert.match(brandLogo, /fill="url\(#wordmark-colour\)"/);
  assert.doesNotMatch(brandLogo, /<text|<tspan|font-family/);
  assert.doesNotMatch(css, /\.signal(?:-|\s*\{)/);
  assert.match(css, /\.directions\s*\{[^}]*border:\s*0/);
  assert.doesNotMatch(html, /Обучаю этому на|hero-accent-task/);
  assert.match(html, /href="\/styles\.css"/);
});

test("all site headers use the canonical Alex Oxytocin wordmark", async () => {
  const [ai, ai404, cv, allo] = await Promise.all([
    readFile(new URL("../sites/ai/website/src/index.html", import.meta.url), "utf8"),
    readFile(new URL("../sites/ai/website/src/404.html", import.meta.url), "utf8"),
    readFile(new URL("../sites/cv/src/components/Layout.astro", import.meta.url), "utf8"),
    readFile(new URL("../sites/allo/index.html", import.meta.url), "utf8"),
  ]);

  const canonical = /alex-oxytocin-logo\.svg\?v=custom-wordmark-20260817/;
  for (const source of [ai, ai404, cv, allo]) {
    assert.match(source, canonical);
    assert.match(source, /width="216" height="30"/);
  }
  assert.doesNotMatch(cv, />ALEX \/ CV</);
  assert.doesNotMatch(allo, /← экосистема Алексея/);
});
