#!/usr/bin/env node
/**
 * Browser integration audit for the visible Developer tool routes.
 * Run after `npm run dev` or against a deployment with EN_V_BROWSER_AUDIT_BASE_URL set.
 * It checks mobile horizontal overflow, axe critical/serious violations, hard route behavior,
 * network request URLs/bodies, and local/session/IndexedDB payload persistence.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch {
  console.error('Playwright is not installed. Run npm ci, start the app, and retry this audit.');
  process.exit(2);
}
const baseUrl = (process.env.EN_V_BROWSER_AUDIT_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const timeout = Number(process.env.EN_V_BROWSER_AUDIT_TIMEOUT_MS || 15000);
const outputPath = resolve(process.env.EN_V_BROWSER_AUDIT_REPORT || 'audit/developer-studio-browser-audit.json');
const marker = `ENV_PRIVACY_SENTINEL_${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`;
const regexMarker = `${marker}_REGEX`;
const sampleMarker = `${marker}_SAMPLE`;
const routes = [
  { path: '/tools/developer/regex-tester', label: 'Regex Studio', kind: 'regex' },
  { path: '/tools/developer/javascript-formatter', label: 'JavaScript formatter', kind: 'javascript' },
  { path: '/tools/developer/sql-formatter', label: 'SQL formatter', kind: 'sql' },
  { path: '/tools/developer/ux-ui-studio', label: 'UX/UI Studio', kind: 'ux-ui' },
];
const report = { schemaVersion: 1, runAt: new Date().toISOString(), baseUrl, viewport: { width: 390, height: 844 }, sentinel: 'redacted', routes: [], networkLeaks: [], storageLeaks: [], axeViolations: [], errors: [] };
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
try {
  const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: true });
  await context.addInitScript(({ marker: sentinels }) => {
    Object.defineProperty(window, '__enVPrivacyWriteLog', { value: [], configurable: true });
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      const raw = `${key}\n${value}`;
      if (sentinels.some((sentinel) => raw.includes(sentinel))) window.__enVPrivacyWriteLog.push({ kind: this === window.localStorage ? 'localStorage' : 'sessionStorage', key });
      return original.call(this, key, value);
    };
  }, { marker: [regexMarker, sampleMarker] });
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  page.on('request', (request) => {
    const candidate = `${request.url()}\n${request.postData() || ''}`;
    if ([regexMarker, sampleMarker].some((sentinel) => candidate.includes(sentinel))) {
      report.networkLeaks.push({ method: request.method(), url: '[REDACTED URL; request payload marker detected]', hasBody: Boolean(request.postData()), payload: '[REDACTED]' });
    }
  });
  const waitForInteractive = async (input) => {
    const loadExample = page.getByRole('button', { name: 'Load example', exact: true });
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await loadExample.click({ timeout: Math.min(timeout, 3000) });
      if ((await input.inputValue()).trim()) return;
      // SSR markup is visible before React hydrates it; verify a real state-changing interaction.
      await page.waitForTimeout(100);
    }
    throw new Error('Developer Studio did not become interactive before the browser audit deadline.');
  };
  for (const route of routes) {
    const routeReport = { path: route.path, label: route.label, loaded: false, actionWorked: false, mobileOverflow: null, runtimeStorageLeaks: [] };
    try {
      await page.setViewportSize(report.viewport);
      await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'domcontentloaded', timeout });
      if (route.kind === 'ux-ui') {
        // Wait for the real React tool effect before clicking SSR markup; a pre-hydration click can be dropped.
        await page.waitForFunction(() => document.documentElement.dataset.envToolHydrated === 'ux-ui-studio', null, { timeout });
        await page.getByRole('heading', { name: 'UX/UI Studio', exact: true, level: 2 }).waitFor({ state: 'visible', timeout });
        const studio = page.locator('section.ux-ui-studio');
        await studio.waitFor({ state: 'visible', timeout });
        await page.locator('.uxui-device-mobile').waitFor({ state: 'visible', timeout });
        await page.getByLabel('Project name').fill('UX/UI Studio browser QA');
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          (async () => {
            await page.getByRole('button', { name: 'Export', exact: true }).click();
            await page.getByRole('button', { name: 'React TSX', exact: true }).click();
          })(),
        ]);
        const downloadPath = await download.path();
        const generatedSource = downloadPath ? await readFile(downloadPath, 'utf8') : '';
        routeReport.loaded = true;
        routeReport.actionWorked = download.suggestedFilename().endsWith('Design.tsx')
          && generatedSource.length > 100
          && generatedSource.includes('export default function') && generatedSource.includes('UX/UI Studio browser QA');
      } else {
        const primaryInput = route.kind === 'regex' ? page.getByLabel('Regular expression') : page.getByLabel('Input');
        await primaryInput.waitFor({ state: 'visible', timeout });
        await waitForInteractive(primaryInput);
        routeReport.loaded = true;
        if (route.kind === 'regex') {
          await primaryInput.fill('ENV_PRIVACY_SENTINEL_[A-Z0-9]+');
          await page.getByLabel(/Test text or batch JSON/).fill(JSON.stringify([{ label: 'privacy sample', text: sampleMarker, expectMatch: true }]));
          await page.locator("#dev-regex-mode").selectOption("test");
          await page.getByRole('button', { name: /Run tests/i }).click();
          const outputRegion = page.getByLabel('Formatted output');
          await outputRegion.waitFor({ state: 'visible', timeout });
          const output = await outputRegion.innerText();
          // Check the result panel, not body text: the input itself necessarily contains the sentinel.
          routeReport.actionWorked = output.includes(sampleMarker) && /assertionPassed|matchCount|results/i.test(output);
        } else if (route.kind === 'javascript') {
          await primaryInput.fill('const greet=async(name)=>{return await Promise.resolve("hi "+name);};');
          await page.getByRole("button", { name: /^(Format|Run)$/i }).last().click();
          const outputRegion = page.getByLabel('Formatted output');
          await outputRegion.waitFor({ state: 'visible', timeout });
          const output = await outputRegion.innerText();
          routeReport.actionWorked = output.includes('async') && output.includes('greet') && output.includes('\n') && output.trim().length > 20;
        } else {
          await primaryInput.fill("select a.id,a.name from accounts a left join orders o on o.account_id=a.id where a.note='FROM should stay in text' group by a.id,a.name having count(*)>0 order by a.name;");
          await page.getByLabel('SQL dialect').selectOption('postgresql');
          await page.getByRole("button", { name: "Format", exact: true }).last().click();
          const outputRegion = page.getByLabel('Formatted output');
          await outputRegion.waitFor({ state: 'visible', timeout });
          const output = await outputRegion.innerText();
          routeReport.actionWorked = output.includes('GROUP BY') && output.includes("'FROM should stay in text'") && output.includes('sql-formatter');
        }

      }
      routeReport.mobileOverflow = await page.evaluate(() => ({ viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth, overflowing: document.documentElement.scrollWidth > innerWidth + 2 }));
      // The runtime assertion inspects persisted browser stores, not only storage calls observed during execution.
      const stored = await page.evaluate(async (sentinels) => {
        const leaks = [];
        for (const store of [localStorage, sessionStorage]) {
          for (let i = 0; i < store.length; i++) {
            const key = store.key(i) || ''; const value = store.getItem(key) || '';
            if (sentinels.some((sentinel) => `${key}\n${value}`.includes(sentinel))) leaks.push({ kind: store === localStorage ? 'localStorage' : 'sessionStorage', key });
          }
        }
        if (indexedDB.databases) {
          for (const info of await indexedDB.databases()) {
            if (!info.name) continue;
            const db = await new Promise((resolve, reject) => { const req = indexedDB.open(info.name); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
            try {
              for (const name of Array.from(db.objectStoreNames)) {
                const values = await new Promise((resolve, reject) => { const tx = db.transaction(name, 'readonly'); const req = tx.objectStore(name).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
                if (sentinels.some((sentinel) => JSON.stringify(values).includes(sentinel))) leaks.push({ kind: 'indexedDB', database: info.name, store: name });
              }
            } finally { db.close(); }
          }
        }
        if (sentinels.some((sentinel) => document.cookie.includes(sentinel))) leaks.push({ kind: 'cookie', key: '[cookie value redacted]' });
        if ('caches' in window) {
          for (const cacheName of await caches.keys()) {
            const cache = await caches.open(cacheName);
            for (const request of await cache.keys()) {
              const response = await cache.match(request);
              if (!response) continue;
              const body = await response.clone().text().catch(() => '');
              if (sentinels.some((sentinel) => request.url.includes(sentinel) || body.includes(sentinel))) {
                leaks.push({ kind: 'cache-storage', cache: cacheName, url: request.url.split('?')[0] });
              }
            }
          }
        }
        return { leaks, writes: window.__enVPrivacyWriteLog || [] };
      }, [regexMarker, sampleMarker]);
      routeReport.runtimeStorageLeaks = stored.leaks;
      report.storageLeaks.push(...stored.leaks.map((item) => ({ route: route.path, ...item })), ...stored.writes.map((item) => ({ route: route.path, ...item, detection: 'write-hook' })));
      // Add axe only if the dependency can be found; make absence explicit rather than silently skipping.
      try {
        const axePath = require.resolve('axe-core/axe.min.js');
        await page.addScriptTag({ path: axePath });
        const axe = await page.evaluate(async () => {
          const results = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } });
          return results.violations.map((violation) => ({ id: violation.id, impact: violation.impact, help: violation.help, nodes: violation.nodes.length, route: location.pathname }));
        });
        report.axeViolations.push(...axe.filter((v) => ['critical', 'serious'].includes(v.impact)));
        routeReport.axeScan = { available: true, violations: axe.length };
      } catch (error) {
        routeReport.axeScan = { available: false, reason: error instanceof Error ? error.message : String(error) };
        report.errors.push({ route: route.path, error: `Required axe-core browser scan unavailable: ${routeReport.axeScan.reason}` });
      }
    } catch (error) {
      const entry = { route: route.path, error: error instanceof Error ? error.message : String(error) };
      report.errors.push(entry); routeReport.error = entry.error;
    }
    report.routes.push(routeReport);
  }
  await context.close();
} finally { await browser.close(); }
await mkdir(resolve(outputPath, '..'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
const failures = report.errors.length || report.networkLeaks.length || report.storageLeaks.length || report.axeViolations.length || report.routes.some((route) => !route.loaded || !route.actionWorked || route.mobileOverflow?.overflowing);
console.log(`Developer browser audit: routes=${report.routes.length}, network leaks=${report.networkLeaks.length}, storage leaks=${report.storageLeaks.length}, serious/critical axe findings=${report.axeViolations.length}, errors=${report.errors.length}. Report: ${outputPath}`);
if (failures) {
  console.error(JSON.stringify({
    failedRoutes: report.routes.filter((route) => !route.loaded || !route.actionWorked || route.mobileOverflow?.overflowing || route.error),
    errors: report.errors,
    networkLeaks: report.networkLeaks,
    storageLeaks: report.storageLeaks,
    axeViolations: report.axeViolations,
  }, null, 2));
  process.exitCode = 1;
}
