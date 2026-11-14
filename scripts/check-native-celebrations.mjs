import assert from "node:assert/strict";
import fs from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const catalog = parseGeneratedCatalog(fs.readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8"));
const tools = catalog.filter((tool) => tool.category === "celebrations");
const expected = tools.map((tool) => tool.id).sort();
assert.equal(expected.length, 93, "all 93 existing Celebrations tools require native coverage");
const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
for (const platform of ["android", "ios"]) {
  const ids = read("apps/" + platform + "/native-family-coverage/celebrations.txt")
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean).sort();
  assert.deepEqual(ids, expected, platform + " must cover all 93 catalogued Celebration IDs");
}
const android = read("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt");
const androidView = read("apps/android/app/src/main/java/com/chastech/env/NativeCelebrationToolForm.kt");
const ios = read("apps/ios/enV/ToolViews.swift");
const iosView = read("apps/ios/enV/NativeCelebration.swift");
assert.match(android, /tool\.category == "celebrations" && runCatching \{ NativeCelebrationEngine\.parse\(tool\.id\) \}\.isSuccess -> NativeCelebrationToolForm\(tool\.id\)/);
assert.match(androidView, /NativeCelebrationEngine/);
assert.match(ios, /tool\.category == "celebrations" \{ if NativeCelebrationEngine\.parse\(tool\.id\) != nil \{ NativeCelebrationToolView\(tool: tool\) \} else \{ NativeUnavailableToolView\(tool: tool, backend: false\) \} \}/);
assert.match(iosView, /enum NativeCelebrationEngine/);
assert.match(iosView, /struct NativeCelebrationToolView/);
console.log("Native Celebrations check PASS: 93 IDs have independent Kotlin and Swift local implementations.");
