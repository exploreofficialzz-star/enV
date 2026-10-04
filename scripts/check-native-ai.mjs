#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const catalogPath = resolve(root, "apps/shared/catalog.json");
const featurePath = resolve(root, "src/lib/ai/features.ts");
const android = resolve(root, "apps/android/app/src/main/java/com/chastech/env/NativeAiEngine.kt");
const androidClient = resolve(root, "apps/android/app/src/main/java/com/chastech/env/NativeAiClient.kt");
const ios = resolve(root, "apps/ios/enV/ToolViews.swift");

const fail = (m) => { console.error(`FAIL: ${m}`); process.exitCode = 1; };
for (const p of [catalogPath, featurePath, android, androidClient, ios]) if (!existsSync(p)) fail(`Missing required file: ${p}`);
if (process.exitCode) process.exit(1);

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const ids = new Set((catalog.tools ?? []).map((t) => t.id));
const active = new Set((catalog.tools ?? []).filter((t) => t.status !== "planned").map((t) => t.id));
const featureSource = readFileSync(featurePath, "utf8");
const featureIds = [
  ...[...featureSource.matchAll(/captionFeature\("([^"]+)"/g)].map((m) => m[1]),
  ...[...featureSource.matchAll(/titleFeature\("([^"]+)"/g)].map((m) => m[1]),
  ...[...featureSource.matchAll(/toolId:\s*"([^"]+)"/g)].map((m) => m[1]),
];
const unique = [...new Set(featureIds)];
if (unique.length !== 17) fail(`Expected 17 AI feature bindings, found ${unique.length}`);
for (const id of unique) {
  if (!ids.has(id)) fail(`AI feature tool is absent from catalog: ${id}`);
  if (!active.has(id)) fail(`AI feature tool is not active in catalog: ${id}`);
}
const a = readFileSync(android, "utf8");
const ac = readFileSync(androidClient, "utf8");
const i = readFileSync(ios, "utf8");
for (const id of unique) {
  if (!a.includes(`"${id}"`)) fail(`Android native AI mapping missing: ${id}`);
  if (!i.includes(`"${id}"`)) fail(`iOS native AI mapping missing: ${id}`);
}
for (const [label, text] of [["Android AI client", ac], ["iOS AI client", i]]) {
  if (!text.includes("/api/ai/run")) fail(`${label} does not call /api/ai/run`);
  if (!text.includes("/api/ai/status")) fail(`${label} does not call /api/ai/status`);
}
const androidBuild = readFileSync(resolve(root, "apps/android/app/build.gradle.kts"), "utf8");
const androidEnv = readFileSync(resolve(root, "apps/android/.env.example"), "utf8");
const iosProject = readFileSync(resolve(root, "apps/ios/enV.xcodeproj/project.pbxproj"), "utf8");
const iosEnv = readFileSync(resolve(root, "apps/ios/Config.xcconfig.example"), "utf8");
const backendBase = "https://env-q3mq.onrender.com";
for (const [label, text] of [["Android build config", androidBuild], ["Android env example", androidEnv], ["iOS Xcode project", iosProject], ["iOS env example", iosEnv]]) {
  if (!text.includes(backendBase)) fail(`${label} does not use the configured native backend URL`);
}
if ((androidBuild + androidEnv + iosProject + iosEnv).includes("https://en-v-6h2l.vercel.app")) fail("Old native Vercel backend URL is still present");
if (/WebView|WKWebView|webView/i.test(a + ac)) fail("Android AI/native integration references a WebView runtime");
if (/WKWebView|WebView/i.test(i)) fail("iOS native integration references a WebView runtime");
console.log(`PASS: ${unique.length} AI feature bindings are present, active, and wired to Kotlin/Swift AI API clients.`);
