#!/usr/bin/env node
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { isOfflineLocalToolRecord } from "../src/lib/offline/local-operation-policy.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const [billing, runtime, catalog] = await Promise.all([
  readJson("../src/data/billing-profile-index.json"),
  readJson("../src/data/billing-profile-runtime-extensions.json"),
  readJson("../apps/shared/catalog.json"),
]);
if (!Array.isArray(billing.profiles) || !Array.isArray(runtime.profiles) || !Array.isArray(catalog.tools)) {
  throw new Error("Billing, runtime extension or catalogue data has an unexpected shape.");
}
const toolsById = new Map(catalog.tools.map((tool) => [tool.id, tool]));
for (const profile of runtime.profiles) {
  if (!toolsById.has(profile.toolId)) {
    toolsById.set(profile.toolId, {
      id: profile.toolId,
      category: profile.category,
      status: profile.toolStatus,
      clientSide: profile.clientSide,
      requiresBackend: profile.requiresBackend,
      requiresAuth: false,
      engine: { type: profile.engineType },
    });
  }
}

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

const sourceProfiles = [...billing.profiles, ...runtime.profiles];
const seen = new Set();
const profiles = [];
for (const profile of sourceProfiles) {
  if (seen.has(profile.toolId)) throw new Error(`Duplicate billing profile: ${profile.toolId}`);
  seen.add(profile.toolId);
  if (!profile.billingKey?.startsWith("local.") ||
      profile.pricingMode !== "per-unit-hypothesis" ||
      !Number.isSafeInteger(profile.provisionalSubunitsPerUnit) ||
      profile.provisionalSubunitsPerUnit <= 0) continue;

  const tool = toolsById.get(profile.toolId);
  const platforms = [];
  if (isOfflineLocalToolRecord(tool)) platforms.push("web");
  if (androidIds.has(profile.toolId)) platforms.push("android");
  if (iosIds.has(profile.toolId)) platforms.push("ios");
  if (!platforms.length) continue;

  profiles.push({
    toolId: profile.toolId,
    billingKey: profile.billingKey,
    subunitsPerUnit: profile.provisionalSubunitsPerUnit,
    platforms,
  });
}
profiles.sort((a, b) => a.toolId.localeCompare(b.toolId));
if (!profiles.length) throw new Error("Offline local capability generation produced no records; refusing to overwrite existing files.");

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
console.log(`Generated ${profiles.length} local-capability records by real platform execution coverage: ${JSON.stringify(platformCounts)}. This registry controls package/offline feature eligibility only; signed token-spend journals have their own narrower operation allowlist.`);
