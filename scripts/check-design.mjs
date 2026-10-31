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
const cssGradient = read("src/lib/engines/css-gradient.ts");
const cssGradientTests = read("src/lib/engines/css-gradient.test.ts");
const palette = read("src/lib/engines/design-palette.ts");
const paletteTests = read("src/lib/engines/design-palette.test.ts");
const palette = read("src/lib/engines/design-palette.ts");
const paletteTests = read("src/lib/engines/design-palette.test.ts");
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
  ["Design color-vision simulator uses shared CVD model", colorEngine.includes('from "@/lib/engines/color-vision"') && colorEngine.includes("simulateColorVision(source, visionMode)")],
  ["Gradient modes and editable stops", cssEngine.includes("Add stop (") && cssEngine.includes("Distribute evenly") && cssEngine.includes("Reverse") && cssEngine.includes("GRADIENT_PRESETS.map") && cssEngine.includes("Move earlier") && cssEngine.includes("Add a second soft gradient layer")],
  ["Gradient stop engine and regression tests", cssGradient.includes("normalizeGradientStops") && cssGradient.includes("moveGradientStop") && cssGradient.includes("oklch") && cssGradientTests.includes("perceptual interpolation and radial sizing")],
  ["Palette semantic roles and token exports", palette.includes("buildDesignPaletteExport") && ["css", "scss", "tailwind", "json", "tokens"].every((format) => palette.includes(`format === "${format}"`))],
  ["Palette locking, sharing and image extraction", ["Lock color", "Copy share link", "Extract colors from an image", "Light preview", "Dark preview"].every((label) => colorEngine.includes(label))],
  ["Palette utility regression tests", paletteTests.includes("primary shade scale") && paletteTests.includes("W3C token exports")],
  ["Layered shadow presets and opacity control", cssEngine.includes("const presets:") && cssEngine.includes("const layers = Array.from") && cssEngine.includes("Shadow opacity")],
  ["Button hover, focus and reduced-motion states", cssEngine.includes("env-live-button:hover") && cssEngine.includes("env-live-input:focus-visible") && cssEngine.includes("Focus ring color") && cssEngine.includes("prefers-reduced-motion")],
  ["Working SVG noise asset", cssEngine.includes("feTurbulence") && !cssEngine.includes('background-image:url("data:image/svg+xml,...")')],
  ["SVG shape color controls and PNG export", cssEngine.includes("values.color ??") && cssEngine.includes("values.fill ??") && cssEngine.includes("Copy SVG") && cssEngine.includes("downloadSvgAsPng")],
];
const failedChecks = checks.filter(([, pass]) => !pass).map(([label]) => label);
if (design.length !== expectedIds.length || missing.length || unexpected.length || duplicates.length || invalid.length || badType.length || failedChecks.length) {
  console.error({ total: design.length, missing, unexpected, duplicates, invalid: invalid.map((tool) => tool.id), badType: badType.map((tool) => tool.id), failedChecks });
  process.exit(1);
}
console.log(`Design audit passed: ${design.length} tools, all active, all routed, ${checks.length} implementation checks passed.`);
