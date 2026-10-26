import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { copyPgliteRuntimeAssets } from "./pglite-runtime-assets.mjs";

test("bundled PGLite can find every runtime asset beside its relocated module", async () => {
  const root = await mkdtemp(join(tmpdir(), "env-pglite-assets-"));
  try {
    const source = join(root, "package"), output = join(root, "output"), library = join(output, "chunks");
    await mkdir(source); await mkdir(library, { recursive: true });
    for (const name of ["pglite.data", "pglite.wasm", "initdb.wasm"]) await writeFile(join(source, name), name);
    await writeFile(join(library, "library.mjs"), 'const data = new URL("./pglite.data", import.meta.url);');
    assert.deepEqual(await copyPgliteRuntimeAssets(output, source), [library]);
    for (const name of ["pglite.data", "pglite.wasm", "initdb.wasm"]) assert.equal(await readFile(join(library, name), "utf8"), name);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a missing PGLite runtime file fails packaging instead of shipping a broken preview", async () => {
  const root = await mkdtemp(join(tmpdir(), "env-pglite-missing-"));
  try {
    await writeFile(join(root, "library.js"), 'const data = new URL("./pglite.data", import.meta.url);');
    await assert.rejects(copyPgliteRuntimeAssets(root, join(root, "missing")), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
