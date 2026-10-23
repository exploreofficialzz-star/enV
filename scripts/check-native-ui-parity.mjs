import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const android = readFileSync("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt", "utf8");
const iosContent = readFileSync("apps/ios/enV/ContentViews.swift", "utf8");
const iosApp = readFileSync("apps/ios/enV/enVApp.swift", "utf8");
const iosTools = readFileSync("apps/ios/enV/ToolViews.swift", "utf8");
const androidTheme = readFileSync("apps/android/app/src/main/java/com/chastech/env/ui/Theme.kt", "utf8");
const androidWordText = readFileSync("apps/android/app/src/main/java/com/chastech/env/ui/CharacterSpacedText.kt", "utf8");
const webStyles = readFileSync("src/styles.css", "utf8");
const webHome = readFileSync("src/routes/index.tsx", "utf8");
const webSearchBox = readFileSync("src/components/tools/search-box.tsx", "utf8");
const webToolShell = readFileSync("src/components/tools/tool-shell.tsx", "utf8");
const webStore = readFileSync("src/lib/storage.ts", "utf8");
const themeHook = readFileSync("src/hooks/use-theme.ts", "utf8");
const iosAssistant = readFileSync("apps/ios/enV/AssistantChat.swift", "utf8");
const androidInfo = readFileSync("apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt", "utf8");
const androidAssistant = readFileSync("apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt", "utf8");
const androidStore = readFileSync("apps/android/app/src/main/java/com/chastech/env/data/FavoritesStore.kt", "utf8");
const iosCatalog = readFileSync("apps/ios/enV/CatalogCore.swift", "utf8");
const androidCatalog = readFileSync("apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt", "utf8");
const androidAccessibility = readFileSync("apps/android/app/src/main/java/com/chastech/env/NativeAccessibilityToolForm.kt", "utf8");
const androidAccessibilityEngine = readFileSync("apps/android/app/src/main/java/com/chastech/env/NativeAccessibilityEngine.kt", "utf8");
const iosAccessibilityEngine = readFileSync("apps/ios/enV/NativeAccessibilityEngine.swift", "utf8");

// Android detail links push onto a stack; system Back returns to the prior detail.
assert.match(android, /var detailStack by rememberSaveable/);
assert.match(android, /BackHandler \{ detailStack = detailStack\.dropLast\(1\) \}/);
assert.match(android, /onRelatedTool = openRelatedTool/);
assert.match(android, /private fun ToolRecord\.isUnderProduction\(\): Boolean/);
assert.match(android, /productionTool\?\.let \{ requestedTool ->[\s\S]*?AlertDialog/);

// Home search drafts remain local until submit, rather than leaking into Tools/Search.
assert.match(android, /var homeQuery by rememberSaveable/);
assert.match(android, /HomeScreen\(catalog, favoriteIds, mostUsedIds, homeQuery, \{ homeQuery = it \}, \{ submitted -> query = submitted/);
const homeScreen = android.split("private fun HomeScreen(")[1]?.split("@Composable\nprivate fun WebHomeToolCard")[0] ?? "";
assert.ok(homeScreen.length > 0, "Android HomeScreen source should be present");
assert.doesNotMatch(homeScreen, /\b(?:var|val)\s+query\s*:/, "Home draft/filter should not declare or consume global Search query state");
assert.match(homeScreen, /homeQuery: String, onQuery:/);

// Native discovery shells use the web's 1152px content maximum.
assert.match(android, /widthIn\(max = 1152\.dp\)/);
assert.ok((iosContent.match(/frame\(maxWidth: 1152\)/g) ?? []).length >= 3, "iOS home, tools, and category screens should share the capped shell");

// Keep the web and each native app on their own platform system sans-serif.
assert.match(webStyles, /--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif/);
assert.match(webStyles, /letter-spacing: 0\.02em/);
assert.match(androidTheme, /typography = EnVTypography/);
assert.match(android, /import com\.chastech\.env\.ui\.CharacterSpacedText as Text/);
assert.match(androidWordText, /private val subtleCharacterSpacing = 0\.02\.em/);
assert.match(androidWordText, /letterSpacing = if \(letterSpacing == TextUnit\.Unspecified\) subtleCharacterSpacing else letterSpacing/);
assert.match(iosApp, /func enVCharacterSpacedText\(_ source: String\)/);
assert.match(iosApp, /Text\(verbatim: source\)\.tracking\(0\.25\)/);
assert.match(iosApp, /func enVLocalizedCharacterSpacedText\(_ key: LocalizedStringKey\)/);
assert.match(androidTheme, /fontScale \* EnVFontScale/);
assert.match(androidTheme, /EnVFontScale = 1\.11f/);
assert.match(androidTheme, /titleSmall = system\.titleSmall\.copy\(fontWeight = FontWeight\.Normal\)/);
assert.doesNotMatch(`${android}${androidInfo}${androidAssistant}`, /FontWeight\.(?:Bold|SemiBold|Medium)/, "Android screens must not add heavier font-weight overrides");
assert.doesNotMatch(android, /(?:In-browser|IN-BROWSER)/, "Android must not describe on-device tools as browser-only");
assert.match(android, /Text\("On device"/);
assert.match(android, /StatusPill\("ON DEVICE"/);
assert.match(androidTheme, /CompositionLocalProvider\(LocalDensity provides scaledDensity\)/);
assert.match(webStyles, /--text-base: 1\.11rem/);
assert.match(webStyles, /font-size: 1\.11rem/);
assert.match(webStyles, /line-height: 1\.5/);
assert.match(iosApp, /size \* 1\.11/);
assert.match(iosApp, /dynamicTypeSize\(dynamicTypeSize\.enVIncreased\)/);
assert.match(iosApp, /EnVIcon\(name: "Home", size: 24, tint: \.envMuted\)\.frame\(width: 44, height: 44\)/, "iOS Home target must meet the 44pt hit-area minimum");
assert.match(iosApp, /EnVIcon\(name: "Heart", size: 24, tint: \.envMuted\)\.frame\(width: 44, height: 44\)/, "iOS Saved target must meet the 44pt hit-area minimum");
assert.match(iosApp, /EnVIcon\(name: "LayoutGrid", size: 24, tint: \.envMuted\)\.frame\(width: 44, height: 44\)/, "iOS Tools target must meet the 44pt hit-area minimum");
assert.match(iosApp, /\.frame\(width: 44, height: 44\)\s*\.contentShape\(Rectangle\(\)\)/, "iOS overflow menu target must meet the 44pt hit-area minimum");
assert.match(iosContent, /horizontalSizeClass == \.regular \? 36 : 24/);
assert.match(iosContent, /\.font\(\.envScaled\(size: 30, weight: \.bold\)\)/);
assert.match(iosContent, /LazyVStack\(alignment: \.leading, spacing: 24\)/);
assert.match(iosTools, /\.font\(\.envScaled\(size: 14, weight: \.semibold\)\)/);
assert.match(iosTools, /\.font\(\.envScaled\(size: 10, weight: \.medium\)\)/);
assert.match(iosAssistant, /\.font\(\.envScaled\(size: 14, weight: \.semibold\)\)/);
assert.match(android, /screenWidth >= 640\) 36\.sp else 24\.sp/);
assert.match(android, /contentPadding = PaddingValues\(horizontal = 16\.dp, vertical = 40\.dp\),\s*verticalArrangement = Arrangement\.spacedBy\(24\.dp\)/);
assert.match(android, /headlineSmall\.copy\(fontSize = 30\.sp\), fontWeight = FontWeight\.Normal, color = MaterialTheme\.colorScheme\.primary/);

// Information-page back and legal email actions remain actionable and return to the source tab.
assert.match(android, /showInformation\s*->\s*NativeInformationScreen\(\s*informationPage,\s*catalog,\s*onBack\s*=\s*\{\s*showInformation\s*=\s*false;\s*tab\s*=\s*informationReturnTab\s*\}/, "Android information page must return to its originating tab through the explicit onBack callback.");
assert.match(androidInfo, /private fun InformationParagraph\(text: String\)/);
assert.match(androidInfo, /pushStringAnnotation\(tag = "mailto"/);
assert.match(androidInfo, /No email app is available/);
assert.match(android, /Year\.now\(\)\.value/);
assert.match(iosContent, /Calendar\.current\.component\(\.year, from: \.now\)/);
assert.match(android, /SearchBox\(catalog, query, onQuery, onTool\) \{ searchFocused = it \}/);
assert.match(android, /contentDescription = "Search tools"/);
assert.match(iosContent, /enVCharacterSpacedText\("Search tools"\)/);
assert.match(iosContent, /TextField\(isHomeSearchFocused \? "" : "Search for a tool", text: \$searchText/);
assert.match(iosContent, /\.accessibilityLabel\("Search tools"\)/);
assert.match(android, /suggestions\.firstOrNull\(\)\?\.let \{ onTool\(it\.id\) \}/);
assert.match(android, /if \(focused && value\.isNotBlank\(\)\) \{[\s\S]*?Popup\(alignment = Alignment\.TopStart[\s\S]*?suggestions\.forEach/);
assert.match(iosContent, /\.overlay\(alignment: \.top\)[\s\S]*?if isHomeSearchFocused && hasSearchText[\s\S]*?ForEach\(searchSuggestions\)/);
assert.match(iosContent, /if let first = searchSuggestions\.first[\s\S]*?homePath\.append\(first\)/);
assert.match(iosContent, /horizontalSizeClass == \.regular \? 288 : min\(288, max\(160, UIScreen\.main\.bounds\.width \* 0\.52\)\)/);
assert.match(android, /Column\(horizontalAlignment = Alignment\.CenterHorizontally, verticalArrangement = Arrangement\.spacedBy\(if \(screenWidth >= 640\) 20\.dp else 16\.dp\), modifier = Modifier\.widthIn\(max = 800\.dp\)\.fillMaxWidth\(\)\.padding\(horizontal = 16\.dp\)\)/);
assert.match(android, /Modifier\.width\(if \(screenWidth >= 640\) 163\.dp else 142\.dp\)\.height\(if \(screenWidth >= 640\) 64\.dp else 56\.dp\)/);
assert.match(android, /Modifier\.fillMaxWidth\(\)\.height\(if \(screenWidth >= 640\) 72\.dp else 64\.dp\)/);
assert.match(iosContent, /EnVLogo\(homeHero: true\)\.frame\(width: horizontalSizeClass == \.regular \? 163 : 142, height: horizontalSizeClass == \.regular \? 64 : 56\)/);
assert.match(iosContent, /\.frame\(maxWidth: 768\)\s*\.frame\(maxWidth: \.infinity, alignment: \.center\)/);
const androidHome = android.split("private fun HomeScreen(")[1]?.split("@Composable\nprivate fun WebHomeToolCard")[0] ?? "";
const androidPreview = android.split("private fun HomePreviewBar(")[1]?.split("@Composable private fun SectionTitle")[0] ?? "";
const iosHome = iosContent.split("struct HomeView: View")[1]?.split("private struct ResponsiveToolGrid")[0] ?? "";
const iosMostUsed = iosContent.split("private struct HomeMostUsedToolsTray: View")[1]?.split("private struct")[0] ?? "";
const iosPreview = iosContent.split("private struct HomePreviewBar: View")[1]?.split("func iconTile")[0] ?? "";
const iosFooter = iosContent.split("private struct WebHomeFooter: View")[1]?.split("private struct ToolCategoryGroup")[0] ?? "";
const androidSearchSuggestion = android.split("private fun WebHomeSearchSuggestion(")[1]?.split("@Composable\nprivate fun WebHomeFooter")[0] ?? "";
const iosSearchSuggestion = iosContent.split("private struct WebHomeSearchSuggestion: View")[1]?.split("private struct WebHomeFooter")[0] ?? "";
const webRelated = webToolShell.split('<h2 className="text-lg font-semibold text-accent">Related tools</h2>')[1]?.split("</section>")[0] ?? "";
const androidToolDetail = android.split("private fun ToolDetail(")[1]?.split("@Composable\nprivate fun NativeToolHeader")[0] ?? "";
const androidRelatedCard = android.split("private fun RelatedToolCard(")[1]?.split("@Composable\nprivate fun NativeToolForm")[0] ?? "";
const iosToolDetail = iosTools.split("struct ToolDetailView: View")[1]?.split("private func toolHeading")[0] ?? "";
const webFullscreenTarget = webToolShell.split("ref={toolInterfaceRef}")[1]?.split("</section>")[0] ?? "";
const androidFullscreenBranch = androidToolDetail.split("if (isFullscreen) {")[1]?.split("} else {")[0] ?? "";
const iosFullscreenContainer = iosTools.split("private struct ToolFullscreenContainer")[1]?.split("struct ToolDestinationView")[0] ?? "";
const iosRelatedCard = iosTools.split("private struct RelatedToolDetailCard: View")[1]?.split("/// The native surface")[0] ?? "";
assert.match(webHome, /gap-4 rounded-full/, "Web branded search should use a fully rounded capsule");
assert.match(webHome, /inputClassName="min-w-0 flex-1 bg-transparent text-left/);
assert.match(androidHome, /Box\(Modifier\.weight\(1f\)\.padding\(horizontal = 16\.dp\), contentAlignment = Alignment\.CenterStart\)/);
assert.match(androidHome, /textAlign = TextAlign\.Start/);
assert.match(iosHome, /HStack\(spacing: 16\)/, "iOS branded search should keep a deliberate logo-to-field gap");
assert.match(iosHome, /\.multilineTextAlignment\(\.leading\)/);
assert.ok(
  webToolShell.includes("ref={toolInterfaceRef}") &&
  webToolShell.indexOf("<header") < webToolShell.indexOf("ref={toolInterfaceRef}") &&
  webFullscreenTarget.includes("{children}") &&
  webFullscreenTarget.includes("Exit full screen") &&
  !webFullscreenTarget.includes("<h1") &&
  !webFullscreenTarget.includes("{tool.description}") &&
  webToolShell.includes("requestFullscreen") &&
  webToolShell.includes("fullscreenchange") &&
  webToolShell.includes("env-tool-fullscreen__content") &&
  webStyles.includes(".env-tool-fullscreen {") &&
  webStyles.includes("height: 100dvh") &&
  webStyles.includes("env(safe-area-inset-top)"),
  "Web fullscreen must target only the working interface and use a safe-area-aware viewport layout."
);
assert.ok(
  androidFullscreenBranch.includes("NativeToolInterfaceContent(tool, backend, supported, onRelatedTool)") &&
  androidFullscreenBranch.includes("Exit full screen for ${tool.name}") &&
  !androidFullscreenBranch.includes("NativeToolHeader") &&
  !androidFullscreenBranch.includes("tool.description") &&
  !androidFullscreenBranch.includes("NativeToolSaveButton") &&
  androidFullscreenBranch.includes("heightIn(min = 48.dp)") &&
  androidFullscreenBranch.includes("verticalScroll(rememberScrollState())") &&
  android.includes("if (isToolFullscreen) BackHandler { isToolFullscreen = false }"),
  "Android fullscreen must render only the working tool interface, with Back/exit support and no page heading or description."
);
assert.ok(
  iosFullscreenContainer.includes("content") &&
  iosFullscreenContainer.includes('accessibilityIdentifier("tool-fullscreen-exit")') &&
  !iosFullscreenContainer.includes("toolHeading") &&
  !iosFullscreenContainer.includes("tool.description") &&
  !iosFullscreenContainer.includes("nativeDisclaimerText") &&
  !iosFullscreenContainer.includes("saveButton") &&
  iosTools.includes(".fullScreenCover(isPresented: $isToolFullscreen)") &&
  iosTools.includes(".statusBarHidden(true)"),
  "iOS fullscreen must use a dedicated full-screen presentation containing only the working tool interface and a non-overlapping exit action."
);
assert.match(iosTools, /Image\(systemName: isToolFullscreen \? "arrow\.down\.right\.and\.arrow\.up\.left" : "arrow\.up\.left\.and\.arrow\.down\.right"\)/, "iOS fullscreen control must switch between enter and exit icons.");
assert.match(androidHome, /Popup\(alignment = Alignment\.TopStart, offset = IntOffset\(0, with\(LocalDensity\.current\)/);
assert.match(iosHome, /\.overlay\(alignment: \.top\)[\s\S]*?if isHomeSearchFocused && hasSearchText[\s\S]*?\.zIndex\(isHomeSearchFocused && hasSearchText/);
assert.match(webSearchBox, /className="absolute z-20 mt-2 w-full/);
assert.match(webSearchBox, /ArrowRight className="size-4 shrink-0"/);
assert.match(androidSearchSuggestion, /EnVToolAppIcon\(tool, size = 32\.dp\)[\s\S]*?EnVIcon\("ArrowRight", Modifier\.size\(16\.dp\)/, "Android search suggestions must show tool icon tiles.");
assert.match(iosSearchSuggestion, /EnVToolAppIcon\(tool: tool, size: 32\)[\s\S]*?EnVIcon\(name: "ArrowRight", size: 16, tint: \.envInk\)/, "iOS search suggestions must show tool icon tiles.");
assert.match(androidHome, /shape = RoundedCornerShape\(percent = 50\)/, "Android hero search should use a capsule shape");
assert.match(iosHome, /\.background\(Color\.envCard, in: Capsule\(\)\)/, "iOS hero search should use a native capsule shape");
assert.match(iosHome, /\.overlay\(Capsule\(\)\.stroke\(/, "iOS focused and resting search borders should follow the capsule shape");
assert.match(webHome, /rounded-full/, "Web hero search should use a fully rounded pill shape");
assert.match(android, /val previewWidth = minOf\(maxWidth \* 0\.84f, 640\.dp\)/);
assert.match(androidPreview, /RoundedCornerShape\(20\.dp\)/);
assert.match(androidPreview, /color = containerColor/);
assert.match(iosPreview, /RoundedRectangle\(cornerRadius: 20\)/);
assert.match(iosPreview, /background\(Color\.envSurface2/);
assert.match(webHome, /className="flex h-10 min-w-0 items-center justify-center rounded-\[20px\] border border-border-strong bg-surface-2/);
assert.match(webToolShell, /<h2 className="text-lg font-semibold text-accent">Related tools<\/h2>/);
assert.match(webRelated, /related\.slice\(0, visibleRelatedCount\)/);
assert.match(webRelated, /ArrowRight className="mt-auto ml-auto size-4"/);
assert.match(webRelated, /related\.length > visibleRelatedCount/);
assert.match(webRelated, /See more related tools/);
assert.match(webRelated, /setVisibleRelatedCount\(\(count\) => Math\.min\(count \+ 6, related\.length\)\)/);
assert.match(androidToolDetail, /catalog\.relatedTools\(tool, Int\.MAX_VALUE\)/);
assert.match(androidToolDetail, /Text\("Related tools"[\s\S]*?color = MaterialTheme\.colorScheme\.primary/);
assert.match(androidToolDetail, /related\.take\(visibleRelatedCount\)/);
assert.match(androidToolDetail, /related\.size > visibleRelatedCount[\s\S]*?Text\("See more"/);
assert.match(androidRelatedCard, /EnVIcon\("ArrowRight", Modifier\.size\(16\.dp\)/);
assert.match(iosToolDetail, /relatedTools\(for: tool, limit: Int\.max\)/);
assert.match(iosToolDetail, /enVCharacterSpacedText\("Related tools"\)[\s\S]*?foregroundStyle\(Color\.envAccent\)/);
assert.match(iosToolDetail, /let allRelatedTools = relatedTools[\s\S]*?ForEach\(allRelatedTools\.prefix\(visibleRelatedCount\)\)/);
assert.match(iosToolDetail, /allRelatedTools\.count > visibleRelatedCount[\s\S]*?enVCharacterSpacedText\("See more"\)/);
assert.match(iosRelatedCard, /EnVIcon\(name: "ArrowRight", size: 16, tint: \.envInk\)/);
assert.match(android, /val homeSurface2 = if \(darkMode\) Color\(0xFF1E2327\) else Color\(0xFFEFECE6\)/);
assert.match(androidHome, /MostUsedToolsTray\(mostUsed, onTool, homeSurface2, Modifier\.fillMaxWidth\(\)\)/);
assert.match(androidHome, /val visibleCount = if \(maxWidth >= 768\.dp\) 10 else 5/);
assert.match(androidHome, /val iconSize = if \(maxWidth >= 768\.dp\) 44\.dp else 40\.dp/);
assert.match(androidHome, /EnVToolAppIcon\(tool, size = iconSize\)/, "Android home shortcuts must use the redesigned app icon tile.");
assert.match(iosMostUsed, /let iconSide = proxy\.size\.width >= 768 \? 44\.0 : 40\.0/);
assert.match(iosMostUsed, /EnVToolAppIcon\(tool: tool, size: iconSide\)/, "iOS home shortcuts must use the redesigned app icon tile.");
assert.match(iosMostUsed, /EnVToolAppIcon\(tool: tool, size: iconSide\)/);
assert.match(androidPreview, /fontSize = if \(isLarge\) 14\.sp else 10\.sp/);
assert.match(iosHome, /proxy\.size\.width \* 0\.84, 640/);
assert.match(iosFooter, /Rectangle\(\)\.fill\(Color\.envBorder\)\.frame\(height: 1\)/);
assert.match(iosFooter, /\.padding\(\.vertical, 16\)/);
assert.doesNotMatch(iosFooter, /linkGroup\("Product"|linkGroup\("Resources"/);
assert.match(iosFooter, /linkGroup\("Legal"/);
assert.match(android, /padding\(horizontal = horizontalPadding, vertical = 12\.dp\)/);
assert.doesNotMatch(android, /FooterProductLinks|FooterResourceLinks/);
assert.match(android, /private fun FooterLegalLinks/);
assert.match(android, /Column\(Modifier\.fillMaxWidth\(\)\.background\(MaterialTheme\.colorScheme\.surface\)\)/);
assert.match(android, /contentDescription = "Search tools"/);
assert.match(android, /if \(homeSearchFocused && homeQuery\.isNotBlank\(\)\) \{\s*Popup\(alignment = Alignment\.TopStart[\s\S]*?Surface\(Modifier\.width\(suggestionWidth\), color = MaterialTheme\.colorScheme\.surface, shape = RoundedCornerShape\(14\.dp\)/);
assert.match(android, /if \(suggestions\.isEmpty\(\)\) \{[\s\S]*?TextButton\(onClick = \{ onSearch\(homeQuery\) \}[^\n]*\{ Text\("See more results"\) \}/);
assert.match(iosContent, /\.accessibilityLabel\("Search tools"\)/);
assert.match(iosContent, /\.accessibilityLabel\("Search all tools"\)/);
assert.match(iosContent, /if searchSuggestions\.isEmpty \{[\s\S]*?Text\("See more results"\)/);
assert.match(android, /LaunchedEffect\(selected\?\.id\)[\s\S]*?favorites\.recordRecent\(it\)[\s\S]*?mostUsedIds = favorites\.getMostUsed\(\)/);
assert.match(androidStore, /private val recentKey = "recent_tool_ids"/);
assert.match(androidStore, /fun recordRecent\(toolId: String\): List<String>/);
assert.match(androidStore, /\.filterNot \{ it == toolId \}.*\.take\(24\)/s);
assert.match(iosTools, /\.onAppear \{ store\.recordRecent\(tool\.id\) \}/);
assert.match(iosCatalog, /@Published private\(set\) var recentIDs: \[String\]/);
assert.match(iosCatalog, /func recordRecent\(_ toolID: String\)/);
assert.match(iosCatalog, /\.prefix\(24\)/);
assert.match(androidStore, /private val usageKey = "tool_use_counts"/);
assert.match(androidStore, /fun getMostUsed\(limit: Int = 10\)/);
assert.match(android, /favorites\.getMostUsed\(\)/);
assert.match(androidHome, /MostUsedToolsTray\(mostUsed, onTool/);
assert.match(androidHome, /mostUsedIds\.mapNotNull \{ catalog\.displayTool\(it\) \}\.distinctBy \{ it\.id \}\.take\(10\)/);
assert.match(androidHome, /RoundedCornerShape\(percent = 50\)/);
assert.match(iosCatalog, /env\.toolUseCounts/);
assert.match(iosCatalog, /var mostUsedIDs: \[String\]/);
assert.match(iosContent, /HomeMostUsedToolsTray\(tools: mostUsedTools\)/);
assert.match(iosContent, /store\.mostUsedIDs\.compactMap \{ store\.catalog\.displayTool\(for: \$0\) \}\.filter \{ seen\.insert\(\$0\.id\)\.inserted \}\.prefix\(10\)/);
assert.match(iosContent, /\.background\(Color\.envCard, in: Capsule\(\)\)/);
assert.match(iosContent, /\.overlay\(Capsule\(\)\.stroke\(/);
assert.match(webStore, /env:tool-use-counts/);
assert.match(webStore, /rankMostUsedToolIds/);
assert.match(webHome, /rankMostUsedToolIds\(recent, usageCounts, 10\)/);
assert.match(webHome, /Your most-used tools/);
assert.match(webHome, /className=\{prefsHydrated \? "visible" : "invisible"\} aria-busy=\{!prefsHydrated\}/);
assert.match(themeHook, /const useIsomorphicLayoutEffect = typeof window === "undefined" \? useEffect : useLayoutEffect/);
assert.match(themeHook, /useIsomorphicLayoutEffect\(\(\) => \{\s*if \(!hydrated\) hydrate\(\);/);
assert.match(webHome, /className="mx-auto mt-4 h-\[112px\] w-full max-w-3xl/);
assert.match(androidHome, /MostUsedToolsTray\(mostUsed, onTool, homeSurface2, Modifier\.fillMaxWidth\(\)\)/);
assert.ok(!/HomeMostUsedToolsTray\(tools: mostUsedTools\)[\s\S]{0,120}\.padding\(\.horizontal, 8\)/.test(iosHome), "iOS personal tray should not have an extra inset relative to search");
assert.ok(webHome.indexOf("Total token = 100") < webHome.indexOf("<MostUsedToolsTray") && webHome.indexOf("<MostUsedToolsTray") < webHome.indexOf('<h1 className="mt-6'), "Web home order should be AI/token, personal tray, then the hero headline");
assert.ok(androidHome.indexOf('HomePreviewBar("Total token = 100"') < androidHome.indexOf("MostUsedToolsTray(mostUsed") && androidHome.indexOf("MostUsedToolsTray(mostUsed") < androidHome.indexOf('Text("A focused toolkit'), "Android home order should be AI/token, personal tray, then the hero headline");
assert.ok(iosHome.indexOf('HomePreviewBar(title: "Total token = 100")') < iosHome.indexOf("HomeMostUsedToolsTray(tools: mostUsedTools)") && iosHome.indexOf("HomeMostUsedToolsTray(tools: mostUsedTools)") < iosHome.indexOf('Text("A focused toolkit'), "iOS home order should be AI/token, personal tray, then the hero headline");
assert.match(webHome, /h-\[112px\].*rounded-\[28px\]/);
assert.match(androidHome, /MostUsedToolsTray[\s\S]*?height\(112\.dp\)/);
assert.match(webHome, /personal-tools-scroll snap-x snap-mandatory/);
assert.match(webStyles, /grid-auto-columns: calc\(20% - 9\.6px\)/);
assert.match(webStyles, /grid-auto-columns: calc\(10% - 10\.8px\)/);
assert.match(webStyles, /overflow-x: auto/);
assert.match(webStyles, /scrollbar-width: none/);
assert.match(webStyles, /::-webkit-scrollbar/);
assert.match(androidHome, /val visibleCount = if \(maxWidth >= 768\.dp\) 10 else 5/);
assert.match(androidHome, /val cellWidth = \(maxWidth - 24\.dp - 12\.dp \* \(visibleCount - 1\)\.toFloat\(\)\) \/ visibleCount\.toFloat\(\)/);
assert.match(androidHome, /Arrangement\.spacedBy\(12\.dp\)/);
assert.match(iosContent, /let visibleCount = proxy\.size\.width >= 768 \? 10 : 5/);
assert.match(iosContent, /ScrollView\(\.horizontal, showsIndicators: false\)/);
assert.match(iosContent, /HomeMostUsedToolsTray:[\s\S]*?\.frame\(height: 112\)[\s\S]*?\.frame\(height: 112\)/);
assert.match(iosContent, /HStack\(spacing: 12\)/);
assert.match(androidCatalog, /val browserActiveToolCount: Int[\s\S]*?relatedReferenceTools\)\.count \{ it\.status == "active" \|\| it\.status == "beta" \}/);
assert.match(iosCatalog, /var browserActiveToolCount: Int[\s\S]*?\(tools \+ \(relatedReferenceTools \?\? \[\]\)\)\.filter \{ \$0\.status == "active" \|\| \$0\.status == "beta" \}\.count/);
assert.match(android, /\$\{catalog\.browserActiveToolCount\} browser tools/);
assert.match(android, /\$\{catalog\.browserActiveToolCount\} live tools/);
assert.match(android, /\$\{catalog\.browserActiveToolCount\} live tools/);
assert.match(iosContent, /WebHomeFooter\(activeCount: store\.catalog\.browserActiveToolCount/);

// All advertised catalog records remain discoverable; general browser-runtime references stay labeled and do not receive a WebView execution fallback.
assert.match(android, /catalog\.webSearch\(query, includeRelatedReferences = true\)/);
assert.match(android, /catalog\.webSearch\(value, limit = 8, includeRelatedReferences = true\)/);
assert.match(android, /\(catalog\.tools \+ catalog\.relatedReferenceTools\)\.filter \{ it\.id in favorites \}/);
assert.match(androidCatalog, /\(tools \+ relatedReferenceTools\)\.asSequence\(\)/);
assert.ok(android.includes("NativeCopy.isWebRuntimeOnly(tool.id)") && android.includes('Text("Web only"'), "Android discovery labels retained browser-only tools");
assert.match(android, /authority\("envtools\.store"\)[\s\S]*?appendPath\("tools"\)[\s\S]*?Intent\(Intent\.ACTION_VIEW/);
assert.match(iosContent, /webSearch\(toolsQuery, includeRelatedReferences: true\)/);
assert.match(iosContent, /webSearch\(text, limit: Int\.max, includeRelatedReferences: true\)/);
assert.match(iosCatalog, /\(catalog\.tools \+ \(catalog\.relatedReferenceTools \?\? \[\]\)(?: \+ catalog\.developerStudioTools\(\))?\)\.filter \{ favoriteIDs\.contains/);
assert.match(iosCatalog, /catalog\.tools \+ \(catalog\.relatedReferenceTools \?\? \[\]\)/);
assert.ok(iosTools.includes("https://envtools.store/tools/\\(tool.category)/\\(tool.slug)"), "iOS opens the canonical Web-only tool route");
assert.match(iosContent, /NativeCopy\.isWebRuntimeOnly\(tool\.id\)/);
assert.match(android, /private fun nativeSupported\(tool: ToolRecord\): Boolean = !NativeCopy\.isWebRuntimeOnly\(tool\.id\)/);
assert.match(android, /private fun nativeBackendSupported\(tool: ToolRecord\): Boolean = !NativeCopy\.isWebRuntimeOnly\(tool\.id\)/);
assert.match(iosTools, /private var backend: Bool \{ !NativeCopy\.isWebRuntimeOnly\(tool\.id\)/);
assert.match(iosTools, /private var local: Bool \{ !NativeCopy\.isWebRuntimeOnly\(tool\.id\)/);
assert.match(android, /private fun WebToolsSearchField\([\s\S]*?focused && query\.isNotBlank\(\)[\s\S]*?suggestions\.forEach[\s\S]*?See more results/);
assert.match(iosContent, /\.focused\(\$isToolsSearchFocused\)/);
assert.match(iosContent, /private var searchSuggestions: \[Tool\][\s\S]*?ForEach\(searchSuggestions\)[\s\S]*?See more results/);
// APCA is the sole WebView exception: it opens the web-content implementation from Color Contrast Studio only.
assert.match(androidAccessibility, /val modes = listOf\("checker", "generator", "helper", "preview", "simulator"\)/);
assert.match(androidAccessibility, /if \(colorTool && studioMode == "simulator"\) \{[\s\S]*?colorVisionPreviewPairs/);
assert.match(androidAccessibility, /if \(studioKind == "contrast" && studioMode == "simulator"\) "color-blindness-simulator"/);
assert.match(androidAccessibility, /Text\("APCA · Web only"\)/);
assert.match(androidAccessibility, /mutableStateOf\(if \(kind == "color-blindness"\) "simulator"/);
assert.match(androidAccessibility, /APCA_WEB_URL = "https:\/\/envtools\.store\/tools\/accessibility\/color-contrast-studio"/);
assert.match(androidAccessibility, /target\.scheme == "https" && target\.host == APCA_WEB_HOST/);
assert.match(iosTools, /private var modes: \[String\] \{ \["checker", "generator", "helper", "preview", "simulator"\] \}/);
assert.match(iosTools, /if colorTool && studioMode == "simulator" \{ colorVisionPreview \}/);
assert.match(iosTools, /colorTool && studioMode == "simulator" \? "color-blindness-simulator"/);
assert.match(iosTools, /rawKind == "color-blindness" \? "simulator"/);
assert.match(iosTools, /if colorTool \{\s*Button \{ showAPCAWebView = true \}[\s\S]*?APCA · Web only/);
assert.doesNotMatch(androidAccessibility, /studioMode == "vision"|"vision"\s*,\s*"apca"/);
assert.doesNotMatch(iosTools, /studioMode == "vision"|"vision"\s*,\s*"apca"/);
assert.match(iosTools, /apcaStudioWebURL = URL\(string: "https:\/\/envtools\.store\/tools\/accessibility\/color-contrast-studio"\)!/);
assert.match(iosTools, /private struct APCAWebView: UIViewRepresentable[\s\S]*?websiteDataStore = \.nonPersistent\(\)/);
assert.match(iosTools, /target\.scheme == "https", target\.host == "envtools\.store"/);
assert.doesNotMatch(`${androidAccessibilityEngine}\n${iosAccessibilityEngine}`, /APCA-W3|APCAcontrast|APCAContrast/, "APCA scoring must not be implemented in a native engine");
assert.doesNotMatch(`${android}\n${iosContent}`, /WebView|WKWebView/, "WebViews are restricted to the APCA Color Contrast Studio entry point");

console.log("PASS: native navigation, personal-use shortcuts, full-catalog discovery, width-cap, and typography parity guards");
