import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const catalogSource = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const tools = parseGeneratedCatalog(catalogSource);
const version = createHash("sha256").update(catalogSource).digest("hex").slice(0, 12);
const activeTools = tools.filter((tool) => tool.status === "active" || tool.status === "beta");
const byPopularity = (a, b) => b.popularity - a.popularity;
const selectHomeSummary = (items, limit) =>
  items.slice(0, limit).map(({ id, name, description, category, slug }) => ({
    id,
    name,
    description,
    category,
    slug,
  }));

const homeTools = {
  version,
  counts: {
    active: activeTools.length,
    planned: tools.length - activeTools.length,
    total: tools.length,
  },
  featured: selectHomeSummary(activeTools.filter((tool) => tool.featured).sort(byPopularity), 8),
  popular: selectHomeSummary([...activeTools].sort(byPopularity), 12),
};
writeFileSync(
  new URL("../src/data/home-tools.json", import.meta.url),
  `${JSON.stringify(homeTools, null, 2)}\n`,
);

const shardSize = 250;
const shardCount = Math.ceil(tools.length / shardSize);
const shardDigits = Math.max(2, String(shardCount - 1).length);
const index = [];
const searchIndex = [];
const shardRecords = [];
for (let offset = 0; offset < tools.length; offset += shardSize) {
  const shard = String(Math.floor(offset / shardSize)).padStart(shardDigits, "0");
  const records = tools.slice(offset, offset + shardSize);
  shardRecords.push([shard, records]);
  for (const tool of records) {
    index.push({
      id: tool.id,
      name: tool.name,
      slug: tool.slug,
      description: tool.description,
      category: tool.category,
      icon: tool.icon,
      popularity: tool.popularity,
      featured: tool.featured,
      clientSide: tool.clientSide,
      status: tool.status,
      ...(tool.isNew ? { isNew: true } : {}),
      detailShard: shard,
    });
    searchIndex.push({
      id: tool.id,
      name: tool.name,
      slug: tool.slug,
      description: tool.description,
      category: tool.category,
      ...(tool.subcategory ? { subcategory: tool.subcategory } : {}),
      keywords: tool.keywords,
      tags: tool.tags,
      icon: tool.icon,
      popularity: tool.popularity,
      clientSide: tool.clientSide,
      status: tool.status,
    });
  }
}

const runtimeRoot = new URL("../public/catalog-runtime/", import.meta.url);
rmSync(runtimeRoot, { recursive: true, force: true });
const versionRoot = new URL(`../public/catalog-runtime/${version}/`, import.meta.url);
const detailsRoot = new URL(`../public/catalog-runtime/${version}/details/`, import.meta.url);
mkdirSync(detailsRoot, { recursive: true });
const writeRuntimeJson = (url, value) => {
  const json = JSON.stringify(value);
  writeFileSync(url, json);
  writeFileSync(new URL(`${url.href}.gz`), gzipSync(json, { level: 9, mtime: 0 }));
};
writeRuntimeJson(new URL("index.json", versionRoot), index);
writeRuntimeJson(new URL("search.json", versionRoot), searchIndex);
for (const [shard, records] of shardRecords) {
  writeRuntimeJson(new URL(`${shard}.json`, detailsRoot), records);
}
console.log(
  `Generated catalog v${version}: ${index.length} compact entries, ${searchIndex.length} search entries, ${shardRecords.length} detail shards of up to ${shardSize} records.`,
);
