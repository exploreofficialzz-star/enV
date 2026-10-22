import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AXE_TAGS,
  DEFAULT_ROUTE_SEEDS,
  canonicalizeRouteUrl,
  classifyKnownEngineEdgeCase,
  classifyPageReadiness,
  isCrawlableInternalUrl,
  LIVE_AUDIT_SCHEMA_VERSION,
  safeReportSlug,
  stableFindingFingerprint,
  stableFindingId,
  summarizeLiveAudit,
  validateLiveAuditReport,
} from './lib/accessibility-live-audit.mjs';

test('route canonicalization strips fragments and query values while preserving path', () => {
  const canonical = canonicalizeRouteUrl('https://envtools.store/tools?q=private#results', 'https://envtools.store');
  assert.equal(canonical.href, 'https://envtools.store/tools');
});

test('crawler keeps same-origin pages and ignores external, API, and static-file URLs', () => {
  const base = 'https://envtools.store/';
  assert.equal(isCrawlableInternalUrl('/tools?sort=popular', base), true);
  assert.equal(isCrawlableInternalUrl('https://example.com/tools', base), false);
  assert.equal(isCrawlableInternalUrl('/api/backend/tool', base), false);
  assert.equal(isCrawlableInternalUrl('/logo.svg', base), false);
  assert.equal(isCrawlableInternalUrl('mailto:help@example.com', base), false);
});

test('finding IDs are reproducible but separate by route, state, rule, and target', () => {
  const first = stableFindingId('https://envtools.store/tools', 'default', 'button-name', ['button.save']);
  assert.equal(first, stableFindingId('https://envtools.store/tools', 'default', 'button-name', ['button.save']));
  assert.notEqual(first, stableFindingId('https://envtools.store/tools', 'popup', 'button-name', ['button.save']));
  assert.notEqual(first, stableFindingId('https://envtools.store/tools', 'default', 'button-name', ['button.cancel']));
  assert.match(first, /^env-a11y-live:button-name:[a-f0-9]{12}$/);
});

test('summary separates confirmed axe violations from manual-review nodes and browser errors', () => {
  const summary = summarizeLiveAudit([
    {
      statusCode: 200,
      pageErrors: [{ message: 'hydration warning' }],
      states: [
        {
          violations: [
            { rule: 'button-name', impact: 'critical' },
            { rule: 'image-alt', impact: 'serious' },
          ],
          incomplete: [{ rule: 'color-contrast', nodes: [{}, {}] }],
        },
        { violations: [{ rule: 'button-name', impact: 'critical' }], incomplete: [] },
      ],
    },
    { statusCode: 503, pageErrors: [], states: [] },
    { statusCode: 200, navigationError: 'axe script injection failed', pageErrors: [], states: [] },
  ]);
  assert.equal(summary.routesVisited, 3);
  assert.equal(summary.statesScanned, 2);
  assert.equal(summary.violationOccurrences, 3);
  assert.equal(summary.uniqueRules, 2);
  assert.equal(summary.manualReviewOccurrences, 2);
  assert.equal(summary.pageErrors, 1);
  assert.equal(summary.routeFailures, 2);
  assert.equal(summary.ruleCounts[0].rule, 'button-name');
});

test('report slugs are filesystem-safe and the baseline includes core enV route seeds', () => {
  assert.equal(safeReportSlug('https://envtools.store/tools/my-tool?x=1'), 'envtools-store-tools-my-tool-x-1');
  assert.ok(DEFAULT_ROUTE_SEEDS.includes('/'));
  assert.ok(DEFAULT_ROUTE_SEEDS.includes('/tools'));
  assert.ok(AXE_TAGS.includes('wcag22aa'));
});


test('root-cause fingerprints group equivalent markup across routes despite run-specific IDs', () => {
  const first = stableFindingFingerprint('button-name', '<button id="save-1" class="Button_x" data-testid="save">Save</button>', ['button-has-name']);
  const second = stableFindingFingerprint('button-name', '<button id="save-2" class="Button_y" data-testid="save">Save</button>', ['button-has-name']);
  const different = stableFindingFingerprint('button-name', '<button id="delete" class="Button_x">Delete</button>', ['button-has-name']);
  assert.equal(first, second);
  assert.notEqual(first, different);
  assert.match(first, /^env-a11y-root:button-name:[a-f0-9]{16}$/);
});

test('summary distinguishes navigation errors, scan errors, HTTP errors and interaction coverage', () => {
  const summary = summarizeLiveAudit([
    {
      statusCode: 200,
      interactionCandidatesDiscovered: 2,
      stateDiscovery: { invalidForm: 'invalid-state-found', searchInput: 'audited' },
      interactionsAttempted: [
        { outcome: 'expanded-state-audited' },
        { outcome: 'target-not-found' },
        { outcome: 'state-audit-error' },
      ],
      states: [{ violations: [{ rule: 'button-name', impact: 'serious', fingerprint: 'root:1' }], incomplete: [] }],
    },
    { statusCode: null, navigationError: 'timeout', states: [], interactionsAttempted: [] },
    { statusCode: 500, scanError: 'axe injection failed', states: [], interactionsAttempted: [] },
  ], { uniqueInternalRoutesDiscovered: 5 });

  assert.equal(summary.routesDiscovered, 5);
  assert.equal(summary.routesVisited, 3);
  assert.equal(summary.routesNotVisited, 2);
  assert.equal(summary.navigationFailures, 1);
  assert.equal(summary.scanFailures, 1);
  assert.equal(summary.routesWithHttpErrors, 1);
  assert.equal(summary.routeFailures, 2);
  assert.equal(summary.uniqueRootCauses, 1);
  assert.equal(summary.duplicateFindingOccurrences, 0);
  assert.equal(summary.interactionCoverage.candidatesDiscovered, 2);
  assert.equal(summary.interactionCoverage.attempted, 3);
  assert.equal(summary.interactionCoverage.audited, 1);
  assert.equal(summary.interactionCoverage.failed, 1);
  assert.equal(summary.interactionCoverage.notAudited, 1);
  assert.equal(summary.stateDiscoveryCoverage.invalidFormStatesFound, 1);
  assert.equal(summary.stateDiscoveryCoverage.searchStatesAudited, 1);
});

test('report validator rejects missing evidence and accepts complete findings in schema v3', () => {
  const baseReport = {
    schemaVersion: LIVE_AUDIT_SCHEMA_VERSION,
    generatedAt: '2026-10-12T00:00:00.000Z',
    testEngine: { name: 'Playwright + Chromium + axe-core', axeVersion: '4.10.0' },
    summary: { routesVisited: 1 },
    routes: [{
      route: '/tools',
      url: 'https://en-v.example/tools',
      states: [{
        violations: [{
          id: 'env-a11y-live:button-name:abc123',
          fingerprint: 'env-a11y-root:button-name:abc123',
          rule: 'button-name', kind: 'violation', target: ['button:nth-of-type(1)'], html: '<button></button>', helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/button-name', status: 'new',
        }],
        incomplete: [],
      }],
    }],
  };
  assert.deepEqual(validateLiveAuditReport(baseReport), []);
  const missingEvidence = structuredClone(baseReport);
  delete missingEvidence.routes[0].states[0].violations[0].fingerprint;
  assert.ok(validateLiveAuditReport(missingEvidence).some((error) => error.includes('missing fingerprint')));
});


test('readiness check refuses empty and placeholder-only renders instead of reporting clean scans', () => {
  const empty = classifyPageReadiness({ readyState: 'complete', visibleText: '', visibleInteractiveCount: 0, visibleMediaCount: 0 });
  const placeholder = classifyPageReadiness({ readyState: 'complete', visibleText: 'Loading…', visibleInteractiveCount: 0, visibleMediaCount: 0, ariaBusy: true });
  const busyMain = classifyPageReadiness({ readyState: 'complete', visibleText: 'App header', visibleInteractiveCount: 2, visibleMediaCount: 0, mainAriaBusy: true });
  const rendered = classifyPageReadiness({ readyState: 'complete', visibleText: 'Accessibility Studio', visibleInteractiveCount: 1, visibleMediaCount: 0 });
  const imageOnly = classifyPageReadiness({ readyState: 'complete', visibleText: '', visibleInteractiveCount: 0, visibleMediaCount: 1 });
  assert.equal(empty.status, 'not-ready');
  assert.equal(placeholder.status, 'not-ready');
  assert.equal(busyMain.status, 'not-ready');
  assert.match(placeholder.reason, /loading or busy/);
  assert.match(busyMain.reason, /loading or busy/);
  assert.equal(rendered.status, 'ready');
  assert.equal(imageOnly.status, 'ready');
});


test('known axe edge case is retained as a review item with a safe corrective action', () => {
  const edgeCase = classifyKnownEngineEdgeCase({
    ruleId: 'aria-required-parent',
    elementTag: 'OPTION',
    role: 'option',
    insideNativeSelect: true,
  });
  assert.equal(edgeCase?.classification, 'engine-edge-case-review');
  assert.match(edgeCase?.source ?? '', /github\.com\/dequelabs\/axe-core\/issues\/5351/);
  assert.match(edgeCase?.recommendedAction ?? '', /Remove the redundant.*role/);
  assert.equal(classifyKnownEngineEdgeCase({ ruleId: 'aria-required-parent', elementTag: 'div', role: 'option', insideNativeSelect: false }), null);
  assert.equal(classifyKnownEngineEdgeCase({ ruleId: 'aria-required-parent', elementTag: 'OPTION', role: 'option', insideNativeSelect: false }), null);
});
