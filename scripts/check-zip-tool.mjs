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
const iosProject = read("apps/ios/enV.xcodeproj/project.pbxproj");
const androidEngine = read("apps/android/app/src/main/java/com/chastech/env/NativeZipArchive.kt");

assert.match(registry, /id: "zip-any-file"/);
assert.match(catalog, /ZIP_ARCHIVE_META/);
assert.match(notice, /"zip-any-file"/);
assert.match(engine, /tool\.id === "zip-any-file"/);
assert.match(zipEngine, /new ZipWriter/);
assert.match(zipEngine, /compressionMethod: stored \? 0 : 8/);
assert.match(zipEngine, /uncompressedSize: file\.size/);
assert.doesNotMatch(zipEngine, /zip64: true/);
assert.match(zipEngine, /checkCrc32: true/);
assert.match(zipEngine, /showDirectoryPicker/);
assert.match(zipEngine, /MAX_EXTRACT_BYTES/);
assert.match(androidCatalog, /withZipArchive/);
assert.match(androidMain, /NativeZipArchiveScreen/);
assert.match(androidEngine, /entrySize = sourceSize/);
assert.match(androidEngine, /CompressionMethod\.STORE/);
assert.doesNotMatch(androidEngine, /zip\.finish\(\)/);
assert.match(iosCatalog, /includingZipArchive/);
assert.match(iosViews, /NativeZipArchiveScreen/);
assert.match(iosProject, /ZIPFoundation/);
assert.match(iosProject, /EXCLUDED_ARCHS\[sdk=iphonesimulator\*\] = x86_64/);

console.log("Zip any file registration and safety checks passed.");
