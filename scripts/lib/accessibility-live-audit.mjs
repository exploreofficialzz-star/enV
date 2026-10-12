import { createHash } from 'node:crypto';

export const LIVE_AUDIT_SCHEMA_VERSION = 3;

export const DEFAULT_ROUTE_SEEDS = [
  '/',
  '/tools',
  '/search',
  '/assistant',
  '/favorites',
  '/history',
  '/account',
  '/about',
  '/contact',
  '/pricing',
  '/privacy',
  '/terms',
  '/disclaimer',
  '/responsible-use',
];

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

export function canonicalizeRouteUrl(value, base) {
  const url = new URL(value, base);
  url.hash = '';
  // Query strings can contain private search terms and explode the crawl cardinality.
  // Search query variants are tested separately through the interactive-state pass.
  url.search = '';
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

export function isCrawlableInternalUrl(value, base) {
  try {
    const url = new URL(value, base);
    const origin = new URL(base).origin;
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) return false;
    if (url.pathname.match(/\.(?:pdf|png|jpe?g|gif|webp|svg|ico|zip|json|xml|txt|css|js|woff2?)$/i)) return false;
    if (/^\/(?:api|auth|logout|sign-out)(?:\/|$)/i.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function digest(value, length = 16) {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}


/** Classify whether a rendered page has enough observable content to scan honestly. */
export function classifyPageReadiness(snapshot = {}) {
  const visibleText = String(snapshot.visibleText ?? '').replace(/\s+/g, ' ').trim();
  const isPlaceholderOnly = /^(?:loading(?:\.{2,}|…)?|please wait(?:\.{2,}|…)?|just a moment(?:\.{2,}|…)?|preparing your page(?:\.{2,}|…)?|checking your browser(?:\.{2,}|…)?)$/i.test(visibleText);
  const usableText = visibleText.length > 0 && !isPlaceholderOnly;
  const visibleInteractiveCount = Math.max(0, Number(snapshot.visibleInteractiveCount) || 0);
  const visibleMediaCount = Math.max(0, Number(snapshot.visibleMediaCount) || 0);
  const mainAriaBusy = Boolean(snapshot.mainAriaBusy);
  const hasUsableContent = !mainAriaBusy && (usableText || visibleInteractiveCount > 0 || visibleMediaCount > 0);
  let reason = null;
  if (!hasUsableContent) {
    reason = mainAriaBusy || snapshot.ariaBusy || isPlaceholderOnly
      ? 'The page or its primary content region still appears to be loading or busy; findings were not generated from a potentially incomplete render.'
      : 'The rendered page has no observable text, interactive controls, or meaningful media; findings were not generated from an empty render.';
  }
  return {
    status: hasUsableContent ? 'ready' : 'not-ready',
    hasUsableContent,
    reason,
    visibleTextLength: visibleText.length,
    visibleInteractiveCount,
    visibleMediaCount,
    ariaBusy: Boolean(snapshot.ariaBusy),
    mainAriaBusy,
    readyState: String(snapshot.readyState ?? 'unknown'),
  };
}

/** Stable per-occurrence ID: a finding remains comparable within the same route and state. */
export function stableFindingId(route, state, ruleId, target) {
  const normalizedTarget = Array.isArray(target) ? target.join('|') : String(target ?? 'document');
  return `env-a11y-live:${ruleId}:${digest(`${route}\n${state}\n${ruleId}\n${normalizedTarget}`, 12)}`;
}

/**
 * Conservative handling for a documented engine edge case. The finding is not erased:
 * it moves to needs-review with the source and a safe corrective action attached.
 */
export function classifyKnownEngineEdgeCase({ ruleId, elementTag, role, insideNativeSelect }) {
  if (ruleId === 'aria-required-parent' && String(elementTag ?? '').toLowerCase() === 'option' && String(role ?? '').toLowerCase() === 'option' && insideNativeSelect) {
    return {
      id: 'axe-core-5351',
      classification: 'engine-edge-case-review',
      source: 'https://github.com/dequelabs/axe-core/issues/5351',
      message: 'axe-core has an open report of aria-required-parent being raised on a native `<option role="option">` inside a native `<select>`. This finding is kept for review instead of counted as a confirmed violation.',
      recommendedAction: 'Remove the redundant `role="option"` from the native `<option>`, then rerun the audit. Do not add ARIA ownership just to silence this rule.',
    };
  }
  return null;
}

/**
 * A cross-route fingerprint for grouping likely repeat root causes.
 * This deliberately removes common run-specific attribute values while keeping the rule,
 * element shape, remaining attributes, check IDs, and compact markup. It is a grouping hint,
 * not proof that two elements have identical causes; retain occurrence evidence for review.
 */
export function stableFindingFingerprint(ruleId, html, checkIds = []) {
  const normalizedHtml = String(html ?? '')
    .toLowerCase()
    .replace(/\s+(?:id|class|for|href|src|value|style|aria-[\w-]+|data-[\w-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<!--[^]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
  const normalizedChecks = [...new Set((Array.isArray(checkIds) ? checkIds : []).filter(Boolean).map(String))].sort().join('|');
  return `env-a11y-root:${ruleId}:${digest(`${ruleId}\n${normalizedChecks}\n${normalizedHtml}`)}`;
}

function interactionOutcomeCounts(routes) {
  const outcomes = new Map();
  for (const route of routes) {
    for (const interaction of route.interactionsAttempted ?? []) {
      const outcome = interaction.outcome ?? 'unknown';
      outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
    }
  }
  const entries = [...outcomes.entries()].sort(([a], [b]) => a.localeCompare(b));
  const attempted = entries.reduce((sum, [, count]) => sum + count, 0);
  const audited = entries.reduce((sum, [outcome, count]) => sum + (/audited/.test(outcome) ? count : 0), 0);
  const failed = entries.reduce((sum, [outcome, count]) => sum + (/(?:failed|error|navigation-failed|audit-failed)/.test(outcome) ? count : 0), 0);
  return {
    candidatesDiscovered: routes.reduce((sum, route) => sum + (route.interactionCandidatesDiscovered ?? 0), 0),
    attempted,
    audited,
    failed,
    notAudited: Math.max(0, attempted - audited - failed),
    outcomes: Object.fromEntries(entries),
  };
}

export function summarizeLiveAudit(routes, coverage = {}) {
  const ruleCounts = new Map();
  const impactCounts = new Map();
  const rootCauseFingerprints = new Set();
  let statesScanned = 0;
  let statesWithFindings = 0;
  let violationOccurrences = 0;
  let manualReviewOccurrences = 0;
  let knownEngineEdgeCaseReviews = 0;
  let pageErrors = 0;
  let navigationFailures = 0;
  let scanFailures = 0;
  let httpErrors = 0;

  for (const route of routes) {
    if (route.navigationError || route.statusCode === null) navigationFailures += 1;
    if (route.scanError) scanFailures += 1;
    if (Number.isFinite(route.statusCode) && route.statusCode >= 400) httpErrors += 1;
    pageErrors += route.pageErrors?.length ?? 0;
    for (const state of route.states ?? []) {
      statesScanned += 1;
      const stateViolationCount = (state.violations ?? []).length;
      if (stateViolationCount > 0 || (state.incomplete ?? []).length > 0) statesWithFindings += 1;
      for (const violation of state.violations ?? []) {
        const key = violation.rule;
        const current = ruleCounts.get(key) ?? { rule: key, impact: violation.impact ?? 'unknown', occurrences: 0, nodes: 0 };
        current.occurrences += 1;
        current.nodes += 1;
        ruleCounts.set(key, current);
        const impact = violation.impact ?? 'unknown';
        impactCounts.set(impact, (impactCounts.get(impact) ?? 0) + 1);
        violationOccurrences += 1;
        if (violation.fingerprint) rootCauseFingerprints.add(violation.fingerprint);
      }
      manualReviewOccurrences += (state.incomplete ?? []).reduce((sum, item) => sum + (Array.isArray(item.nodes) ? item.nodes.length : 1), 0);
      knownEngineEdgeCaseReviews += (state.incomplete ?? []).filter((item) => item.knownEngineEdgeCase).length;
    }
  }

  const interactionCoverage = interactionOutcomeCounts(routes);
  const stateDiscoveryCoverage = routes.reduce((coverage, route) => {
    const discovery = route.stateDiscovery ?? {};
    if (discovery.invalidForm === 'invalid-state-found') coverage.invalidFormStatesFound += 1;
    if (discovery.invalidForm === 'no-invalid-native-form') coverage.routesWithoutInvalidForms += 1;
    if (discovery.invalidForm === 'discovery-failed') coverage.formDiscoveryErrors += 1;
    if (discovery.searchInput === 'audited') coverage.searchStatesAudited += 1;
    if (discovery.searchInput === 'no-search-input') coverage.routesWithoutSearchInput += 1;
    if (discovery.searchInput === 'no-state-change') coverage.searchStatesWithoutObservableChange += 1;
    if (discovery.searchInput === 'discovery-failed' || discovery.searchInput === 'search-input-fill-failed') coverage.searchStateErrors += 1;
    return coverage;
  }, { invalidFormStatesFound: 0, routesWithoutInvalidForms: 0, formDiscoveryErrors: 0, searchStatesAudited: 0, routesWithoutSearchInput: 0, searchStatesWithoutObservableChange: 0, searchStateErrors: 0 });
  const routesVisited = routes.length;
  const uniqueInternalRoutesDiscovered = Math.max(routesVisited, coverage.uniqueInternalRoutesDiscovered ?? routesVisited);
  const routeFailures = routes.filter((route) => route.navigationError || route.scanError || route.statusCode === null || (Number.isFinite(route.statusCode) && route.statusCode >= 400)).length;
  const uniqueRootCauses = rootCauseFingerprints.size;

  return {
    routesDiscovered: uniqueInternalRoutesDiscovered,
    routesVisited,
    routesNotVisited: Math.max(0, uniqueInternalRoutesDiscovered - routesVisited),
    routesWithHttpErrors: httpErrors,
    navigationFailures,
    scanFailures,
    routeFailures,
    statesScanned,
    statesWithFindings,
    violationOccurrences,
    uniqueRootCauses,
    duplicateFindingOccurrences: Math.max(0, violationOccurrences - uniqueRootCauses),
    uniqueRules: ruleCounts.size,
    manualReviewOccurrences,
    knownEngineEdgeCaseReviews,
    pageErrors,
    interactionCoverage,
    stateDiscoveryCoverage,
    impactCounts: Object.fromEntries([...impactCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    ruleCounts: [...ruleCounts.values()].sort((a, b) => b.occurrences - a.occurrences || a.rule.localeCompare(b.rule)),
  };
}

/** Fail closed on incomplete report structure, rather than publishing misleading empty results. */
export function validateLiveAuditReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object') return ['Report must be an object.'];
  if (report.schemaVersion !== LIVE_AUDIT_SCHEMA_VERSION) errors.push(`schemaVersion must be ${LIVE_AUDIT_SCHEMA_VERSION}.`);
  if (!report.generatedAt || Number.isNaN(Date.parse(report.generatedAt))) errors.push('generatedAt must be a valid ISO timestamp.');
  if (!report.testEngine?.name || !report.testEngine?.axeVersion) errors.push('testEngine must include engine name and axeVersion.');
  if (!Array.isArray(report.routes)) errors.push('routes must be an array.');
  if (!report.summary || typeof report.summary.routesVisited !== 'number') errors.push('summary must include routesVisited.');
  for (const [routeIndex, route] of (Array.isArray(report.routes) ? report.routes : []).entries()) {
    if (!route.url || typeof route.route !== 'string') errors.push(`routes[${routeIndex}] must include route and url.`);
    if (!Array.isArray(route.states)) errors.push(`routes[${routeIndex}].states must be an array.`);
    for (const [stateIndex, state] of (Array.isArray(route.states) ? route.states : []).entries()) {
      for (const field of ['violations', 'incomplete']) {
        if (!Array.isArray(state[field])) errors.push(`routes[${routeIndex}].states[${stateIndex}].${field} must be an array.`);
      }
      for (const finding of [...(state.violations ?? []), ...(state.incomplete ?? [])]) {
        for (const field of ['id', 'fingerprint', 'rule', 'kind', 'target', 'html', 'helpUrl']) {
          if (finding[field] === undefined || finding[field] === null) errors.push(`Finding ${finding.id ?? '(missing id)'} is missing ${field}.`);
        }
        if (finding.kind === 'violation' && finding.status === 'manual-review') errors.push(`Confirmed violation ${finding.id} has a manual-review status.`);
      }
    }
  }
  return errors;
}

export function safeReportSlug(value) {
  const slug = String(value ?? 'page')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || 'page';
}
