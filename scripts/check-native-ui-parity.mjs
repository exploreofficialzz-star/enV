import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const android = readFileSync("apps/android/app/src/main/java/com/chastech/env/MainActivity.kt", "utf8");
const iosContent = readFileSync("apps/ios/enV/ContentViews.swift", "utf8");
const iosTools = readFileSync("apps/ios/enV/ToolViews.swift", "utf8");

// Android detail links push onto a stack; system Back returns to the prior detail.
assert.match(android, /var detailStack by rememberSaveable/);
assert.match(android, /BackHandler \{ detailStack = detailStack\.dropLast\(1\) \}/);
assert.match(android, /onRelatedTool = \{ detailStack = detailStack \+ it \}/);

// Home search drafts remain local until submit, rather than leaking into Tools/Search.
assert.match(android, /var homeQuery by rememberSaveable/);
assert.match(android, /HomeScreen\(catalog, favoriteIds, homeQuery, \{ homeQuery = it \}, \{ submitted -> query = submitted/);
const homeScreen = android.split("private fun HomeScreen(")[1]?.split("@Composable\nprivate fun WebHomeToolCard")[0] ?? "";
assert.ok(homeScreen.length > 0, "Android HomeScreen source should be present");
assert.doesNotMatch(homeScreen, /\bquery\b/, "Home draft/filter should not read the global Search query");

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

console.log("PASS: native navigation, search-state, width-cap, and typography parity guards");
