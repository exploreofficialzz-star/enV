#!/usr/bin/env node
/**
 * Phase 8: rendered accessibility audit of real enV routes and low-risk interactive states.
 *
 * Usage:
 *   npm run dev
 *   A11Y_BASE_URL=http://127.0.0.1:8080 npm run audit:accessibility:live
 *   A11Y_BASE_URL=https://en-v.vercel.app npm run audit:accessibility:live
 *
 * Automated axe violations and manual-review items are reported separately. This script is not
 * a WCAG conformance certification, and it does not submit valid forms or trigger tool actions.
 */
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import {
  AXE_TAGS,
  DEFAULT_ROUTE_SEEDS,
  LIVE_AUDIT_SCHEMA_VERSION,
  canonicalizeRouteUrl,
  classifyKnownEngineEdgeCase,
  classifyPageReadiness,
  isCrawlableInternalUrl,
  safeReportSlug,
  stableFindingFingerprint,
  stableFindingId,
  summarizeLiveAudit,
  validateLiveAuditReport,
} from './lib/accessibility-live-audit.mjs';

const require = createRequire(import.meta.url);
let chromium;
let axePath;

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.A11Y_BASE_URL || 'http://127.0.0.1:8080',
    maxPages: Number.parseInt(process.env.A11Y_MAX_PAGES || '40', 10),
    maxInteractions: Number.parseInt(process.env.A11Y_MAX_INTERACTIONS_PER_ROUTE || '4', 10),
    timeoutMs: Number.parseInt(process.env.A11Y_TIMEOUT_MS || '20000', 10),
    reportPath: resolve(process.env.A11Y_REPORT_PATH || 'artifacts/accessibility-live-audit.json'),
    screenshotDir: resolve(process.env.A11Y_SCREENSHOT_DIR || 'artifacts/accessibility-live-audit/screenshots'),
    routes: [...DEFAULT_ROUTE_SEEDS],
    failOnViolations: process.env.A11Y_FAIL_ON_VIOLATIONS === '1',
    failOnScanErrors: process.env.A11Y_FAIL_ON_SCAN_ERRORS === '1',
    includeScreenshots: process.env.A11Y_SCREENSHOTS !== '0',
  };
  for (const arg of argv) {
    if (arg === '--fail-on-violations') opts.failOnViolations = true;
    else if (arg === '--no-screenshots') opts.includeScreenshots = false;
    else if (arg.startsWith('--base-url=')) opts.baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--max-pages=')) opts.maxPages = Number.parseInt(arg.slice('--max-pages='.length), 10);
    else if (arg.startsWith('--max-interactions=')) opts.maxInteractions = Number.parseInt(arg.slice('--max-interactions='.length), 10);
    else if (arg.startsWith('--timeout-ms=')) opts.timeoutMs = Number.parseInt(arg.slice('--timeout-ms='.length), 10);
    else if (arg.startsWith('--report=')) opts.reportPath = resolve(arg.slice('--report='.length));
    else if (arg.startsWith('--screenshot-dir=')) opts.screenshotDir = resolve(arg.slice('--screenshot-dir='.length));
    else if (arg.startsWith('--routes=')) opts.routes = arg.slice('--routes='.length).split(',').map((x) => x.trim()).filter(Boolean);
    else if (arg === '--help' || arg === '-h') opts.help = true;
  }
  if (!Number.isInteger(opts.maxPages) || opts.maxPages < 1) throw new Error('--max-pages must be a positive integer.');
  if (!Number.isInteger(opts.maxInteractions) || opts.maxInteractions < 0) throw new Error('--max-interactions must be a non-negative integer.');
  if (!Number.isInteger(opts.timeoutMs) || opts.timeoutMs < 1000) throw new Error('--timeout-ms must be at least 1000.');
  return opts;
}

const HELP = `enV live rendered accessibility audit (Phase 8)

Options:
  --base-url=https://en-v.vercel.app   Root origin to scan (default localhost:8080)
  --routes=/,/tools,/search            Comma-separated route seeds (internal pages only)
  --max-pages=40                       Maximum unique routes to visit
  --max-interactions=4                 Low-risk interaction states per route
  --timeout-ms=20000                   Navigation timeout
  --report=artifacts/audit.json        JSON report destination
  --screenshot-dir=artifacts/a11y      Evidence screenshot directory
  --no-screenshots                     Disable screenshots
  --fail-on-violations                 Exit 1 when violations are found (opt-in baseline gate)
  --fail-on-scan-errors                Exit 2 when any route could not be scanned (opt-in CI gate)

Environment:
  A11Y_BASE_URL, A11Y_MAX_PAGES, A11Y_MAX_INTERACTIONS_PER_ROUTE, A11Y_REPORT_PATH,
  A11Y_SCREENSHOT_DIR, A11Y_TIMEOUT_MS, A11Y_FAIL_ON_VIOLATIONS=1,
  A11Y_FAIL_ON_SCAN_ERRORS=1, A11Y_SCREENSHOTS=0
`;

async function visibleInteractionCandidates(page, maxInteractions) {
  if (maxInteractions === 0) return [];
  return page.evaluate((limit) => {
    const nameOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    const candidates = [];
    const seen = new Set();
    const triggerPattern = /more options|more menu|open menu|navigation menu|see more (?:tools|results)|show more|open (?:settings|dialog|filter)|filters|preferences/i;
    for (const el of Array.from(document.querySelectorAll('summary,button,[role="button"],[aria-haspopup]'))) {
      if (!(el instanceof HTMLElement)) continue;
      const name = nameOf(el);
      const tag = el.tagName.toLowerCase();
      if (tag === 'button' && ((el.getAttribute('type') || 'submit').toLowerCase() === 'submit')) continue;
      if (el.matches(':disabled,[aria-disabled="true"]')) continue;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none') continue;
      const summaryIsOpen = tag === 'summary' && el.parentElement?.matches('details[open]');
      const isClosedDisclosure = tag === 'summary' && el.parentElement?.matches('details:not([open])');
      const explicitPopup = el.hasAttribute('aria-haspopup') || el.getAttribute('aria-expanded') === 'false';
      if (summaryIsOpen || !(isClosedDisclosure || explicitPopup || triggerPattern.test(name))) continue;
      const selector = pagePathSelectorForElement(el);
      if (seen.has(selector)) continue;
      seen.add(selector);
      candidates.push({ selector, tag, name: name || `<${tag}>`, stateKind: tag === 'summary' ? 'disclosure' : explicitPopup ? 'popup' : 'expanded-content' });
      if (candidates.length >= limit) break;
    }
    function pagePathSelectorForElement(el) {
      const parts = [];
      let node = el;
      while (node && node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() !== 'html') {
        let part = node.tagName.toLowerCase();
        if (node.id) {
          part += `#${CSS.escape(node.id)}`;
          parts.unshift(part);
          break;
        }
        const parent = node.parentElement;
        if (parent) {
          const sameTag = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
          if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
        }
        parts.unshift(part);
        node = parent;
      }
      return parts.join(' > ');
    }
    return candidates;
  }, maxInteractions);
}

async function searchInputState(page) {
  const inputs = page.locator('input[type="search"], input[aria-label*="search" i], input[placeholder*="search" i]');
  let search = null;
  for (let index = 0; index < await inputs.count(); index += 1) {
    const candidate = inputs.nth(index);
    if (await candidate.isVisible().catch(() => false) && await candidate.isEnabled().catch(() => false)) { search = candidate; break; }
  }
  if (!search) return { kind: 'search-query', name: 'Search query state', outcome: 'no-search-input' };
  const beforeUrl = page.url();
  const beforeCount = await page.locator('body').innerText().catch(() => '');
  try {
    await search.fill('json');
  } catch (error) {
    return { kind: 'search-query', name: 'Search query state', outcome: 'search-input-fill-failed', error: error instanceof Error ? error.message : String(error) };
  }
  await page.waitForTimeout(250);
  const afterCount = await page.locator('body').innerText().catch(() => '');
  const queryValue = (await search.inputValue().catch(() => '')).toLowerCase();
  // Input updates are a testable state even when suggestions do not change; report that distinction.
  if (beforeCount === afterCount && !queryValue.includes('json')) return { kind: 'search-query', name: 'Search suggestions after typing "json"', beforeUrl, outcome: 'no-state-change' };
  return { kind: 'search-query', name: 'Search suggestions after typing "json"', beforeUrl, outcome: 'audited' };
}

async function invalidFormState(page) {
  return page.evaluate(() => {
    const form = Array.from(document.forms).find((candidate) => {
      const controls = Array.from(candidate.querySelectorAll('input,select,textarea,button'));
      return controls.some((control) => {
        const input = control;
        const hasNativeConstraint = 'willValidate' in input && input.willValidate && 'checkValidity' in input && !input.checkValidity();
        return hasNativeConstraint;
      });
    });
    if (!form) return null;
    const before = form.innerText;
    // reportValidity can reveal native validation but never submits data.
    form.reportValidity();
    return {
      kind: 'form-validation',
      name: `Invalid form: ${form.getAttribute('aria-label') || form.getAttribute('name') || form.querySelector('legend,h1,h2,h3,label')?.textContent?.trim() || 'unnamed form'}`,
      before,
      blockedByNativeValidation: !form.checkValidity(),
    };
  });
}

function scanItem(rule, node, route, state, kind, stateKind, knownEngineEdgeCase = null) {
  const target = node.target ?? [];
  const html = node.html ?? '';
  const anyChecks = (node.any ?? []).map((check) => ({ id: check.id, message: check.message, data: check.data ?? null }));
  const allChecks = (node.all ?? []).map((check) => ({ id: check.id, message: check.message, data: check.data ?? null }));
  const noneChecks = (node.none ?? []).map((check) => ({ id: check.id, message: check.message, data: check.data ?? null }));
  const checkIds = [...anyChecks, ...allChecks, ...noneChecks].map((check) => check.id);
  return {
    id: stableFindingId(route, state, rule.id, target),
    fingerprint: stableFindingFingerprint(rule.id, html, checkIds),
    kind,
    status: knownEngineEdgeCase ? 'known-engine-edge-case-review' : kind === 'violation' ? 'new' : 'needs-review',
    knownEngineEdgeCase,
    route,
    state,
    stateKind,
    rule: rule.id,
    impact: rule.impact ?? null,
    help: rule.help,
    description: rule.description,
    helpUrl: rule.helpUrl ?? null,
    tags: rule.tags ?? [],
    target,
    html,
    failureSummary: node.failureSummary ?? null,
    anyChecks,
    allChecks,
    noneChecks,
  };
}

async function scanCurrentState(page, { route, stateName, stateKind, screenshotDir, includeScreenshots }) {
  const scanStartedAt = Date.now();
  const audit = await page.evaluate(async (tags) => {
    const results = await window.axe.run(document, {
      runOnly: { type: 'tag', values: tags },
      resultTypes: ['violations', 'incomplete', 'passes'],
    });
    const title = document.title || '';
    const mainHeadings = Array.from(document.querySelectorAll('h1')).map((el) => (el.textContent || '').trim()).filter(Boolean);
    const flattenSelectors = (value, output = []) => {
      if (Array.isArray(value)) value.forEach((item) => flattenSelectors(item, output));
      else if (typeof value === 'string') output.push(value);
      return output;
    };
    const resolveTarget = (node) => {
      for (const selector of flattenSelectors(node.target)) {
        try {
          const element = document.querySelector(selector);
          if (element) return element;
        } catch { /* Axe can return selectors scoped to a frame or shadow root. */ }
      }
      return null;
    };
    const violations = results.violations.flatMap((rule) => rule.nodes.map((node) => {
      let target = resolveTarget(node);
      if (!(target?.tagName === 'OPTION' && target.getAttribute('role')?.toLowerCase() === 'option' && target.closest('select'))) {
        const serialized = (node.html || '').replace(/\s+/g, ' ').trim().toLowerCase();
        target = Array.from(document.querySelectorAll('select option[role="option"]')).find((option) => option.outerHTML.replace(/\s+/g, ' ').trim().toLowerCase() === serialized) ?? target;
      }
      const option = target?.tagName === 'OPTION' ? target : null;
      return {
        rule,
        node,
        nativeOptionContext: {
          elementTag: option?.tagName ?? '',
          role: option?.getAttribute('role') ?? '',
          insideNativeSelect: Boolean(option?.closest('select')),
        },
      };
    }));
    const incomplete = results.incomplete.flatMap((rule) => rule.nodes.map((node) => ({ rule, node, knownEngineEdgeCase: null })));
    return {
      title,
      lang: document.documentElement.getAttribute('lang'),
      h1: mainHeadings,
      counts: { violations: results.violations.length, incomplete: results.incomplete.length, passes: results.passes.length },
      violations,
      incomplete,
    };
  }, AXE_TAGS);

  // Only reclassify the narrowly evidenced known edge case. Keep its HTML/selector,
  // upstream issue, and corrective action in the manual-review section; never discard it.
  const confirmedViolations = [];
  const reviewItems = [...audit.incomplete];
  for (const item of audit.violations) {
    const knownEngineEdgeCase = classifyKnownEngineEdgeCase({ ruleId: item.rule.id, ...item.nativeOptionContext });
    if (knownEngineEdgeCase) reviewItems.push({ ...item, knownEngineEdgeCase });
    else confirmedViolations.push(item);
  }
  audit.counts.violations = confirmedViolations.length;
  audit.counts.incomplete = reviewItems.length;

  const state = {
    name: stateName,
    kind: stateKind,
    url: page.url(),
    counts: audit.counts,
    violations: confirmedViolations.map(({ rule, node }) => scanItem(rule, node, route, stateName, 'violation', stateKind)),
    incomplete: reviewItems.map(({ rule, node, knownEngineEdgeCase }) => scanItem(rule, node, route, stateName, 'manual-review', stateKind, knownEngineEdgeCase)),
    screenshot: null,
    durationMs: Date.now() - scanStartedAt,
  };
  if (includeScreenshots && (state.violations.length > 0 || state.incomplete.length > 0)) {
    const safeName = `${safeReportSlug(route)}-${safeReportSlug(stateName)}`;
    const screenshotSuffix = stableFindingId(route, stateName, 'screenshot', []).split(':').at(-1);
    const targetPath = resolve(screenshotDir, `${safeName}-${screenshotSuffix}.png`);
    await mkdir(dirname(targetPath), { recursive: true });
    try {
      await page.screenshot({ path: targetPath, fullPage: true, animations: 'disabled', timeout: 10000 });
      state.screenshot = relative(process.cwd(), targetPath).split(sep).join('/');
    } catch (error) {
      state.screenshotError = error instanceof Error ? error.message : String(error);
    }
  }
  return { metadata: { title: audit.title, lang: audit.lang, h1: audit.h1 }, state };
}

async function installAxe(page) {
  await page.addScriptTag({ path: axePath });
}

async function crawlRoute(page, routeUrl, opts) {
  const routeKey = `${routeUrl.origin}${routeUrl.pathname}`;
  const entry = {
    route: routeUrl.pathname,
    url: routeUrl.href,
    statusCode: null,
    title: '',
    lang: null,
    h1: [],
    states: [],
    linksDiscovered: [],
    interactionCandidatesDiscovered: 0,
    stateDiscovery: { invalidForm: 'not-checked', searchInput: 'not-checked' },
    interactionsAttempted: [],
    pageErrors: [],
    navigationError: null,
    scanError: null,
    errorStage: null,
  };
  let currentStage = 'navigation';
  const onPageError = (error) => entry.pageErrors.push({ message: error.message });
  page.on('pageerror', onPageError);
  try {
    const response = await page.goto(routeUrl.href, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs });
    currentStage = 'page-settle';
    entry.statusCode = response?.status() ?? null;
    await page.waitForLoadState('networkidle', { timeout: Math.min(opts.timeoutMs, 2500) }).catch(() => {});
    await page.waitForFunction(() => {
      if (document.readyState === 'loading' || !document.body) return false;
      const text = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
      const hasNonPlaceholderText = text.length > 0 && !/^(?:loading(?:\.{2,}|…)?|please wait(?:\.{2,}|…)?|just a moment(?:\.{2,}|…)?|preparing your page(?:\.{2,}|…)?|checking your browser(?:\.{2,}|…)?)$/i.test(text);
      const primaryContent = document.querySelector('main,[role=main],#root,#app');
      if (primaryContent?.matches('[aria-busy="true"]')) return false;
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const hasInteractive = Array.from(document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[role="link"]')).some(visible);
      const hasMedia = Array.from(document.querySelectorAll('img[alt],svg[role="img"],canvas,video,audio,[role="img"]')).some(visible);
      return hasNonPlaceholderText || hasInteractive || hasMedia;
    }, null, { timeout: Math.min(opts.timeoutMs, 3500) }).catch(() => {});
    await page.waitForTimeout(150);
    entry.readiness = classifyPageReadiness(await page.evaluate(() => {
      const body = document.body;
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      return {
        readyState: document.readyState,
        visibleText: body?.innerText ?? '',
        visibleInteractiveCount: Array.from(document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[role="link"]')).filter(visible).length,
        visibleMediaCount: Array.from(document.querySelectorAll('img[alt],svg[role="img"],canvas,video,audio,[role="img"]')).filter(visible).length,
        ariaBusy: Boolean(document.querySelector('[aria-busy="true"]')),
        mainAriaBusy: Boolean(document.querySelector('main[aria-busy="true"],[role=main][aria-busy="true"],#root[aria-busy="true"],#app[aria-busy="true"]')),
      };
    }));
    if (!entry.readiness.hasUsableContent) {
      currentStage = 'page-readiness';
      entry.errorStage = currentStage;
      entry.scanError = entry.readiness.reason;
      return entry;
    }
    currentStage = 'axe-injection';
    await installAxe(page);
    currentStage = 'initial-scan';
    const { metadata, state } = await scanCurrentState(page, {
      route: routeKey,
      stateName: 'default',
      stateKind: 'initial-render',
      screenshotDir: opts.screenshotDir,
      includeScreenshots: opts.includeScreenshots,
    });
    entry.title = metadata.title;
    entry.lang = metadata.lang;
    entry.h1 = metadata.h1;
    entry.states.push(state);
    entry.linksDiscovered = await page.locator('a[href]').evaluateAll((anchors, base) => {
      const urls = new Set();
      for (const anchor of anchors) {
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#') || /^(?:mailto:|tel:|javascript:|data:)/i.test(href)) continue;
        try { urls.add(new URL(href, base).href); } catch { /* Ignore malformed hrefs. */ }
      }
      return [...urls];
    }, routeUrl.href);

    // Discover controls from the default render before search/validation interactions alter the DOM.
    currentStage = 'discover-interactions';
    const candidates = await visibleInteractionCandidates(page, opts.maxInteractions);
    entry.interactionCandidatesDiscovered = candidates.length;

    let formState = null;
    try {
      formState = await invalidFormState(page);
      entry.stateDiscovery.invalidForm = formState ? 'invalid-state-found' : 'no-invalid-native-form';
    } catch (error) {
      entry.stateDiscovery.invalidForm = 'discovery-failed';
      entry.stateDiscovery.invalidFormError = error instanceof Error ? error.message : String(error);
    }
    if (formState) {
      entry.interactionsAttempted.push({ ...formState, outcome: 'audited' });
      currentStage = 'form-validation-scan';
      const { state: invalidState } = await scanCurrentState(page, {
        route: routeKey,
        stateName: `form-validation-${entry.states.length}`,
        stateKind: 'form-validation',
        screenshotDir: opts.screenshotDir,
        includeScreenshots: opts.includeScreenshots,
      });
      entry.states.push(invalidState);
    }

    currentStage = 'search-state';
    let candidateSearch;
    try {
      candidateSearch = await searchInputState(page);
      entry.stateDiscovery.searchInput = candidateSearch.outcome;
    } catch (error) {
      entry.stateDiscovery.searchInput = 'discovery-failed';
      entry.stateDiscovery.searchInputError = error instanceof Error ? error.message : String(error);
    }
    if (candidateSearch?.outcome === 'audited') {
      entry.interactionsAttempted.push({ ...candidateSearch, outcome: 'audited' });
      const { state: searchState } = await scanCurrentState(page, {
        route: routeKey,
        stateName: candidateSearch.kind,
        stateKind: candidateSearch.kind,
        screenshotDir: opts.screenshotDir,
        includeScreenshots: opts.includeScreenshots,
      });
      entry.states.push(searchState);
    } else if (candidateSearch && candidateSearch.outcome !== 'no-search-input') {
      entry.interactionsAttempted.push(candidateSearch);
    }

    currentStage = 'interactive-states';
    for (const candidate of candidates) {
      // Re-navigate before each state so one interaction cannot silently affect the next state.
      const response = await page.goto(routeUrl.href, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs }).catch((error) => ({ navigationFailed: true, error }));
      if (response?.navigationFailed) {
        entry.interactionsAttempted.push({ ...candidate, outcome: 'navigation-failed', error: response.error instanceof Error ? response.error.message : String(response.error) });
        continue;
      }
      await page.waitForTimeout(100);
      const clicked = page.locator(candidate.selector).first();
      let didClick = false;
      try {
        if (await clicked.count() === 0) {
          entry.interactionsAttempted.push({ ...candidate, outcome: 'target-not-found' });
          continue;
        }
        if (!(await clicked.isVisible().catch(() => false))) {
          entry.interactionsAttempted.push({ ...candidate, outcome: 'target-not-visible' });
          continue;
        }
        if (!(await clicked.isEnabled().catch(() => false))) {
          entry.interactionsAttempted.push({ ...candidate, outcome: 'target-disabled' });
          continue;
        }
        {
          const beforeText = await page.locator('body').innerText().catch(() => '');
          const beforeExpanded = await page.locator('[role="dialog"], [role="menu"], [role="listbox"], details[open], [aria-expanded="true"]').count();
          await clicked.click({ timeout: 2500 });
          didClick = true;
          await page.waitForTimeout(180);
          await installAxe(page);
          const stateName = `${candidate.stateKind}-${candidate.name}`;
          const { state: interactiveState } = await scanCurrentState(page, {
            route: routeKey,
            stateName,
            stateKind: candidate.stateKind,
            screenshotDir: opts.screenshotDir,
            includeScreenshots: opts.includeScreenshots,
          });
          const afterExpanded = await page.locator('[role="dialog"], [role="menu"], [role="listbox"], details[open], [aria-expanded="true"]').count();
          const afterText = await page.locator('body').innerText().catch(() => '');
          const isExpanded = afterExpanded > beforeExpanded;
          const contentChanged = beforeText !== afterText;
          if (isExpanded || contentChanged) entry.states.push(interactiveState);
          entry.interactionsAttempted.push({ ...candidate, outcome: isExpanded ? 'expanded-state-audited' : contentChanged ? 'changed-state-audited' : 'clicked-no-clear-state-change' });
        }
      } catch (error) {
        entry.interactionsAttempted.push({ ...candidate, outcome: didClick ? 'state-audit-error' : 'interaction-failed', error: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    entry.errorStage = currentStage;
    if (currentStage === 'navigation') entry.navigationError = message;
    else entry.scanError = message;
  } finally {
    page.off('pageerror', onPageError);
  }
  return entry;
}

function markdownReport(report) {
  const lines = [
    '# enV Phase 8 — Live rendered accessibility audit',
    '',
    `- **Generated:** ${report.generatedAt}`,
    `- **Base URL:** ${report.baseUrl}`,
    `- **Routes discovered:** ${report.summary.routesDiscovered}`,
    `- **Routes visited:** ${report.summary.routesVisited}`,
    `- **Routes not visited:** ${report.summary.routesNotVisited}`,
    `- **Navigation failures:** ${report.summary.navigationFailures}`,
    `- **Scan failures:** ${report.summary.scanFailures}`,
    `- **HTTP error routes:** ${report.summary.routesWithHttpErrors}`,
    `- **Rendered states scanned:** ${report.summary.statesScanned}`,
    `- **States with findings:** ${report.summary.statesWithFindings}`,
    `- **Likely root-cause groups:** ${report.summary.uniqueRootCauses}`,
    `- **Repeated finding occurrences beyond first fingerprint:** ${report.summary.duplicateFindingOccurrences}`,
    `- **Interaction candidates discovered:** ${report.summary.interactionCoverage.candidatesDiscovered}`,
    `- **Interactions attempted / audited / failed:** ${report.summary.interactionCoverage.attempted} / ${report.summary.interactionCoverage.audited} / ${report.summary.interactionCoverage.failed}`,
    `- **Search states audited / unavailable / unchanged:** ${report.summary.stateDiscoveryCoverage.searchStatesAudited} / ${report.summary.stateDiscoveryCoverage.routesWithoutSearchInput} / ${report.summary.stateDiscoveryCoverage.searchStatesWithoutObservableChange}`,
    `- **Invalid native-form states found:** ${report.summary.stateDiscoveryCoverage.invalidFormStatesFound}`,
    `- **State-discovery errors:** ${report.summary.stateDiscoveryCoverage.formDiscoveryErrors + report.summary.stateDiscoveryCoverage.searchStateErrors}`,
    `- **Violation occurrences:** ${report.summary.violationOccurrences}`,
    `- **Distinct rules with violations:** ${report.summary.uniqueRules}`,
    `- **Manual-review node occurrences:** ${report.summary.manualReviewOccurrences}`,
    `- **Known engine edge-case reviews:** ${report.summary.knownEngineEdgeCaseReviews}`,
    `- **Browser page errors:** ${report.summary.pageErrors}`,
    `- **Route failures:** ${report.summary.routeFailures}`,
    '',
    '> Automated findings are reviewable evidence, not a WCAG conformance verdict. axe incomplete results are kept separately for manual inspection. This audit does not test real screen-reader behavior.',
    '',
    '## Most frequent rules',
    '',
    '| Rule | Impact | Occurrences | Node count |',
    '|---|---|---:|---:|',
  ];
  if (!report.summary.ruleCounts.length) lines.push('| None detected | — | 0 | 0 |');
  else for (const item of report.summary.ruleCounts) lines.push(`| ${item.rule} | ${item.impact} | ${item.occurrences} | ${item.nodes} |`);
  lines.push('', '## Route/state details', '');
  for (const route of report.routes) {
    const violationCount = route.states.reduce((sum, state) => sum + state.violations.length, 0);
    const reviewCount = route.states.reduce((sum, state) => sum + state.incomplete.length, 0);
    lines.push(`### ${route.route || '/'} — HTTP ${route.statusCode ?? 'unknown'}`, '', `URL: ${route.url}`, `Title: ${route.title || '(missing)'}`, `Document language: ${route.lang || '(missing)'}`, `H1 count: ${route.h1.length}`, `States: ${route.states.length}; violations: ${violationCount}; manual-review items: ${reviewCount}`);
    if (route.navigationError) lines.push(`Navigation error: ${route.navigationError}`);
    if (route.readiness) lines.push(`Page readiness: ${route.readiness.status}; visible text: ${route.readiness.visibleTextLength} chars; visible controls: ${route.readiness.visibleInteractiveCount}; media: ${route.readiness.visibleMediaCount}; primary content busy: ${route.readiness.mainAriaBusy}`);
    if (route.stateDiscovery) lines.push(`State discovery: invalid form = ${route.stateDiscovery.invalidForm}; search input = ${route.stateDiscovery.searchInput}`);
    if (route.scanError) lines.push(`Scan error (${route.errorStage || 'unknown stage'}): ${route.scanError}`);
    if (route.pageErrors.length) lines.push(`Browser page errors: ${route.pageErrors.map((x) => x.message).join('; ')}`);
    for (const state of route.states) {
      lines.push('', `#### State: ${state.name}`, '', `Violations: ${state.violations.length}; incomplete nodes: ${state.incomplete.length}; axe passes: ${state.counts.passes}`);
      if (state.screenshot) lines.push(`Evidence screenshot: ${state.screenshot}`);
      for (const finding of state.violations) {
        lines.push('', `- **${finding.impact ?? 'unknown'} — ${finding.rule}** · ${finding.id}`, `  - Root-cause fingerprint: ${finding.fingerprint}`, `  - Initial status: ${finding.status}`, `  - Target: ${finding.target.join(', ') || '(document)'}`, `  - Guidance: ${finding.help} — ${finding.helpUrl}`);
        if (finding.failureSummary) lines.push(`  - Evidence: ${finding.failureSummary.replace(/\s+/g, ' ').slice(0, 500)}`);
        if (finding.html) lines.push(`  - HTML: ${finding.html.replace(/`/g, '').slice(0, 280)}`);
      }
      if (state.incomplete.length) {
        lines.push('', '**Manual review required (not counted as confirmed violations):**');
        for (const item of state.incomplete) {
          lines.push(`- ${item.rule} — ${item.target.join(', ') || '(document)'} · ${item.id}`);
          if (item.knownEngineEdgeCase) lines.push(`  - Engine edge case: ${item.knownEngineEdgeCase.message}`, `  - Source: ${item.knownEngineEdgeCase.source}`, `  - Suggested action: ${item.knownEngineEdgeCase.recommendedAction}`);
        }
      }
    }
    if (route.interactionsAttempted.length) {
      lines.push('', '**Interactions attempted:**');
      for (const interaction of route.interactionsAttempted) lines.push(`- ${interaction.name ?? interaction.kind}: ${interaction.outcome}`);
    }
    lines.push('');
  }
  lines.push('## Limitations', '', '- The crawler only follows same-origin HTTP(S) links, with a maximum route count and no authentication bypass.', '- It tests the first visible search input with the synthetic query `json`, native-invalid form states, and selected low-risk menu/disclosure/expand controls. It does not click every control or submit valid forms.', '- Dynamic pages outside the crawl budget must be added as explicit route seeds. Content requiring login, permission, a real device, or assistive technology needs separate testing.', '- A zero-violation result is not proof of WCAG conformance. Validate findings with keyboard-only, VoiceOver, TalkBack, zoom/reflow, and human review.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }
  try {
    ({ chromium } = require('playwright'));
    axePath = require.resolve('axe-core/axe.min.js');
  } catch (error) {
    console.error('Live rendered accessibility audit requires installed dependencies: playwright and axe-core.');
    console.error(`Dependency resolution: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const base = new URL(opts.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('The base URL must use HTTP or HTTPS.');
  base.hash = '';
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const visited = new Set();
  const queued = new Set();
  const discoveredRoutes = new Set();
  const queue = [];
  const enqueue = (value) => {
    if (!isCrawlableInternalUrl(value, base.href)) return;
    const canonical = canonicalizeRouteUrl(value, base.href);
    if (canonical.origin !== base.origin) return;
    discoveredRoutes.add(canonical.href);
    if (visited.has(canonical.href) || queued.has(canonical.href)) return;
    queued.add(canonical.href);
    queue.push(canonical);
  };
  for (const route of opts.routes) enqueue(new URL(route, base));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    reducedMotion: 'reduce',
    colorScheme: 'light',
    ignoreHTTPSErrors: false,
  });
  const packageVersion = async (entryPath) => {
    const packageJsonPath = resolve(dirname(entryPath), 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    return packageJson.version;
  };
  const runtimeVersions = {
    node: process.version,
    playwright: await packageVersion(require.resolve('playwright')),
    axeCore: await packageVersion(axePath),
    chromium: browser.version(),
  };
  const routes = [];
  try {
    while (queue.length > 0 && routes.length < opts.maxPages) {
      const routeUrl = queue.shift();
      queued.delete(routeUrl.href);
      if (visited.has(routeUrl.href)) continue;
      visited.add(routeUrl.href);
      const page = await context.newPage();
      page.setDefaultTimeout(opts.timeoutMs);
      const entry = await crawlRoute(page, routeUrl, opts);
      routes.push(entry);
      for (const discovered of entry.linksDiscovered) enqueue(discovered);
      const stateViolationCount = entry.states.reduce((sum, state) => sum + state.violations.length, 0);
      const stateReviewCount = entry.states.reduce((sum, state) => sum + state.incomplete.length, 0);
      console.log(`${entry.navigationError || entry.scanError ? 'ERROR' : 'AUDIT'} ${entry.statusCode ?? '---'} ${routeUrl.pathname} · ${entry.states.length} states · ${stateViolationCount} violations · ${stateReviewCount} manual-review nodes`);
      await page.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const report = {
    schemaVersion: LIVE_AUDIT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    baseUrl: base.origin,
    scope: 'Rendered enV routes and selected low-risk interactive states; not a WCAG conformance verdict',
    testEngine: { name: 'Playwright + Chromium + axe-core', axeTags: AXE_TAGS, ...runtimeVersions, axeVersion: runtimeVersions.axeCore },
    environment: {
      commit: process.env.GITHUB_SHA || process.env.GIT_COMMIT || null,
      viewport: { width: 1365, height: 900 },
      colorScheme: 'light',
      reducedMotion: 'reduce',
    },
    configuration: {
      maxPages: opts.maxPages,
      maxInteractionsPerRoute: opts.maxInteractions,
      timeoutMs: opts.timeoutMs,
      screenshots: opts.includeScreenshots,
      seedRoutes: opts.routes,
      uniqueInternalRoutesDiscovered: discoveredRoutes.size,
      routeBudgetReached: routes.length >= opts.maxPages && queue.length > 0,
      unauditedQueuedRouteCount: queue.length,
    },
    summary: summarizeLiveAudit(routes, { uniqueInternalRoutesDiscovered: discoveredRoutes.size }),
    routes,
  };
  const reportErrors = validateLiveAuditReport(report);
  if (reportErrors.length) {
    throw new Error(`Refusing to write an invalid accessibility report:\n- ${reportErrors.join('\n- ')}`);
  }
  await mkdir(dirname(opts.reportPath), { recursive: true });
  await writeFile(opts.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const markdownPath = opts.reportPath.replace(/\.json$/i, '.md');
  await writeFile(markdownPath, markdownReport(report));
  console.log(`JSON report: ${opts.reportPath}`);
  console.log(`Markdown report: ${markdownPath}`);
  if (report.configuration.routeBudgetReached) console.warn(`Route budget reached; ${queue.length} same-origin routes remain queued. Increase --max-pages to expand coverage.`);
  console.log(`Summary: ${report.summary.routesVisited} routes, ${report.summary.statesScanned} states, ${report.summary.violationOccurrences} violation occurrences, ${report.summary.manualReviewOccurrences} manual-review node occurrences.`);
  if (opts.failOnViolations && report.summary.violationOccurrences > 0) process.exitCode = 1;
  if (report.summary.routesVisited === 0 || routes.every((route) => route.navigationError || route.scanError)) process.exitCode = 2;
  if (opts.failOnScanErrors && (report.summary.navigationFailures > 0 || report.summary.scanFailures > 0)) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 2;
});
