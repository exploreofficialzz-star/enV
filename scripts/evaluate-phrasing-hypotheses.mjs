// Ranks accepted tools for plausible phrasings (NOT measured demand). Regression evidence only.
import fs from "node:fs";
import { getSearchableTools } from "../src/lib/registry.ts";
import { searchTools } from "../src/lib/search.ts";
import { searchTools as legacy } from "./fixtures/legacy-search-baseline.ts";
const d = JSON.parse(fs.readFileSync(new URL("../audit/discovery/demand/phrasing-hypotheses.v1.json", import.meta.url), "utf8"));
const pool = getSearchableTools(); const known = new Set(pool.map((t) => t.id));
const unknown = d.cases.flatMap(([q, ids]) => ids.filter((i) => !known.has(i)).map((i) => `${q}:${i}`));
if (unknown.length) { console.error("Unknown IDs:", unknown.join(", ")); process.exit(2); }
const run = (fn) => { let top1 = 0, top3 = 0, found = 0; const bad = [];
  for (const [q, ids] of d.cases) { const r = fn(pool, q, 10).map((t) => t.id); const i = r.findIndex((x) => ids.includes(x));
    if (i === 0) top1++; if (i >= 0 && i < 3) top3++; if (i >= 0) found++; else bad.push(`${q} → ${ids[0]} (top: ${r.slice(0, 3).join(", ") || "none"})`); }
  return { cases: d.cases.length, top1, top3, found, noResultForIntent: d.cases.length - found, bad }; };
const a = run(legacy), b = run(searchTools);
console.log("legacy ", { ...a, bad: undefined }); console.log("current", { ...b, bad: undefined });
if (b.bad.length) console.log("Still missing:\n" + b.bad.join("\n"));
if (process.argv.includes("--gate") && (b.top1 / b.cases < 0.9 || b.found / b.cases < 0.97)) { console.error("Phrasing gate failed"); process.exit(1); }
