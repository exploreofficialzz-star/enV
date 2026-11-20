// Turn a Search Console / Bing Webmaster query export into reviewable search-alias proposals.
//   node --experimental-strip-types --import ./scripts/register-ts-alias.mjs scripts/learn-search-aliases.mjs --input export.csv [--out audit/discovery/demand] [--min-impressions 30]
// The export MUST be page-level (Query + Page + Clicks + Impressions). Output is a proposal only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAllTools, getSearchableTools, getToolByPath } from "../src/lib/registry.ts";
import { searchTools, normalizeText } from "../src/lib/search.ts";
import { SEARCH_ALIASES } from "../src/data/search-aliases.ts";
import { DEFAULTS, learnFromDemand, parseCsv, readExport } from "./search-demand-core.mjs";

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const input = arg("--input"); if (!input) { console.error("Usage: --input <page-level query export .csv|.json>"); process.exit(2); }
const outDir = path.resolve(arg("--out") ?? fileURLToPath(new URL("../audit/discovery/demand/", import.meta.url)));
const minImpressions = Number(arg("--min-impressions") ?? DEFAULTS.minImpressions);
const text = fs.readFileSync(input, "utf8");
const rows = input.endsWith(".json") ? JSON.parse(text) : readExport(parseCsv(text));

const pool = getSearchableTools(); const active = new Map(getAllTools().filter((t) => t.status !== "planned").map((t) => [t.id, t]));
const resolvePage = (url) => {
  let p; try { p = new URL(url, "https://envtools.store").pathname.replace(/\/$/, ""); } catch { return null; }
  const guide = p.match(/^\/blog\/tool-(.+)$/); if (guide) return active.has(guide[1]) ? guide[1] : null;
  const tool = p.match(/^\/tools\/([^/]+)\/([^/]+)$/); if (tool) { const t = getToolByPath(tool[1], tool[2]); return t && active.has(t.id) ? t.id : null; }
  return null;
};
const cache = new Map();
const rankOf = (query, toolId) => { const r = cache.get(query) ?? cache.set(query, searchTools(pool, query, 10).map((t) => t.id)).get(query); return toolId === null ? r.length : r.indexOf(toolId) + 1; };
const existingPhrases = new Map();
for (const t of pool) existingPhrases.set(t.id, new Set([t.name, ...(t.keywords ?? []), ...(t.tags ?? []), ...(SEARCH_ALIASES[t.id]?.phrases ?? [])].map(normalizeText)));

const result = learnFromDemand(rows, { resolvePage, rankOf, existingPhrases }, { ...DEFAULTS, minImpressions });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "proposed-aliases.json"), JSON.stringify({ kind: "PROPOSAL_FOR_HUMAN_REVIEW", note: "Do not apply automatically. Review each phrase, then add accepted ones to src/data/search-aliases.ts with source search-console|bing-webmaster and reviewed:true.", ...result }, null, 1) + "\n");
const s = result.summary;
const md = ["# Search demand report", "", "Built from an aggregated Search Console / Bing export. It shows how people reach enV from web search, not how they use the in-app search box. Click-based relevance is noisy and unreviewed.", "",
  ...Object.entries(s).map(([k, v]) => `- ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`), "", "## Top ranking gaps (query → tool, current in-app rank)", "",
  ...result.proposedAliases.slice(0, 40).map((g) => `- "${g.query}" → \`${g.toolId}\` — ${g.impressions} impressions, ${g.clicks} clicks, current rank ${g.currentRank ?? "none"}`), ""].join("\n");
fs.writeFileSync(path.join(outDir, "DEMAND-REPORT.md"), md);
console.log(md);
