import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  loadContract,
  remoteProbe,
  verifyHostFacts,
  verifyHttpContract,
} from "../scripts/verify-openclaw-voice-teardown.mjs";

const nginx = await readFile(new URL("../infra/nginx/default.conf", import.meta.url), "utf8");
const runbook = await readFile(new URL("../docs/runbooks/GOD-8-openclaw-voice-teardown.md", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const contract = await loadContract();

test("GOD-8 contract tombstones the complete namespace and preserves protected routes", () => {
  assert.equal(contract.schema_version, 1);
  assert.equal(contract.story, "GOD-8");
  assert.equal(contract.production_origin, "https://godmodetools.com");
  assert.deepEqual(contract.tombstones.map(({ path, status }) => [path, status]), [
    ["/openclaw-voice", 410],
    ["/openclaw-voice/", 410],
    ["/openclaw-voice/__god8_probe__/deep?probe=1", 410],
  ]);
  assert.ok(contract.tombstones.every(({ redirect }) => redirect === "forbidden"));
  assert.deepEqual(contract.preserved.map(({ path, status }) => [path, status]), [
    ["/", 200],
    ["/api/", 200],
    ["/api/health", 200],
    ["/voidplayer/", 200],
  ]);
  assert.equal(contract.host_checks.expected.telegram_enabled, "true");
  assert.equal(contract.host_checks.expected.minimax_enabled, "true");
});

test("target Nginx config returns 410 without retaining the voice upstream", () => {
  assert.match(nginx, /location\s*=\s*\/openclaw-voice\s*\{\s*return\s+410;\s*\}/su);
  assert.match(nginx, /location\s+\^~\s+\/openclaw-voice\/\s*\{\s*return\s+410;\s*\}/su);
  assert.doesNotMatch(nginx, /172\.18\.0\.1:3334|proxy_pass[^;]*openclaw/iu);
  assert.match(nginx, /location\s+\^~\s+\/api\/\s*\{\s*proxy_pass http:\/\/backend:8000\//su);
  assert.match(nginx, /location\s+\^~\s+\/voidplayer\/\s*\{\s*alias \/usr\/share\/nginx\/html\/voidplayer\//su);
});

test("runbook protects the shared runtime and avoids broad deletion commands", () => {
  assert.match(runbook, /POST-GATE-2 CHECKPOINT/u);
  assert.match(runbook, /openclaw plugins disable voice-call/u);
  assert.match(runbook, /openclaw plugins enable voice-call/u);
  assert.match(runbook, /shared runtime/iu);
  assert.doesNotMatch(runbook, /rm\s+-rf|systemctl\s+disable\s+(?:--now\s+)?openclaw-gateway|npm\s+uninstall\s+-g\s+openclaw/iu);
  assert.equal(
    packageJson.scripts["verify:openclaw-teardown"],
    "node scripts/verify-openclaw-voice-teardown.mjs",
  );
});

test("HTTP verifier accepts the target contract without following redirects", async (t) => {
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    if (path === "/openclaw-voice" || path.startsWith("/openclaw-voice/")) {
      response.writeHead(410, { "content-type": "text/plain" });
      response.end("Gone");
    } else if (path === "/api/") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "API is running" }));
    } else if (path === "/api/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "healthy" }));
    } else if (path === "/voidplayer/" || path === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>ok</title>");
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();

  const results = await verifyHttpContract({
    baseUrl: `http://127.0.0.1:${address.port}`,
    contract,
  });
  assert.ok(results.every(({ ok }) => ok), results.map(({ message }) => message).join("\n"));
});

test("host verifier disables only voice while preserving the shared gateway, Telegram, and Minimax", () => {
  assert.match(remoteProbe, /config get channels\.telegram\.enabled/u);
  assert.match(remoteProbe, /config get plugins\.entries\.minimax\.enabled/u);

  const output = Object.entries(contract.host_checks.expected)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const results = verifyHostFacts(output, contract.host_checks.expected);
  assert.ok(results.every(({ ok }) => ok));

  const unsafe = verifyHostFacts(output.replace("unit_active=active", "unit_active=inactive"), contract.host_checks.expected);
  assert.ok(unsafe.some(({ ok, message }) => !ok && message.startsWith("unit_active:")));

  for (const invariant of ["telegram_enabled", "minimax_enabled"]) {
    const changed = verifyHostFacts(
      output.replace(`${invariant}=true`, `${invariant}=false`),
      contract.host_checks.expected,
    );
    assert.ok(changed.some(({ ok, message }) => !ok && message.startsWith(`${invariant}:`)));
  }
});
