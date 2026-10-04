// Node module-customization hooks that let plain `node --experimental-strip-types`
// load app source that uses the "@/" alias, extensionless relative imports and
// JSON imports. Test/audit tooling only; the app itself is built by Vite.
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSIONS = [".ts", ".mts", ".js", ".mjs", ".json"];

function isFile(p) {
  return existsSync(p) && statSync(p).isFile();
}

function tryResolve(base) {
  if (isFile(base)) return base;
  for (const ext of EXTENSIONS) if (isFile(base + ext)) return base + ext;
  for (const ext of EXTENSIONS) {
    const indexPath = path.join(base, `index${ext}`);
    if (isFile(indexPath)) return indexPath;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let base = null;
  if (specifier.startsWith("@/")) {
    base = path.join(root, "src", specifier.slice(2));
  } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (base) {
    const found = tryResolve(base);
    if (found) return nextResolve(pathToFileURL(found).href, context);
  }
  return nextResolve(specifier, context);
}

// JSON modules normally need `with { type: "json" }`; the bundler does not.
export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.endsWith(".json")) {
    const source = `export default ${readFileSync(fileURLToPath(url), "utf8")};`;
    return { format: "module", source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
