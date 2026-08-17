import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const release = resolve(root, "release");

await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });

await cp(resolve(root, "sites", "hub"), resolve(release, "hub"), { recursive: true });
const css = (await readFile(resolve(root, "app", "globals.css"), "utf8"))
  .replace(/^@import\s+"tailwindcss";\s*/u, "");
await writeFile(resolve(release, "hub", "styles.css"), css);
await mkdir(resolve(release, "hub", "assets"), { recursive: true });
for (const name of ["field.js", "palette.js", "placement.js", "neural.js"]) {
  await cp(
    resolve(root, "sites", "ai", "website", "src", "js", name),
    resolve(release, "hub", "assets", name)
  );
}
await cp(
  resolve(root, "public", "assets", "community-mark.jpg"),
  resolve(release, "hub", "assets", "community-mark.jpg")
);
await cp(
  resolve(root, "public", "assets", "alex-oxytocin-logo.svg"),
  resolve(release, "hub", "assets", "alex-oxytocin-logo.svg")
);

const hubCss = await readFile(resolve(release, "hub", "styles.css"));
const hubNeural = await readFile(resolve(release, "hub", "assets", "neural.js"));
const hubAssetVersion = createHash("sha256")
  .update(hubCss)
  .update(hubNeural)
  .digest("hex")
  .slice(0, 12);
const hubHtmlPath = resolve(release, "hub", "index.html");
const hubHtml = (await readFile(hubHtmlPath, "utf8"))
  .replace('href="/styles.css"', `href="/styles.css?v=${hubAssetVersion}"`)
  .replace('src="/assets/neural.js"', `src="/assets/neural.js?v=${hubAssetVersion}"`);
await writeFile(hubHtmlPath, hubHtml);

await cp(resolve(root, "sites", "ai", "website", "dist"), resolve(release, "ai"), { recursive: true });

const cvSource = resolve(root, "sites", "cv", "dist");
await cp(cvSource, resolve(release, "cv"), {
  recursive: true,
  filter(source) {
    const path = relative(cvSource, source).split(sep).join("/");
    const isTemplateMedia = path === "media/projects" || path.startsWith("media/projects/");
    const isTemplateChangelog = path === "changelog" || path.startsWith("changelog/");
    return !isTemplateMedia && !isTemplateChangelog;
  },
});

await cp(resolve(root, "sites", "allo"), resolve(release, "allo"), { recursive: true });
