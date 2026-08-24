import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const inventoryPath = new URL("../docs/url-migration-inventory.json", import.meta.url);
const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
const { production_origin: origin, records, prefix_contracts: prefixContracts } = inventory;
const publishedLocalePrefix = /^https:\/\/godmodetools\.com\/(?:ru|en)(?:\/|$)/u;
const forbiddenTarget = /(?:workers\.dev|staging|stage)/iu;

function recordFor(source) {
  const record = records.find((candidate) => candidate.source === source);
  assert.ok(record, `Missing inventory record for ${source}`);
  return record;
}

test("inventory has a valid schema and unique HTTPS source URLs", () => {
  assert.equal(inventory.schema_version, 1);
  assert.equal(origin, "https://godmodetools.com");
  assert.ok(Array.isArray(records) && records.length > 0);

  const seen = new Set();
  for (const record of records) {
    assert.equal(typeof record.source, "string");
    assert.match(record.source, /^https:\/\//u);
    assert.ok(!seen.has(record.source), `Duplicate source URL: ${record.source}`);
    seen.add(record.source);
    assert.ok(record.current?.evidence, `Missing current evidence for ${record.source}`);
    assert.equal(typeof record.current.status, "number", `Current status is not measured for ${record.source}`);
    assert.ok(record.final?.action, `Missing final action for ${record.source}`);
    assert.ok(record.final?.status, `Missing final status for ${record.source}`);

    const expectedStatus = { redirect: 301, serve: 200, gone: 410, not_found: 404 }[record.final.action];
    assert.equal(record.final.status, expectedStatus, `Action/status mismatch for ${record.source}`);
    if (record.final.action === "redirect" || record.final.action === "serve") {
      assert.equal(typeof record.final.target, "string", `Missing final target for ${record.source}`);
    } else {
      assert.equal(record.final.target, undefined, `Terminal contract must not redirect: ${record.source}`);
    }
  }
});

test("HTTP requests resolve directly to the final contract without redirect chains", () => {
  assert.equal(inventory.http_policy.mode, "direct-to-final-contract");
  assert.equal(inventory.http_policy.status, 301);
  assert.equal(inventory.http_policy.query, "preserve");
  assert.deepEqual(inventory.http_policy.hosts, [
    "godmodetools.com",
    "www.godmodetools.com",
    "cv.godmodetools.com",
    "ai.godmodetools.com",
    "allo.godmodetools.com"
  ]);
  assert.equal(inventory.http_policy.rules.redirect, "redirect directly to the HTTPS record final.target");
  assert.equal(inventory.http_policy.rules.serve, "redirect directly to the HTTPS record final.target");
  assert.equal(inventory.http_policy.rules.gone, "return 410 without a redirect");
  assert.equal(inventory.http_policy.rules.not_found, "return 404 without a redirect");
});

test("redirect targets are explicit and production-only; page targets are locale-first", () => {
  for (const record of records.filter(({ final }) => final.action === "redirect")) {
    assert.equal(typeof record.final.target, "string", `Missing redirect target for ${record.source}`);
    assert.ok(record.final.target.startsWith(`${origin}/`), `Non-production target for ${record.source}`);
    assert.ok(!forbiddenTarget.test(record.final.target), `Forbidden worker/stage target for ${record.source}`);
    if (record.kind !== "seo-contract") {
      assert.match(record.final.target, publishedLocalePrefix, `Target is not locale-first: ${record.source}`);
    }
    assert.equal(record.final.status, 301, `Redirect must be permanent: ${record.source}`);
  }
});

test("preserved service contracts and retired voice contract are explicit", () => {
  const api = recordFor("https://godmodetools.com/api/");
  const apiHealth = recordFor("https://godmodetools.com/api/health");
  const voidplayer = recordFor("https://godmodetools.com/voidplayer/");
  const voidManifest = recordFor("https://godmodetools.com/voidplayer/void.webmanifest");
  const voice = recordFor("https://godmodetools.com/openclaw-voice/");

  assert.equal(api.final.action, "serve");
  assert.equal(api.final.status, 200);
  assert.equal(api.final.target, "https://godmodetools.com/api/");
  assert.equal(api.final.security_contract, "response must not expose configuration or secrets");
  assert.deepEqual(apiHealth.final, { action: "serve", status: 200, target: "https://godmodetools.com/api/health", security_contract: "status-only health response" });
  assert.deepEqual(voidplayer.final, { action: "serve", status: 200, target: "https://godmodetools.com/voidplayer/" });
  assert.deepEqual(voidManifest.final, { action: "serve", status: 200, target: "https://godmodetools.com/voidplayer/void.webmanifest" });
  assert.deepEqual(voice.final, { action: "gone", status: 410 });
  assert.equal(recordFor("https://godmodetools.com/openclaw-voice/any/deep/path").final.status, 410);

  assert.deepEqual(prefixContracts.map(({ prefix }) => prefix), [
    "https://godmodetools.com/api/",
    "https://godmodetools.com/voidplayer/",
    "https://godmodetools.com/openclaw-voice/"
  ]);
  for (const contract of prefixContracts) {
    assert.ok(contract.representative.startsWith(contract.prefix));
    assert.ok(recordFor(contract.representative));
    assert.equal(contract.final.preserve_path, true);
  }
});

test("key page, CV, download, and SEO mappings are present", () => {
  const expectedRedirects = new Map([
    ["https://godmodetools.com/", "https://godmodetools.com/ru/"],
    ["https://www.godmodetools.com/", "https://godmodetools.com/ru/"],
    ["https://cv.godmodetools.com/", "https://godmodetools.com/ru/experience/"],
    ["https://cv.godmodetools.com/showcase/en/", "https://godmodetools.com/en/projects/"],
    ["https://cv.godmodetools.com/changelog/", "https://godmodetools.com/ru/experience/changelog/"],
    ["https://cv.godmodetools.com/en/", "https://godmodetools.com/en/experience/"],
    ["https://cv.godmodetools.com/java/", "https://godmodetools.com/ru/experience/java/"],
    ["https://cv.godmodetools.com/java/en/", "https://godmodetools.com/en/experience/java/"],
    ["https://cv.godmodetools.com/showcase/", "https://godmodetools.com/ru/projects/"],
    ["https://ai.godmodetools.com/", "https://godmodetools.com/ru/learning/"],
    ["https://ai.godmodetools.com/en/", "https://godmodetools.com/en/learning/"],
    ["https://allo.godmodetools.com/", "https://godmodetools.com/ru/community/"],
    ["https://allo.godmodetools.com/en/", "https://godmodetools.com/en/community/"]
  ]);

  for (const [source, target] of expectedRedirects) {
    assert.equal(recordFor(source).final.target, target);
  }

  assert.equal(recordFor("https://godmodetools.com/robots.txt").final.status, 200);
  assert.equal(recordFor("https://godmodetools.com/sitemap.xml").final.status, 200);
  const legacySeo = new Map([
    ["https://ai.godmodetools.com/robots.txt", "https://godmodetools.com/robots.txt"],
    ["https://ai.godmodetools.com/sitemap.xml", "https://godmodetools.com/sitemap.xml"],
    ["https://cv.godmodetools.com/robots.txt", "https://godmodetools.com/robots.txt"],
    ["https://cv.godmodetools.com/sitemap-index.xml", "https://godmodetools.com/sitemap.xml"],
    ["https://allo.godmodetools.com/robots.txt", "https://godmodetools.com/robots.txt"],
    ["https://allo.godmodetools.com/sitemap.xml", "https://godmodetools.com/sitemap.xml"]
  ]);
  for (const [source, target] of legacySeo) {
    const record = recordFor(source);
    assert.equal(record.final.status, 301);
    assert.equal(record.final.target, target);
  }
  assert.equal(recordFor("https://godmodetools.com/__god2_unknown__/").final.status, 404);
  assert.equal(recordFor("https://cv.godmodetools.com/__god2_unknown__/").final.status, 404);
  assert.equal(recordFor("https://ai.godmodetools.com/__god2_unknown__/").final.status, 404);
  assert.equal(recordFor("https://allo.godmodetools.com/__god2_unknown__/").final.status, 404);
});

test("every generated CV download has an explicit final redirect", async () => {
  const downloads = (await readdir(new URL("../sites/cv/public/downloads/", import.meta.url)))
    .filter((name) => /\.(?:pdf|docx|txt)$/u.test(name))
    .sort();
  const inventoried = records
    .filter(({ kind }) => kind === "resume-download")
    .map(({ source }) => new URL(source).pathname.split("/").at(-1))
    .sort();

  assert.equal(downloads.length, 12);
  assert.deepEqual(inventoried, downloads);
  for (const filename of downloads) {
    const locale = filename.startsWith("resume_en") ? "en" : "ru";
    const profile = filename.includes("_java.") ? "java/" : "";
    const record = recordFor(`https://cv.godmodetools.com/downloads/${filename}`);
    assert.equal(record.final.target, `${origin}/${locale}/experience/${profile}downloads/${filename}`);
  }
});

test("locale policy reserves Spanish without publishing it", () => {
  assert.deepEqual(inventory.locale_policy.published, ["ru", "en"]);
  assert.deepEqual(inventory.locale_policy.future, ["es"]);
  assert.equal(inventory.locale_policy.default, "ru");
  assert.equal(inventory.query_policy.redirect, "preserve");
  assert.equal(inventory.baseline.public_probe_date, "2026-08-23");
  assert.equal(inventory.baseline.app_subdomain.state, "reserved-no-live-dns-or-public-deployment");
});
