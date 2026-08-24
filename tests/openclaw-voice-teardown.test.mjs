import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  expectedHostFacts,
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
  const expected = expectedHostFacts(contract, "final");
  assert.equal(expected.telegram_enabled, "true");
  assert.equal(expected.minimax_enabled, "true");
  assert.equal(expected.voice_config_state, "absent");
  assert.equal(expected.voice_cli_state, "absent");
  assert.equal(expected.plugins_allow_exact_shared, "1");
  assert.equal(expected.voice_allowlisted_count, "0");
  assert.equal(expected.voice_data_file_present, "0");
  assert.equal(expected.voice_local_dir_present, "0");
  assert.equal(expected.legacy_voice_backup_count, "0");
  assert.equal(expected.rollback_sensitive_payload_count, "0");
  assert.equal(expected.bundled_extension_present, "1");
});

test("target Nginx config returns 410 without retaining the voice upstream", () => {
  assert.match(nginx, /location\s*=\s*\/openclaw-voice\s*\{\s*return\s+410;\s*\}/su);
  assert.match(nginx, /location\s+\^~\s+\/openclaw-voice\/\s*\{\s*return\s+410;\s*\}/su);
  assert.doesNotMatch(nginx, /172\.18\.0\.1:3334|proxy_pass[^;]*openclaw/iu);
  assert.match(nginx, /location\s+\^~\s+\/api\/\s*\{\s*proxy_pass http:\/\/backend:8000\//su);
  assert.match(nginx, /location\s+\^~\s+\/voidplayer\/\s*\{\s*alias \/usr\/share\/nginx\/html\/voidplayer\//su);
});

test("runbook performs only exact Gate 3 cleanup and protects the shared runtime", () => {
  assert.match(runbook, /GATE-3/u);
  assert.match(runbook, /openclaw config unset plugins\.entries\.voice-call/u);
  assert.match(runbook, /openclaw config set plugins\.allow '\["telegram","minimax"\]' --strict-json/u);
  assert.match(runbook, /\/root\/\.openclaw\/voice-calls\/calls\.jsonl/u);
  assert.match(runbook, /\/root\/\.openclaw\/workspace\/plugins\/voice-call-local\/openclaw\.plugin\.json/u);
  assert.match(runbook, /\/root\/\.openclaw\/backups\/openclaw-voice-switch-\.json/u);
  assert.match(runbook, /openclaw-20260403-225852\/openclaw\.json/u);
  assert.match(runbook, /voice-call\/index\.js/u);
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

test("host verifier is phase-aware and fails closed on ambiguous voice absence", () => {
  assert.match(remoteProbe, /run_cli\('config', 'get', 'channels\.telegram\.enabled'\)/u);
  assert.match(remoteProbe, /run_cli\('config', 'get', 'plugins\.entries\.minimax\.enabled'\)/u);
  assert.match(remoteProbe, /voice_result\.returncode != 0/u);
  assert.match(remoteProbe, /current_voice_state == 'absent'/u);

  for (const phase of ["gate2", "cleanup", "final"]) {
    const expected = expectedHostFacts(contract, phase);
    const output = Object.entries(expected)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    const results = verifyHostFacts(output, expected);
    assert.ok(results.every(({ ok }) => ok), `${phase}: ${results.map(({ message }) => message).join("\n")}`);
  }

  const expected = expectedHostFacts(contract, "final");
  const output = Object.entries(expected)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  for (const [invariant, unsafeValue] of [
    ["unit_active", "inactive"],
    ["telegram_enabled", "false"],
    ["minimax_enabled", "false"],
    ["voice_config_state", "present_disabled"],
    ["voice_cli_state", "error"],
    ["plugins_allow_exact_shared", "0"],
    ["rollback_sensitive_payload_count", "4"],
  ]) {
    const changed = verifyHostFacts(
      output.replace(`${invariant}=${expected[invariant]}`, `${invariant}=${unsafeValue}`),
      expected,
    );
    assert.ok(changed.some(({ ok, message }) => !ok && message.startsWith(`${invariant}:`)));
  }

  const withoutCliState = output
    .split("\n")
    .filter((line) => !line.startsWith("voice_cli_state="))
    .join("\n");
  assert.ok(verifyHostFacts(withoutCliState, expected).some(
    ({ ok, message }) => !ok && message.startsWith("voice_cli_state:"),
  ));
});
