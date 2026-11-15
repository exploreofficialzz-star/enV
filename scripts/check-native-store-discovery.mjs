import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const androidGradle = read("apps/android/app/build.gradle.kts");
const androidManifest = read("apps/android/app/src/main/AndroidManifest.xml");
const iosInfo = read("apps/ios/enV/Info.plist");
const iosProject = read("apps/ios/enV.xcodeproj/project.pbxproj");
const nativeInventory = JSON.parse(read("apps/shared/native-engine-inventory.json"));
const catalogSource = read("src/data/catalog.ts");
const seoSource = read("src/lib/seo-metadata.ts");
const platformSource = read("src/components/platform/platform-landing.tsx");
const androidRoute = read("src/routes/platform/android.tsx");
const iosRoute = read("src/routes/platform/ios.tsx");

function capture(source, expression, label) {
  const match = source.match(expression);
  assert.ok(match, "Could not read " + label + " from the current native app sources.");
  return match[1].trim();
}

const androidNamespace = capture(androidGradle, /^\s*namespace\s*=\s*"([^"]+)"/m, "Android namespace");
const androidApplicationId = capture(androidGradle, /^\s*applicationId\s*=\s*"([^"]+)"/m, "Android application ID");
const androidVersionCode = Number(capture(androidGradle, /^\s*versionCode\s*=\s*(\d+)/m, "Android version code"));
const androidVersionName = capture(androidGradle, /^\s*versionName\s*=\s*"([^"]+)"/m, "Android version name");
const androidDisplayName = capture(androidManifest, /android:label="([^"]+)"/, "Android display name");

const iosDisplayName = capture(iosInfo, /<key>CFBundleDisplayName<\/key>\s*<string>([^<]+)<\/string>/, "iOS display name");
const iosBundleIdentifier = capture(iosInfo, /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/, "iOS bundle identifier");
const iosProjectBundleIdentifiers = [...new Set(
  [...iosProject.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((match) => match[1].trim()),
)];
const iosMarketingVersions = [...new Set(
  [...iosProject.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((match) => match[1].trim()),
)];
const iosBuildVersions = [...new Set(
  [...iosProject.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((match) => match[1].trim()),
)];

const siteOrigin = capture(seoSource, /export const SITE_ORIGIN = "([^"]+)"/, "canonical website origin");
const expectedCatalogVersion = createHash("sha256").update(catalogSource).digest("hex").slice(0, 12);
const androidIds = new Set(nativeInventory.androidToolIds ?? []);
const iosIds = new Set(nativeInventory.iosToolIds ?? []);

assert.equal(androidDisplayName, "enV", "Android display name must use the canonical product name.");
assert.equal(iosDisplayName, "enV", "iOS display name must use the canonical product name.");
assert.equal(androidNamespace, "com.chastech.env", "Android namespace changed unexpectedly.");
assert.equal(androidApplicationId, "com.chastech.env", "Android application ID must match the enV package identity.");
assert.equal(iosBundleIdentifier, "com.chastech.env", "iOS bundle identifier must match the enV app identity.");
assert.ok(iosProjectBundleIdentifiers.includes(iosBundleIdentifier), "Xcode app target must use the bundle identifier from Info.plist.");
assert.equal(siteOrigin, "https://envtools.store", "Native discovery pages must point to the canonical website.");
assert.ok(platformSource.includes("The native enV app stays native."), "Platform landing page must distinguish the native app from the Web product.");
assert.ok(platformSource.includes("native-ready tools continue to run inside the app."), "Platform landing page must distinguish native-ready tools from Web-only tools.");
assert.ok(platformSource.includes("open here in your system browser"), "Platform landing page must disclose Web-only browser handoff.");
assert.ok(androidRoute.includes('path: "/platform/android"'), "Android handoff must have the canonical platform route.");
assert.ok(iosRoute.includes('path: "/platform/ios"'), "iOS handoff must have the canonical platform route.");
assert.equal(nativeInventory.baseCatalogVersion, expectedCatalogVersion, "Native catalogue inventory must match the current shared source catalogue.");
assert.equal(androidIds.size, (nativeInventory.androidToolIds ?? []).length, "Android native manifest contains duplicate tool IDs.");
assert.equal(iosIds.size, (nativeInventory.iosToolIds ?? []).length, "iOS native manifest contains duplicate tool IDs.");
assert.deepEqual([...androidIds].sort(), [...iosIds].sort(), "Android and iOS coverage manifests must list the same stable tool IDs.");
assert.equal(nativeInventory.summary.androidImplemented, androidIds.size, "Android native inventory summary must match its manifest.");
assert.equal(nativeInventory.summary.iosImplemented, iosIds.size, "iOS native inventory summary must match its manifest.");

const report = {
  status: "passed",
  canonicalProductName: "enV",
  website: siteOrigin,
  android: {
    displayName: androidDisplayName,
    namespace: androidNamespace,
    applicationId: androidApplicationId,
    versionName: androidVersionName,
    versionCode: androidVersionCode,
    nativeManifestToolIds: androidIds.size,
  },
  ios: {
    displayName: iosDisplayName,
    bundleIdentifier: iosBundleIdentifier,
    marketingVersions: iosMarketingVersions,
    buildVersions: iosBuildVersions,
    nativeManifestToolIds: iosIds.size,
  },
  sharedNativeCatalogue: {
    expandedRecords: nativeInventory.summary.totalTools,
    engineFamilies: nativeInventory.summary.engineFamilies,
    matchingBaseCatalogVersion: nativeInventory.baseCatalogVersion,
    androidAndIosManifestIdSetsMatch: true,
  },
  releaseVersionMetadataAligned:
    iosMarketingVersions.length === 1 &&
    iosBuildVersions.length === 1 &&
    iosMarketingVersions[0] === androidVersionName &&
    iosBuildVersions[0] === String(androidVersionCode),
  storeAccountPublication: "Not checked by this source audit; requires Google Play Console and App Store Connect evidence.",
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
