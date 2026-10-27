#!/usr/bin/env node
/** Refresh pinned, first-party-served OCR worker/model assets after npm ci. */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const versions = { "tesseract.js": "7.0.0", "tesseract.js-core": "7.0.0", "@tesseract.js-data/eng": "1.0.0" };
for (const [name, expected] of Object.entries(versions)) {
  const installed = JSON.parse(await readFile(resolve(root, "node_modules", name, "package.json"), "utf8"));
  if (installed.version !== expected) throw new Error(`${name} must be pinned to ${expected} before OCR assets are refreshed.`);
}
const files = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["tesseract.js/dist/worker.min.js.LICENSE.txt", "worker.min.js.LICENSE.txt"],
  ["tesseract.js/LICENSE.md", "LICENSE-tesseract.txt"],
  ["tesseract.js-core/LICENSE", "LICENSE-core.txt"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "core/tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "core/tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "lang/eng.traineddata.gz"],
];
const manifest = { versions, language: "eng", model: "4.0.0_best_int", assets: [] };
for (const [source, destination] of files) {
  const target = resolve(root, "public/uxui/ocr", destination);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, "node_modules", source), target);
  const bytes = await readFile(target);
  manifest.assets.push({ path: destination, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
await writeFile(resolve(root, "public/uxui/ocr/manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Vendored ${manifest.assets.length} pinned OCR assets; runtime OCR requests remain on the application's own origin.`);
