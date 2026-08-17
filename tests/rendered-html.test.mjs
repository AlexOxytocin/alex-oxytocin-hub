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

test("renders the personal hub with the neural hero", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Alex Oxytocin — ИИ, архитектура и инструменты<\/title>/i);
  assert.match(html, /<strong>OXYTOCIN<\/strong>/);
  assert.match(html, /class="hero-canvas"/);
  assert.match(html, /class="direction-card-mark"[^>]*src="\/assets\/community-mark\.jpg"/);
  assert.match(html, /alt="Логотип сообщества «Алло, Нейросеточная\?»"/);
  assert.match(html, /Собираю технологии/);
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

test("static deployment carries the same interactive field", async () => {
  const [html, css, communityMark] = await Promise.all([
    readFile(new URL("../sites/hub/index.html", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/assets/community-mark.jpg", import.meta.url)),
  ]);

  assert.match(html, /<canvas class="hero-canvas"/);
  assert.match(html, /<script type="module" src="\/assets\/neural\.js"><\/script>/);
  assert.match(css, /\.hero-canvas\s*\{/);
  assert.match(css, /\.hero::before[\s\S]*mask-image:\s*[\s\S]*linear-gradient\(to right,[\s\S]*transparent 100%\)/);
  assert.match(css, /mask-composite:\s*intersect/);
  assert.match(html, /class="direction-card-mark"[^>]*community-mark\.jpg/);
  assert.ok(communityMark.byteLength > 8000, "community logo asset is missing or truncated");
  assert.doesNotMatch(css, /\.signal(?:-|\s*\{)/);
});
