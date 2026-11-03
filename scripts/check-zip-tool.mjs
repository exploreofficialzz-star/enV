import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const registry = read("src/lib/registry.ts");
const catalog = read("src/lib/catalog-data.ts");
const notice = read("src/lib/production-notice.ts");
const engine = read("src/components/tools/tool-engine.tsx");
const zipEngine = read("src/components/engines/zip-archive-engine.tsx");
const androidCatalog = read("apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt");
const androidMain = read("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt");
const iosCatalog = read("apps/ios/enV/CatalogCore.swift");
const iosViews = read("apps/ios/enV/NativeZipArchiveView.swift");

assert.match(registry, /id: "zip-any-file"/);
assert.match(catalog, /ZIP_ARCHIVE_META/);
assert.match(notice, /"zip-any-file"/);
assert.match(engine, /tool\.id === "zip-any-file"/);
assert.match(zipEngine, /new ZipWriter/);
assert.match(zipEngine, /zip64: true/);
assert.match(zipEngine, /checkCrc32: true/);
assert.match(zipEngine, /showDirectoryPicker/);
assert.match(zipEngine, /MAX_EXTRACT_BYTES/);
assert.match(androidCatalog, /withZipArchive/);
assert.match(androidMain, /NativeZipArchiveScreen/);
assert.match(iosCatalog, /includingZipArchive/);
assert.match(iosViews, /NativeZipArchiveScreen/);

console.log("Zip any file registration and safety checks passed.");
