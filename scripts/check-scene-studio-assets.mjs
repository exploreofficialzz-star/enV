// Fails the build when the Scene Studio asset manifest breaks the license gate.
// Planned packs only need a valid license and source; bundled packs also need files that match their sha256.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkManifest } from "../src/lib/scene-studio/assets.ts";

const sharedDir = new URL("../apps/shared/scene-studio/", import.meta.url).pathname;
const libraryRoot = new URL("../public/scene-studio/library/", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(sharedDir, "asset-manifest.json"), "utf8"));

const problems = checkManifest(manifest, {
  inspectFile(relativePath) {
    const full = join(libraryRoot, relativePath);
    if (!existsSync(full)) return null;
    const data = readFileSync(full);
    return { sha256: createHash("sha256").update(data).digest("hex"), bytes: statSync(full).size };
  },
});

if (problems.length) {
  console.error("Scene Studio asset manifest failed the license gate:");
  for (const p of problems) console.error(`  - ${[p.pack, p.asset].filter(Boolean).join(" / ")}: ${p.message}`);
  process.exit(1);
}
const planned = manifest.packs.filter((p) => p.status === "planned").length;
const bundled = manifest.packs.length - planned;
console.log(`Scene Studio asset manifest OK: ${bundled} bundled pack(s), ${planned} planned pack(s) (planned packs are not shipped).`);
