import { readFileSync } from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const tools = parseGeneratedCatalog(read("src/data/catalog.ts"));
const design = tools.filter((tool) => tool.category === "design");
const expectedIds = [
  "color-picker", "hex-converter", "rgb-converter", "hsl-converter", "hsv-converter", "cmyk-converter",
  "palette-generator", "gradient-generator", "css-shadow-generator", "css-border-generator",
  "glassmorphism-generator", "neumorphism-generator", "css-button-generator", "css-card-generator",
  "blob-generator", "svg-wave-generator", "contrast-checker", "wcag-checker",
  "color-blindness-simulator", "text-shadow-generator", "noise-generator",
];
const ids = design.map((tool) => tool.id);
const missing = expectedIds.filter((id) => !ids.includes(id));
const unexpected = ids.filter((id) => !expectedIds.includes(id));
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
const invalid = design.filter((tool) => tool.status === "planned" || !tool.engine?.type || !tool.engine?.op);
const allowedTypes = new Set(["color", "cssgen"]);
const badType = design.filter((tool) => !allowedTypes.has(tool.engine?.type));

const explorer = read("src/components/tools/design-category-explorer.tsx");
const colorEngine = read("src/components/engines/color-engine.tsx");
const cssEngine = read("src/components/engines/cssgen-engine.tsx");
const colorVision = read("src/lib/engines/color-vision.ts");
const tests = read("src/lib/engines/accessibility-color.test.ts");
const dispatcher = read("src/components/tools/tool-engine.tsx");
const accessibilityEngine = read("src/components/engines/accessibility-engine.tsx");
const checks = [
  ["Design category search", explorer.includes("Search design tools")],
  ["Design category filter groups", ["Color & palettes", "Gradients & effects", "SVG & backgrounds", "Accessibility"].every((label) => explorer.includes(label))],
  ["Color converter-specific routing", dispatcher.includes("ColorEngine op={tool.engine.op} toolId={tool.id}")],
  ["CSS generator-specific routing", dispatcher.includes("CssGenEngine op={tool.engine.op} toolId={tool.id}")],
  ["HSV conversion implementation", colorEngine.includes("function rgbToHsv") && colorEngine.includes("function hsvToRgb")],
  ["Palette harmony controls", colorEngine.includes("Split complementary") && colorEngine.includes("Monochromatic")],
  ["Distinct WCAG target checks", colorEngine.includes("getContrastTargets()") && colorEngine.includes("evaluateContrast")],
  ["Published CVD simulation utility", colorVision.includes("simulateColorVision") && colorVision.includes("protanopia") && colorVision.includes("tritanopia")],
  ["CVD regression tests", tests.includes("color vision simulations preserve neutral black and white")],
  ["Accessibility Studio uses shared CVD model", accessibilityEngine.includes('from "@/lib/engines/color-vision"') && accessibilityEngine.includes("return simulateColorVision(hex, type);")],
  ["Gradient modes and three stops", cssEngine.includes("radial-gradient") && cssEngine.includes("conic-gradient") && cssEngine.includes("values.via")],
  ["Layered shadow presets", cssEngine.includes("const presets:") && cssEngine.includes("const layers = Array.from")],
  ["Working SVG noise asset", cssEngine.includes("feTurbulence") && !cssEngine.includes('background-image:url("data:image/svg+xml,...")')],
  ["SVG shape color controls", cssEngine.includes("values.color ??") && cssEngine.includes("values.fill ??")],
];
const failedChecks = checks.filter(([, pass]) => !pass).map(([label]) => label);
if (design.length !== expectedIds.length || missing.length || unexpected.length || duplicates.length || invalid.length || badType.length || failedChecks.length) {
  console.error({ total: design.length, missing, unexpected, duplicates, invalid: invalid.map((tool) => tool.id), badType: badType.map((tool) => tool.id), failedChecks });
  process.exit(1);
}
console.log(`Design audit passed: ${design.length} tools, all active, all routed, ${checks.length} implementation checks passed.`);
