#!/usr/bin/env node
/** Start a local Vite server, run the real Playwright/axe/privacy audit, and always stop the server. */
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const host = process.env.EN_V_BROWSER_AUDIT_HOST || '127.0.0.1';
const port = Number(process.env.EN_V_BROWSER_AUDIT_PORT || 8188);
const baseUrl = `http://${host}:${port}`;
const report = process.env.EN_V_BROWSER_AUDIT_REPORT || 'audit/developer-studio-browser-audit.json';
const server = spawn(process.execPath, ['scripts/with-app-env.mjs', 'vite', 'dev', '--host', host, '--port', String(port), '--strictPort'], {
  cwd: root, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, CI: 'true' },
});
let exitCode = 1;
try {
  let ready = false;
  const deadline = Date.now() + Number(process.env.EN_V_BROWSER_AUDIT_START_TIMEOUT_MS || 60_000);
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) throw new Error(`Vite server exited before it was ready (code=${server.exitCode}, signal=${server.signalCode}).`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) { ready = true; break; }
    } catch { /* startup race */ }
    await delay(350);
  }
  if (!ready) throw new Error(`Vite server did not become ready at ${baseUrl} before the startup deadline.`);
  const child = spawn(process.execPath, ['scripts/audit-developer-studios-browser.mjs'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, EN_V_BROWSER_AUDIT_BASE_URL: baseUrl, EN_V_BROWSER_AUDIT_REPORT: report },
  });
  exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
  });
} catch (error) {
  console.error(`Developer browser audit runner failed: ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM');
    await Promise.race([new Promise((resolveExit) => server.once('exit', resolveExit)), delay(4_000)]);
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
  }
}
process.exitCode = exitCode;
