import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(path.join(root, "apps/shared/catalog.json"), "utf8"));
const iconSource = readFileSync(path.join(root, "src/lib/icons.ts"), "utf8");
const toolIconDesign = readFileSync(path.join(root, "src/lib/tool-icon-design.ts"), "utf8");
const webTile = readFileSync(path.join(root, "src/components/tools/tool-app-icon.tsx"), "utf8");
const webCard = readFileSync(path.join(root, "src/components/tools/tool-card.tsx"), "utf8");
const webHome = readFileSync(path.join(root, "src/routes/index.tsx"), "utf8");
const webShell = readFileSync(path.join(root, "src/components/tools/tool-shell.tsx"), "utf8");
const androidTile = readFileSync(path.join(root, "apps/android/app/src/main/java/com/chastech/env/ui/EnVToolAppIcon.kt"), "utf8");
const androidActivity = readFileSync(path.join(root, "apps/android/app/src/main/java/com/chastech/env/MainActivity.kt"), "utf8");
const androidAssistant = readFileSync(path.join(root, "apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt"), "utf8");
const iosApp = readFileSync(path.join(root, "apps/ios/enV/enVApp.swift"), "utf8");
const iosContent = readFileSync(path.join(root, "apps/ios/enV/ContentViews.swift"), "utf8");
const iosTools = readFileSync(path.join(root, "apps/ios/enV/ToolViews.swift"), "utf8");
const iosAssistant = readFileSync(path.join(root, "apps/ios/enV/AssistantChat.swift"), "utf8");

function hash32(value) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const h = (((hue % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const [r1, g1, b1] = h < 1 ? [chroma, x, 0] : h < 2 ? [x, chroma, 0] : h < 3 ? [0, chroma, x] : h < 4 ? [0, x, chroma] : h < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const m = l - chroma / 2;
  return `#${[r1, g1, b1].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}
function assetName(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

assert.ok(catalog.tools.length >= 10_000, `Expected a complete catalog, got ${catalog.tools.length} tools.`);
assert.equal(new Set(catalog.tools.map((tool) => tool.id)).size, catalog.tools.length, "Tool IDs must remain unique.");

const importBody = iconSource.match(/import\s*\{([\s\S]*?)\}\s*from\s*"lucide-react"/)?.[1] ?? "";
const mapBody = iconSource.match(/const MAP: Record<string, LucideIcon> = \{([\s\S]*?)\n\};/)?.[1] ?? "";
assert.ok(importBody && mapBody, "Lucide import list and icon map must be present.");
const imports = new Set(importBody.split(",").map((item) => item.trim().replace(/^type\s+/, "")).filter(Boolean));
const mapped = new Set(mapBody.split(",").map((item) => item.trim()).filter((item) => /^[A-Z][A-Za-z0-9]*$/.test(item)));
for (const name of mapped) assert.ok(imports.has(name), `Web icon map refers to unimported Lucide symbol ${name}.`);

const systemIcons = "Home LayoutGrid Search ChevronDown Heart User Moon Sun ArrowLeft ArrowRight Wrench Settings Bell Info ShieldCheck CircleCheck Clock3 Copy RotateCcw Play Globe FilePlus2 Hammer".split(" ");
const requiredIcons = new Set([
  ...catalog.tools.map((tool) => tool.icon),
  ...catalog.categories.map((category) => category.icon),
  ...systemIcons,
]);
for (const name of requiredIcons) {
  assert.ok(mapped.has(name), `Web icon map is missing ${name}.`);
  const asset = path.join(root, "apps/shared/native-icons/icons", `${assetName(name)}.png`);
  assert.ok(existsSync(asset), `Native icon asset is missing for ${name}.`);
}

const pairs = new Set();
const backgrounds = new Set();
const accents = new Set();
const iconCounts = new Map();
for (const tool of catalog.tools) {
  assert.match(tool.iconBackground ?? "", /^#[0-9a-f]{6}$/i, `${tool.id} is missing a valid icon background.`);
  assert.match(tool.iconAccent ?? "", /^#[0-9a-f]{6}$/i, `${tool.id} is missing a valid icon accent.`);
  const baseHash = hash32(tool.id || tool.slug || tool.name);
  const accentHash = hash32(`${tool.id || tool.slug || tool.name}:accent`);
  assert.equal(tool.iconBackground, hslToHex((baseHash / 0xffffffff) * 360, 74, 34), `${tool.id} background hash drifted.`);
  assert.equal(tool.iconAccent, hslToHex((accentHash / 0xffffffff) * 360, 76, 43), `${tool.id} accent hash drifted.`);
  pairs.add(`${tool.iconBackground}|${tool.iconAccent}`);
  backgrounds.add(tool.iconBackground);
  accents.add(tool.iconAccent);
  iconCounts.set(tool.icon, (iconCounts.get(tool.icon) ?? 0) + 1);
}
assert.ok(pairs.size / catalog.tools.length >= 0.99, `Per-tool color identity collision rate is too high (${pairs.size}/${catalog.tools.length}).`);
assert.ok(iconCounts.size >= 80, `Expected a broad semantic icon family set, got ${iconCounts.size}.`);
assert.ok((iconCounts.get("Calculator") ?? 0) / catalog.tools.length < 0.05, "Generic calculator icon is overused.");

const sampleExpectations = new Map([
  ["business-name-generator", "Wand2"],
  ["cash-flow-estimator", "Wallet"],
  ["image-cropper", "Crop"],
  ["image-compressor", "Image"],
  ["hashtag-generator", "Share2"],
]);
for (const [id, expected] of sampleExpectations) {
  const tool = catalog.tools.find((item) => item.id === id);
  assert.ok(tool, `Semantic sample tool is missing: ${id}`);
  assert.equal(tool.icon, expected, `${id} should have the ${expected} semantic glyph.`);
}

assert.ok(toolIconDesign.includes('"iconBackground"') && toolIconDesign.includes('"iconAccent"'), "Shared design must return both tile colors.");
assert.ok(webTile.includes("toolIcon(tool.icon)") && webTile.includes("tool.iconBackground") && webTile.includes("tool.iconAccent"), "Web app-icon tile must use semantic glyph and designed colors.");
assert.ok(webCard.includes("ToolAppIcon") && webShell.includes("ToolAppIcon") && webHome.includes("ToolAppIcon tool={tool}"), "Web tool cards, Home shortcuts, and detail/related-tool UI must use the redesigned tile.");
assert.ok(androidTile.includes("EnVIcon(tool.icon") && androidTile.includes('toolIconHash("$id:accent")') && (androidActivity.match(/EnVToolAppIcon\(/g) ?? []).length >= 5 && androidAssistant.includes("EnVToolAppIcon(tool, size = 36.dp)"), "Android native UI must render the icon tile across Home, cards, detail, suggestions, and assistant recommendations.");
assert.ok(iosApp.includes("struct EnVToolAppIcon") && iosApp.includes('envToolIconHash("\\(tool.id):accent")'), "iOS must render an ID-stable native app-icon tile.");
assert.ok(iosContent.includes("EnVToolAppIcon(tool: tool") && iosTools.includes("EnVToolAppIcon(tool: tool") && iosAssistant.includes("EnVToolAppIcon(tool: tool"), "iOS Home, search suggestions, cards, tool detail, and assistant recommendations must use redesigned icon tiles.");

console.log(`Tool icon design passed: ${catalog.tools.length} tools, ${catalog.categories.length} categories, ${iconCounts.size} semantic glyph families, ${requiredIcons.size} shared native/web icons.`);
console.log(`Per-tool color identity: ${pairs.size} unique gradient pairs (${Math.round((pairs.size / catalog.tools.length) * 10000) / 100}% unique), ${backgrounds.size} background colors, ${accents.size} accent colors.`);
