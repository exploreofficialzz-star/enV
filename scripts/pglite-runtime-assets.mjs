import { copyFile, readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const runtimeFiles = ["pglite.data", "pglite.wasm", "initdb.wasm"];

/** Keep filesystem/WASM assets beside the relocated server module that loads them. */
export async function copyPgliteRuntimeAssets(serverDir, runtimeDir = dirname(require.resolve("@electric-sql/pglite"))) {
  const consumers = new Set();
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && /\.[cm]?js$/.test(entry.name)) {
        const source = await readFile(path, "utf8");
        if (source.includes("pglite.data") && source.includes("import.meta.url")) consumers.add(directory);
      }
    }
  }
  await visit(serverDir);
  for (const directory of consumers) {
    await Promise.all(runtimeFiles.map((name) => copyFile(join(runtimeDir, name), join(directory, name))));
  }
  return [...consumers];
}
