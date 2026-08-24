#!/usr/bin/env node
/* Alex Neon static build.
   Renders the single landing page into dist/: copies the HTML, concatenates
   the stylesheet layers, and copies scripts, fonts, and icons. No network
   access and no framework runtime. */

import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");

const PRODUCTION_ORIGIN = "https://godmodetools.com";
const LEARNING_URL = `${PRODUCTION_ORIGIN}/ru/learning/`;

const STYLE_ORDER = [
  "tokens.css",
  "base.css",
  "layout.css",
  "components.css",
  "sections.css"
];

async function buildStylesheet() {
  const parts = [];
  for (const name of STYLE_ORDER) {
    parts.push(await readFile(join(root, "src/styles", name), "utf8"));
  }
  parts.push(await readFile(resolve(root, "../../../shared/ecosystem-nav.css"), "utf8"));
  return parts.join("\n");
}

async function main() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(join(dist, "assets"), { recursive: true });

  await cp(join(root, "src/index.html"), join(dist, "index.html"));
  await cp(join(root, "src/404.html"), join(dist, "404.html"));
  const stylesheet = await buildStylesheet();
  await writeFile(join(dist, "assets/styles.css"), stylesheet);

  for (const file of await readdir(join(root, "src/js"))) {
    if (file.endsWith(".js") || file.endsWith(".mjs")) {
      await cp(join(root, "src/js", file), join(dist, "assets", file));
    }
  }

  const assetVersion = createHash("sha256")
    .update(stylesheet)
    .update(await readFile(join(dist, "assets/neural.js")))
    .digest("hex")
    .slice(0, 12);
  const indexPath = join(dist, "index.html");
  const indexHtml = (await readFile(indexPath, "utf8"))
    .replace("./assets/styles.css", `./assets/styles.css?v=${assetVersion}`)
    .replace("./assets/neural.js", `./assets/neural.js?v=${assetVersion}`);
  await writeFile(indexPath, indexHtml);

  await cp(join(root, "assets/fonts"), join(dist, "assets/fonts"), {
    recursive: true
  });
  await cp(join(root, "assets/favicon.png"), join(dist, "assets/favicon.png"));
  await cp(join(root, "assets/og.png"), join(dist, "assets/og.png"));
  await cp(
    join(root, "assets/ks-design-signature.png"),
    join(dist, "assets/ks-design-signature.png")
  );

  await writeFile(
    join(dist, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${PRODUCTION_ORIGIN}/sitemap.xml\n`
  );
  await writeFile(
    join(dist, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${LEARNING_URL}</loc></url>\n</urlset>\n`
  );

  console.log("Built the Alex Neon landing into dist/");
}

await main();
