#!/usr/bin/env node
/**
 * Rendered-DOM accessibility regression harness.
 * Runs axe-core in Chromium against intentionally flawed and corrected UI states.
 * This validates the harness and sample states; it does not certify the full app.
 */
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
let axePath;
try {
  ({ chromium } = require('playwright'));
  axePath = require.resolve('axe-core/axe.min.js');
} catch (error) {
  console.error('Rendered accessibility audit requires installed dev dependencies: playwright and axe-core.');
  console.error(`Dependency resolution: ${error.message}`);
  process.exit(2);
}

const cases = [
  {
    id: 'rendered-invalid-form-state',
    expected: ['label', 'aria-valid-attr-value'],
    html: `<!doctype html><html lang="en"><head><title>Account form</title></head><body><main><h1>Account</h1><form><label for="email">Email</label><input id="email" type="email" aria-invalid="perhaps" value="not-an-email"><button type="submit">Save</button></form></main></body></html>`,
  },
  {
    id: 'rendered-dialog-open-state',
    expected: ['button-name'],
    html: `<!doctype html><html lang="en"><head><title>Dialog state</title></head><body><main><h1>Settings</h1><section role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">Confirm settings</h2><p>Apply these changes?</p><button></button><button>Cancel</button></section></main></body></html>`,
  },
  {
    id: 'rendered-menu-open-state',
    expected: ['image-alt'],
    html: `<!doctype html><html lang="en"><head><title>Menu state</title></head><body><main><h1>Tools</h1><nav aria-label="Main menu"><a href="/tools"><img src="/missing-icon.svg">Tools</a><a href="/help">Help</a></nav></main></body></html>`,
  },
  {
    id: 'rendered-corrected-state',
    expected: [],
    html: `<!doctype html><html lang="en"><head><title>Accessible page</title></head><body><main><h1>Tools</h1><p>Choose an action.</p><label for="query">Search tools</label><input id="query" type="search"><button type="button">Search</button><img src="/missing-decorative.svg" alt=""></main></body></html>`,
  },
];

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const item of cases) {
    const page = await browser.newPage();
    await page.setContent(item.html, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ path: axePath });
    const result = await page.evaluate(async () => {
      const scan = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      });
      return {
        violations: scan.violations.map((v) => ({ id: v.id, impact: v.impact, description: v.description, help: v.help, nodes: v.nodes.length })),
        incomplete: scan.incomplete.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })),
        passes: scan.passes.length,
      };
    });
    const ids = new Set(result.violations.map((v) => v.id));
    const missingExpected = item.expected.filter((id) => !ids.has(id));
    results.push({ id: item.id, ...result, expectedViolationIds: item.expected, missingExpected });
    await page.close();
    if (missingExpected.length) console.error(`${item.id}: expected violations not detected: ${missingExpected.join(', ')}`);
    else console.log(`PASS ${item.id}: ${result.violations.length} violations, ${result.incomplete.length} manual-review items, ${result.passes} rules passed`);
  }
} finally {
  await browser.close();
}

const output = resolve(process.env.A11Y_REPORT_PATH || 'artifacts/accessibility-rendered-audit.json');
await mkdir(resolve(output, '..'), { recursive: true });
await writeFile(output, `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), scope: 'rendered DOM regression fixtures; not a full-app or WCAG conformance verdict', results }, null, 2)}\n`);
console.log(`Report written to ${output}`);
if (results.some((r) => r.missingExpected.length)) process.exitCode = 1;
