#!/usr/bin/env node
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { isOfflineLocalToolRecord } from "../src/lib/offline/local-operation-policy.mjs";
import { getAllTools } from "../src/lib/registry.ts";

const root = new URL("../", import.meta.url);
const billingIndex = JSON.parse(await readFile(new URL("../src/data/billing-profile-index.json", import.meta.url), "utf8"));
const runtimeIndex = JSON.parse(await readFile(new URL("../src/data/billing-profile-runtime-extensions.json", import.meta.url), "utf8"));
const catalog = JSON.parse(await readFile(new URL("../apps/shared/catalog.json", import.meta.url), "utf8"));
const runtimeTools = getAllTools();
const toolsById = new Map([...catalog.tools, ...runtimeTools].map((tool) => [tool.id, tool]));

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
        const content = await readFile(file, "utf8");
        for (const line of content.split(/\r?\n/)) {
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

const [androidLocalIds, iosLocalIds] = await Promise.all([
  readNativeLocalIds("android"),
  readNativeLocalIds("ios"),
]);
const sourceProfiles = [...(billingIndex.profiles ?? []), ...(runtimeIndex.profiles ?? [])];
const duplicateSourceIds = sourceProfiles.filter((item, index) => sourceProfiles.findIndex((other) => other.toolId === item.toolId) !== index);
if (duplicateSourceIds.length) throw new Error(`Duplicate billing profile IDs: ${duplicateSourceIds.slice(0, 10).map((item) => item.toolId).join(", ")}`);

const profiles = [];
for (const profile of sourceProfiles) {
  if (!profile.toolId || !profile.billingKey?.startsWith("local.") ||
      profile.pricingMode !== "per-unit-hypothesis" ||
      !Number.isSafeInteger(profile.provisionalSubunitsPerUnit) || profile.provisionalSubunitsPerUnit <= 0) continue;

  const tool = toolsById.get(profile.toolId);
  if (!tool || !["active", "beta"].includes(tool.status)) continue;

  const platforms = [];
  if (isOfflineLocalToolRecord(tool)) platforms.push("web");
  if (androidLocalIds.has(profile.toolId)) platforms.push("android");
  if (iosLocalIds.has(profile.toolId)) platforms.push("ios");
  if (!platforms.length) continue;

  profiles.push({
    toolId: profile.toolId,
    billingKey: profile.billingKey,
    subunitsPerUnit: profile.provisionalSubunitsPerUnit,
    platforms,
  });
}
profiles.sort((a, b) => a.toolId.localeCompare(b.toolId));
if (!profiles.length) throw new Error("Offline eligibility generation produced no local operations; refusing to overwrite existing manifests.");
if (new Set(profiles.map((item) => item.toolId)).size !== profiles.length) throw new Error("Offline eligibility contains duplicate tool IDs.");

const output = `${JSON.stringify({
  pricingVersion: billingIndex.pricingVersion,
  toolCount: profiles.length,
  platformCounts: Object.fromEntries(["web", "android", "ios"].map((platform) => [platform, profiles.filter((item) => item.platforms.includes(platform)).length])),
  profiles,
}, null, 2)}\n`;
await Promise.all([
  writeFile(new URL("../src/data/offline-eligible-tools.json", import.meta.url), output),
  writeFile(new URL("../apps/shared/offline-eligible-tools.json", import.meta.url), output),
]);
const counts = Object.fromEntries(["web", "android", "ios"].map((platform) => [platform, profiles.filter((item) => item.platforms.includes(platform)).length]));
console.log(`Generated ${profiles.length} cross-platform token allowance profiles from actual local execution coverage: ${JSON.stringify(counts)}. This is capability coverage, not proof that every engine action is already journal-instrumented; provisional rates remain disabled for production.`);
