/** Audit the Communication category against the CommunicationEngine contract. */
import { readFileSync } from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const source = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const tools = parseGeneratedCatalog(source).filter((tool) => tool.category === "communication");
const expected = [
  "email", "message", "sms", "meeting", "agenda", "minutes", "signature", "invitation",
  "announcement", "thank-you", "follow-up", "reminder",
];
const actions = ["generator", "template", "builder", "planner", "formatter"];
const errors = [];

if (tools.length !== 55) errors.push(`Expected 55 Communication tools, found ${tools.length}`);
for (const tool of tools) {
  if (tool.status !== "active") errors.push(`${tool.id}: must be active`);
  if (tool.engine?.type !== "custom" || tool.engine?.id !== tool.id) errors.push(`${tool.id}: must route to CommunicationEngine with its own id`);
  const action = actions.find((candidate) => tool.id.endsWith(`-${candidate}`));
  if (!action) errors.push(`${tool.id}: unsupported action`);
  const prefix = action ? tool.id.slice(0, -(action.length + 1)) : "";
  if (!expected.includes(prefix)) errors.push(`${tool.id}: unsupported communication type ${prefix}`);
}
if (errors.length) {
  console.error(`Communication audit failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Communication audit passed: ${tools.length} tools, all active and routed to CommunicationEngine.`);
