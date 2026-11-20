// Offline search-quality evaluation against the real registry (requirements 3.4).
//   node --experimental-strip-types --import ./scripts/register-ts-alias.mjs scripts/evaluate-search-quality.mjs [--json] [--gate]
// Metrics: Precision@5, Recall@10, NDCG@10, zero-result rate. Reformulation rate, selection rate and
// time-to-correct-tool need real user telemetry and are NOT computed here.
// Judgments are a DRAFT (see queries.v1.json). Results are regression evidence, not acceptance.
import fs from "node:fs";
import { getSearchableTools } from "../src/lib/registry.ts";
import { searchTools as newSearch } from "../src/lib/search.ts";
import { searchTools as legacySearch } from "./fixtures/legacy-search-baseline.ts";

const dataset = JSON.parse(fs.readFileSync(new URL("../audit/discovery/search-eval/queries.v1.json", import.meta.url), "utf8"));
const pool = getSearchableTools();
const known = new Set(pool.map((t) => t.id));
const unknown = dataset.queries.flatMap((q) => Object.keys(q.relevant).filter((id) => !known.has(id)).map((id) => `${q.id}:${id}`));
if (unknown.length) { console.error("Dataset references IDs not in the searchable registry:", unknown.join(", ")); process.exit(2); }

const dcg = (grades) => grades.reduce((s, g, i) => s + (2 ** g - 1) / Math.log2(i + 2), 0);
function score(search) {
  const rows = dataset.queries.map((q) => {
    const results = search(pool, q.query, 10).map((t) => t.id);
    const rel = q.relevant; const relIds = Object.keys(rel);
    const top5 = results.slice(0, 5);
    const p5 = relIds.length ? top5.filter((id) => rel[id]).length / 5 : null;
    const r10 = relIds.length ? results.filter((id) => rel[id]).length / relIds.length : null;
    const ideal = dcg(Object.values(rel).sort((a, b) => b - a).slice(0, 10));
    const ndcg = relIds.length ? dcg(results.map((id) => rel[id] ?? 0)) / ideal : null;
    const top1 = relIds.length ? (rel[results[0]] === 3 ? 1 : 0) : null;
    return { id: q.id, type: q.type, query: q.query, results: results.slice(0, 5), p5, r10, ndcg, top1, zero: results.length === 0, expectEmpty: relIds.length === 0 };
  });
  const supported = rows.filter((r) => !r.expectEmpty); const unsupported = rows.filter((r) => r.expectEmpty);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  return {
    rows,
    summary: {
      queries: rows.length, supportedQueries: supported.length, unsupportedQueries: unsupported.length,
      "Precision@5": +mean(supported.map((r) => r.p5)).toFixed(3),
      "Recall@10": +mean(supported.map((r) => r.r10)).toFixed(3),
      "NDCG@10": +mean(supported.map((r) => r.ndcg)).toFixed(3),
      top1TargetRate: +mean(supported.map((r) => r.top1)).toFixed(3),
      zeroResultRateOnSupported: +mean(supported.map((r) => (r.zero ? 1 : 0))).toFixed(3),
      correctNoMatchRate: +mean(unsupported.map((r) => (r.zero ? 1 : 0))).toFixed(3),
    },
  };
}
const split = (set) => ({ queries: dataset.queries.filter((q) => (q.set ?? "tuning") === set) });
const full = dataset.queries;
function scoreSet(search, set) { const saved = dataset.queries; dataset.queries = split(set).queries; const r = score(search); dataset.queries = saved; return r; }
const legacy = score(legacySearch); const next = score(newSearch);
const heldLegacy = scoreSet(legacySearch, "held-out"); const heldNext = scoreSet(newSearch, "held-out");
if (process.argv.includes("--json")) console.log(JSON.stringify({ datasetVersion: dataset.datasetVersion, reviewStatus: dataset.reviewStatus, legacy: legacy.summary, current: next.summary, heldOut: { legacy: heldLegacy.summary, current: heldNext.summary }, rows: next.rows }, null, 1));
else {
  console.log(`Dataset ${dataset.datasetVersion} (${dataset.reviewStatus}), pool ${pool.length} searchable records\n`);
  console.table({ "all-legacy": legacy.summary, "all-current": next.summary, "HELD-OUT legacy": heldLegacy.summary, "HELD-OUT current": heldNext.summary });
  for (const r of heldNext.rows.filter((x) => (x.expectEmpty ? !x.zero : x.top1 !== 1))) console.log(`HELD-OUT MISS ${r.id} [${r.type}] "${r.query}" → ${r.results.join(", ") || "(none)"}`);
  for (const r of next.rows.filter((x) => (x.expectEmpty ? !x.zero : x.top1 !== 1))) console.log(`MISS ${r.id} [${r.type}] "${r.query}" → ${r.results.join(", ") || "(none)"}`);
}
if (process.argv.includes("--gate")) {
  const s = next.summary; const floor = { "Precision@5": 0, "NDCG@10": 0.75, top1TargetRate: 0.7, correctNoMatchRate: 1 };
  const bad = Object.entries(floor).filter(([k, v]) => s[k] < v);
  if (bad.length || s["NDCG@10"] < legacy.summary["NDCG@10"]) { console.error("Search quality gate failed:", JSON.stringify(bad)); process.exit(1); }
}
