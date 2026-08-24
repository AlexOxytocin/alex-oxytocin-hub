import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const host = '127.0.0.1';

async function availablePort() {
  const server = createServer();
  await new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolveReady);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4321;
  await new Promise((resolveClosed) => server.close(resolveClosed));
  return port;
}

async function waitForPreview(url, preview) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (preview.exitCode !== null) throw new Error(`Astro preview exited with ${preview.exitCode}`);
    try {
      const response = await fetch(`${url}/ru/`);
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Astro preview did not become ready at ${url}`);
}

function stopPreview(preview) {
  if (!preview.pid || preview.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(preview.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    preview.kill('SIGTERM');
  }
}

function runScript(script, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [script], { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${script} failed (${signal ?? code})`));
    });
  });
}

const port = await availablePort();
const baseUrl = `http://${host}:${port}`;
const astro = resolve(root, 'node_modules/astro/bin/astro.mjs');
const preview = spawn(process.execPath, [astro, 'preview', '--host', host, '--port', String(port), '--strictPort'], {
  cwd: root,
  env: { ...process.env, ASTRO_PREVIEW_BACKGROUND: '0' },
  stdio: 'inherit',
});

try {
  await waitForPreview(baseUrl, preview);
  const env = { ...process.env, SITE_PREVIEW_URL: baseUrl };
  for (const script of [
    'tests/design-browser.mjs',
    'tests/content-browser.mjs',
    'tests/performance-browser.mjs',
    'tests/god7-browser-contract.mjs',
  ]) {
    await runScript(script, env);
  }
} finally {
  stopPreview(preview);
}
