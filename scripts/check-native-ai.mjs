#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const catalogPath = resolve(root, "apps/shared/catalog.json");
const featurePath = resolve(root, "src/lib/ai/features.ts");
const android = resolve(root, "apps/android/app/src/main/java/com/chastech/env/NativeAiEngine.kt");
const androidClient = resolve(root, "apps/android/app/src/main/java/com/chastech/env/NativeAiClient.kt");
const androidAssistant = resolve(root, "apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt");
const androidActivity = resolve(root, "apps/android/app/src/main/java/com/chastech/env/MainActivity.kt");
const ios = resolve(root, "apps/ios/enV/ToolViews.swift");
const iosAssistant = resolve(root, "apps/ios/enV/AssistantChat.swift");
const iosHome = resolve(root, "apps/ios/enV/ContentViews.swift");
const webAssistant = resolve(root, "src/routes/assistant.tsx");
const webHome = resolve(root, "src/routes/index.tsx");
const backendAssistant = resolve(root, "src/lib/ai/server/tasks/assistant.ts");

const fail = (message) => { console.error(`FAIL: ${message}`); process.exitCode = 1; };
for (const path of [catalogPath, featurePath, android, androidClient, androidAssistant, androidActivity, ios, iosAssistant, iosHome, webAssistant, webHome, backendAssistant]) {
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
const androidAssistantSource = readFileSync(androidAssistant, "utf8");
const androidActivitySource = readFileSync(androidActivity, "utf8");
const iosSource = readFileSync(ios, "utf8");
const iosAssistantSource = readFileSync(iosAssistant, "utf8");
const webAssistantSource = readFileSync(webAssistant, "utf8");
for (const id of unique) {
  if (!androidSource.includes(`"${id}"`)) fail(`Android native AI mapping missing: ${id}`);
  if (!iosSource.includes(`"${id}"`)) fail(`iOS native AI mapping missing: ${id}`);
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
if (!webAssistantSource.includes("searchTools(getActiveTools(), query, 8)") || !webAssistantSource.includes("<ToolCard key={tool.id} tool={tool}")) fail("Web assistant is missing catalog-backed, tappable tool recommendations");
if (!androidActivitySource.includes("AssistantScreen(catalog, assistantMessages") || !androidActivitySource.includes("{ selectedId = it }")) fail("Android recommendation navigation is not wired to the native tool detail view");

const androidHome = androidActivitySource;
const iosHomeSource = readFileSync(resolve(root, "apps/ios/enV/ContentViews.swift"), "utf8");
const webHomeSource = readFileSync(webHome, "utf8");
if (!androidHome.includes('HomePreviewBar("AI assistant"') || !androidHome.includes("onClick = onAssistant")) fail("Android Home assistant preview is not actionable");
if (!iosHomeSource.includes('HomePreviewBar(title: "AI assistant", action: onAssistant)')) fail("iOS Home assistant preview is not actionable");
if (!webHomeSource.includes('to="/assistant"')) fail("Web Home assistant preview is not actionable");

const androidBuild = readFileSync(resolve(root, "apps/android/app/build.gradle.kts"), "utf8");
const androidEnv = readFileSync(resolve(root, "apps/android/.env.example"), "utf8");
const iosProject = readFileSync(resolve(root, "apps/ios/enV.xcodeproj/project.pbxproj"), "utf8");
const iosEnv = readFileSync(resolve(root, "apps/ios/Config.xcconfig.example"), "utf8");
if (!iosProject.includes("AssistantChat.swift in Sources") || !iosProject.includes("A60000000000000000000001 /* AssistantChat.swift in Sources */")) fail("iOS AssistantChat.swift is not registered in the Xcode app build phase");
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
