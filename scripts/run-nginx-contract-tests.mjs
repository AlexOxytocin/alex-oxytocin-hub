import { spawn, spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { request } from 'node:https';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const composeFile = resolve(root, 'tests/fixtures/nginx-contract.compose.yml');
const tlsDirectory = resolve(root, 'tests/fixtures/tls');
const projectName = 'god7-nginx-contract';

function command(commandName, args, options = {}) {
  return spawnSync(commandName, args, { cwd: root, encoding: 'utf8', stdio: 'inherit', ...options });
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveReady);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolveClosed) => server.close(resolveClosed));
  return port;
}

function opensslExecutable() {
  const candidates = process.platform === 'win32'
    ? ['openssl.exe', resolve(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git/usr/bin/openssl.exe')]
    : ['openssl'];
  return candidates.find((candidate) => spawnSync(candidate, ['version'], { stdio: 'ignore' }).status === 0);
}

async function waitForNginx(port) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolveReady) => {
      const probe = request({
        hostname: '127.0.0.1',
        port,
        path: '/api/health',
        method: 'GET',
        rejectUnauthorized: false,
        headers: { Host: 'godmodetools.com' },
      }, (response) => {
        response.resume();
        resolveReady(response.statusCode === 200);
      });
      probe.once('error', () => resolveReady(false));
      probe.end();
    });
    if (ready) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error('Nginx contract fixture did not become ready');
}

function runNodeTests(env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, ['--test', 'tests/god7-http-routing.test.mjs'], {
      cwd: root,
      env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`Nginx HTTP contract tests failed (${signal ?? code})`));
    });
  });
}

if (spawnSync('docker', ['version'], { stdio: 'ignore' }).status !== 0) {
  throw new Error('Docker Engine is required for test:http:nginx');
}

const openssl = opensslExecutable();
if (!openssl) throw new Error('OpenSSL is required to generate the isolated test certificate');

const httpPort = await availablePort();
let httpsPort = await availablePort();
while (httpsPort === httpPort) httpsPort = await availablePort();
const composeEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: projectName,
  GOD7_HTTP_PORT: String(httpPort),
  GOD7_HTTPS_PORT: String(httpsPort),
};

await rm(tlsDirectory, { recursive: true, force: true });
await mkdir(tlsDirectory, { recursive: true });
const certificate = command(openssl, [
  'req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-days', '1',
  '-subj', '/CN=godmodetools.com',
  '-keyout', resolve(tlsDirectory, 'privkey.pem'),
  '-out', resolve(tlsDirectory, 'fullchain.pem'),
], { stdio: 'ignore' });
if (certificate.status !== 0) throw new Error('Failed to generate the isolated test certificate');

try {
  const up = command('docker', ['compose', '-f', composeFile, 'up', '-d', '--build', '--force-recreate'], { env: composeEnv });
  if (up.status !== 0) throw new Error('Failed to start the isolated Nginx contract fixture');
  await waitForNginx(httpsPort);
  await runNodeTests({
    ...process.env,
    HTTP_CONTRACT_URL: `https://127.0.0.1:${httpsPort}`,
    HTTP_REDIRECT_URL: `http://127.0.0.1:${httpPort}`,
    HTTP_CONTRACT_INSECURE: '1',
  });
} finally {
  command('docker', ['compose', '-f', composeFile, 'down', '--volumes', '--remove-orphans'], { env: composeEnv });
  await rm(tlsDirectory, { recursive: true, force: true });
}
