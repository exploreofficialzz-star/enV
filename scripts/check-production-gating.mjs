import assert from "node:assert/strict";
import fs from "node:fs";
const catalogSource = fs.readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const catalogMatch = catalogSource.match(/const catalogJson = \[([\s\S]*?)\]\.join\(""\);/);
assert.ok(catalogMatch, "catalog JSON literal is present");
const tools = JSON.parse(JSON.parse(`[${catalogMatch[1]}]`).join(""));

const expectedWebExempt = ["accessibility", "audio", "business", "calculators", "developer", "ecommerce", "qr", "video"];
const expectedNativeExempt = ["accessibility", "audio", "business", "calculators", "developer", "ecommerce", "qr", "video"];
const webPolicy = fs.readFileSync(new URL("../src/lib/production-notice.ts", import.meta.url), "utf8");
const android = fs.readFileSync(new URL("../apps/android/app/src/main/java/com/chastech/env/MainActivity.kt", import.meta.url), "utf8");
const ios = fs.readFileSync(new URL("../apps/ios/enV/CatalogCore.swift", import.meta.url), "utf8");
const webCard = fs.readFileSync(new URL("../src/components/tools/tool-card.tsx", import.meta.url), "utf8");
const webSearch = fs.readFileSync(new URL("../src/components/tools/search-box.tsx", import.meta.url), "utf8");
const webHome = fs.readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
const webToolShell = fs.readFileSync(new URL("../src/components/tools/tool-shell.tsx", import.meta.url), "utf8");
const webRoute = fs.readFileSync(new URL("../src/routes/tools/$category/$slug.tsx", import.meta.url), "utf8");
const iosCards = fs.readFileSync(new URL("../apps/ios/enV/ContentViews.swift", import.meta.url), "utf8");
const iosDestinations = fs.readFileSync(new URL("../apps/ios/enV/AssistantChat.swift", import.meta.url), "utf8");

function quotedValues(source, pattern, description) {
  const match = source.match(pattern);
  assert.ok(match, `${description}: policy declaration found`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

const webExempt = quotedValues(webPolicy, /PRODUCTION_EXEMPT_CATEGORIES\s*=\s*new Set<CategoryId>\(\[([\s\S]*?)\]\)/, "Web");
const androidExempt = quotedValues(android, /productionExemptCategories\s*=\s*setOf\(([^)]*)\)/, "Android");
const iosExempt = quotedValues(ios, /!\[([^\]]+)\]\.contains\(category\.lowercased\(\)\)/, "iOS");
assert.deepEqual(webExempt, expectedWebExempt, "Web production policy must expose the eight implemented categories");
assert.deepEqual(androidExempt, expectedNativeExempt, "Android production policy exposes the implemented QR and E-commerce categories");
assert.deepEqual(iosExempt, expectedNativeExempt, "iOS production policy exposes the implemented QR and E-commerce categories");

assert.ok(Array.isArray(tools) && tools.length > 0, "catalog tools load");
const categories = new Set(tools.map((tool) => tool.category));
for (const category of expectedWebExempt) assert.ok(categories.has(category), `catalog contains web-ready category: ${category}`);
const restricted = tools.filter((tool) => !expectedWebExempt.includes(tool.category));
assert.ok(restricted.length > 0, "catalog has tools outside the web-ready categories");
assert.ok(webCard.includes("isToolUnderProduction(tool)"), "Web cards apply production policy");
assert.ok(webSearch.includes("isToolUnderProduction(t)"), "Web search suggestions apply production policy");
assert.ok(webHome.includes("isToolUnderProduction(tool)") && webHome.includes("UnderProductionDialog"), "Web most-used shortcuts label and intercept restricted tools");
assert.ok(webToolShell.includes("isToolUnderProduction(r)") && webToolShell.includes("UnderProductionDialog"), "Web related-tool links label and intercept restricted tools");
assert.ok(webRoute.includes("if (isToolUnderProduction(tool))"), "Web direct tool URLs cannot enter restricted engines");
assert.ok(android.includes("candidate?.isUnderProduction() == true") && android.includes("AlertDialog("), "Android entry points show a native modal before opening restricted tools");
assert.ok(android.includes('Text("Under production"') && android.includes('if (tool.isUnderProduction()) Text("Under production"'), "Android card and search surfaces are labeled");
assert.ok(ios.includes("var isUnderProduction: Bool") && iosCards.includes("if tool.isUnderProduction") && iosDestinations.includes("ToolDestinationView(tool: $0)"), "iOS cards and destinations apply production policy");

console.log(`Production-gating audit PASS: ${tools.length} catalog tools scanned; Web, Android and iOS expose the same 8 implemented categories; ${restricted.length} other tools remain restricted.`);
