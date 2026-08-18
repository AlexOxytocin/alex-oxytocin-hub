import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist", "hub");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, "sites", "hub"), output, { recursive: true });
const css = [
  await readFile(resolve(root, "shared", "ecosystem-nav.css"), "utf8"),
  (await readFile(resolve(root, "app", "globals.css"), "utf8"))
    .replace(/^@import\s+"tailwindcss";\s*/u, ""),
].join("\n");
await writeFile(resolve(output, "styles.css"), css);
