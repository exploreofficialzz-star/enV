#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const packageJson = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
const appConfig = JSON.parse(readFileSync(join(appRoot, "app.json"), "utf8")).expo;
const gitignore = readFileSync(join(appRoot, ".gitignore"), "utf8");
const webShell = readFileSync(join(appRoot, "src/features/web-shell/WebAppScreen.tsx"), "utf8");
const bridge = readFileSync(join(appRoot, "src/features/web-shell/blob-download-bridge.ts"), "utf8");
const webConfig = readFileSync(join(appRoot, "src/lib/web-app-config.ts"), "utf8");

function assertFile(relativePath) {
  assert.ok(existsSync(join(appRoot, relativePath)), `Required mobile file is missing: ${relativePath}`);
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

assert.equal(packageJson.name, "env-mobile", "Mobile package name must remain scoped and separate from the web app.");
assert.equal(packageJson.main, "expo-router/entry", "Expo Router entry point is required.");
for (const name of ["expo", "expo-router", "react-native", "react-native-webview", "expo-file-system", "expo-sharing", "expo-system-ui"]) {
  assert.ok(packageJson.dependencies[name], `Missing native dependency: ${name}`);
}
assert.equal(packageJson.scripts.postinstall, "patch-package", "Security compatibility patch must be applied after clean installs.");
assert.equal(packageJson.overrides["decode-uri-component"], "0.5.0", "Use the patched URI decoder version.");
assert.equal(packageJson.overrides.uuid, "11.1.1", "Use the patched UUID version.");
assert.equal(appConfig.name, "enV", "Native app must use the canonical enV brand.");
assert.equal(appConfig.android.package, "com.chastech.env", "Android application ID changed unexpectedly.");
assert.equal(appConfig.ios.bundleIdentifier, appConfig.android.package, "iOS bundle ID must be ready to align with Android.");
assert.equal(appConfig.scheme, "env", "Native deep-link scheme must be stable.");
assert.equal(appConfig.userInterfaceStyle, "light", "Native system chrome must use the configured light UI style.");
assert.ok(!("androidStatusBar" in appConfig) && !("androidNavigationBar" in appConfig), "Do not use deprecated Expo Android system-bar config.");
assert.ok(appConfig.plugins.includes("expo-sharing"), "Expo Sharing's native config plugin must be registered.");
assert.ok(appConfig.plugins.includes("./plugins/withUnsignedAndroidRelease.js"), "Release-signing policy must be applied by a persistent config plugin.");
for (const asset of [
  "assets/images/icon.png",
  "assets/images/android-icon-foreground.png",
  "assets/images/splash-icon.png",
  "assets/images/favicon.png",
  "plugins/withUnsignedAndroidRelease.js",
  "patches/query-string+7.1.3.patch",
]) assertFile(asset);
assert.ok(!/^\s*\/android\s*$/m.test(gitignore), "The generated Android native source must not be ignored.");
assert.ok(webConfig.includes("https:") && webConfig.includes("WEB_APP_ORIGIN"), "WebView must use a validated HTTPS origin.");
assert.ok(webShell.includes("onShouldStartLoadWithRequest") && webShell.includes("BackHandler"), "Native navigation controls are incomplete.");
assert.ok(webShell.includes("onMessage") && webShell.includes("FileSystem.EncodingType.Base64"), "Native generated-file transfer bridge is incomplete.");
assert.ok(bridge.includes('a[download]') && bridge.includes('indexOf("blob:")') && bridge.includes("env-download-chunk"), "Blob download bridge must target generated blob anchors and transfer chunks.");

const parsedQuery = require("query-string").parse("value=hello%20enV&malformed=%E0%A4%A");
assert.equal(parsedQuery.value, "hello enV", "query-string must work with the security-fixed decoder.");
assert.equal(parsedQuery.malformed, "%E0%A4%A", "Malformed URI input must be handled without throwing.");
assert.match(require("uuid").v4(), /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i, "The patched UUID package must preserve xcode's v4 API.");

const androidFiles = walk(join(appRoot, "android"));
const androidAppGradle = readFileSync(join(appRoot, "android/app/build.gradle"), "utf8");
const rootLayout = readFileSync(join(appRoot, "src/app/_layout.tsx"), "utf8");
assert.match(androidAppGradle, /debug\s*\{\s*signingConfig signingConfigs\.debug/, "Debug APK must keep the development signing key.");
assert.doesNotMatch(androidAppGradle, /buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/, "Release bundles must never use the public debug key.");
assert.ok(androidAppGradle.includes("enV: Release artifacts intentionally remain unsigned"), "The generated release signing policy must be explicit.");
assert.ok(androidAppGradle.includes("ANDROID_KEYSTORE_FILE") && androidAppGradle.includes("signingConfig signingConfigs.release"), "Release signing must be available through protected environment variables.");
assert.ok(rootLayout.includes("SplashScreen.preventAutoHideAsync") && rootLayout.includes("SplashScreen.hideAsync"), "Native splash dismissal must be explicit and bounded by the React root lifecycle.");
assert.ok(webShell.includes("WEBVIEW_LOAD_TIMEOUT_MS") && webShell.includes("startLoadTimeout"), "WebView startup must fail into a recoverable connection state instead of hanging indefinitely.");
for (const relativePath of ["android/settings.gradle", "android/build.gradle", "android/gradlew", "android/gradlew.bat", "android/app/build.gradle", "android/app/src/main/AndroidManifest.xml"]) {
  assertFile(relativePath);
}
assert.ok(androidFiles.some((path) => path.endsWith("/MainActivity.kt")), "Generated Android MainActivity.kt is missing.");
assert.ok(androidFiles.some((path) => path.endsWith("/MainApplication.kt")), "Generated Android MainApplication.kt is missing.");
assert.ok(androidFiles.some((path) => path.endsWith("/gradle-wrapper.jar")), "Generated Gradle wrapper JAR is missing.");

console.log(`Mobile project checks passed (${androidFiles.length} generated Android source/build files found).`);
