/**
 * Static audit for the Screenshot category (no browser needed).
 * Run: npm run check:screenshots
 *
 * Guards the things that went wrong before this category was rebuilt: planned tools that
 * looked finished, "active" tools with no real output, demo labels drawn into exports, and
 * catalog metadata that disagreed with the code that actually renders a tool.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const errors = [];
const fail = (m) => errors.push(m);

const { tools } = await import(new URL("src/data/catalog.ts", root));
const registry = await import(new URL("src/lib/screenshots/tool-config.ts", root));
const presets = await import(new URL("src/lib/screenshots/presets.ts", root));
const stores = await import(new URL("src/lib/screenshots/store-presets.ts", root));

/* 1 + 2: catalog <-> registry parity and honest status */
const shots = tools.filter((t) => t.category === "screenshots");
const registryIds = registry.allScreenshotToolIds();
if (shots.length !== registryIds.length) fail(`catalog has ${shots.length} screenshot tools, registry has ${registryIds.length}`);
for (const id of registryIds) if (!shots.some((t) => t.id === id)) fail(`registry id "${id}" is not in the catalog`);
const descriptions = new Set();
for (const t of shots) {
  const cfg = registry.resolveScreenshotTool(t.id);
  if (!cfg) { fail(`${t.id}: not resolvable by the screenshot registry`); continue; }
  if (t.status !== "active") fail(`${t.id}: catalog status is "${t.status}" but the studio renders every registry tool`);
  if (!t.clientSide || t.requiresBackend || t.requiresAuth) fail(`${t.id}: must be client-side with no backend/auth`);
  if (t.engine?.type !== "custom" || t.engine?.id !== t.id) fail(`${t.id}: engine must be { type: "custom", id: "${t.id}" }`);
  if (t.description !== registry.describeTool(cfg)) fail(`${t.id}: catalog description is out of sync with describeTool (rerun node scripts/gen-catalog.mjs)`);
  if (/\b(demo|coming soon|placeholder|lorem|todo)\b/i.test(t.description)) fail(`${t.id}: description contains placeholder wording`);
  descriptions.add(t.description);
  if (!cfg.workflowInfo.panels.length) fail(`${t.id}: workflow has no panels`);
}
if (descriptions.size !== shots.length) fail(`descriptions are not unique (${descriptions.size} unique of ${shots.length})`);
if (shots.length !== registry.FAMILIES.length * registry.CORE_WORKFLOWS.length + Object.keys(registry.LEGACY_TOOLS).length) fail("tool count does not equal families x workflows + legacy ids");

/* 3: real routing, ahead of the planned check */
const engine = read("src/components/tools/tool-engine.tsx");
const guard = engine.indexOf('tool.category === "screenshots"'), planned = engine.indexOf('tool.status === "planned"');
if (guard < 0) fail("tool-engine.tsx has no screenshots routing guard");
else if (planned >= 0 && guard > planned) fail("the screenshots guard must run before the planned check in tool-engine.tsx");
if (!/import \{ ScreenshotEngine \}/.test(engine)) fail("tool-engine.tsx does not import ScreenshotEngine");
if (/DeviceEngine/.test(engine) || /DeviceEngine/.test(read("src/components/engines/mockup-engine.tsx"))) fail("the obsolete DeviceEngine prototype is still referenced");

/* 4 + 5: source hygiene */
const files = [];
const walk = (dir) => { for (const name of readdirSync(new URL(dir, root))) { const p = join(dir, name); if (statSync(new URL(p, root)).isDirectory()) walk(p); else files.push(p); } };
walk("src/lib/screenshots"); walk("src/components/screenshots"); files.push("src/components/engines/screenshot-engine.tsx");
const allowedHosts = ["developer.apple.com", "support.google.com"];
for (const f of files.filter((p) => /\.(ts|tsx|css)$/.test(p) && !/\.test\.ts$/.test(p))) {
  const src = read(f), code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (/\bDemo\b|lorem ipsum|coming soon|\bTODO\b|\bFIXME\b/i.test(code)) fail(`${f}: placeholder/demo wording`);
  if (/\b(eval|Function)\s*\(|dangerouslySetInnerHTML|\.innerHTML\s*=|\blocalStorage\b|\bsessionStorage\b|document\.cookie/.test(code)) fail(`${f}: unsafe API or persistence of user images (${f})`);
  if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon|new WebSocket/.test(code)) fail(`${f}: network access is not allowed in screenshot code`);
  for (const m of code.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) if (!allowedHosts.includes(m[1])) fail(`${f}: unexpected external URL host ${m[1]}`);
}

/* 6 + 7: preset honesty */
for (const p of presets.FRAME_PRESETS) {
  if (p.exactness !== "generic") fail(`preset ${p.id}: only generic frames are shipped`);
  if (/\b(iphone|ipad|macbook|galaxy|pixel)\s?\d/i.test(p.label)) fail(`preset ${p.id}: label names a specific model`);
}
for (const c of stores.CANVAS_PRESETS.filter((c) => c.group !== "generic")) {
  if (!/^https:\/\//.test(c.sourceUrl ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(c.lastVerified ?? "")) fail(`store preset ${c.id}: needs sourceUrl and lastVerified`);
  if (c.alphaAllowed) fail(`store preset ${c.id}: store uploads must not allow transparency`);
}

/* 8: every panel a workflow lists is wired in the studio */
const studio = read("src/components/screenshots/screenshot-studio.tsx");
for (const w of Object.values(registry.WORKFLOW_INFO)) for (const id of w.panels) if (!new RegExp(`\\b${id}:\\s*<`).test(studio)) fail(`panel "${id}" is listed by a workflow but not rendered by the studio`);

/* 9: tests wired in, old prototype tests gone */
const pkg = JSON.parse(read("package.json"));
if (!/src\/lib\/screenshots\/\*\.test\.ts/.test(pkg.scripts.test)) fail("npm test does not run src/lib/screenshots/*.test.ts");
if (/screenshot-engine-utils/.test(pkg.scripts.test)) fail("npm test still references the removed screenshot-engine-utils test");

if (errors.length) { console.error(`Screenshot audit failed (${errors.length}):\n- ${errors.join("\n- ")}`); process.exit(1); }
console.log(`Screenshot audit passed: ${shots.length} tools (${registry.FAMILIES.length} families x ${registry.CORE_WORKFLOWS.length} workflows + ${Object.keys(registry.LEGACY_TOOLS).length} legacy ids), all active and routed; ${presets.FRAME_PRESETS.length} generic frame presets; ${stores.CANVAS_PRESETS.length} canvas presets.`);
