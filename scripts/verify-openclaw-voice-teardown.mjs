#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

const defaultContractUrl = new URL("../docs/contracts/openclaw-voice-teardown.v1.json", import.meta.url);

export async function loadContract(url = defaultContractUrl) {
  return JSON.parse(await readFile(url, "utf8"));
}

function failure(message) {
  return { ok: false, message };
}

export async function verifyHttpContract({
  baseUrl,
  contract,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
}) {
  const origin = new URL(baseUrl ?? contract.production_origin);
  const checks = [
    ...contract.tombstones.map((entry) => ({ ...entry, kind: "tombstone" })),
    ...contract.preserved.map((entry) => ({ ...entry, kind: "preserved" })),
  ];
  const results = [];

  for (const check of checks) {
    const url = new URL(check.path, origin);
    try {
      const response = await fetchImpl(url, {
        redirect: "manual",
        headers: { "user-agent": "godmodetools-god-8-verifier/1" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.text();

      if (response.status !== check.status) {
        results.push(failure(`${check.name}: expected ${check.status}, received ${response.status}`));
        continue;
      }

      if (check.redirect === "forbidden" && response.headers.has("location")) {
        results.push(failure(`${check.name}: unexpected redirect to ${response.headers.get("location")}`));
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (check.content_type_prefix && !contentType.toLowerCase().startsWith(check.content_type_prefix)) {
        results.push(failure(`${check.name}: expected content type ${check.content_type_prefix}, received ${contentType || "<missing>"}`));
        continue;
      }

      if (check.json) {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          results.push(failure(`${check.name}: response is not valid JSON`));
          continue;
        }
        if (!isDeepStrictEqual(parsed, check.json)) {
          results.push(failure(`${check.name}: JSON body does not match the contract`));
          continue;
        }
      }

      results.push({ ok: true, message: `${check.name}: ${response.status}` });
    } catch (error) {
      results.push(failure(`${check.name}: ${error.message}`));
    }
  }

  return results;
}

export const remoteProbe = String.raw`set +e
listener_count=$(ss -H -ltn '( sport = :3334 )' 2>/dev/null | wc -l | tr -d '[:space:]')
unit_active=$(systemctl is-active openclaw-gateway.service 2>/dev/null || true)
unit_enabled=$(systemctl is-enabled openclaw-gateway.service 2>/dev/null || true)
plugin_enabled=$(openclaw config get plugins.entries.voice-call.enabled 2>/dev/null | tail -n1 | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
telegram_enabled=$(openclaw config get channels.telegram.enabled 2>/dev/null | tail -n1 | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
minimax_enabled=$(openclaw config get plugins.entries.minimax.enabled 2>/dev/null | tail -n1 | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
ufw_rule_count=$(ufw status 2>/dev/null | grep -Ec '3334/tcp' || true)

printf 'listener_count=%s\n' "$listener_count"
printf 'unit_active=%s\n' "$unit_active"
printf 'unit_enabled=%s\n' "$unit_enabled"
printf 'plugin_enabled=%s\n' "$plugin_enabled"
printf 'telegram_enabled=%s\n' "$telegram_enabled"
printf 'minimax_enabled=%s\n' "$minimax_enabled"
printf 'ufw_rule_count=%s\n' "$ufw_rule_count"

python3 - <<'PY'
import re
from pathlib import Path

text = Path('/opt/app/nginx/conf.d/default.conf').read_text()
exact = re.search(r'location\s*=\s*/openclaw-voice\s*\{\s*return\s+410\s*;\s*\}', text, re.S)
prefix = re.search(r'location\s+\^~\s+/openclaw-voice/\s*\{\s*return\s+410\s*;\s*\}', text, re.S)
print(f'nginx_exact_410={int(exact is not None)}')
print(f'nginx_prefix_410={int(prefix is not None)}')
print(f'nginx_proxy_3334={text.count("172.18.0.1:3334")}')
PY

if docker exec nginx nginx -t >/dev/null 2>&1; then
  printf 'nginx_syntax=ok\n'
else
  printf 'nginx_syntax=failed\n'
fi
`;

function runSsh(target, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", [
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=15",
      "-o", "StrictHostKeyChecking=yes",
      target,
      "bash -s",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`SSH host verification timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`SSH host verification failed with exit ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(stdout);
    });
    child.stdin.end(remoteProbe);
  });
}

export function verifyHostFacts(output, expected) {
  const facts = new Map();
  for (const line of output.split(/\r?\n/u)) {
    const separator = line.indexOf("=");
    if (separator > 0) {
      facts.set(line.slice(0, separator), line.slice(separator + 1));
    }
  }

  return Object.entries(expected).map(([key, value]) => {
    const actual = facts.get(key);
    return actual === value
      ? { ok: true, message: `${key}: ${actual}` }
      : failure(`${key}: expected ${value}, received ${actual ?? "<missing>"}`);
  });
}

export async function verifyRemoteHost({ target, contract, timeoutMs = 30_000 }) {
  const output = await runSsh(target, timeoutMs);
  return verifyHostFacts(output, contract.host_checks.expected);
}

function parseArguments(argv) {
  const options = { baseUrl: undefined, sshTarget: undefined, timeoutMs: 10_000 };
  const takeValue = (name, index) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${name} requires a value`);
    }
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base-url") {
      options.baseUrl = takeValue(argument, index);
      index += 1;
    } else if (argument === "--ssh") {
      options.sshTarget = takeValue(argument, index);
      index += 1;
    } else if (argument === "--timeout-ms") {
      options.timeoutMs = Number(takeValue(argument, index));
      index += 1;
      if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
        throw new Error("--timeout-ms must be a positive integer");
      }
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/verify-openclaw-voice-teardown.mjs [options]

Options:
  --base-url <url>    HTTP origin to verify (default: contract production origin)
  --ssh <target>      Also run read-only host checks, for example root@89.167.49.137
  --timeout-ms <ms>   Per-check timeout (default: 10000)
  -h, --help          Show this help`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const contract = await loadContract();
  const results = await verifyHttpContract({
    baseUrl: options.baseUrl,
    contract,
    timeoutMs: options.timeoutMs,
  });
  if (options.sshTarget) {
    results.push(...await verifyRemoteHost({
      target: options.sshTarget,
      contract,
      timeoutMs: Math.max(options.timeoutMs, 30_000),
    }));
  }

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.message}`);
  }
  if (results.some(({ ok }) => !ok)) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
