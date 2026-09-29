/**
 * Production-readiness static audit. Intentionally dependency-free so CI can
 * run before node_modules is installed.
 */
import { readFileSync, existsSync } from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const root = new URL("../", import.meta.url);
const text = (path) => readFileSync(new URL(path, root), "utf8");
const errors = [];
const warnings = [];

const tools = parseGeneratedCatalog(text("src/data/catalog.ts"));
const ids = new Set();
const slugs = new Set();
const engineTypes = new Set([
  "calculator", "converter", "text", "generator", "codec", "color", "qr", "barcode", "image",
  "cssgen", "developer", "mime", "security", "mockup", "post", "device", "datetime", "seo",
  "creator", "business", "audio", "network", "file-converter", "document", "pdf", "ai", "video",
  "url-media", "url-media-info", "custom",
]);

for (const tool of tools) {
  if (!tool.id || ids.has(tool.id)) errors.push(`Duplicate tool id: ${tool.id || "<missing>"}`);
  ids.add(tool.id);
  if (!tool.slug || slugs.has(tool.slug)) errors.push(`Duplicate tool slug: ${tool.slug || "<missing>"}`);
  slugs.add(tool.slug);
  if (!tool.engine?.type || !engineTypes.has(tool.engine.type)) errors.push(`${tool.id}: unknown engine type`);
  if (tool.status === "active" && tool.engine?.type === "custom") {
    const supported = new Set([
      "productivity", "personal", "communication", "streaming", "marketing", "accessibility",
    ]);
    const plannedLocalCategories = new Set(["events", "celebrations", "food", "travel", "photography", "video"]);
    const explicitCustomDispatchers = new Set([
      "image-comparison-tool", "image-screenshot-tool", "image-print-layout-helper",
    ]);
    const isPlannedLocal = typeof tool.engine?.id === "string" && tool.engine.id.startsWith("planned-local:");
    if (!supported.has(tool.category) && !plannedLocalCategories.has(tool.category) && !explicitCustomDispatchers.has(tool.id) && !isPlannedLocal) {
      errors.push(`${tool.id}: active custom tool has no dispatcher category`);
    }
  }
  if (tool.status === "active" && tool.requiresBackend && tool.clientSide) {
    errors.push(`${tool.id}: active tool cannot simultaneously require a backend and claim clientSide`);
  }
}

const pkg = JSON.parse(text("package.json"));
if (pkg.engines?.node !== "22.x") errors.push("package.json: production Node engine is not pinned to 22.x");
if (!pkg.scripts?.build) errors.push("package.json: missing build script");
if (!pkg.scripts?.test) errors.push("package.json: missing test script");
if (!pkg.scripts?.lint) errors.push("package.json: missing lint script");
if (!pkg.scripts?.typecheck) errors.push("package.json: missing typecheck script");
if (!pkg.scripts?.verify) errors.push("package.json: missing verify script");
if (!existsSync(new URL(".github/workflows/production-check.yml", root))) errors.push("CI workflow .github/workflows/production-check.yml is missing");

const vercel = JSON.parse(text("vercel.json"));
if (vercel.buildCommand !== "npm run build") errors.push("vercel.json: buildCommand must remain npm run build");
if (!vercel.installCommand?.startsWith("npm ci")) errors.push("vercel.json: installCommand must use npm ci");
const headers = vercel.headers ?? [];
const headerNames = new Set(headers.flatMap((h) => (h.headers ?? []).map((x) => x.key.toLowerCase())));
for (const required of ["x-content-type-options", "referrer-policy", "x-frame-options", "strict-transport-security"]) {
  if (!headerNames.has(required)) errors.push(`vercel.json: missing security header ${required}`);
}

if (!existsSync(new URL("package-lock.json", root))) errors.push("package-lock.json is missing");
if (existsSync(new URL(".env", root))) warnings.push(".env exists in the project tree; do not ship local secrets");

const env = JSON.parse(text(".enV/app-env.json"));
if (env.VITE_AUTH_ENABLED === "false") {
  warnings.push(".enV/app-env.json disables auth locally; production must explicitly set VITE_AUTH_ENABLED=true if authentication is required");
}

if (errors.length) {
  console.error(`Production audit failed with ${errors.length} error(s).`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`Production audit passed: ${tools.length.toLocaleString()} tools, ${ids.size.toLocaleString()} unique ids.`);
for (const w of warnings) console.warn(`WARN: ${w}`);
