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
ufw_rule_count=$(ufw status 2>/dev/null | grep -Ec '3334/tcp' || true)

printf 'listener_count=%s\n' "$listener_count"
printf 'unit_active=%s\n' "$unit_active"
printf 'unit_enabled=%s\n' "$unit_enabled"
printf 'ufw_rule_count=%s\n' "$ufw_rule_count"

if python3 - <<'PY'
import json
import os
import subprocess
from pathlib import Path

CONFIG = Path('/root/.openclaw/openclaw.json')
AUTOMATIC_BACKUP = Path('/root/.openclaw/openclaw.json.bak')
PROTECTED_BACKUP = Path('/root/.openclaw/backups/openclaw-20260403-225852/openclaw.json')
ROLLBACK_PACKET = Path('/root/god-8-backups/20260824T051347Z')
ROLLBACK_MARKER = Path('/root/god-8-backups/LAST_PRE_TEARDOWN')
LOCAL_DIR = Path('/root/.openclaw/workspace/plugins/voice-call-local')
LOCAL_FILES = [
    LOCAL_DIR / 'README.md',
    LOCAL_DIR / 'runtime-api.js',
    LOCAL_DIR / 'package.json',
    LOCAL_DIR / 'runtime-entry.js',
    LOCAL_DIR / 'api.js',
    LOCAL_DIR / 'index.js',
    LOCAL_DIR / 'openclaw.plugin.json',
]
LEGACY_BACKUPS = [
    Path('/root/.openclaw/openclaw.json.bak-'),
    Path('/root/.openclaw/openclaw.json.bak-20260405-043525'),
    Path('/root/.openclaw/openclaw.json.bak-20260405-044351'),
    Path('/root/.openclaw/backups/openclaw-voice-switch-.json'),
]
SENSITIVE_PACKET_FILES = [
    ROLLBACK_PACKET / 'openclaw.json',
    ROLLBACK_PACKET / 'calls.jsonl',
    ROLLBACK_PACKET / 'voice-call-bundled.tgz',
    ROLLBACK_PACKET / 'voice-call-local.tgz',
]

def emit(name, value):
    print(f'{name}={value}')

def lexists(path):
    return os.path.lexists(path)

def voice_state(document):
    if not isinstance(document, dict):
        return 'error'
    plugins = document.get('plugins')
    if plugins is None:
        return 'absent'
    if not isinstance(plugins, dict):
        return 'error'
    entries = plugins.get('entries')
    if entries is None:
        return 'absent'
    if not isinstance(entries, dict):
        return 'error'
    if 'voice-call' not in entries:
        return 'absent'
    voice = entries['voice-call']
    if isinstance(voice, dict) and voice.get('enabled') is False:
        return 'present_disabled'
    if isinstance(voice, dict) and voice.get('enabled') is True:
        return 'present_enabled'
    return 'present_other'

def run_cli(*arguments):
    return subprocess.run(
        ['openclaw', *arguments],
        capture_output=True,
        text=True,
        check=False,
    )

def cli_boolean(result):
    if result.returncode != 0:
        return 'cli_error'
    lines = [line.strip().lower() for line in result.stdout.splitlines() if line.strip()]
    if not lines or lines[-1] not in {'true', 'false'}:
        return 'cli_error'
    return lines[-1]

try:
    document = json.loads(CONFIG.read_text())
    if not isinstance(document, dict):
        raise TypeError('root is not an object')
    config_parse = 'ok'
    current_voice_state = voice_state(document)
    plugins = document.get('plugins', {})
    allow = plugins.get('allow') if isinstance(plugins, dict) else None
    entries = plugins.get('entries', {}) if isinstance(plugins, dict) else {}
    telegram_json = document.get('channels', {}).get('telegram', {}).get('enabled')
    minimax_json = entries.get('minimax', {}).get('enabled') if isinstance(entries, dict) else None
    allow_exact = int(allow == ['telegram', 'minimax'])
    allow_count = allow.count('voice-call') if isinstance(allow, list) else -1
except (OSError, json.JSONDecodeError, TypeError):
    document = None
    config_parse = 'error'
    current_voice_state = 'error'
    telegram_json = 'error'
    minimax_json = 'error'
    allow_exact = -1
    allow_count = -1

validate_result = run_cli('config', 'validate')
validate_state = 'ok' if validate_result.returncode == 0 else 'error'
telegram_result = run_cli('config', 'get', 'channels.telegram.enabled')
minimax_result = run_cli('config', 'get', 'plugins.entries.minimax.enabled')
voice_result = run_cli('config', 'get', 'plugins.entries.voice-call.enabled')
telegram_enabled = cli_boolean(telegram_result)
minimax_enabled = cli_boolean(minimax_result)
voice_boolean = cli_boolean(voice_result)
if voice_boolean in {'true', 'false'}:
    voice_cli_state = 'present'
elif (
    voice_result.returncode != 0
    and current_voice_state == 'absent'
    and validate_state == 'ok'
    and telegram_enabled in {'true', 'false'}
    and minimax_enabled in {'true', 'false'}
):
    voice_cli_state = 'absent'
else:
    voice_cli_state = 'error'

plugin_count = -1
plugin_enabled = 'error'
plugin_status = 'error'
plugin_origin = 'error'
plugins_result = run_cli('plugins', 'list', '--json')
if plugins_result.returncode == 0:
    try:
        plugins_document = json.loads(plugins_result.stdout)
        rows = plugins_document.get('plugins', []) if isinstance(plugins_document, dict) else []
        voice_rows = [row for row in rows if isinstance(row, dict) and row.get('id') == 'voice-call']
        plugin_count = len(voice_rows)
        if plugin_count == 1:
            row = voice_rows[0]
            plugin_enabled = str(row.get('enabled')).lower() if isinstance(row.get('enabled'), bool) else 'error'
            plugin_status = row.get('status') if isinstance(row.get('status'), str) else 'error'
            plugin_origin = row.get('origin') if isinstance(row.get('origin'), str) else 'error'
    except json.JSONDecodeError:
        pass

def backup_voice_state(path):
    if not lexists(path):
        return 'missing'
    if path.is_symlink() or not path.is_file():
        return 'error'
    try:
        parsed = json.loads(path.read_text())
        return voice_state(parsed)
    except (OSError, json.JSONDecodeError, TypeError):
        return 'error'

automatic_state = backup_voice_state(AUTOMATIC_BACKUP)
automatic_clear = int(automatic_state in {'absent', 'missing'})
protected_state = backup_voice_state(PROTECTED_BACKUP)

packet_present = int(ROLLBACK_PACKET.is_dir() and not ROLLBACK_PACKET.is_symlink())
packet_mode = format(ROLLBACK_PACKET.stat().st_mode & 0o777, 'o') if packet_present else 'error'
try:
    marker_matches = int(
        ROLLBACK_MARKER.is_file()
        and not ROLLBACK_MARKER.is_symlink()
        and ROLLBACK_MARKER.read_text().strip() == str(ROLLBACK_PACKET)
    )
except OSError:
    marker_matches = 0
sensitive_count = sum(int(lexists(path)) for path in SENSITIVE_PACKET_FILES)
packet_closed = int((ROLLBACK_PACKET / 'GATE3-CLOSED').is_file())
manifest = ROLLBACK_PACKET / 'SHA256SUMS'
if manifest.is_file() and not manifest.is_symlink():
    try:
        manifest_result = subprocess.run(
            ['sha256sum', '--check', 'SHA256SUMS'],
            cwd=ROLLBACK_PACKET,
            capture_output=True,
            text=True,
            check=False,
        )
        manifest_state = 'ok' if manifest_result.returncode == 0 else 'failed'
    except OSError:
        manifest_state = 'failed'
elif packet_closed and sensitive_count == 0:
    manifest_state = 'closed'
else:
    manifest_state = 'missing'

emit('config_parse', config_parse)
emit('config_validate', validate_state)
emit('voice_config_state', current_voice_state)
emit('voice_cli_state', voice_cli_state)
emit('telegram_enabled', telegram_enabled)
emit('minimax_enabled', minimax_enabled)
emit('telegram_json_enabled', str(telegram_json).lower())
emit('minimax_json_enabled', str(minimax_json).lower())
emit('plugins_allow_exact_shared', allow_exact)
emit('voice_allowlisted_count', allow_count)
emit('voice_plugin_discovered_count', plugin_count)
emit('voice_plugin_enabled', plugin_enabled)
emit('voice_plugin_status', plugin_status)
emit('voice_plugin_origin', plugin_origin)
emit('bundled_extension_present', int(Path('/usr/lib/node_modules/openclaw/dist/extensions/voice-call/index.js').is_file()))
emit('bundled_index_hash', subprocess.run(
    ['sha256sum', '/usr/lib/node_modules/openclaw/dist/extensions/voice-call/index.js'],
    capture_output=True,
    text=True,
    check=False,
).stdout.split()[0] if Path('/usr/lib/node_modules/openclaw/dist/extensions/voice-call/index.js').is_file() else 'missing')
emit('global_openclaw_hash', subprocess.run(
    ['sha256sum', '/usr/lib/node_modules/openclaw/openclaw.mjs'],
    capture_output=True,
    text=True,
    check=False,
).stdout.split()[0] if Path('/usr/lib/node_modules/openclaw/openclaw.mjs').is_file() else 'missing')
emit('voice_data_file_present', int(lexists('/root/.openclaw/voice-calls/calls.jsonl')))
emit('voice_data_dir_present', int(lexists('/root/.openclaw/voice-calls')))
emit('voice_local_file_count', sum(int(lexists(path)) for path in LOCAL_FILES))
emit('voice_local_dir_present', int(lexists(LOCAL_DIR)))
emit('legacy_voice_backup_count', sum(int(lexists(path)) for path in LEGACY_BACKUPS))
emit('automatic_backup_voice_clear', automatic_clear)
emit('protected_backup_present', int(PROTECTED_BACKUP.is_file() and not PROTECTED_BACKUP.is_symlink()))
emit('protected_backup_voice_state', protected_state)
emit('rollback_packet_present', packet_present)
emit('rollback_packet_mode', packet_mode)
emit('rollback_marker_matches', marker_matches)
emit('rollback_manifest_state', manifest_state)
emit('rollback_sensitive_payload_count', sensitive_count)
emit('rollback_packet_closed', packet_closed)
emit('host_probe', 'ok')
PY
then
  :
else
  printf 'host_probe=error\n'
fi

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

export function expectedHostFacts(contract, phase = "final") {
  const common = contract.host_checks?.expected_common;
  const phaseExpected = contract.host_checks?.phases?.[phase];
  if (!common || typeof common !== "object") {
    throw new Error("Host contract is missing expected_common");
  }
  if (!phaseExpected || typeof phaseExpected !== "object") {
    throw new Error(`Unknown host verification phase: ${phase}`);
  }
  return { ...common, ...phaseExpected };
}

export async function verifyRemoteHost({ target, contract, phase = "final", timeoutMs = 30_000 }) {
  const output = await runSsh(target, timeoutMs);
  return verifyHostFacts(output, expectedHostFacts(contract, phase));
}

function parseArguments(argv) {
  const options = {
    baseUrl: undefined,
    sshTarget: undefined,
    phase: "final",
    timeoutMs: 10_000,
  };
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
    } else if (argument === "--phase") {
      options.phase = takeValue(argument, index);
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
  --phase <name>      Host phase: gate2, cleanup, or final (default: final)
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
  expectedHostFacts(contract, options.phase);
  const results = await verifyHttpContract({
    baseUrl: options.baseUrl,
    contract,
    timeoutMs: options.timeoutMs,
  });
  if (options.sshTarget) {
    results.push(...await verifyRemoteHost({
      target: options.sshTarget,
      contract,
      phase: options.phase,
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
