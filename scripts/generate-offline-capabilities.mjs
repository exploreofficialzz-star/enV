#!/usr/bin/env node
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { getAllTools } from "../src/lib/registry.ts";
import { isOfflineLocalToolRecord } from "../src/lib/offline/local-operation-policy.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const [billing, runtime] = await Promise.all([
  readJson("../src/data/billing-profile-index.json"),
  readJson("../src/data/billing-profile-runtime-extensions.json"),
]);
if (!Array.isArray(billing.profiles) || !Array.isArray(runtime.profiles)) {
  throw new Error("Billing or runtime extension data has an unexpected shape.");
}

// Execution inventory is authoritative for offline availability. Billing profiles are
// optional annotations: a local feature must not disappear merely because monetization
// metadata has not been added yet (for example, Zip any file and HEX Color Converter).
const runtimeTools = getAllTools();
const toolsById = new Map(runtimeTools.map((tool) => [tool.id, tool]));
const billingById = new Map([...billing.profiles, ...runtime.profiles].map((profile) => [profile.toolId, profile]));

async function readNativeLocalIds(platform) {
  const ids = new Set();
  const paths = [
    new URL(`../apps/${platform}/native-tool-coverage.txt`, import.meta.url),
    new URL(`../apps/${platform}/native-family-coverage/`, import.meta.url),
  ];
  for (const path of paths) {
    try {
      const info = await stat(path);
      const files = info.isDirectory()
        ? (await readdir(path)).filter((name) => name.endsWith(".txt")).map((name) => new URL(name, path))
        : [path];
      for (const file of files) {
        const contents = await readFile(file, "utf8");
        for (const line of contents.split(/\r?\n/)) {
          const id = line.trim();
          if (id && !id.startsWith("#")) ids.add(id);
        }
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return ids;
}

const [androidIds, iosIds] = await Promise.all([
  readNativeLocalIds("android"),
  readNativeLocalIds("ios"),
]);

const toolIds = new Set([
  ...runtimeTools.map((tool) => tool.id),
  ...androidIds,
  ...iosIds,
]);
const profiles = [];
for (const toolId of toolIds) {
  const tool = toolsById.get(toolId);
  const platforms = [];
  if (tool && isOfflineLocalToolRecord(tool)) platforms.push("web");
  if (androidIds.has(toolId)) platforms.push("android");
  if (iosIds.has(toolId)) platforms.push("ios");
  if (!platforms.length) continue;

  const billing = billingById.get(toolId);
  const hasReviewedLocalRate = Boolean(
    billing?.billingKey?.startsWith("local.") &&
    billing.pricingMode === "per-unit-hypothesis" &&
    Number.isSafeInteger(billing.provisionalSubunitsPerUnit) &&
    billing.provisionalSubunitsPerUnit > 0
  );
  profiles.push({
    toolId,
    billingKey: hasReviewedLocalRate ? billing.billingKey : null,
    subunitsPerUnit: hasReviewedLocalRate ? billing.provisionalSubunitsPerUnit : null,
    platforms,
  });
}
profiles.sort((a, b) => a.toolId.localeCompare(b.toolId));
if (new Set(profiles.map((profile) => profile.toolId)).size !== profiles.length) {
  throw new Error("Duplicate tool IDs in generated offline local capabilities.");
}
if (!profiles.length) {
  throw new Error("Offline local capability generation produced no records; refusing to overwrite existing files.");
}

const platformCounts = Object.fromEntries(
  ["web", "android", "ios"].map((platform) => [
    platform,
    profiles.filter((profile) => profile.platforms.includes(platform)).length,
  ]),
);
const output = `${JSON.stringify({
  pricingVersion: billing.pricingVersion,
  toolCount: profiles.length,
  platformCounts,
  profiles,
}, null, 2)}\n`;
await Promise.all([
  writeFile(new URL("../src/data/offline-local-capabilities.json", import.meta.url), output),
  writeFile(new URL("../apps/shared/offline-local-capabilities.json", import.meta.url), output),
]);
console.log(`Generated ${profiles.length} offline local capabilities from runtime execution coverage: ${JSON.stringify(platformCounts)}. Billing metadata is attached only where a local rate exists; missing monetization profiles never suppress local tool availability.`);
