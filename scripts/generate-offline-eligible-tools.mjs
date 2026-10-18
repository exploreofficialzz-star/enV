#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../src/data/billing-profile-index.json", import.meta.url);
const catalogPath = new URL("../apps/shared/catalog.json", import.meta.url);
const nativeCalculatorPath = new URL("../apps/shared/native-calculators.json", import.meta.url);
const targetPaths = [
  new URL("../src/data/offline-eligible-tools.json", import.meta.url),
  new URL("../apps/shared/offline-eligible-tools.json", import.meta.url),
];
const allowedKeys = new Set(["local.calculator"]);
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const nativeCalculatorIndex = JSON.parse(await readFile(nativeCalculatorPath, "utf8"));
if (!Array.isArray(source.profiles) || !Array.isArray(catalog.tools) || !Array.isArray(nativeCalculatorIndex.tools)) {
  throw new Error("Billing, catalog, or native calculator index has an unexpected shape.");
}
const catalogById = new Map(catalog.tools.map((tool) => [tool.id, tool]));
// An ID is eligible only when the same explicit Calculate action is implemented on Web,
// Android, and iOS. This deliberately avoids charging expansion/custom calculators whose
// native execution boundary is not instrumented yet.
const nativeInstrumentedIds = new Set(nativeCalculatorIndex.tools.map((tool) => tool.id));
const profiles = source.profiles
  .filter((profile) => {
    const tool = catalogById.get(profile.toolId);
    // Offline token collection must be connected to an explicit, durable Calculate action.
    // Other engines (live converters, generators, studios, AI assists, and many custom forms)
    // are not yet wrapped at their execution boundary and must not be advertised as billable.
    return nativeInstrumentedIds.has(profile.toolId) && allowedKeys.has(profile.billingKey) && profile.pricingMode === "per-unit-hypothesis" &&
      Number.isSafeInteger(profile.provisionalSubunitsPerUnit) && profile.provisionalSubunitsPerUnit > 0 &&
      typeof profile.toolId === "string" && profile.toolId.length <= 160 &&
      tool?.engine?.type === "calculator" && typeof tool.engine.formula === "string" && tool.engine.formula.length > 0 &&
      !["mockups", "screenshots", "accessibility"].includes(tool.category) &&
      !(tool.category === "developer" && Array.isArray(tool.tags) && tool.tags.includes("developer-studio")) &&
      tool?.status === "active" && tool.clientSide === true && tool.requiresBackend === false &&
      tool.requiresAuth === false;
  })
  .map((profile) => ({
    toolId: profile.toolId,
    billingKey: profile.billingKey,
    subunitsPerUnit: profile.provisionalSubunitsPerUnit,
  }))
  .sort((a, b) => a.toolId.localeCompare(b.toolId));
const uniqueIds = new Set(profiles.map((profile) => profile.toolId));
if (uniqueIds.size !== profiles.length) throw new Error("Duplicate tool IDs in offline eligibility index.");
if (profiles.length === 0) throw new Error("The offline eligibility index would be empty; refusing to overwrite the generated file.");
const output = `${JSON.stringify({ pricingVersion: source.pricingVersion, toolCount: profiles.length, profiles }, null, 2)}\n`;
await Promise.all(targetPaths.map((path) => writeFile(path, output)));
console.log(`Generated ${profiles.length} explicitly instrumentable local calculator operations shared by Web, Android, and iOS (${source.pricingVersion}); intersects native implementation IDs ${nativeInstrumentedIds.size}. Other calculator families remain excluded until their exact execution actions are instrumented. Rates remain provisional until explicitly approved.`);
