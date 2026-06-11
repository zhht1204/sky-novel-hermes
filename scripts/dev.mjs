import { spawn } from 'node:child_process';
import process from 'node:process';

const servicePort = Number(process.env.HERMES_SERVICE_PORT ?? 17891);
const serviceUrl = `http://127.0.0.1:${servicePort}`;
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const useShell = process.platform === 'win32';
const children = new Set();
let shuttingDown = false;

function start(label, args) {
  const child = spawn(pnpm, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: useShell,
  });
  children.add(child);
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      console.log(`[dev] ${label} exited${signal ? ` with signal ${signal}` : ` with code ${code ?? 0}`}`);
    }
  });
  return child;
}

function stopAll() {
  shuttingDown = true;
  for (const child of children) {
    child.kill();
  }
}

process.once('SIGINT', () => {
  stopAll();
  process.exit(130);
});
process.once('SIGTERM', () => {
  stopAll();
  process.exit(143);
});

console.log(`[dev] starting node service at ${serviceUrl}`);
const service = start('node-service', ['--filter', '@sky-novel-hermes/node-service', 'dev']);

service.once('exit', (code) => {
  if (!shuttingDown) process.exit(code ?? 1);
});

await waitForService();
console.log('[dev] node service is ready; starting desktop');

const desktop = start('desktop', ['--filter', '@sky-novel-hermes/desktop', 'dev']);
desktop.once('exit', (code) => {
  stopAll();
  process.exit(code ?? 0);
});

async function waitForService() {
  const startedAt = Date.now();
  let lastError = '';
  while (Date.now() - startedAt < 60_000) {
    try {
      const response = await fetch(`${serviceUrl}/api/status`);
      if (response.ok) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stopAll();
  throw new Error(`Node service did not become ready at ${serviceUrl}: ${lastError}`);
}
