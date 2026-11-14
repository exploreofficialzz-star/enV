import assert from "node:assert/strict";
import fs from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const catalog = parseGeneratedCatalog(fs.readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8"));
const occasions = ["birthday","anniversary","graduation","valentine","christmas","new-year","congratulations","thank-you","appreciation","farewell","achievement","party"];
const experiences = ["page-generator","interactive-card","invitation-generator","countdown","memory-page","reveal-page","quiz-generator","surprise-page"];
const expected = new Set(occasions.flatMap((occasion) => experiences.map((experience) => occasion + "-" + experience))
  .filter((id) => !["birthday-countdown", "valentine-reveal-page", "appreciation-reveal-page"].includes(id)));
const tools = catalog.filter((tool) => tool.category === "celebrations");
assert.equal(tools.length, 93, "all 93 catalogued Celebrations tools must remain present");
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
console.log("Celebrations check PASS: 93 active exact-ID workflows, Web engine dispatch, account-free local execution.");

const categorySource = read("src/data/categories.ts");
assert.match(categorySource, /id: "celebrations", name: "Celebrations", description: "Birthday, anniversary, graduation, appreciation, and celebration generators\."/);
const allToolsPage = read("src/routes/tools/index.tsx");
assert.match(allToolsPage, /category\.id === "celebrations" \? category\.description : category\.blurb/,
  "the All tools directory must show the full Celebrations category description");
const categoryTiles = read("src/components/tools/category-card.tsx");
assert.match(categoryTiles, /category\.id === "celebrations" \? category\.description : category\.blurb/,
  "category chooser cards must show the full Celebrations category description");
const categoryPage = read("src/routes/tools/\$category/index.tsx");
assert.match(categoryPage, /meta\?\.description/,
  "the Celebrations category route must render its full category description");
const android = read("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt");
assert.match(android, /groupCategory\.id == "celebrations"\) groupCategory\.description/,
  "Android All tools groups must show the full Celebrations category description");
assert.match(android, /category\.id == "celebrations"\) category\.description/,
  "Android category chooser must show the full Celebrations category description");
const ios = read("apps/ios/enV/ContentViews.swift");
assert.match(ios, /group\.category\.id == "celebrations" \? group\.category\.description/,
  "iOS All tools groups must show the full Celebrations category description");
const cards = read("src/components/tools/tool-card.tsx");
assert.match(cards, /tool\.category !== "celebrations".*offlineAwareToolDescription/,
  "Celebrations descriptions must remain hidden only inside tool cards");
console.log("Celebrations category description check PASS: full category description is shown in All tools and category directories on Web, Android, and iOS; card descriptions remain hidden.");
