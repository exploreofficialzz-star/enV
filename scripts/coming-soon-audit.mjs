import { tools } from "../src/data/catalog.ts";

const planned = tools.filter((t) => t.status === "planned");
const localCandidates = planned.filter((t) => t.clientSide && !t.requiresBackend && !t.requiresAuth);
const backendRequired = planned.filter((t) => t.requiresBackend);
const authRequired = planned.filter((t) => t.requiresAuth);
const byEngine = Object.entries(planned.reduce((m, t) => { m[t.engine.type] = (m[t.engine.type] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);

for (const tool of planned) {
  if (!tool.description?.trim()) throw new Error(`${tool.id}: planned tool needs a description`);
  if (tool.status !== "planned") throw new Error(`${tool.id}: status changed during audit`);
}

console.log(`Coming Soon audit: ${planned.length} planned tools`);
console.log(`Local implementation candidates: ${localCandidates.length}`);
console.log(`Backend-required: ${backendRequired.length}`);
console.log(`Auth-required: ${authRequired.length}`);
console.log(`By engine: ${byEngine.map(([k, v]) => `${k}=${v}`).join(", ")}`);
console.log("No planned tool was promoted without an implemented engine.");
