#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const catalogPath = resolve(root, "apps/shared/catalog.json");
const featurePath = resolve(root, "src/lib/ai/features.ts");
const android = resolve(root, "apps/android/app/src/main/java/com/chastech/env/NativeAiEngine.kt");
const androidClient = resolve(root, "apps/android/app/src/main/java/com/chastech/env/NativeAiClient.kt");
const androidAssist = resolve(root, "apps/android/app/src/main/java/com/chastech/env/NativeAiAssistPanel.kt");
const androidAssistant = resolve(root, "apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt");
const androidActivity = resolve(root, "apps/android/app/src/main/java/com/chastech/env/MainActivity.kt");
const ios = resolve(root, "apps/ios/enV/ToolViews.swift");
const iosAssistant = resolve(root, "apps/ios/enV/AssistantChat.swift");
const iosHome = resolve(root, "apps/ios/enV/ContentViews.swift");
const webAssistant = resolve(root, "src/routes/assistant.tsx");
const webAssistantState = resolve(root, "src/components/assistant/assistant-state.tsx");
const webRoot = resolve(root, "src/routes/__root.tsx");
const iosRoot = resolve(root, "apps/ios/enV/enVApp.swift");
const webHome = resolve(root, "src/routes/index.tsx");
const backendAssistant = resolve(root, "src/lib/ai/server/tasks/assistant.ts");

const fail = (message) => { console.error(`FAIL: ${message}`); process.exitCode = 1; };
for (const path of [catalogPath, featurePath, android, androidClient, androidAssist, androidAssistant, androidActivity, ios, iosAssistant, iosHome, iosRoot, webAssistant, webAssistantState, webRoot, webHome, backendAssistant]) {
  if (!existsSync(path)) fail(`Missing required file: ${path}`);
}
if (process.exitCode) process.exit(1);

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const ids = new Set((catalog.tools ?? []).map((tool) => tool.id));
const active = new Set((catalog.tools ?? []).filter((tool) => tool.status !== "planned").map((tool) => tool.id));
const featureSource = readFileSync(featurePath, "utf8");
const featureIds = [
  ...[...featureSource.matchAll(/captionFeature\("([^"]+)"/g)].map((match) => match[1]),
  ...[...featureSource.matchAll(/titleFeature\("([^"]+)"/g)].map((match) => match[1]),
  ...[...featureSource.matchAll(/toolId:\s*"([^"]+)"/g)].map((match) => match[1]),
];
const unique = [...new Set(featureIds)];
if (unique.length !== 17) fail(`Expected 17 AI feature bindings, found ${unique.length}`);
for (const id of unique) {
  if (!ids.has(id)) fail(`AI feature tool is absent from catalog: ${id}`);
  if (!active.has(id)) fail(`AI feature tool is not active in catalog: ${id}`);
}

const androidSource = readFileSync(android, "utf8");
const androidClientSource = readFileSync(androidClient, "utf8");
const androidAssistSource = readFileSync(androidAssist, "utf8");
const androidAssistantSource = readFileSync(androidAssistant, "utf8");
const androidActivitySource = readFileSync(androidActivity, "utf8");
const iosSource = readFileSync(ios, "utf8");
const iosHomeSource = readFileSync(iosHome, "utf8");
const iosAssistantSource = readFileSync(iosAssistant, "utf8");
const webAssistantSource = readFileSync(webAssistant, "utf8");
const webAssistantStateSource = readFileSync(webAssistantState, "utf8");
const webRootSource = readFileSync(webRoot, "utf8");
const iosRootSource = readFileSync(iosRoot, "utf8");
for (const id of unique) {
  if (!androidSource.includes(`"${id}"`)) fail(`Android native AI mapping missing: ${id}`);
  if (!iosSource.includes(`"${id}"`)) fail(`iOS native AI mapping missing: ${id}`);
  if (!androidAssistSource.includes(`"${id}"`)) fail(`Android supplemental AI panel missing: ${id}`);
}
for (const [label, source] of [["Android", androidAssistSource], ["iOS", iosSource]]) {
  for (const match of featureSource.matchAll(/name:\s*"([A-Za-z][A-Za-z0-9]*)"/g)) {
    if (!source.includes(`"${match[1]}"`)) fail(`${label} supplemental AI panel is missing the web feature field ${match[1]}`);
  }
}
if (!androidActivitySource.includes("NativeAiAssistPanel(tool)") || !iosSource.includes("NativeAiAssistPanel(tool: tool, feature: assistFeature)")) fail("Native tool-detail screens do not mount the supplemental AI-assist panel");
for (const [label, source] of [["Android", androidAssistSource], ["iOS", iosSource]]) {
  if (!source.includes("Nothing is sent until you press the button")) fail(`${label} supplemental AI panel is missing the web disclosure`);
  if (!source.includes("Cancel")) fail(`${label} supplemental AI panel is missing task cancellation`);
  if (!source.includes("requiresConsent")) fail(`${label} supplemental AI panel is missing feature-specific consent gating`);
}
for (const [label, text] of [["Android AI client", androidClientSource], ["iOS AI client", iosSource + iosAssistantSource]]) {
  if (!text.includes("/api/ai/run")) fail(`${label} does not call /api/ai/run`);
  if (!text.includes("/api/ai/status")) fail(`${label} does not retain the shared AI task-status client`);
}

const screens = [
  ["Android", androidAssistantSource],
  ["iOS", iosAssistantSource],
  ["Web", webAssistantSource],
];
for (const [label, text] of screens) {
  if (!text.includes("assistant.chat")) fail(`${label} screen is not connected to the registered assistant.chat task`);
  if (!text.includes("recommendedToolIds")) fail(`${label} screen does not render returned recommendation IDs`);
  if (!/Ask about enV tools or the (enV )?brand/.test(text)) fail(`${label} screen lacks the focused tool/brand chat prompt`);
  if (/configured AI provider|This chat is not saved|I agree that my message|AI responses can be inaccurate|Questions, planning, writing|Choose a starting point|Draft a professional email/i.test(text)) fail(`${label} screen still contains removed generic-chat write-up or consent/disclaimer copy`);
}
if (!androidAssistantSource.includes("candidates") || !androidAssistantSource.includes("onTool(tool.id)")) fail("Android assistant is missing catalog-backed, tappable tool recommendations");
if (!iosAssistantSource.includes("candidates:") || !iosAssistantSource.includes("NavigationLink(value: tool)")) fail("iOS assistant is missing catalog-backed, tappable tool recommendations");
if (!(iosAssistantSource.indexOf("if !message.isUser && !message.recommendedToolIds.isEmpty") < iosAssistantSource.indexOf(".background(message.isUser ? Color.envAccentSoft : Color.envCard"))) fail("iOS assistant recommendations must be grouped inside the assistant reply bubble");
if (!androidAssistantSource.includes("activeRequestHandle?.cancel()") || !androidAssistantSource.includes('NativeAiClient.run(context, "assistant.chat", input, requestHandle)')) fail("Android assistant Stop does not cancel the active network request");
if (!iosAssistantSource.includes('Button("Stop", action: stopRequest)') || !iosAssistantSource.includes("private func stopRequest()") || !iosAssistantSource.includes("activeRequest?.cancel()")) fail("iOS assistant Stop does not cancel the active task");
if (!androidAssistantSource.includes("DisposableEffect(Unit)") || !androidAssistantSource.includes("activeRequestHandle?.cancel()")) fail("Android assistant does not cancel in-flight work when its route is disposed");
if (!androidAssistantSource.includes("SelectionContainer") || !androidAssistantSource.includes("liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Polite")) fail("Android assistant messages need copy/select support and a live region");
if (!iosAssistantSource.includes("accessibilityAddTraits(.updatesFrequently)")) fail("iOS assistant conversation is missing a VoiceOver update announcement");
if (!androidActivitySource.includes("assistantDraft") || !iosRootSource.includes("assistantDraft") || !iosRootSource.includes("AssistantChatView(messages: $assistantMessages, draft: $assistantDraft)")) fail("Native Assistant conversation/draft state is not owned above the tab screen");
if (!webRootSource.includes("<AssistantStateProvider><Outlet /></AssistantStateProvider>") || !webAssistantStateSource.includes("useState<ChatTurn[]>") || !webAssistantSource.includes("useAssistantState()")) fail("Web Assistant conversation state must be root-owned across route changes");
if (!androidAssistantSource.includes('retry?.let { pending -> TextButton(onClick = { requestReply(pending) }') || !iosAssistantSource.includes("if let retryRequest")) fail("Native Retry visibility must match the web chat's any-error retry action");
if (!iosAssistantSource.includes('Outfit-SemiBold", size: horizontalSizeClass == .regular ? 30 : 24')) fail("iOS assistant heading is missing responsive Outfit typography");
if (!iosAssistantSource.includes('Outfit-Regular", size: 14')) fail("iOS assistant message text is missing Outfit typography");
if (!iosAssistantSource.includes("Ask about enV tools or the enV brand…")) fail("iOS assistant composer prompt does not match the web prompt");
if (!webAssistantSource.includes("searchTools(getActiveTools(), query, 8)") || !webAssistantSource.includes("<ToolCard key={tool.id} tool={tool}")) fail("Web assistant is missing catalog-backed, tappable tool recommendations");
if (!androidActivitySource.includes("suggestions.firstOrNull()?.let { onTool(it.id) }") || !iosHomeSource.includes("homePath.append(first)")) fail("Home search submission must open the first ranked suggestion before global-search fallback");
if (!androidActivitySource.includes("AssistantScreen(catalog, assistantMessages") || !androidActivitySource.includes("{ detailStack = listOf(it) }")) fail("Android recommendation navigation is not wired to the native tool detail view");
if (!androidAssistSource.includes("field.kind in setOf(AssistKind.TEXTAREA, AssistKind.IMAGE, AssistKind.AUDIO)") || !androidAssistSource.includes("Box(if (columns == 2 && !fullWidth) Modifier.weight(1f) else Modifier.fillMaxWidth())")) fail("Android contextual AI textarea/image/audio fields must span both columns on wide layouts");
for (const [task, resultKind] of [["developer.regex.explain", "regex"], ["developer.sql.explain", "sql"], ["developer.json.explain", "json"], ["image.alt.generate", "alt-text"]]) {
  if (!androidAssistSource.includes(`"${task}" ->`)) fail(`Android contextual AI result is missing the structured ${task} view`);
  if (!iosSource.includes(`feature.resultKind == "${resultKind}"`)) fail(`iOS contextual AI result is missing the structured ${task} view`);
}
if (!androidAssistSource.includes("private fun AssistResultSection(") || !iosSource.includes("private struct NativeAiStructuredSection")) fail("Structured AI results must expose reusable labeled sections and per-entry copy actions");
if (!androidAssistSource.includes("shape = RoundedCornerShape(32.dp)") || !iosSource.includes("RoundedRectangle(cornerRadius: 32)")) fail("Android/iOS contextual AI panel outer radius must match the web 32px 2xl token");
for (const heading of ["Breakdown", "Watch out for", "Suggested examples (AI guesses, not verified)", "Step by step", "Warnings", "Performance notes", "Structure", "Possible issues", "Alt text", "Longer description", "Text found in the image"]) {
  if (!androidAssistSource.includes(heading)) fail(`Android structured AI output is missing ${heading}`);
  if (!iosSource.includes(heading)) fail(`iOS structured AI output is missing ${heading}`);
}

const androidHome = androidActivitySource;
const webHomeSource = readFileSync(webHome, "utf8");
if (!androidHome.includes('HomePreviewBar("AI assistant"') || !androidHome.includes("onClick = onAssistant")) fail("Android Home assistant preview is not actionable");
if (!iosHomeSource.includes('HomePreviewBar(title: "AI assistant", action: onAssistant)')) fail("iOS Home assistant preview is not actionable");
if (!webHomeSource.includes('to="/assistant"')) fail("Web Home assistant preview is not actionable");

const androidBuild = readFileSync(resolve(root, "apps/android/app/build.gradle.kts"), "utf8");
const androidEnv = readFileSync(resolve(root, "apps/android/.env.example"), "utf8");
const iosProject = readFileSync(resolve(root, "apps/ios/enV.xcodeproj/project.pbxproj"), "utf8");
const iosEnv = readFileSync(resolve(root, "apps/ios/Config.xcconfig.example"), "utf8");
if (!iosProject.includes("AssistantChat.swift in Sources") || !iosProject.includes("A60000000000000000000001 /* AssistantChat.swift in Sources */")) fail("iOS AssistantChat.swift is not registered in the Xcode app build phase");
// Native clients call the application gateway. The Render host is the
// Render API proxy serves the application /api/ routes and direct processor routes.
const backendBase = "https://env-q3mq.onrender.com";
for (const [label, text] of [["Android build config", androidBuild], ["Android env example", androidEnv], ["iOS Xcode project", iosProject], ["iOS env example", iosEnv]]) {
  if (!text.includes(backendBase)) fail(`${label} does not use the configured native backend URL`);
}
if ((androidBuild + androidEnv + iosProject + iosEnv).includes("https://en-v-6h2l.vercel.app")) fail("Old native Vercel backend URL is still present");
if (/WebView|WKWebView|webView/i.test(androidSource + androidClientSource + androidAssistantSource)) fail("Android AI/native integration references a WebView runtime");
if (/WKWebView|WebView/i.test(iosSource + iosAssistantSource)) fail("iOS native integration references a WebView runtime");

const backend = readFileSync(backendAssistant, "utf8");
if (!backend.includes('id: "assistant.chat"') || !backend.includes('privacy: "sensitive"') || !backend.includes("wrapUntrusted")) fail("Backend assistant task is missing its registered id or prompt safeguards");
if (!backend.includes("BRAND_FACTS") || !backend.includes("recommendedToolIds") || !backend.includes("allowed.has(id)")) fail("Backend assistant task lacks grounded enV brand answers or candidate-constrained tool recommendations");
console.log(`PASS: ${unique.length} AI feature bindings and focused native/Web assistant tool/brand chat integrations are wired to the backend.`);
