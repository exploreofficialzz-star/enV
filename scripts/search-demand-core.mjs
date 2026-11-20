// Search-demand learning core (pure, no registry import; fixture-testable).
//
// Input is AGGREGATED query data exported from the owner's Google Search Console / Bing Webmaster
// accounts (query, landing page, clicks, impressions, position). Those engines already anonymize
// rare queries. Nothing here reads in-product search terms: the Privacy page states analytics events
// contain no search terms, so in-product logging would need a policy change and owner approval.
//
// Output is a PROPOSAL for human review. Nothing is applied automatically, and these numbers measure
// how people reach enV from web search, not how they use enV's internal search box.

export const DEFAULTS = Object.freeze({ minImpressions: 30, maxQueryTokens: 10, maxQueryLength: 80, topRankOk: 3, ambiguityRatio: 0.6 });

const BRAND = /\b(envtools|env tools|env tool|envtools store|chas ?tech)\b/;

export function normalizeQuery(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9%+#\s]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Returns { query } or { dropped: reason }. Drops anything that could identify a person or leak a secret. */
export function sanitizeQuery(raw, opts = DEFAULTS) {
  const original = String(raw ?? "");
  if (/@/.test(original)) return { dropped: "email-like" };
  if (/https?:|www\.|\b[a-z0-9-]+\.(com|net|org|io|app|co|store|dev)\b/i.test(original)) return { dropped: "url-like" };
  const digits = (original.match(/\d/g) ?? []).length;
  if (digits >= 7) return { dropped: "long-digit-sequence" };
  if (/\b[A-Za-z0-9+/_-]{24,}\b/.test(original)) return { dropped: "token-like" };
  const query = normalizeQuery(original);
  if (!query) return { dropped: "empty" };
  if (query.length > opts.maxQueryLength || query.split(" ").length > opts.maxQueryTokens) return { dropped: "too-long" };
  if (BRAND.test(query)) return { dropped: "brand-query" };
  return { query };
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; } else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i += 1; row.push(field); field = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((x) => x !== "")) rows.push(row); }
  return rows;
}

const HEADER = { query: ["query", "top queries", "search query", "keyword"], page: ["page", "top pages", "url", "landing page", "page url"], clicks: ["clicks"], impressions: ["impressions"], position: ["position", "avg. position", "average position", "avg position"] };
/** Map a CSV/JSON export to [{query,page,clicks,impressions,position}] by header name (case-insensitive). */
export function readExport(rows) {
  const [head, ...body] = rows; const index = {};
  head.forEach((h, i) => { const k = h.trim().toLowerCase(); for (const [field, names] of Object.entries(HEADER)) if (names.includes(k) && index[field] === undefined) index[field] = i; });
  const missing = ["query", "page", "impressions"].filter((f) => index[f] === undefined);
  if (missing.length) throw new Error(`Export is missing required column(s): ${missing.join(", ")}. A page-level query export (Query + Page + Clicks + Impressions) is required.`);
  const num = (v) => { const n = Number(String(v ?? "").replace(/[,%\s]/g, "")); return Number.isFinite(n) ? n : 0; };
  return body.map((r) => ({ query: r[index.query], page: r[index.page], clicks: index.clicks === undefined ? 0 : num(r[index.clicks]), impressions: num(r[index.impressions]), position: index.position === undefined ? null : num(r[index.position]) }));
}

/**
 * @param rows normalized export rows
 * @param ctx.resolvePage (url) => toolId|null   ctx.rankOf (query, toolId) => 1-based rank or 0 if absent
 * @param ctx.existingPhrases Map<toolId, Set<string>> phrases already covered (names, keywords, aliases)
 */
export function learnFromDemand(rows, ctx, opts = DEFAULTS) {
  const dropped = {}; const bump = (k) => { dropped[k] = (dropped[k] ?? 0) + 1; };
  const agg = new Map(); let unmapped = 0; let kept = 0;
  for (const row of rows) {
    const s = sanitizeQuery(row.query, opts);
    if (s.dropped) { bump(s.dropped); continue; }
    const toolId = ctx.resolvePage(row.page);
    if (!toolId) { unmapped += 1; const key = `\u0000${s.query}`; const a = agg.get(key) ?? { query: s.query, toolId: null, impressions: 0, clicks: 0, posW: 0 }; a.impressions += row.impressions; a.clicks += row.clicks; a.posW += (row.position ?? 0) * row.impressions; agg.set(key, a); continue; }
    kept += 1;
    const key = `${toolId}\u0000${s.query}`; const a = agg.get(key) ?? { query: s.query, toolId, impressions: 0, clicks: 0, posW: 0 };
    a.impressions += row.impressions; a.clicks += row.clicks; a.posW += (row.position ?? 0) * row.impressions; agg.set(key, a);
  }
  const all = [...agg.values()].sort((a, b) => a.query.localeCompare(b.query) || String(a.toolId).localeCompare(String(b.toolId))).filter((a) => a.impressions >= opts.minImpressions).map((a) => ({ ...a, position: a.impressions ? Number((a.posW / a.impressions).toFixed(1)) : null }));
  const mapped = all.filter((a) => a.toolId);
  const byQuery = new Map(); for (const a of mapped) (byQuery.get(a.query) ?? byQuery.set(a.query, []).get(a.query)).push(a);

  const ok = []; const gaps = []; const ambiguous = []; const covered = [];
  for (const [query, list] of [...byQuery.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    list.sort((x, y) => y.clicks - x.clicks || y.impressions - x.impressions || x.toolId.localeCompare(y.toolId));
    if (list.length > 1 && list[1].clicks >= opts.ambiguityRatio * Math.max(1, list[0].clicks) && list[0].clicks > 0) { ambiguous.push({ query, tools: list.map((x) => ({ toolId: x.toolId, clicks: x.clicks, impressions: x.impressions })) }); continue; }
    const top = list[0]; const rank = ctx.rankOf(query, top.toolId);
    if (rank >= 1 && rank <= opts.topRankOk) { ok.push({ query, toolId: top.toolId, rank, impressions: top.impressions, clicks: top.clicks }); continue; }
    const known = ctx.existingPhrases.get(top.toolId);
    if (known?.has(query)) { covered.push({ query, toolId: top.toolId, rank, impressions: top.impressions }); continue; }
    gaps.push({ query, toolId: top.toolId, currentRank: rank || null, impressions: top.impressions, clicks: top.clicks, position: top.position, source: "measured-demand", reviewed: false });
  }
  gaps.sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query));
  const unmet = all.filter((a) => !a.toolId && ctx.rankOf(a.query, null) === 0).sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query)).slice(0, 200)
    .map((a) => ({ query: a.query, impressions: a.impressions, clicks: a.clicks, position: a.position, note: "Landing page is not a tool page and enV search finds no tool. Demand lead only; not evidence a tool should exist." }));
  const judgments = mapped.filter((a) => a.clicks > 0).sort((a, b) => b.clicks - a.clicks || a.query.localeCompare(b.query) || a.toolId.localeCompare(b.toolId)).map((a) => ({ query: a.query, relevant: { [a.toolId]: 3 }, evidence: { clicks: a.clicks, impressions: a.impressions }, reviewStatus: "BEHAVIORAL_NOT_HUMAN_REVIEWED" }));
  return {
    summary: { inputRows: rows.length, droppedRows: dropped, keptMappedRows: kept, unmappedRows: unmapped, queriesAboveThreshold: all.length, rankedOk: ok.length, alreadyCovered: covered.length, rankingGaps: gaps.length, ambiguousQueries: ambiguous.length, unmetIntentLeads: unmet.length, minImpressions: opts.minImpressions },
    proposedAliases: gaps, ambiguous, unmet, behavioralJudgments: judgments,
  };
}
