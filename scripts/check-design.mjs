import { readFileSync } from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const tools = parseGeneratedCatalog(read("src/data/catalog.ts"));
const design = tools.filter((tool) => tool.category === "design");
const expectedIds = [
  "color-picker", "hex-color-converter", "rgb-converter", "hsl-converter", "hsv-converter", "cmyk-converter",
  "palette-generator", "gradient-generator", "css-shadow-generator", "css-border-generator",
  "glassmorphism-generator", "neumorphism-generator", "css-button-generator", "css-card-generator",
  "blob-generator", "svg-wave-generator", "contrast-checker", "wcag-checker",
  "color-blindness-simulator", "text-shadow-generator", "noise-generator",
];
const ids = design.map((tool) => tool.id);
const generatedCoreIds = expectedIds.filter((id) => id !== "hex-color-converter");
const registrySource = read("src/lib/registry.ts");
const generatorSource = read("scripts/gen-catalog.mjs");
const hexConverterRegistered = generatorSource.includes('["hex-color-converter","HEX Color Converter","design"')
  && registrySource.includes('const designHexColorConverterTool: ToolMeta')
  && registrySource.includes('id: "hex-color-converter"')
  && registrySource.includes('designHexColorConverterTool.id) ? [designHexColorConverterTool] : []');
const missing = [
  ...generatedCoreIds.filter((id) => !ids.includes(id)),
  ...(!hexConverterRegistered ? ["hex-color-converter"] : []),
];
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
const invalid = design.filter((tool) => tool.status === "planned" || !tool.engine?.type || !tool.engine?.op);
const allowedTypes = new Set(["color", "cssgen"]);
const badType = design.filter((tool) => !allowedTypes.has(tool.engine?.type));
const allowedColorOps = new Set(["picker", "palette", "contrast"]);
const allowedCssFamilies = new Set(["avatar", "badge", "blob", "border", "button", "card", "glass", "gradient", "input", "neomorph", "noise", "pattern", "shadow", "wave"]);
const allowedCssActions = new Set(["builder", "css", "generator", "preset", "preview", "svg", "token"]);
const unsupportedOps = design.filter((tool) => {
  if (tool.engine?.type === "color") return !allowedColorOps.has(tool.engine?.op);
  if (tool.engine?.type !== "cssgen") return true;
  const [family, action, extra] = String(tool.engine?.op ?? "").split(":");
  return Boolean(extra) || !allowedCssFamilies.has(family) || !allowedCssActions.has(action);
});

const explorer = read("src/components/tools/design-category-explorer.tsx");
const explorerUtils = read("src/lib/engines/design-explorer.ts");
const explorerUtilsTests = read("src/lib/engines/design-explorer.test.ts");
const designCatalogGenerator = read("scripts/gen-catalog.mjs");
const designBrowserAudit = read("scripts/audit-design-category-browser.mjs");
const renderedWorkflow = read(".github/workflows/accessibility-phase8.yml");
const colorEngine = read("src/components/engines/color-engine.tsx");
const cssEngine = read("src/components/engines/cssgen-engine.tsx");
const colorVision = read("src/lib/engines/color-vision.ts");
const cssGradient = read("src/lib/engines/css-gradient.ts");
const cssGradientTests = read("src/lib/engines/css-gradient.test.ts");
const palette = read("src/lib/engines/design-palette.ts");
const paletteTests = read("src/lib/engines/design-palette.test.ts");
const designColor = read("src/lib/engines/design-color.ts");
const designColorTests = read("src/lib/engines/design-color.test.ts");
const svgGenerators = read("src/lib/engines/svg-generators.ts");
const svgGeneratorTests = read("src/lib/engines/svg-generators.test.ts");
const svgBackgrounds = read("src/lib/engines/svg-backgrounds.ts");
const svgBackgroundTests = read("src/lib/engines/svg-backgrounds.test.ts");
const paletteImage = read("src/lib/engines/palette-image.ts");
const paletteImageTests = read("src/lib/engines/palette-image.test.ts");
const textShadow = read("src/lib/engines/css-text-shadow.ts");
const textShadowTests = read("src/lib/engines/css-text-shadow.test.ts");
const componentA11y = read("src/lib/engines/design-component-a11y.ts");
const componentA11yTests = read("src/lib/engines/design-component-a11y.test.ts");
const cssBorder = read("src/lib/engines/css-border.ts");
const cssBorderTests = read("src/lib/engines/css-border.test.ts");
const contrastTests = read("src/lib/engines/design-contrast.test.ts");
const layerUtils = read("src/lib/engines/design-layer-utils.ts");
const layerUtilsTests = read("src/lib/engines/design-layer-utils.test.ts");
const tests = read("src/lib/engines/accessibility-color.test.ts");
const dispatcher = read("src/components/tools/tool-engine.tsx");
const explorerGroupIds = [...explorer.matchAll(/ids:\s*\[([^\]]+)\]/g)]
  .flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]));
const missingExplorerIds = expectedIds.filter((id) => !explorerGroupIds.includes(id));
const duplicateExplorerIds = explorerGroupIds.filter((id, index) => explorerGroupIds.indexOf(id) !== index);
const unexpectedExplorerIds = explorerGroupIds.filter((id) => !expectedIds.includes(id));
const generatedFamilyGroups = {
  gradient: "effects", shadow: "effects", border: "effects", glass: "effects", neomorph: "effects", noise: "effects",
  button: "components", card: "components", badge: "components", input: "components", avatar: "components",
  pattern: "shapes", blob: "shapes", wave: "shapes",
};
const generatedDesignTools = design.filter((tool) => !explorerGroupIds.includes(tool.id));
const unmappedGeneratedDesignTools = generatedDesignTools.filter((tool) => {
  if (tool.engine?.type === "color") return false;
  if (tool.engine?.type !== "cssgen") return true;
  return !generatedFamilyGroups[String(tool.engine?.op ?? "").split(":")[0]];
});
const checks = [
  ["Design category search", explorer.includes("Search design tools")],
  ["Design category filter groups", ["Color & palettes", "Gradients & effects", "SVG & backgrounds", "Accessibility"].every((label) => explorer.includes(label))],
  ["Every core Design tool appears in exactly one explorer group", missingExplorerIds.length === 0 && duplicateExplorerIds.length === 0 && unexpectedExplorerIds.length === 0 && explorerGroupIds.length === expectedIds.length],
  ["Generated Design workflow families are mapped into visible groups", designCatalogGenerator.includes('addCross("design"') && ["gradient", "shadow", "border", "glass", "neomorph", "noise", "button", "card", "badge", "input", "avatar", "pattern", "blob", "wave"].every((family) => explorerUtils.includes(family + ":")) && explorerUtils.includes('engine.type === "color"') && explorerUtilsTests.includes("every generated Design CSS family maps to one visible explorer group")],
  ["Generated tools participate in explorer filtering and result counts", explorer.includes("getGeneratedDesignTools(tools, CORE_TOOL_IDS, group.id)") && explorerUtils.includes("getGeneratedDesignTools") && explorerUtilsTests.includes("generated utilities are grouped once") && explorer.includes("uniqueTools.filter((tool) => !normalizedQuery")],
  ["Every generated Design catalog entry maps into a visible explorer group", generatedDesignTools.length === design.length - generatedCoreIds.length && unmappedGeneratedDesignTools.length === 0],
  ["Rendered Design browser audit checks search, groups, mobile and card counts", designBrowserAudit.includes("Gradient Token Generator") && designBrowserAudit.includes("mobileOverflow") && designBrowserAudit.includes("advertisedCount") && renderedWorkflow.includes("audit:design:browser")],
  ["Color converter-specific routing", dispatcher.includes("ColorEngine op={tool.engine.op} toolId={tool.id}")],
  ["Color picker alpha control and extended CSS Color 4 outputs", colorEngine.includes("design-color-alpha") && colorEngine.includes("Opacity / alpha") && colorEngine.includes('["HWB", formatHwb(color)]') && colorEngine.includes('["OKLCH", formatOklch(color)]')],
  ["CSS generator-specific routing", dispatcher.includes("CssGenEngine op={tool.engine.op} toolId={tool.id}")],
  ["HSV conversion implementation", designColor.includes("function rgbToHsv") && designColor.includes("function hsvToRgb")],
  ["Palette harmony controls and selectable palette counts", colorEngine.includes("Split complementary") && colorEngine.includes("Monochromatic") && colorEngine.includes("palette-count") && colorEngine.includes("Edit palette color") && palette.includes("createHarmonyPalette")],
  ["Distinct WCAG target checks and WCAG report", colorEngine.includes("getContrastTargets()") && colorEngine.includes("evaluateContrast") && colorEngine.includes("WCAG contrast report")],
  ["Custom transparent-color canvas and report details", colorEngine.includes("Page / canvas behind transparency") && colorEngine.includes("Success criterion {item.result.criterion}") && colorEngine.includes("Actual {item.result.ratio.toFixed(2)}:1")],
  ["Published CVD simulation utility", colorVision.includes("simulateColorVision") && colorVision.includes("protanopia") && colorVision.includes("tritanopia")],
  ["CVD regression tests", tests.includes("color vision simulations preserve neutral black and white")],
  ["Design color-vision simulator uses shared CVD model", colorEngine.includes('from "@/lib/engines/color-vision"') && colorEngine.includes("simulateColorVision(source, visionMode)")],
  ["Gradient modes, editable stops and mesh-style blends", cssEngine.includes("Add stop (") && cssEngine.includes("Distribute evenly") && cssEngine.includes("Reverse") && cssEngine.includes("GRADIENT_PRESETS.map") && cssEngine.includes("Move earlier") && cssEngine.includes("Add a second soft gradient layer") && cssEngine.includes("buildCssMeshGradient") && cssEngine.includes("meshMode")],
  ["Gradient stop engine and regression tests", cssGradient.includes("normalizeGradientStops") && cssGradient.includes("moveGradientStop") && cssGradient.includes("buildCssMeshGradient") && cssGradient.includes("oklch") && cssGradientTests.includes("perceptual interpolation and radial sizing") && cssGradientTests.includes("mesh-style gradients stack") && cssEngine.includes("@supports (background-image: ${enhanced})")],
  ["Independently editable and reorderable text-shadow layers", textShadow.includes("buildTextShadow") && textShadow.includes("normalizeTextShadowLayers") && textShadowTests.includes("each text shadow layer keeps its own editable values") && cssEngine.includes("Independent text-shadow layers") && cssEngine.includes("Move text shadow layer") && cssEngine.includes("Add layer (")],
  ["Glassmorphism fallback and progressive blur enhancement", cssEngine.includes("fallbackBackground") && cssEngine.includes("@supports (backdrop-filter: blur(1px)) or") && cssEngine.includes("-webkit-backdrop-filter")],
  ["Neumorphism accessibility usage guidance", cssEngine.includes("Neumorphic effects can make controls")],
  ["Editable semantic roles with pair contrast feedback", colorEngine.includes("Edit any role without regenerating") && colorEngine.includes("semanticContrast.body") && colorEngine.includes("semanticContrast.primary")],
  ["Shareable semantic role overrides", colorEngine.includes('url.searchParams.set("roles", JSON.stringify(roleOverrides))') && colorEngine.includes('params.get("roles")')],
  ["Perceptual OKLCH shade scale with gamut mapping", palette.includes("linearRgbToOklab") && palette.includes("fromOklchInSrgb") && palette.includes("upwardRoom")],
  ["Palette semantic roles and token exports", palette.includes("buildDesignPaletteExport") && ["css", "scss", "tailwind", "json", "tokens"].every((format) => palette.includes(`format === "${format}"`))],
  ["Palette locking, sharing and image extraction", ["Lock color", "Copy share link", "Extract colors from an image", "Light preview", "Dark preview", "Try a smaller image", "context.drawImage(image, offsetX"].every((label) => colorEngine.includes(label))],
  ["Palette harmony counts avoid duplicate swatches", palette.includes("const anchors:") && paletteTests.includes("must not contain duplicate swatches")],
  ["Palette utility regression tests", paletteTests.includes("primary shade scale") && paletteTests.includes("W3C token exports") && paletteTests.includes("selectable counts from three to eight")],
  ["HSV, HSB, CMYK, HWB and OKLCH parsers and copyable formatters", designColor.includes("parsePercentOrUnit") && designColor.includes("parseOklch") && designColor.includes("parseHwb") && designColor.includes("formatOklch") && designColor.includes("formatHwb") && designColorTests.includes("HWB CSS colors parse") && designColorTests.includes("OKLCH CSS colors parse") && colorEngine.includes("formatOklch(converted)")],
  ["Independent multi-layer shadow editor with stack reordering", cssEngine.includes("Independent shadow layers") && cssEngine.includes("setShadowLayers") && cssEngine.includes("buildBoxShadow") && cssEngine.includes("Move shadow layer") && layerUtils.includes("moveLayerItem") && layerUtilsTests.includes("layer stack reordering") && cssEngine.includes("Add layer")],
  ["Button variants and disabled interaction preview", cssEngine.includes("Button style") && cssEngine.includes("env-button:disabled") && cssEngine.includes("disabled={values.disabled === \"yes\"}")],
  ["Five structured card preview layouts", cssEngine.includes("Card layout") && ["product", "profile", "article", "metric"].every((layout) => cssEngine.includes(`values.layout === "${layout}"`))],
  ["Button hover, focus and reduced-motion states", cssEngine.includes("env-live-button:hover") && cssEngine.includes("env-live-input:focus-visible") && cssEngine.includes("Focus ring color") && cssEngine.includes("prefers-reduced-motion")],
  ["Live contrast feedback for generated buttons, cards, badges and inputs", componentA11y.includes("inspectDesignComponentContrast") && componentA11y.includes("non-text") && componentA11yTests.includes("cards check title") && cssEngine.includes("Component contrast check") && cssEngine.includes("inspectDesignComponentContrast(family, values)")],
  ["Editable color-vision palette", colorEngine.includes("Test your own interface colors") && colorEngine.includes("Reset sample colors")],
  ["Alpha-aware contrast preview", colorEngine.includes("resolveRenderedPair(foreground, background, canvas)") && colorEngine.includes("previewPair.background")],
  ["Foreground, background and opacity contrast correction choices", colorEngine.includes("Adjust foreground") && colorEngine.includes("Adjust background") && colorEngine.includes("Increase foreground opacity") && colorEngine.includes("Increase background opacity") && contrastTests.includes("can adjust either color")],
  ["Independent border edge widths, corner radii and safe CSS export", cssBorder.includes("border-width:") && cssBorder.includes("border-radius:") && cssBorderTests.includes("independent edge widths") && cssEngine.includes("Top edge width") && cssEngine.includes("buildCssBorder")],
  ["Noise generator supports multiple algorithms, octaves and repeatable seeds", svgGenerators.includes("type?: NoiseType") && svgGenerators.includes("numOctaves") && svgGenerators.includes("seed=") && svgGeneratorTests.includes("noise textures support turbulence modes") && cssEngine.includes("Noise type") && cssEngine.includes("Noise seed")],
  ["Blob, pattern and wave generator regression tests", svgGenerators.includes("buildWaveSvg") && svgGenerators.includes("buildBlobSvg") && svgGenerators.includes("PatternStyle") && svgGeneratorTests.includes("wave geometry responds to frequency") && svgGeneratorTests.includes("pattern generator clamps settings") && svgGeneratorTests.includes("outlined")],
  ["Expanded SVG pattern families and rotation", ["Concentric rings", "Chevron", "Hexagons", "Crosshatch", "Checkerboard", "Triangles", "Polka dots", "Wave lines", "Zigzag"].every((name) => cssEngine.includes(name)) && ["checkerboard", "triangles", "polka", "waves", "zigzag"].every((name) => svgGenerators.includes(name)) && svgGeneratorTests.includes("new Set(variants).size, 14")],
  ["Organic blob generator variation, deterministic seeding and outline export", cssEngine.includes("Organic variation") && svgGenerators.includes("safeIrregularity") && svgGeneratorTests.includes("const organic = buildBlobSvg") && svgGenerators.includes("vector-effect")],
  ["Wave customization, transparency and five-layer support", cssEngine.includes("Wave frequency") && cssEngine.includes("Wave phase") && cssEngine.includes("Canvas background") && cssEngine.includes("value: \"5\", label: \"5 layers\"") && svgGenerators.includes("clamp(options.layers, 1, 5)")],
  ["SVG shape color controls and PNG export", cssEngine.includes("values.color ??") && cssEngine.includes("values.fill ??") && cssEngine.includes("Copy SVG") && cssEngine.includes("downloadSvgAsPng")],
  ["Exported blob and wave SVGs include accessible names", svgGenerators.includes('aria-label="Generated organic blob shape"') && svgGenerators.includes('aria-label="Generated layered wave background"') && svgGeneratorTests.includes("Generated organic blob shape") && svgGeneratorTests.includes("Generated layered wave background")],
  ["Median-cut image palette extraction and transparent-pixel filtering", paletteImage.includes("extractDominantColors") && paletteImage.includes("selectedChannel") && paletteImageTests.includes("ignores transparent pixels") && colorEngine.includes("extractDominantColors(pixels, 5, 160)")],
  ["Image extraction progress and local-only handling", colorEngine.includes("isExtractingPalette") && colorEngine.includes("Sampling image colors locally") && colorEngine.includes("disabled={isExtractingPalette}")],
  ["Independently editable and reorderable text-shadow layers", textShadow.includes("buildTextShadow") && textShadow.includes("normalizeTextShadowLayers") && textShadowTests.includes("keeps its own editable values") && cssEngine.includes("Independent text-shadow layers") && cssEngine.includes("Move text shadow layer") && cssEngine.includes("Add layer (" )],
  ["Consistent SVG wave export dimensions", svgGenerators.includes('viewBox="0 0 1440 240"') && svgGenerators.includes("L1440 240 L0 240 Z") && svgGeneratorTests.includes('viewBox="0 0 1440 240"')],
  ["Low-poly SVG artwork with deterministic triangulation", svgBackgrounds.includes("buildLowPolySvg") && svgBackgrounds.includes("createRandom") && svgBackgroundTests.includes("low-poly artwork is deterministic") && cssEngine.includes("Low-poly geometry")],
  ["Scatter generator with dots, stars and confetti families", svgBackgrounds.includes("buildScatterSvg") && ["dots", "stars", "confetti"].every((style) => svgBackgrounds.includes('"'+style+'"')) && svgBackgroundTests.includes("scatter generator supports dots, stars and confetti") && cssEngine.includes("Particle style")],
  ["Standalone SVG mesh-gradient generator", svgBackgrounds.includes("buildMeshGradientSvg") && svgBackgrounds.includes("radialGradient") && svgBackgroundTests.includes("mesh gradients sanitize colors") && cssEngine.includes("Mesh gradient")],
  ["Reusable paper, halftone, topographic and woven SVG textures", svgBackgrounds.includes("buildTextureSvg") && ["paper", "halftone", "topography", "woven"].every((style) => svgBackgrounds.includes('"'+style+'"')) && svgBackgroundTests.includes("texture generator exports four deterministic") && cssEngine.includes("Surface texture")],
  ["SVG artwork family selector and conditional controls", cssEngine.includes("Artwork family") && cssEngine.includes('if (family === "blob")') && cssEngine.includes("values.artStyle") && cssEngine.includes("buildTextureSvg")],
];
const failedChecks = checks.filter(([, pass]) => !pass).map(([label]) => label);
if (design.length < generatedCoreIds.length || missing.length || duplicates.length || invalid.length || badType.length || unsupportedOps.length || failedChecks.length || missingExplorerIds.length || duplicateExplorerIds.length || unexpectedExplorerIds.length || unmappedGeneratedDesignTools.length) {
  console.error({ total: design.length, coreMissing: missing, duplicates, invalid: invalid.map((tool) => tool.id), badType: badType.map((tool) => tool.id), unsupportedOps: unsupportedOps.map((tool) => ({ id: tool.id, type: tool.engine?.type, op: tool.engine?.op })), missingExplorerIds, duplicateExplorerIds, unexpectedExplorerIds, unmappedGeneratedDesignTools: unmappedGeneratedDesignTools.map((tool) => ({ id: tool.id, type: tool.engine?.type, op: tool.engine?.op })), failedChecks });
  process.exit(1);
}
console.log(`Design audit passed: ${design.length} active catalogue entries, ${expectedIds.length} core tool IDs present, every engine operation supported, ${checks.length} implementation checks passed.`);
