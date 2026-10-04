#!/usr/bin/env node
/**
 * Static audit of the AI platform. Dependency-free; run with:
 *   node --experimental-strip-types scripts/check-ai.mjs     (npm run check:ai)
 *
 * Fails (exit 1) when:
 *  - browser code imports server AI code, Node built-ins, provider SDKs or provider hosts;
 *  - a provider API host or key name appears outside src/lib/ai/server (and its tests/docs);
 *  - a secret-looking name carries the public VITE_ prefix anywhere in tracked config/source;
 *  - AI code persists to web storage, evals, or renders HTML from model output;
 *  - the task, model or feature registries are inconsistent with each other or the catalog;
 *  - the AI environment variables are not documented in .env.example and docs/ai-infrastructure.md;
 *  - the AI tests are not part of `npm test`, or this audit is not part of `npm run verify`.
 * Warnings (never fail) describe the current environment, e.g. no provider configured.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const warnings = [];
const fail = (message) => failures.push(message);
const rel = (file) => relative(root, file).split(sep).join("/");

function walk(dir, accept) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist" || name === ".output") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, accept));
    else if (accept(full)) out.push(full);
  }
  return out;
}

const isSource = (f) => /\.(ts|tsx|mjs|js)$/.test(f);
const isTest = (f) => /\.test\.(ts|tsx|mjs)$/.test(f);
const SERVER_DIR = join(root, "src", "lib", "ai", "server") + sep;
const PROVIDERS_DIR = join(SERVER_DIR, "providers") + sep;

const srcFiles = walk(join(root, "src"), isSource).filter((f) => f !== join(root, "src", "data", "catalog.ts"));
const serverRouteFiles = walk(join(root, "server"), isSource);

function read(file) {
  return readFileSync(file, "utf8");
}

function specifiersOf(text) {
  const found = [];
  const patterns = [/\bimport\s+(?:type\s+)?(?:[\w*${}\s,]+?\s+from\s+)?["']([^"']+)["']/g, /\bexport\s+(?:type\s+)?[\w*${}\s,]*\s+from\s+["']([^"']+)["']/g, /\bimport\(\s*["']([^"']+)["']\s*\)/g];
  for (const pattern of patterns) for (const m of text.matchAll(pattern)) found.push(m[1]);
  return found;
}

function resolveSpecifier(from, specifier) {
  if (specifier.startsWith("@/")) return join(root, "src", specifier.slice(2));
  if (specifier.startsWith(".")) return resolve(dirname(from), specifier);
  return null;
}

const NODE_BUILTINS = new Set(["fs", "path", "crypto", "os", "child_process", "util", "stream", "http", "https", "net", "zlib", "buffer", "url", "vm", "worker_threads"]);
const PROVIDER_SDKS = [/^openai($|\/)/, /^@anthropic-ai\//, /^@google\/(generative-ai|genai)/, /^groq-sdk/, /^@openrouter\//, /^ai($|\/)/, /^@ai-sdk\//, /^@huggingface\//, /^cohere-ai/, /^@mistralai\//];
const PROVIDER_HOSTS = /(api\.groq\.com|openrouter\.ai|generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|api-inference\.huggingface\.co|router\.huggingface\.co|api\.cohere\.(ai|com)|api\.mistral\.ai)/;
const SECRET_NAMES = ["OPENROUTER_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY", "GOOGLE_AI_API_KEY", "HF_TOKEN", "AI_ADMIN_TOKEN", "AI_SESSION_SECRET"];

// ------------------------------------------------------------------ 1. client/server boundary
const browserFiles = srcFiles.filter((f) => {
  if (isTest(f) || f.startsWith(SERVER_DIR)) return false;
  const p = rel(f);
  return p.startsWith("src/components/") || p.startsWith("src/routes/") || p.startsWith("src/hooks/") || p.startsWith("src/lib/ai/client/") || /^src\/lib\/ai\/[^/]+\.ts$/.test(p);
});

for (const file of browserFiles) {
  const text = read(file);
  for (const specifier of specifiersOf(text)) {
    const target = resolveSpecifier(file, specifier);
    if (target && (target + sep).startsWith(SERVER_DIR)) fail(`${rel(file)} imports server-only AI code (${specifier})`);
    if (target && rel(target).startsWith("server/")) fail(`${rel(file)} imports a server route (${specifier})`);
    if (specifier.startsWith("node:") || NODE_BUILTINS.has(specifier)) fail(`${rel(file)} imports a Node built-in in browser code (${specifier})`);
    if (PROVIDER_SDKS.some((re) => re.test(specifier))) fail(`${rel(file)} imports a provider SDK (${specifier})`);
  }
}

// AI code stays independent of app modules that rely on Vite-only features or databases.
for (const file of srcFiles.filter((f) => rel(f).startsWith("src/lib/ai/") && !isTest(f))) {
  for (const specifier of specifiersOf(read(file))) {
    const target = resolveSpecifier(file, specifier);
    if (target && /^src\/lib\/(auth|db)(\/|\.|$)/.test(rel(target))) fail(`${rel(file)} imports ${specifier}; AI server code must not depend on auth/db modules (resolve sessions over HTTP instead)`);
  }
}

// ------------------------------------------------------------------ 2. provider hosts, keys and SDKs stay on the server
const everySource = [...srcFiles, ...serverRouteFiles];
for (const file of everySource) {
  const p = rel(file);
  const inProviders = file.startsWith(PROVIDERS_DIR);
  const text = read(file);
  if (!inProviders && !isTest(file) && PROVIDER_HOSTS.test(text)) fail(`${p} mentions a provider API host; only src/lib/ai/server/providers may`);
  if (!file.startsWith(SERVER_DIR) && !isTest(file)) {
    for (const name of SECRET_NAMES) if (text.includes(name)) fail(`${p} references secret ${name}; secrets are read only by src/lib/ai/server/config.ts`);
  }
  if (!inProviders && !isTest(file)) {
    for (const specifier of specifiersOf(text)) if (PROVIDER_SDKS.some((re) => re.test(specifier))) fail(`${p} imports a provider SDK (${specifier}); use the adapters`);
  }
}

// Only the runtime, routes and AI server may touch provider adapters; categories and UI may not.
for (const file of everySource) {
  if (isTest(file) || file.startsWith(SERVER_DIR)) continue;
  for (const specifier of specifiersOf(read(file))) {
    const target = resolveSpecifier(file, specifier);
    if (target && (target + sep).startsWith(PROVIDERS_DIR)) fail(`${rel(file)} imports a provider adapter directly (${specifier}); call the AI Core instead`);
  }
}

// process.env is read in exactly one AI file; nothing else in the AI server may read the environment.
for (const file of srcFiles.filter((f) => f.startsWith(SERVER_DIR) && !isTest(f))) {
  const p = rel(file);
  const text = read(file);
  if (/process\.env/.test(text) && p !== "src/lib/ai/server/config.ts") fail(`${p} reads process.env; only config.ts may`);
  if (/console\.(log|info|debug|warn|error)\(/.test(text) && p !== "src/lib/ai/server/observability.ts") fail(`${p} calls console directly; use the structured logger`);
}

// ------------------------------------------------------------------ 3. unsafe patterns in AI code
const aiFiles = srcFiles.filter((f) => /^src\/(lib\/ai|components\/ai)\//.test(rel(f)) && !isTest(f));
const UNSAFE = [
  [/\bdangerouslySetInnerHTML\b/, "renders HTML (AI output must be plain text)"],
  [/\.innerHTML\s*=/, "assigns innerHTML"],
  [/\beval\s*\(/, "uses eval"],
  [/\bnew Function\s*\(/, "uses new Function"],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, "persists to web storage (AI input/output must not be stored)"],
  [/Access-Control-Allow-Origin/i, "sets CORS headers (the AI API is same-origin only)"],
];
for (const file of aiFiles) {
  const text = read(file);
  for (const [pattern, why] of UNSAFE) if (pattern.test(text)) fail(`${rel(file)} ${why}`);
}
for (const file of serverRouteFiles.filter((f) => rel(f).startsWith("server/routes/api/ai/"))) {
  if (/cors|Access-Control/i.test(read(file))) fail(`${rel(file)} must not configure CORS`);
}

// ------------------------------------------------------------------ 4. no secret behind a public prefix
const configLike = [
  ...["package.json", "vercel.json", "render.yaml", ".env.example", "README.md", "startup.sh", ".enV/app-env.json"].map((f) => join(root, f)),
  ...walk(join(root, "docs"), (f) => /\.(md|txt)$/.test(f)),
  ...walk(join(root, ".github"), () => true),
  ...walk(join(root, "scripts"), isSource).filter((f) => rel(f) !== "scripts/check-ai.mjs"),
  ...srcFiles.filter((f) => !isTest(f)),
  ...serverRouteFiles,
].filter((f) => existsSync(f));
const PUBLIC_SECRET = /\bVITE_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PRIVATE)[A-Z0-9_]*/g;
for (const file of configLike) {
  const text = read(file);
  for (const m of text.matchAll(PUBLIC_SECRET)) fail(`${rel(file)} defines or reads ${m[0]}: a VITE_ variable is shipped to every browser`);
}

// .enV/app-env.json feeds the CLIENT environment: it may hold VITE_ values only, never a secret.
const appEnvPath = join(root, ".enV", "app-env.json");
if (existsSync(appEnvPath)) {
  const appEnv = JSON.parse(read(appEnvPath));
  for (const key of Object.keys(appEnv)) {
    if (!key.startsWith("VITE_")) fail(`.enV/app-env.json has non-VITE_ key ${key}; this file is exposed to the browser`);
    if (SECRET_NAMES.some((name) => key.includes(name) || String(appEnv[key]).includes(name))) fail(`.enV/app-env.json mentions a secret (${key}); put secrets in the host's environment variables instead`);
  }
}

// ------------------------------------------------------------------ 5. registries
const tsImport = (path) => import(pathToFileURL(join(root, path)).href);
const [{ MODEL_REGISTRY, validateModelRegistry }, { TASKS, taskRegistryProblems }, { AI_FEATURES }, { AI_TASK_IDS }, { loadAiConfig, validateAiConfig, configuredProviders, SECRET_ENV_NAMES }, { strictSchemaProblems, validateJsonSchema, exampleFromSchema }] = await Promise.all([
  tsImport("src/lib/ai/server/registry/models.ts"),
  tsImport("src/lib/ai/server/tasks/index.ts"),
  tsImport("src/lib/ai/features.ts"),
  tsImport("src/lib/ai/contracts.ts"),
  tsImport("src/lib/ai/server/config.ts"),
  tsImport("src/lib/ai/server/core/schema-utils.ts"),
]);

for (const problem of validateModelRegistry(MODEL_REGISTRY)) fail(`model registry: ${problem}`);
for (const problem of taskRegistryProblems(TASKS)) fail(`task registry: ${problem}`);

for (const task of TASKS.values()) {
  const hasModel = MODEL_REGISTRY.some((m) => m.provider !== "mock" && m.enabled && m.capabilities.includes(task.capability) && (!task.structured || m.structuredOutput !== "none"));
  if (!hasModel) fail(`task ${task.id} needs ${task.capability}${task.structured ? " + structured output" : ""} but no real model in the registry provides it`);
  if (task.structured) {
    for (const p of strictSchemaProblems(task.jsonSchema)) fail(`task ${task.id} schema is not strict-mode compatible: ${p}`);
    const problems = validateJsonSchema(exampleFromSchema(task.jsonSchema), task.jsonSchema);
    if (problems.length) fail(`task ${task.id} schema cannot validate its own example: ${problems[0]}`);
  }
  if (task.timeoutMs < task.attemptTimeoutMs) fail(`task ${task.id} attemptTimeoutMs exceeds timeoutMs`);
  if (task.privacy === "sensitive" && task.cacheTtlSeconds !== null) fail(`task ${task.id} is sensitive but cacheable; sensitive tasks must never be cached`);
}

// Fallback coverage is informational: some capabilities genuinely have a single provider today.
for (const task of TASKS.values()) {
  const capable = MODEL_REGISTRY.filter((m) => m.provider !== "mock" && m.enabled && m.capabilities.includes(task.capability) && (!task.structured || m.structuredOutput !== "none"));
  const providers = new Set(capable.map((m) => m.provider));
  if (providers.size < 2) warnings.push(`task ${task.id} has no cross-provider fallback (${[...providers].join(", ") || "none"}; ${capable.length} model(s))`);
}

// Prompt snapshots: every task has one, at the current version (tasks/prompts.test.ts checks the content hash).
const snapshotPath = join(SERVER_DIR, "tasks", "prompt-snapshots.json");
if (!existsSync(snapshotPath)) fail("src/lib/ai/server/tasks/prompt-snapshots.json is missing");
else {
  const snapshots = JSON.parse(read(snapshotPath));
  for (const task of TASKS.values()) {
    if (!snapshots[task.id]) fail(`no prompt snapshot for task ${task.id}`);
    else if (snapshots[task.id].version !== task.version) fail(`prompt snapshot for ${task.id} is at version ${snapshots[task.id].version}, task is ${task.version}; refresh it (see tasks/prompts.test.ts)`);
  }
}

const catalog = parseGeneratedCatalog(read(join(root, "src", "data", "catalog.ts")));
const toolsById = new Map(catalog.map((t) => [t.id, t]));
const seenTools = new Set();
for (const feature of AI_FEATURES) {
  const tool = toolsById.get(feature.toolId);
  if (!tool) fail(`AI feature binds unknown tool "${feature.toolId}"`);
  else if (tool.status !== "active") fail(`AI feature binds "${feature.toolId}" but that tool is ${tool.status}; planned tools must stay Coming Soon`);
  if (seenTools.has(feature.toolId)) fail(`tool "${feature.toolId}" has more than one AI feature`);
  seenTools.add(feature.toolId);
  if (!AI_TASK_IDS.includes(feature.taskId)) fail(`AI feature for "${feature.toolId}" uses unknown task ${feature.taskId}`);
  if ((feature.fields.some((f) => f.kind === "image" || f.kind === "audio") || feature.taskId === "developer.json.explain") && !feature.requiresConsent) fail(`AI feature for "${feature.toolId}" sends files or free-form data and must require consent`);
}
const active = catalog.filter((t) => t.status === "active").length;
if (AI_FEATURES.length / Math.max(active, 1) > 0.05) fail(`AI is bound to ${AI_FEATURES.length} of ${active} active tools; keep AI to tools where it materially helps`);

// ------------------------------------------------------------------ 6. documented environment
const configSource = read(join(SERVER_DIR, "config.ts"));
const readNames = new Set([...configSource.matchAll(/read(?:Bool|Number|List)?\(env, "([A-Z0-9_]+)"/g)].map((m) => m[1]));
readNames.add("VITE_AUTH_ENABLED");
for (const name of SECRET_ENV_NAMES) if (!readNames.has(name) && !["HF_TOKEN"].includes(name)) fail(`SECRET_ENV_NAMES lists ${name} but config.ts never reads it`);
const envExample = existsSync(join(root, ".env.example")) ? read(join(root, ".env.example")) : "";
const docs = existsSync(join(root, "docs", "ai-infrastructure.md")) ? read(join(root, "docs", "ai-infrastructure.md")) : "";
if (!envExample) fail(".env.example is missing");
if (!docs) fail("docs/ai-infrastructure.md is missing");
for (const name of readNames) {
  if (name === "VITE_AUTH_ENABLED") continue;
  if (!envExample.includes(name)) fail(`${name} is read by config.ts but not documented in .env.example`);
  if (!docs.includes(name)) fail(`${name} is read by config.ts but not documented in docs/ai-infrastructure.md`);
}
for (const m of envExample.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]+)=(.+)$/gm)) {
  const [, name, value] = m;
  if (SECRET_NAMES.includes(name) && value.trim() && !/^<.*>$|^$/.test(value.trim())) fail(`.env.example gives ${name} a value; leave secrets empty`);
}

// ------------------------------------------------------------------ 7. wired into npm test and verify
const pkg = JSON.parse(read(join(root, "package.json")));
if (!/src\/lib\/ai\/\*\*\/\*\.test\.ts/.test(pkg.scripts?.test ?? "")) fail("npm test does not run src/lib/ai/**/*.test.ts");
if (!/npm run check:ai\b/.test(pkg.scripts?.verify ?? "")) fail("npm run verify does not run check:ai");
if (!pkg.dependencies?.zod) fail("zod must be a production dependency (the AI server imports it at runtime and Vercel installs with --omit=dev)");

// ------------------------------------------------------------------ 8. current environment (informational)
const config = loadAiConfig(process.env);
const { errors, warnings: configWarnings } = validateAiConfig(config);
for (const e of errors) fail(`AI configuration: ${e}`);
for (const w of configWarnings) warnings.push(`AI configuration: ${w}`);
const providers = configuredProviders(config);
console.log(`AI audit: ${TASKS.size} tasks, ${MODEL_REGISTRY.filter((m) => m.provider !== "mock").length} real models, ${AI_FEATURES.length} tool bindings, ${browserFiles.length} browser files checked.`);
console.log(`Environment: AI ${config.enabled ? "enabled" : "disabled"}; providers configured: ${providers.length ? providers.join(", ") : "none"}.`);
for (const w of warnings) console.warn(`  warning: ${w}`);
if (failures.length) {
  console.error(`\nAI audit failed with ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("AI audit passed.");
