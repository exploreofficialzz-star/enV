import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(path.join(root, "apps/shared/catalog.json"), "utf8"));
const sharedRoot = path.join(root, "apps/shared/native-icons");
const webIconSource = readFileSync(path.join(root, "src/lib/icons.ts"), "utf8");
const webIconMap = webIconSource.match(/const MAP: Record<string, LucideIcon> = \{([\s\S]*?)\n\};/)?.[1] ?? "";
const iconNames = new Set([
  ...catalog.tools.map((tool) => tool.icon),
  ...catalog.categories.map((category) => category.icon),
  "Home", "LayoutGrid", "Search", "Heart", "User", "Moon", "Sun",
  "ArrowLeft", "ArrowRight", "ChevronDown", "Wrench", "Settings", "Bell", "Info",
  "ShieldCheck", "CircleCheck", "Clock3", "Copy", "RotateCcw", "Play",
  "Globe", "FilePlus2", "Hammer",
]);

function assetName(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function assertPng(file, expectedSize) {
  const data = readFileSync(file);
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${file} is not a PNG`);
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  assert.deepEqual([width, height], expectedSize, `${file} dimensions are unexpected`);
}

assertPng(path.join(sharedRoot, "logo-header-transparent.png"), [960, 640]);
assertPng(path.join(sharedRoot, "logo-header-dark.png"), [960, 640]);
assertPng(path.join(sharedRoot, "logo-home-transparent.png"), [813, 317]);
assertPng(path.join(sharedRoot, "logo-home-dark.png"), [813, 317]);
assertPng(path.join(root, "public/logo-home-transparent.png"), [813, 317]);
assertPng(path.join(root, "public/logo-home-dark.png"), [813, 317]);
for (const name of iconNames) {
  const file = path.join(sharedRoot, "icons", `${assetName(name)}.png`);
  assert.ok(existsSync(file), `Missing shared Lucide asset for ${name}: ${file}`);
  assertPng(file, [96, 96]);
}
for (const name of new Set([...catalog.tools, ...catalog.categories].map((entry) => entry.icon))) {
  assert.ok(new RegExp(`\\b${name}\\b`).test(webIconMap), `Web must map the catalog icon ${name} to a real Lucide component`);
}

const androidAssets = readFileSync(path.join(root, "apps/android/app/src/main/java/com/chastech/env/ui/EnVBrandAssets.kt"), "utf8");
const androidHome = readFileSync(path.join(root, "apps/android/app/src/main/java/com/chastech/env/MainActivity.kt"), "utf8");
const androidToolCard = androidHome.slice(androidHome.indexOf("private fun ToolCard("));
const androidBaseStyles = readFileSync(path.join(root, "apps/android/app/src/main/res/values/styles.xml"), "utf8");
const androidApi27Styles = readFileSync(path.join(root, "apps/android/app/src/main/res/values-v27/styles.xml"), "utf8");
const iosApp = readFileSync(path.join(root, "apps/ios/enV/enVApp.swift"), "utf8");
const iosHome = readFileSync(path.join(root, "apps/ios/enV/ContentViews.swift"), "utf8");
const iosCards = readFileSync(path.join(root, "apps/ios/enV/ToolViews.swift"), "utf8");
const xcodeProject = readFileSync(path.join(root, "apps/ios/enV.xcodeproj/project.pbxproj"), "utf8");
assert.ok(androidAssets.includes('"native-icons/icons/'), "Android must read the shared icon assets");
assert.ok(iosApp.includes('native-icons/icons/'), "iOS must read the shared icon assets");
assert.ok(androidAssets.includes('"native-icons/logo-header-dark.png"'), "Android must use the contrast-safe dark logo");
assert.ok(iosApp.includes('"native-icons/logo-header-dark.png"'), "iOS must use the contrast-safe dark logo");
assert.ok(androidAssets.includes('"native-icons/logo-home-transparent.png"') && androidAssets.includes('"native-icons/logo-home-dark.png"'), "Android must load cropped home logo variants");
assert.ok(iosApp.includes('native-icons/logo-home-transparent.png') && iosApp.includes('native-icons/logo-home-dark.png'), "iOS must load cropped home logo variants");
assert.ok(androidHome.includes("homeHero = true"), "Android home must use the cropped hero logo");
assert.ok(iosHome.includes("EnVLogo(homeHero: true)"), "iOS home must use the cropped hero logo");
assert.ok(androidHome.includes('HomePreviewBar("AI assistant", Modifier.weight(1f))') && androidHome.includes('HomePreviewBar("Total token = 100", Modifier.weight(1f))'), "Android home must include equal-width horizontal preview bars with the requested labels");
assert.ok(iosHome.includes('HomePreviewBar(title: "AI assistant").frame(maxWidth: .infinity)') && iosHome.includes('HomePreviewBar(title: "Total token = 100").frame(maxWidth: .infinity)'), "iOS home must include equal-width horizontal preview bars with the requested labels");
assert.ok(androidHome.includes("padding(start = 20.dp, top = 6.dp, end = 20.dp)") && androidHome.includes("contentAlignment = Alignment.Center"), "Android preview bars must have wider side insets and centered text");
assert.ok(iosHome.includes(".padding(.horizontal, 20)") && iosHome.includes("alignment: .center") && iosHome.includes("multilineTextAlignment(.center)"), "iOS preview bars must have wider side insets and centered text");
assert.ok(androidHome.includes("Arrangement.spacedBy(8.dp)") && iosHome.includes("HStack(spacing: 8)"), "Native preview bars must be separated from each other");
assert.ok(androidHome.includes("modifier.height(40.dp)"), "Android preview bars must be smaller than the search field");
assert.ok(iosHome.includes(".frame(height: 40)"), "iOS preview bars must be smaller than the search field");
assert.ok(androidHome.includes('SectionTitle("Trending tools", accent = true)') && androidHome.includes("if (accent) MaterialTheme.colorScheme.primary"), "Android Trending title must use the accent color");
assert.ok(iosHome.includes('sectionHeader("Trending tools", subtitle: "Useful tools to explore today", accent: true)') && iosHome.includes("accent ? Color.envAccent : Color.envInk"), "iOS Trending title must use the accent color");
assert.ok(androidHome.includes('Text("All tools"') && androidHome.includes('contentDescription = "Search all tools"') && androidHome.includes('groupCategory.icon') && androidHome.includes('"See more tools"') && androidHome.includes('"ChevronDown"') && !androidHome.includes('"Available (') && !androidHome.includes('"Coming Soon ('), "Android All Tools must group tools under category icons with progressive See more and no availability filters");
assert.ok(iosHome.includes('Text("All tools")') && iosHome.includes('TextField("Search", text: $toolsQuery)') && iosHome.includes("store.tools(matching: toolsQuery)") && iosHome.includes("group.category.icon") && iosHome.includes("See more tools") && iosHome.includes('"ChevronDown"') && !iosHome.includes('Text("\\(matchingTools.count) results")'), "iOS All Tools must group tools under category icons with progressive See more and no global results count");
assert.ok(androidHome.includes('groupCategory.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary') && androidHome.includes('contentAlignment = Alignment.CenterEnd') && androidHome.includes('Text("See more tools", color = MaterialTheme.colorScheme.primary)'), "Android category names and right-aligned See more buttons must use the Trending accent");
assert.ok(iosHome.includes('.font(.headline.weight(.bold))') && iosHome.includes('.foregroundStyle(Color.envAccent)') && iosHome.includes('HStack {\n                                        Spacer()'), "iOS category names and right-aligned See more buttons must use the Trending accent");
assert.ok(androidToolCard.includes('EnVIcon("ArrowRight"') && androidToolCard.includes('tint = MaterialTheme.colorScheme.onSurface') && androidToolCard.indexOf('EnVIcon("ArrowRight"') > androidToolCard.indexOf('StatusPill("On device"'), "Android tool cards must show an adaptive arrow at the bottom-right after tool details");
assert.ok(iosCards.includes('EnVIcon(name: "ArrowRight"') && iosCards.includes('tint: .primary') && iosCards.indexOf('EnVIcon(name: "ArrowRight"') > iosCards.indexOf('StatusPill(text: "WEB ONLY"'), "iOS tool cards must show an adaptive arrow at the bottom-right after tool details");
assert.ok(androidHome.includes('AppTab.Home -> HomeScreen') && androidHome.includes('category = null; tab = AppTab.Search.name') && androidHome.includes('catalog.search(query).take(5)') && androidHome.includes('Text("See more results"'), "Android Home must show live tool suggestions and open full Search results only on an explicit action");
assert.ok(iosHome.includes('private var searchSuggestions: [Tool]') && iosHome.includes('ForEach(searchSuggestions)') && iosHome.includes('Text("See more results")') && iosApp.includes('HomeView(onSearch: { query in searchQuery = query; selectedTab = NativeTab.search.rawValue })') && iosApp.includes('SearchView(query: $searchQuery)'), "iOS Home must show live tool suggestions and open the full Search results view only on an explicit action");
assert.ok(androidHome.includes("SideEffect {") && androidHome.includes("window.statusBarColor = systemBarColor") && androidHome.includes("WindowCompat.getInsetsController") && androidHome.includes("isAppearanceLightStatusBars = !darkMode"), "Android status and navigation bars must follow the active theme with readable system icons");
assert.ok(!androidBaseStyles.includes("windowLightNavigationBar") && androidApi27Styles.includes("android:windowLightNavigationBar") && androidHome.includes("Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1"), "Android light-navigation styling must be API-27-qualified for minSdk 26");
assert.ok(iosApp.includes("envChrome = adaptive(light: 0xFFFFFF, dark: 0x000000)") && iosApp.includes(".toolbarBackground(Color.envChrome, for: .navigationBar)"), "iOS browser-like navigation and safe-area chrome must be white in light mode and black in dark mode");
assert.ok(androidHome.includes("top = 4.dp") && androidHome.includes("Arrangement.spacedBy(14.dp)") && androidHome.includes("Modifier.padding(bottom = 2.dp).width(142.dp).height(56.dp)"), "Android home must use 4dp header spacing and 16dp brand-to-search spacing");
assert.ok(iosHome.includes(".padding(.top, 4)") && iosHome.includes("VStack(alignment: .center, spacing: 16)") && iosHome.includes(".frame(width: 142, height: 56)"), "iOS home must use 4pt header spacing and 16pt brand-to-search spacing");
assert.ok(!androidHome.includes("bottomBar = {"), "Android must not render a bottom navigation bar");
assert.ok(!iosApp.includes("EnVBottomBar") && !iosApp.includes(".safeAreaInset(edge: .bottom"), "iOS must not render a bottom navigation bar");
assert.ok(!androidAssets.includes("Icons.Default."), "Android icons must not fall back to platform-specific Material symbols");
assert.ok(!iosApp.includes("Image(systemName:"), "iOS icons must not fall back to platform-specific SF Symbols");
assert.ok(xcodeProject.includes("../shared/native-icons"), "Xcode must bundle the shared icon folder");
assert.ok(xcodeProject.includes("native-icons in Resources"), "Xcode resource phase must include the shared icon folder");

console.log(`Validated the shared enV logo and ${iconNames.size} Lucide icons across Android and iOS.`);
