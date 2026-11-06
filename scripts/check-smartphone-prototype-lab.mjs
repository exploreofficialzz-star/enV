import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const registry = read("src/lib/registry.ts");
const router = read("src/components/tools/tool-engine.tsx");
const preload = read("src/lib/tool-engine-preload.ts");
const engine = read("src/components/engines/smartphone-prototype-lab-engine.tsx");
const html = read("public/labs/smartphone-prototype-lab/index.html");
const css = read("public/labs/smartphone-prototype-lab/styles.css");
const loader = read("public/labs/smartphone-prototype-lab/app-loader.js");
const encoded = Array.from({ length: 10 }, (_, i) => read(`public/labs/smartphone-prototype-lab/app-bundle.${String(i + 1).padStart(2, "0")}.txt`)).join("");
assert.equal(encoded.length, 24600, "compressed scene bundle parts must be complete");
const appBundle = gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");

assert.match(registry, /id: "smartphone-prototype-lab"/);
assert.match(registry, /name: "Smartphone Prototype Lab"/);
assert.match(registry, /category: "design"/);
assert.match(router, /if \(tool\.id === "smartphone-prototype-lab"\) return <SmartphonePrototypeLabEngine \/>/);
assert.match(preload, /smartphone-prototype-lab-engine/);
assert.match(engine, /\/labs\/smartphone-prototype-lab\/index\.html\?embedded=1/);
assert.match(engine, /allowFullScreen/);
assert.match(html, /Smartphone Prototype Lab \| enV/);
assert.match(html, /babylonjs\.com\/babylon\.js/);
assert.match(html, /app-loader\.js/);
assert.match(css, /\.embedded \.topbar,\.embedded \.footer\{display:none\}/);
assert.match(loader, /DecompressionStream\("gzip"\)/);
assert.match(appBundle, /BABYLON\.Engine/);
assert.match(appBundle, /Factory build/);
assert.doesNotMatch(registry + html + css + appBundle, /Samsung Galaxy|Galaxy S26|Samsung-specific/i);

console.log("Smartphone Prototype Lab integration checks passed: registry, route, preload, embedded scene and compressed Babylon bundle.");
