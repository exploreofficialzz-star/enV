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
const iosWorkflow = readFileSync(resolve(appRoot, "../../.github/workflows/ios-build.yml"), "utf8");
const webShell = readFileSync(join(appRoot, "src/features/web-shell/WebAppScreen.tsx"), "utf8");
const bridge = readFileSync(
  join(appRoot, "src/features/web-shell/blob-download-bridge.ts"),
  "utf8",
);
const connectionErrorView = readFileSync(
  join(appRoot, "src/features/web-shell/ConnectionErrorView.tsx"),
  "utf8",
);
const webConfig = readFileSync(join(appRoot, "src/lib/web-app-config.ts"), "utf8");
const typescriptNativeModule = readFileSync(
  join(appRoot, "modules/contact-exchange/src/ContactExchangeModule.ts"),
  "utf8",
);
const androidNativeModule = readFileSync(
  join(
    appRoot,
    "modules/contact-exchange/android/src/main/java/com/chastech/env/contactexchange/ContactExchangeModule.kt",
  ),
  "utf8",
);
const iosNativeModule = readFileSync(
  join(appRoot, "modules/contact-exchange/ios/ContactExchangeModule.swift"),
  "utf8",
);
const webNativeModule = readFileSync(
  join(appRoot, "modules/contact-exchange/src/ContactExchangeModule.web.ts"),
  "utf8",
);
const androidExchangeManifest = readFileSync(
  join(appRoot, "modules/contact-exchange/android/src/main/AndroidManifest.xml"),
  "utf8",
);

function assertFile(relativePath) {
  assert.ok(
    existsSync(join(appRoot, relativePath)),
    `Required mobile file is missing: ${relativePath}`,
  );
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

assert.equal(
  packageJson.name,
  "env-mobile",
  "Mobile package name must remain scoped and separate from the web app.",
);
assert.equal(packageJson.main, "expo-router/entry", "Expo Router entry point is required.");
for (const name of [
  "expo",
  "expo-router",
  "react-native",
  "react-native-webview",
  "expo-file-system",
  "expo-sharing",
  "expo-system-ui",
]) {
  assert.ok(packageJson.dependencies[name], `Missing native dependency: ${name}`);
}
assert.equal(
  packageJson.scripts.postinstall,
  "patch-package",
  "Security compatibility patch must be applied after clean installs.",
);
assert.equal(
  packageJson.overrides["decode-uri-component"],
  "0.5.0",
  "Use the patched URI decoder version.",
);
assert.equal(packageJson.overrides.uuid, "11.1.1", "Use the patched UUID version.");
assert.equal(appConfig.name, "enV", "Native app must use the canonical enV brand.");
assert.equal(
  appConfig.android.package,
  "com.chastech.env",
  "Android application ID changed unexpectedly.",
);
assert.equal(
  appConfig.ios.bundleIdentifier,
  appConfig.android.package,
  "iOS bundle ID must be ready to align with Android.",
);
assert.equal(
  appConfig.ios.deploymentTarget,
  "16.4",
  "iOS deployment target must support the Expo native modules used by this app.",
);
assert.match(
  appConfig.version,
  /^\d+\.\d+\.\d+$/,
  "Native app version must use semantic version formatting.",
);
assert.ok(
  Number.isSafeInteger(appConfig.android.versionCode) && appConfig.android.versionCode > 0,
  "Android versionCode must be a positive integer.",
);
assert.equal(appConfig.scheme, "env", "Native deep-link scheme must be stable.");
assert.equal(
  appConfig.userInterfaceStyle,
  "light",
  "Native system chrome must use the configured light UI style.",
);
assert.ok(
  !("androidStatusBar" in appConfig) && !("androidNavigationBar" in appConfig),
  "Do not use deprecated Expo Android system-bar config.",
);
assert.ok(
  appConfig.plugins.includes("expo-sharing"),
  "Expo Sharing's native config plugin must be registered.",
);
assert.ok(
  appConfig.plugins.includes("./plugins/withUnsignedAndroidRelease.js"),
  "Release-signing policy must be applied by a persistent config plugin.",
);
for (const asset of [
  "assets/images/icon.png",
  "assets/images/android-icon-foreground.png",
  "assets/images/splash-icon.png",
  "assets/images/favicon.png",
  "plugins/withUnsignedAndroidRelease.js",
  "patches/query-string+7.1.3.patch",
])
  assertFile(asset);
assert.ok(
  !/^\s*\/android\s*$/m.test(gitignore),
  "The generated Android native source must not be ignored.",
);
assert.ok(
  webConfig.includes("https:") && webConfig.includes("WEB_APP_ORIGIN"),
  "WebView must use a validated HTTPS origin.",
);
assert.ok(
  webConfig.includes("function isSafeHttpsWebUrl") &&
    webConfig.includes("!parsed.username && !parsed.password"),
  "In-app navigation must reject non-HTTPS links and embedded credentials.",
);
assert.ok(
  webConfig.includes('DEFAULT_WEB_APP_URL = "https://en-v.vercel.app"'),
  "Default WebView origin must remain the verified live repository homepage.",
);
assert.ok(
  typescriptNativeModule.includes('requireNativeModule<ContactExchangeModule>("ContactExchange")'),
  "TypeScript must call the registered native contact-exchange module.",
);
assert.ok(
  androidNativeModule.includes("com.google.android.gms.nearby.Nearby"),
  "Android contact exchange must use the Kotlin Nearby Connections implementation.",
);
assert.ok(
  androidNativeModule.includes("Build.VERSION.SDK_INT == 31") &&
    androidNativeModule.includes("Build.VERSION.SDK_INT >= 33") &&
    androidExchangeManifest.includes(
      'ACCESS_FINE_LOCATION" android:minSdkVersion="29" android:maxSdkVersion="31"',
    ) &&
    androidExchangeManifest.includes('NEARBY_WIFI_DEVICES" android:minSdkVersion="32"'),
  "Nearby Connections Android permissions must match the documented API-level requirements.",
);
assert.ok(
  iosNativeModule.includes("import MultipeerConnectivity"),
  "iOS contact exchange must use the Swift MultipeerConnectivity implementation.",
);
assert.ok(
  webNativeModule.includes("registerWebModule"),
  "Browser builds must use the TypeScript web fallback rather than requiring a native module.",
);
assert.ok(
  webShell.includes("onShouldStartLoadWithRequest") &&
    webShell.includes("BackHandler") &&
    webShell.includes("isSafeHttpsWebUrl") &&
    webShell.includes('originWhitelist={["https://*"]}') &&
    webShell.includes('allowsBackForwardNavigationGestures={Platform.OS === "ios"}'),
  "Native navigation controls are incomplete.",
);
assert.ok(
  webShell.includes("onHttpError") &&
    webShell.includes("onRenderProcessGone={retry}") &&
    webShell.includes("onContentProcessDidTerminate={retry"),
  "WebView HTTP failures and native renderer crashes must have an in-app recovery path.",
);
assert.doesNotMatch(
  `${webShell}\n${connectionErrorView}`,
  /onOpenBrowser|Open enV in browser|openURL\(WEB_APP_URL\)/,
  "Connection and navigation recovery must not escape to an external browser.",
);
assert.ok(
  webShell.includes("onMessage") && webShell.includes("FileSystem.EncodingType.Base64"),
  "Native generated-file transfer bridge is incomplete.",
);
assert.ok(
  bridge.includes("a[download]") &&
    bridge.includes('indexOf("blob:")') &&
    bridge.includes("env-download-chunk") &&
    bridge.includes("window.location.origin") &&
    bridge.includes("window.__envBlobDownloadBridgeInstalled = true"),
  "Blob download bridge must transfer generated files only on the configured enV origin.",
);
assert.ok(
  iosWorkflow.includes("runs-on: macos-15") &&
    iosWorkflow.includes("pod install --project-directory=ios") &&
    iosWorkflow.includes("xcodebuild") &&
    iosWorkflow.includes("CODE_SIGNING_ALLOWED=NO"),
  "iOS CI must compile the app for Simulator without pretending to produce a signed device IPA.",
);

const parsedQuery = require("query-string").parse("value=hello%20enV&malformed=%E0%A4%A");
assert.equal(
  parsedQuery.value,
  "hello enV",
  "query-string must work with the security-fixed decoder.",
);
assert.equal(
  parsedQuery.malformed,
  "%E0%A4%A",
  "Malformed URI input must be handled without throwing.",
);
assert.match(
  require("uuid").v4(),
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
  "The patched UUID package must preserve xcode's v4 API.",
);

const androidFiles = walk(join(appRoot, "android"));
const androidAppGradle = readFileSync(join(appRoot, "android/app/build.gradle"), "utf8");
const gradleVersionCode = Number(androidAppGradle.match(/versionCode\s+(\d+)/)?.[1]);
const gradleVersionName = androidAppGradle.match(/versionName\s+"([^"]+)"/)?.[1];
assert.equal(
  gradleVersionCode,
  appConfig.android.versionCode,
  "Checked-in Android Gradle versionCode must match Expo app.json.",
);
assert.equal(
  gradleVersionName,
  appConfig.version,
  "Checked-in Android Gradle versionName must match Expo app.json.",
);
const rootLayout = readFileSync(join(appRoot, "src/app/_layout.tsx"), "utf8");
assert.match(
  androidAppGradle,
  /debug\s*\{\s*signingConfig signingConfigs\.debug/,
  "Debug APK must keep the development signing key.",
);
assert.doesNotMatch(
  androidAppGradle,
  /buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/,
  "Release bundles must never use the public debug key.",
);
assert.ok(
  androidAppGradle.includes("enV: Release signing is injected by CI or local environment"),
  "The generated release signing policy must be explicit.",
);
assert.ok(
  androidAppGradle.includes("ANDROID_KEYSTORE_FILE") &&
    androidAppGradle.includes("signingConfig signingConfigs.release"),
  "Release signing must be available through protected environment variables.",
);
assert.ok(
  rootLayout.includes("SplashScreen.preventAutoHideAsync") &&
    rootLayout.includes("SplashScreen.hideAsync"),
  "Native splash dismissal must be explicit and bounded by the React root lifecycle.",
);
assert.ok(
  webShell.includes("WEBVIEW_LOAD_TIMEOUT_MS") && webShell.includes("startLoadTimeout"),
  "WebView startup must fail into a recoverable connection state instead of hanging indefinitely.",
);
for (const relativePath of [
  "android/settings.gradle",
  "android/build.gradle",
  "android/gradlew",
  "android/gradlew.bat",
  "android/app/build.gradle",
  "android/app/src/main/AndroidManifest.xml",
]) {
  assertFile(relativePath);
}
assert.ok(
  androidFiles.some((path) => path.endsWith("/MainActivity.kt")),
  "Generated Android MainActivity.kt is missing.",
);
assert.ok(
  androidFiles.some((path) => path.endsWith("/MainApplication.kt")),
  "Generated Android MainApplication.kt is missing.",
);
assert.ok(
  androidFiles.some((path) => path.endsWith("/gradle-wrapper.jar")),
  "Generated Gradle wrapper JAR is missing.",
);

console.log(
  `Mobile project checks passed (${androidFiles.length} generated Android source/build files found).`,
);
