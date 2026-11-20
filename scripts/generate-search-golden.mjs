// Golden ranked results for native search parity (requirements §3, §7).
//   npm run discovery:search-golden | ... --check
// Android/iOS ports of src/lib/search.ts must return the same top-10 IDs, in order, for these queries
// over the same active catalogue. The Web scorer is the reference implementation.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { getSearchableTools } from "../src/lib/registry.ts";
import { searchToolResults } from "../src/lib/search.ts";

const root = new URL("../audit/discovery/search-eval/", import.meta.url);
const dataset = JSON.parse(fs.readFileSync(new URL("queries.v1.json", root), "utf8"));
const pool = getSearchableTools();
const extra = ["", "pdf", "calculator", "qr", "converter", "image to pdf", "free online json tool", "Résumé", "c++", "100%"];
const queries = [...new Set([...dataset.queries.map((q) => q.query), ...extra])];
const golden = {
  schemaVersion: 1,
  referenceImplementation: "src/lib/search.ts searchToolResults(getSearchableTools(), query, 10)",
  poolSize: pool.length,
  note: "Order is part of the contract. includePlanned defaults to true; planned tools sort after active ones.",
  cases: queries.map((query) => {
    const r = searchToolResults(pool, query, 10);
    return { query, matchCount: r.matchCount, top10: r.tools.map((t) => t.id) };
  }),
};
const text = JSON.stringify({ ...golden, cases: "__C__" }, null, 1).replace('"__C__"', "[\n" + golden.cases.map((c) => " " + JSON.stringify(c)).join(",\n") + "\n ]") + "\n";
const file = fileURLToPath(new URL("native-golden.v1.json", root));
if (process.argv.includes("--check")) {
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) { console.error("STALE: native-golden.v1.json (search behaviour or catalogue changed). Run npm run discovery:search-golden and review the diff."); process.exit(1); }
  console.log(`Search golden OK (${golden.cases.length} cases).`);
} else { fs.writeFileSync(file, text); console.log(`Wrote native-golden.v1.json (${golden.cases.length} cases).`); }
