import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");
const registry = read("src/lib/registry.ts");
const toolEngine = read("src/components/tools/tool-engine.tsx");
const preload = read("src/lib/tool-engine-preload.ts");
const documentation = read("src/lib/tool-documentation.ts");
const enginePath = "src/components/engines/scene-studio-engine.tsx";
assert.ok(existsSync(enginePath), "Scene Studio engine module must exist");
assert.match(registry, /id:\s*["']scene-studio["']/);
assert.match(registry, /name:\s*["']Scene Studio["']/);
assert.match(registry, /category:\s*["']video["']/);
assert.match(registry, /scene-studio-tool|scene-studio/i);
assert.match(toolEngine, /tool\.id\s*===\s*["']scene-studio["']/);
assert.match(toolEngine, /SceneStudioEngine/);
assert.match(preload, /tool\.id\s*===\s*["']scene-studio["']/);
assert.ok(preload.includes(enginePath.replace(/^src\//, "@/")), "navigation preloader must resolve the same engine module");
assert.match(documentation, /id\s*===\s*["']scene-studio["']/);
const guideStart = documentation.indexOf('if (id === "scene-studio")');
const guideEnd = documentation.indexOf('if (id === "camera-studio")', guideStart);
assert.ok(guideStart >= 0 && guideEnd > guideStart, "Scene Studio must have a dedicated guide before generic engine guidance");
const guide = documentation.slice(guideStart, guideEnd);
for (const term of ["timeline", "captions", "preview", "MP4", "asset library"]) {
  assert.ok(guide.toLowerCase().includes(term.toLowerCase()), "Scene Studio guide must explain " + term);
}
console.log("PASS: Scene Studio has an active Video registry record, tool route, matching preload, editor module and dedicated practical guide.");
