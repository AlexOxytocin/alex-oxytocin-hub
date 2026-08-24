import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const backendSource = await readFile(new URL("../backend/main.py", import.meta.url), "utf8");
const dockerfile = await readFile(new URL("../backend/Dockerfile", import.meta.url), "utf8");
const requirements = await readFile(new URL("../backend/requirements.txt", import.meta.url), "utf8");

test("backend source cannot read or echo DATABASE_URL", () => {
  assert.doesNotMatch(backendSource, /DATABASE_URL|os\.getenv|os\.environ/u);
  assert.doesNotMatch(backendSource, /password|connection.?string|credential/iu);
});

test("public FastAPI surface uses explicit response and host boundaries", () => {
  assert.match(backendSource, /docs_url=None/u);
  assert.match(backendSource, /redoc_url=None/u);
  assert.match(backendSource, /openapi_url=None/u);
  assert.match(backendSource, /TrustedHostMiddleware/u);
  assert.equal((backendSource.match(/response_model=/gu) ?? []).length, 2);
});

test("public payloads remain minimal even when the process environment contains a DSN", () => {
  const probe = [
    "import asyncio, json, sys",
    "sys.path.insert(0, 'backend')",
    "from main import root, health",
    "print(json.dumps({'root': asyncio.run(root()).model_dump(), 'health': asyncio.run(health()).model_dump()}, sort_keys=True))"
  ].join("; ");
  const result = spawnSync("python", ["-c", probe], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://test-user:test-password@database.invalid/test"
    }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    health: { status: "healthy" },
    root: { message: "API is running" }
  });
  assert.doesNotMatch(result.stdout, /postgres|test-user|test-password|database\.invalid/iu);
});

test("container runs the minimal API as an unprivileged user", () => {
  assert.match(dockerfile, /^FROM python:3\.12-slim$/mu);
  assert.match(dockerfile, /^USER appuser$/mu);
  assert.doesNotMatch(dockerfile, /gcc|postgresql-client|DATABASE_URL/iu);
  assert.match(dockerfile, /CMD \["uvicorn", "main:app"/u);
  assert.match(dockerfile, /"--no-proxy-headers"/u);
  assert.match(dockerfile, /"--no-server-header"/u);
  assert.equal(
    requirements.replaceAll("\r\n", "\n"),
    "fastapi==0.141.1\nuvicorn[standard]==0.52.4\n",
  );
});
