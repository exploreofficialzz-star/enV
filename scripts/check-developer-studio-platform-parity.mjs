import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const webSource = readFileSync('src/lib/developer-studios-catalog.ts', 'utf8');
const kotlinSource = readFileSync('apps/android/app/src/main/java/com/chastech/env/data/DeveloperStudios.kt', 'utf8');
const swiftSource = readFileSync('apps/ios/enV/CatalogCore.swift', 'utf8');

function extractDefinitions(source, studioPattern, modePattern, label) {
  const matches = [...source.matchAll(studioPattern)];
  assert.ok(matches.length, `${label}: Studio definitions must exist`);
  return new Map(matches.map((match, index) => {
    const begin = match.index ?? 0;
    const next = matches[index + 1]?.index ?? source.length;
    const chunk = source.slice(begin, next);
    const id = match[1];
    const modes = [...chunk.matchAll(modePattern)].map((mode) => mode[1]);
    assert.ok(modes.length, `${label}/${id}: at least one mode is required`);
    assert.equal(new Set(modes).size, modes.length, `${label}/${id}: duplicate mode key`);
    return [id, modes];
  }));
}

const web = extractDefinitions(webSource, /\bid:\s*"([a-z0-9-]+-studio)"\s*,\s*slug:/g, /\{\s*key:\s*"([a-z0-9-]+)"\s*,\s*label:/g, 'Web TypeScript');
const android = extractDefinitions(kotlinSource, /NativeDeveloperStudioSpec\("([a-z0-9-]+-studio)"/g, /NativeDeveloperStudioMode\("([a-z0-9-]+)"\s*,/g, 'Android Kotlin');
const ios = extractDefinitions(swiftSource, /\.init\(id:\s*"([a-z0-9-]+-studio)"/g, /\.init\("([a-z0-9-]+)"\s*,/g, 'iOS Swift');

assert.equal(web.size, 13, 'Web must define all thirteen Developer Studios');
assert.deepEqual([...android.keys()].sort(), [...web.keys()].sort(), 'Android Studio IDs must match Web');
assert.deepEqual([...ios.keys()].sort(), [...web.keys()].sort(), 'iOS Studio IDs must match Web');
for (const [id, modes] of web) {
  assert.deepEqual([...android.get(id)].sort(), [...modes].sort(), `Android modes must match Web for ${id}`);
  assert.deepEqual([...ios.get(id)].sort(), [...modes].sort(), `iOS modes must match Web for ${id}`);
}
const webUx = readFileSync('src/components/engines/ux-ui-studio-engine.tsx', 'utf8');
const webDispatcher = readFileSync('src/components/tools/tool-engine.tsx', 'utf8');
const webRoute = readFileSync('src/routes/tools/$category/$slug.tsx', 'utf8');
const webRegistry = readFileSync('src/lib/registry.ts', 'utf8');
const androidMain = readFileSync('apps/android/app/src/main/java/com/chastech/env/MainActivity.kt', 'utf8');
const androidUx = readFileSync('apps/android/app/src/main/java/com/chastech/env/NativeUxUiStudio.kt', 'utf8');
const iosTools = readFileSync('apps/ios/enV/ToolViews.swift', 'utf8');
assert.ok(webRegistry.includes('makeDeveloperStudioTools(allTools)'), 'UX/UI Studio must enter the searchable virtual tool registry');
assert.ok(webRoute.includes('getToolByPath(category, slug)'), 'The public tools route must resolve the Studio slug');
assert.ok(webDispatcher.includes('tool.slug === "ux-ui-studio" ? <UxUiStudioEngine />'), 'Web route must launch the dedicated UX/UI editor');
assert.ok(androidMain.includes('tool.id == "ux-ui-studio") NativeUxUiStudioForm()'), 'Android route must launch the native Kotlin UX/UI editor');
assert.ok(iosTools.includes('if tool.id == "ux-ui-studio"') && iosTools.includes('NativeUxUiStudioView()'), 'iOS route must launch the native SwiftUI UX/UI editor');
assert.match(webUx, /PDFDocument\.create\(\)/, 'Web UX/UI Studio must create a downloadable PDF');
assert.match(webUx, /api\.iconify\.design\/search/, 'Web UX/UI Studio must search the icon catalogue on demand');
assert.match(webUx, /iconName|marginLeft|fontFamily|borderWidth/, 'Web design layers must retain detailed metadata');
assert.match(androidUx, /NativeUxUiStudioForm/, 'Android Kotlin UX/UI editor must be present');
assert.match(androidUx, /PdfDocument/, 'Android UX/UI Studio must generate a native PDF');
assert.match(androidUx, /aiPrompt/, 'Android project handoff must include an AI prompt');
assert.match(iosTools, /NativeUxUiStudioView/, 'iOS Swift UX/UI editor must be present');
assert.match(iosTools, /UIGraphicsPDFRenderer/, 'iOS UX/UI Studio must generate a native PDF');
assert.match(iosTools, /iconName|marginLeft|fontFamily/, 'iOS design layers must retain implementation metadata');
const uxStudioCss = readFileSync('src/styles.css', 'utf8');
assert.match(webUx, /uxui-device-shell/, 'Web preview must use a target-specific device mockup');
assert.match(webUx, /uxui-brand-title/, 'The redesigned editor must keep its studio heading visible for accessible orientation');
assert.match(webUx, /uxui-quick-style/, 'Common corner styling must be available without opening technical settings');
assert.match(webUx, /aria-label="Mobile"/, 'Mobile target control must stay named when its visible label collapses');
assert.match(webUx, /aria-label="Tablet"/, 'Tablet target control must stay named when its visible label collapses');
assert.match(webUx, /aria-label="Desktop"/, 'Desktop target control must stay named when its visible label collapses');
assert.match(webUx, /uxui-layer-chip/, 'Web editor must expose selectable visual layer chips');
assert.match(webUx, /uxui-color-grid/, 'Web editor must expose the compact palette');
assert.match(webUx, /Fine-tune design/, 'Exact measurements must remain available in the advanced inspector');
assert.match(webUx, /svgToPng\(svg, 3, target\)/, 'PDF preview must include the selected device target frame');
assert.match(uxStudioCss, /\.uxui-canvas-stage/, 'The checkerboard photo-editor canvas styles must be shipped');
assert.match(uxStudioCss, /\.uxui-canvas-hint\s*\{[^}]*color:\s*#E4E7E4/i, 'Canvas hint text must remain readable against the dark device bezel');
assert.match(uxStudioCss, /\.uxui-device-desktop/, 'Desktop preview must use a monitor mockup');
assert.match(uxStudioCss, /\.uxui-device-tablet/, 'Tablet preview must use a tablet mockup');
const androidUxStudio = readFileSync('apps/android/app/src/main/java/com/chastech/env/NativeUxUiStudio.kt', 'utf8');
const iosUxStudio = readFileSync('apps/ios/enV/ToolViews.swift', 'utf8');
assert.match(androidUxStudio, /mutableStateOf\(false\)\};var target by remember\{mutableStateOf\("mobile"\)\}/, 'Android native studio should open directly into the mobile design');
assert.match(androidUxStudio, /if\(showElementTray\)/, 'Android native tools palette should be collapsible');
assert.ok(androidUxStudio.includes('var iconQuery by remember{mutableStateOf("")};var iconResults'), 'Android Compose state declarations must remain separated');
assert.match(androidUxStudio, /Corner style/, 'Android native studio should expose quick rounded-corner styles');
assert.match(androidUxStudio, /0xFF0B0C0E/, 'Android previews must use a device shell');
assert.match(androidUxStudio, /Desktop mockup/, 'Android studio must label the selected device preview simply');
assert.match(androidUxStudio, /0xFF9BA0A5/, 'Android desktop preview must include a monitor stand');
assert.match(iosUxStudio, /didInitialize = true/, 'iOS native studio should initialize its design once');
assert.match(iosUxStudio, /showComponentPalette\.toggle\(\)/, 'iOS native tools palette should be collapsible');
assert.match(iosUxStudio, /aspectRatio\(CGFloat\(boardWidth\) \/ CGFloat\(boardHeight\), contentMode: \.fit\)/, 'iOS preview must preserve target viewport ratio inside a mockup');
assert.match(iosUxStudio, /DisclosureGroup\("Fine-tune design"/, 'iOS technical measurements must be behind simple visual controls');
assert.match(iosUxStudio, /showAllLayers \? elements : Array\(elements\.prefix\(6\)\)/, 'iOS layer list must support a compact preview with see-more');
console.log('UX/UI Studio surface audit: PASS (Web PDF/icon search, Kotlin editor/PDF, SwiftUI editor/PDF and layer metadata).');
console.log(`Developer Studio platform parity: PASS (${web.size} Studios; ${[...web.values()].reduce((sum, modes) => sum + modes.length, 0)} Studio modes match across TypeScript, Kotlin, and Swift).`);
