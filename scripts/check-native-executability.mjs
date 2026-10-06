import fs from "node:fs";
const m = JSON.parse(fs.readFileSync(new URL("../apps/shared/native-execution-matrix.json", import.meta.url), "utf8"));
const active = m.tools.filter((tool) => tool.status === "active" || tool.status === "beta");
const divergent = active.filter((tool) => tool.android !== tool.ios);
const invalid = active.filter((tool) => tool.android === "missing" || tool.ios === "missing");
if (invalid.length || divergent.length) throw new Error(`Native execution audit failed: missing=${invalid.length} divergent=${divergent.length}`);
console.log(`Native execution audit: ${m.stats.fullyExecutable}/${m.stats.active} active catalog records have native/backend paths on both platforms; ${m.stats.webOnly} active records are explicitly Web-only on both native products. Planned records are excluded.`);
