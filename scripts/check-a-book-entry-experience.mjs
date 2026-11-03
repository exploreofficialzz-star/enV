import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const web = readFileSync("src/components/engines/a-book-engine.tsx", "utf8");
const android = readFileSync("apps/android/app/src/main/java/com/chastech/env/NativeABook.kt", "utf8");
const ios = readFileSync("apps/ios/enV/ToolViews.swift", "utf8");

assert.match(web, /aria-label="A book start page"/, "Web A book must open a dedicated entry page");
assert.match(web, /Create a note/);
assert.match(web, /Open my library/);
assert.match(web, /placeholder="Search your local library"/);
assert.match(web, /visibleNotes\.slice\(0, 3\)/);
assert.match(web, /returnToEntry\(\)/, "Web workspace must provide a route back to the entry page");
assert.match(android, /var showWelcome by rememberSaveable\{mutableStateOf\(true\)\}/, "Android must start at the native entry page");
assert.match(android, /Create note/);
assert.match(android, /Open library/);
assert.match(android, /Search your library/);
assert.match(android, /filtered\.take\(3\)/);
assert.match(android, /Start page/, "Android workspace must return to the entry page");
assert.match(android, /Column\(Modifier\.fillMaxWidth\(\),verticalArrangement=Arrangement\.spacedBy\(8\.dp\)\)\{\s*Card\(Modifier\.fillMaxWidth\(\)\)/, "Android entry feature cards must remain readable at phone widths");
assert.match(ios, /@State private var showWelcome = true/, "iOS must start at the native entry page");
assert.match(ios, /private var workspaceView: some View/, "iOS editor must be isolated from the welcome view for stable SwiftUI type checking");
assert.match(ios, /private func safeFilename\(_ value: String\) -> String/);
assert.match(ios, /accessibilityLabel\("A book start page"\)/);
assert.match(ios, /Create a note/);
assert.match(ios, /Open library/);
assert.match(ios, /TextField\("Search your library", text: \$query\)/);
assert.match(ios, /filteredNotes\.prefix\(3\)/);
assert.match(ios, /GridItem\(\.adaptive\(minimum: 220\), spacing: 10\)/, "iOS entry features must adapt to compact phone widths");
assert.match(ios, /await autosave\(\)\s+if errorText\.isEmpty \{ showWelcome = true \}/, "iOS must not leave the editor when the local draft save fails");
assert.match(ios, /Start page/);
assert.match(web, /data-local-only="true"/);
assert.match(android, /Files are not uploaded/);
assert.match(ios, /No cloud sync or content upload/);

console.log("A book entry experience PASS: Web, Android and iOS each have a dedicated local-first start page and a workspace return action.");
