import { access, cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "sites", "ai", "website", "src", "js");
const output = resolve(root, "public", "assets");
const modules = ["field.js", "palette.js", "placement.js", "neural.js"];

await mkdir(output, { recursive: true });
const sourceAvailable = await Promise.all(
  modules.map((name) => access(resolve(source, name)).then(() => true, () => false))
).then((checks) => checks.every(Boolean));

if (sourceAvailable) {
  await Promise.all(modules.map((name) => cp(resolve(source, name), resolve(output, name))));
} else {
  /* Hosted source checkouts do not materialise the local nested repositories.
     The exact synced modules are committed under public/assets for that case. */
  await Promise.all(modules.map((name) => access(resolve(output, name))));
}
