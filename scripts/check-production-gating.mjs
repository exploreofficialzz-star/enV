import assert from "node:assert/strict";
import fs from "node:fs";
const catalogSource = fs.readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const catalogMatch = catalogSource.match(/const catalogJson = \[([\s\S]*?)\]\.join\(""\);/);
assert.ok(catalogMatch, "catalog JSON literal is present");
const tools = JSON.parse(JSON.parse(`[${catalogMatch[1]}]`).join(""));

const expectedExempt = ["accessibility", "audio", "business", "calculators", "developer", "video"];
const webPolicy = fs.readFileSync(new URL("../src/lib/production-notice.ts", import.meta.url), "utf8");
const android = fs.readFileSync(new URL("../apps/android/app/src/main/java/com/chastech/env/MainActivity.kt", import.meta.url), "utf8");
const ios = fs.readFileSync(new URL("../apps/ios/enV/CatalogCore.swift", import.meta.url), "utf8");
const webCard = fs.readFileSync(new URL("../src/components/tools/tool-card.tsx", import.meta.url), "utf8");
const webSearch = fs.readFileSync(new URL("../src/components/tools/search-box.tsx", import.meta.url), "utf8");
const webHome = fs.readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
const webNotice = fs.readFileSync(new URL("../src/components/tools/under-production.tsx", import.meta.url), "utf8");
const webToolShell = fs.readFileSync(new URL("../src/components/tools/tool-shell.tsx", import.meta.url), "utf8");
const webRoute = fs.readFileSync(new URL("../src/routes/tools/$category/$slug.tsx", import.meta.url), "utf8");
const iosCards = fs.readFileSync(new URL("../apps/ios/enV/ContentViews.swift", import.meta.url), "utf8");
const iosDestinations = fs.readFileSync(new URL("../apps/ios/enV/AssistantChat.swift", import.meta.url), "utf8");
const iosToolViews = fs.readFileSync(new URL("../apps/ios/enV/ToolViews.swift", import.meta.url), "utf8");

function quotedValues(source, pattern, description) {
  const match = source.match(pattern);
  assert.ok(match, `${description}: policy declaration found`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

const webExempt = quotedValues(webPolicy, /PRODUCTION_EXEMPT_CATEGORIES\s*=\s*new Set<CategoryId>\(\[([\s\S]*?)\]\)/, "Web");
const androidExempt = quotedValues(android, /productionExemptCategories\s*=\s*setOf\(([^)]*)\)/, "Android");
const iosExempt = quotedValues(ios, /!\[([^\]]+)\]\.contains\(category\.lowercased\(\)\)/, "iOS");
for (const [platform, actual] of [["Web", webExempt], ["Android", androidExempt], ["iOS", iosExempt]]) {
  assert.deepEqual(actual, expectedExempt, `${platform} exempt categories must exactly match the requested six categories`);
}

assert.ok(Array.isArray(tools) && tools.length > 0, "catalog tools load");
const categories = new Set(tools.map((tool) => tool.category));
for (const category of expectedExempt) assert.ok(categories.has(category), `catalog contains exempt category: ${category}`);
const restricted = tools.filter((tool) => !expectedExempt.includes(tool.category));
assert.ok(restricted.length > 0, "catalog has tools outside the exempt categories");
assert.ok(webCard.includes("isToolUnderProduction(tool)"), "Web cards apply production policy");
assert.ok(webSearch.includes("isToolUnderProduction(t)"), "Web search suggestions apply production policy");
assert.ok(webHome.includes("isToolUnderProduction(tool)") && webHome.includes("UnderProductionDialog"), "Web most-used shortcuts label and intercept restricted tools");
assert.ok(webToolShell.includes("isToolUnderProduction(r)") && webToolShell.includes("UnderProductionDialog"), "Web related-tool links label and intercept restricted tools");
assert.ok(webRoute.includes("if (isToolUnderProduction(tool))"), "Web direct tool URLs cannot enter restricted engines");
assert.ok(webNotice.includes('@radix-ui/react-dialog') && webNotice.includes("<Dialog.Title") && webNotice.includes("<Dialog.Description"), "Web notices use an accessible dialog primitive with a title and description");
assert.ok(android.includes("candidate?.isUnderProduction() == true") && android.includes("AlertDialog("), "Android entry points show a native modal before opening restricted tools");
assert.ok(android.includes('Text("Under production"') && android.includes('if (tool.isUnderProduction()) Text("Under production"'), "Android card and search surfaces are labeled");
assert.ok(android.includes("if (selected != null && !selected.isUnderProduction())") && /LaunchedEffect\(selected\?\.id\)[\s\S]*?if \(selected\?\.isUnderProduction\(\) == true\)[\s\S]*?detailStack = detailStack\.dropLast\(1\)/.test(android), "Android blocks both fresh and restored restricted detail-stack entries");
assert.ok(ios.includes("var isUnderProduction: Bool") && iosCards.includes("if tool.isUnderProduction") && iosDestinations.includes("ToolDestinationView(tool: $0)") && /struct ToolDestinationView: View[\s\S]*?if tool\.isUnderProduction\s*\{\s*UnderProductionDestinationView\(tool: tool\)/.test(iosToolViews), "iOS cards and actual destinations apply production policy");

console.log(`Production-gating audit PASS: ${tools.length} catalog tools scanned; ${restricted.length} tools restricted; six exempt categories match on Web, Android, and iOS.`);
