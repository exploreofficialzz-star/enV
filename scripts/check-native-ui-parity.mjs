import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const android = readFileSync("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt", "utf8");
const iosContent = readFileSync("apps/ios/enV/ContentViews.swift", "utf8");
const iosTools = readFileSync("apps/ios/enV/ToolViews.swift", "utf8");
const androidInfo = readFileSync("apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt", "utf8");
const androidStore = readFileSync("apps/android/app/src/main/java/com/chastech/env/data/FavoritesStore.kt", "utf8");
const iosCatalog = readFileSync("apps/ios/enV/CatalogCore.swift", "utf8");
const androidCatalog = readFileSync("apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt", "utf8");

// Android detail links push onto a stack; system Back returns to the prior detail.
assert.match(android, /var detailStack by rememberSaveable/);
assert.match(android, /BackHandler \{ detailStack = detailStack\.dropLast\(1\) \}/);
assert.match(android, /onRelatedTool = \{ detailStack = detailStack \+ it \}/);

// Home search drafts remain local until submit, rather than leaking into Tools/Search.
assert.match(android, /var homeQuery by rememberSaveable/);
assert.match(android, /HomeScreen\(catalog, favoriteIds, homeQuery, \{ homeQuery = it \}, \{ submitted -> query = submitted/);
const homeScreen = android.split("private fun HomeScreen(")[1]?.split("@Composable\nprivate fun WebHomeToolCard")[0] ?? "";
assert.ok(homeScreen.length > 0, "Android HomeScreen source should be present");
assert.doesNotMatch(homeScreen, /\b(?:var|val)\s+query\s*:/, "Home draft/filter should not declare or consume global Search query state");
assert.match(homeScreen, /homeQuery: String, onQuery:/);

// Native discovery shells use the web's 1152px content maximum.
assert.match(android, /widthIn\(max = 1152\.dp\)/);
assert.ok((iosContent.match(/frame\(maxWidth: 1152\)/g) ?? []).length >= 3, "iOS home, tools, and category screens should share the capped shell");

// Home/category hierarchy and shared cards use registered Outfit faces.
assert.match(iosContent, /horizontalSizeClass == \.regular \? 36 : 24/);
assert.match(iosContent, /Outfit-Bold", size: 30/);
assert.match(iosContent, /LazyVStack\(alignment: \.leading, spacing: 24\)/);
assert.match(iosTools, /Outfit-SemiBold", size: 14/);
assert.match(iosTools, /Outfit-Medium", size: 10/);
assert.match(android, /screenWidth >= 640\) 36\.sp else 24\.sp/);
assert.match(android, /contentPadding = PaddingValues\(horizontal = 16\.dp, vertical = 40\.dp\),\s*verticalArrangement = Arrangement\.spacedBy\(24\.dp\)/);
assert.match(android, /headlineSmall\.copy\(fontSize = 30\.sp\), fontWeight = FontWeight\.Bold, color = MaterialTheme\.colorScheme\.primary/);

// Information-page back and legal email actions remain actionable and return to the source tab.
assert.match(android, /showInformation -> NativeInformationScreen\(informationPage\) \{ showInformation = false; tab = informationReturnTab \}/);
assert.match(androidInfo, /private fun InformationParagraph\(text: String\)/);
assert.match(androidInfo, /pushStringAnnotation\(tag = "mailto"/);
assert.match(androidInfo, /No email app is available/);
assert.match(android, /Year\.now\(\)\.value/);
assert.match(iosContent, /Calendar\.current\.component\(\.year, from: \.now\)/);
assert.match(android, /SearchBox\(catalog, query, onQuery, onTool\)/);
assert.match(android, /contentDescription = "Search tools"/);
assert.match(iosContent, /Text\("Search tools"\)/);
assert.match(iosContent, /TextField\("Search tools", text: \$text\)/);
assert.match(iosContent, /\.accessibilityLabel\("Search tools"\)/);
assert.match(android, /suggestions\.firstOrNull\(\)\?\.let \{ onTool\(it\.id\) \}/);
assert.match(android, /if \(focused && value\.isNotBlank\(\)\) \{[\s\S]*?suggestions\.forEach/);
assert.match(iosContent, /if isSearchFocused && !text\.trimmingCharacters[\s\S]*?ForEach\(suggestions\)/);
assert.match(iosContent, /if let first = suggestions\.first[\s\S]*?showSearchNavigation = true/);
assert.match(iosContent, /UIScreen\.main\.bounds\.width \* 0\.52/);
assert.match(android, /Column\(horizontalAlignment = Alignment\.CenterHorizontally, verticalArrangement = Arrangement\.spacedBy\(if \(screenWidth >= 640\) 20\.dp else 16\.dp\), modifier = Modifier\.fillMaxWidth\(\)\.widthIn\(max = 768\.dp\)\)/);
assert.match(android, /Modifier\.width\(if \(screenWidth >= 640\) 163\.dp else 142\.dp\)\.height\(if \(screenWidth >= 640\) 64\.dp else 56\.dp\)/);
assert.match(android, /Modifier\.fillMaxWidth\(\)\.height\(if \(screenWidth >= 640\) 72\.dp else 64\.dp\)/);
assert.match(iosContent, /EnVLogo\(homeHero: true\)\.frame\(width: horizontalSizeClass == \.regular \? 163 : 142, height: horizontalSizeClass == \.regular \? 64 : 56\)/);
assert.match(iosContent, /\.frame\(maxWidth: 768\)\s*\.frame\(maxWidth: \.infinity, alignment: \.center\)/);
assert.match(android, /contentDescription = "Search tools"/);
assert.match(android, /if \(homeQuery\.isNotBlank\(\)\) \{\s*Surface\(Modifier\.fillMaxWidth\(\), color = MaterialTheme\.colorScheme\.surface, shape = RoundedCornerShape\(14\.dp\)/);
assert.match(android, /if \(suggestions\.isEmpty\(\)\) \{[\s\S]*?TextButton\(onClick = \{ onSearch\(homeQuery\) \}[^\n]*\{ Text\("See more results"\) \}/);
assert.match(iosContent, /\.accessibilityLabel\("Search tools"\)/);
assert.match(iosContent, /\.accessibilityLabel\("Search all tools"\)/);
assert.match(iosContent, /if searchSuggestions\.isEmpty \{[\s\S]*?Text\("See more results"\)/);
assert.match(android, /LaunchedEffect\(selected\?\.id\) \{ selected\?\.id\?\.let \{ favorites\.recordRecent\(it\) \} \}/);
assert.match(androidStore, /private val recentKey = "recent_tool_ids"/);
assert.match(androidStore, /fun recordRecent\(toolId: String\): List<String>/);
assert.match(androidStore, /\.filterNot \{ it == toolId \}.*\.take\(24\)/s);
assert.match(iosTools, /\.onAppear \{ store\.recordRecent\(tool\.id\) \}/);
assert.match(iosCatalog, /@Published private\(set\) var recentIDs: \[String\]/);
assert.match(iosCatalog, /func recordRecent\(_ toolID: String\)/);
assert.match(iosCatalog, /\.prefix\(24\)/);
assert.match(androidCatalog, /val browserActiveToolCount: Int[\s\S]*?relatedReferenceTools\)\.count \{ it\.status == "active" \|\| it\.status == "beta" \}/);
assert.match(iosCatalog, /var browserActiveToolCount: Int[\s\S]*?\(tools \+ \(relatedReferenceTools \?\? \[\]\)\)\.filter \{ \$0\.status == "active" \|\| \$0\.status == "beta" \}\.count/);
assert.match(android, /\$\{catalog\.browserActiveToolCount\} browser tools/);
assert.match(android, /\$\{catalog\.browserActiveToolCount\} live tools/);
assert.match(iosContent, /WebHomeFooter\(activeCount: store\.catalog\.browserActiveToolCount/);

// All advertised catalog records remain discoverable; browser-runtime references are clearly labeled and never wrapped in a WebView.
assert.match(android, /catalog\.webSearch\(query, includeRelatedReferences = true\)/);
assert.match(android, /catalog\.webSearch\(value, limit = 8, includeRelatedReferences = true\)/);
assert.match(android, /\(catalog\.tools \+ catalog\.relatedReferenceTools\)\.filter \{ it\.id in favorites \}/);
assert.match(androidCatalog, /\(tools \+ relatedReferenceTools\)\.asSequence\(\)/);
assert.ok(android.includes("NativeCopy.isWebRuntimeOnly(tool.id)") && android.includes('Text("Web only"'), "Android discovery labels retained browser-only tools");
assert.match(android, /authority\("en-v\.vercel\.app"\)[\s\S]*?appendPath\("tools"\)[\s\S]*?Intent\(Intent\.ACTION_VIEW/);
assert.match(iosContent, /webSearch\(toolsQuery, includeRelatedReferences: true\)/);
assert.match(iosContent, /webSearch\(text, limit: Int\.max, includeRelatedReferences: true\)/);
assert.match(iosCatalog, /\(catalog\.tools \+ \(catalog\.relatedReferenceTools \?\? \[\]\)\)\.filter \{ favoriteIDs\.contains/);
assert.match(iosCatalog, /catalog\.tools \+ \(catalog\.relatedReferenceTools \?\? \[\]\)/);
assert.ok(iosTools.includes("https://en-v.vercel.app/tools/\\(tool.category)/\\(tool.slug)"), "iOS opens the canonical Web-only tool route");
assert.match(iosContent, /NativeCopy\.isWebRuntimeOnly\(tool\.id\)/);
assert.match(android, /private fun nativeSupported\(tool: ToolRecord\): Boolean = !NativeCopy\.isWebRuntimeOnly\(tool\.id\)/);
assert.match(android, /private fun nativeBackendSupported\(tool: ToolRecord\): Boolean = !NativeCopy\.isWebRuntimeOnly\(tool\.id\)/);
assert.match(iosTools, /private var backend: Bool \{ !NativeCopy\.isWebRuntimeOnly\(tool\.id\)/);
assert.match(iosTools, /private var local: Bool \{ !NativeCopy\.isWebRuntimeOnly\(tool\.id\)/);
assert.match(android, /private fun WebToolsSearchField\([\s\S]*?focused && query\.isNotBlank\(\)[\s\S]*?suggestions\.forEach[\s\S]*?See more results/);
assert.match(iosContent, /\.focused\(\$isToolsSearchFocused\)/);
assert.match(iosContent, /private var searchSuggestions: \[Tool\][\s\S]*?ForEach\(searchSuggestions\)[\s\S]*?See more results/);
assert.doesNotMatch(`${android}\n${iosContent}\n${iosTools}`, /WebView|WKWebView/);

console.log("PASS: native navigation, full-catalog discovery, search interaction, width-cap, and typography parity guards");
