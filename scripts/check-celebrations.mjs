import assert from "node:assert/strict";
import fs from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const catalog = parseGeneratedCatalog(fs.readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8"));
const occasions = ["birthday","anniversary","graduation","valentine","christmas","new-year","congratulations","thank-you","appreciation","farewell","achievement","party"];
const experiences = ["page-generator","interactive-card","invitation-generator","countdown","memory-page","reveal-page","quiz-generator","surprise-page"];
const expected = new Set(occasions.flatMap((occasion) => experiences.map((experience) => occasion + "-" + experience)));
const tools = catalog.filter((tool) => tool.category === "celebrations");
assert.equal(tools.length, 96, "the full 96-tool Celebrations inventory must remain catalogued");
assert.deepEqual(new Set(tools.map((tool) => tool.id)), expected, "Celebrations must retain every exact catalog ID");
for (const tool of tools) {
  assert.equal(tool.status, "active", tool.id + " must be released");
  assert.equal(tool.clientSide, true, tool.id + " must work locally");
  assert.equal(tool.requiresBackend, false, tool.id + " must not require a backend");
  assert.equal(tool.requiresAuth, false, tool.id + " must not require an account");
  assert.equal(tool.engine.type, "custom", tool.id + " must use the custom engine");
  assert.equal(tool.engine.id, tool.id, tool.id + " must dispatch by exact operation ID");
}
const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const web = read("src/components/tools/tool-engine.tsx");
const preload = read("src/lib/tool-engine-preload.ts");
assert.match(web, /CelebrationEngine toolId=\{tool\.id\}/);
assert.match(preload, /celebration-engine/);
console.log("Celebrations check PASS: 96 active exact-ID workflows, Web engine dispatch, account-free local execution.");
