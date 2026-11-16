import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const androidGradle = read("apps/android/app/build.gradle.kts");
const androidManifest = read("apps/android/app/src/main/AndroidManifest.xml");
const iosInfo = read("apps/ios/enV/Info.plist");
const iosProject = read("apps/ios/enV.xcodeproj/project.pbxproj");
const nativeInventory = JSON.parse(read("apps/shared/native-engine-inventory.json"));
const storeListing = JSON.parse(read("docs/native-store-listing.json"));
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
assert.equal(iosBundleIdentifier, androidApplicationId, "Android and iOS must share the same enV product identifier.");
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


const play = storeListing.android;
const appStore = storeListing.ios;
const byteLength = (value) => Buffer.byteLength(value, "utf8");
assert.equal(storeListing.status, "draft-not-submitted", "Store metadata must stay a draft until store-account publication is verified.");
assert.equal(storeListing.productName, "enV", "The product name must remain enV.");
assert.equal(play.appName, "enV");
assert.equal(play.applicationId, androidApplicationId);
assert.ok(play.appName.length <= 30, "Google Play title limit is 30 characters.");
assert.ok(play.shortDescription.length <= 80, "Google Play short description limit is 80 characters.");
assert.ok(play.fullDescription.length <= 4000, "Google Play full description limit is 4,000 characters.");
assert.equal(appStore.appName, "enV");
assert.equal(appStore.bundleIdentifier, iosBundleIdentifier);
assert.ok(appStore.appName.length >= 2 && appStore.appName.length <= 30, "App Store name must be 2–30 characters.");
assert.ok(appStore.subtitle.length <= 30, "App Store subtitle limit is 30 characters.");
assert.ok(appStore.promotionalText.length <= 170, "App Store promotional text limit is 170 characters.");
assert.ok(appStore.description.length <= 4000, "App Store description limit is 4,000 characters.");
assert.ok(byteLength(appStore.keywords) <= 100, "App Store keywords limit is 100 UTF-8 bytes.");
for (const [platform, listing] of [["Google Play", play], ["App Store", appStore]]) {
  for (const field of ["supportUrl", "privacyPolicyUrl"]) {
    const url = new URL(listing[field]);
    assert.equal(url.protocol, "https:", platform + " " + field + " must use HTTPS.");
    assert.equal(url.hostname, "envtools.store", platform + " " + field + " must use the canonical enV host.");
  }
  assert.equal(listing.listingUrl, null, platform + " listing URL must remain unset until the actual public product page is verified.");
  assert.ok(listing.assetReadiness.includes("Not verified"), platform + " store assets must not be described as ready without evidence.");
}
assert.ok(storeListing.crossSurface.networkDisclosure.includes("Do not claim"), "Store copy must not promise whole-app offline operation.");
assert.ok(storeListing.crossSurface.nativeAppPolicy.includes("system browser"), "Store copy must distinguish native screens from Web-only browser handoff.");

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
  storeListingDraft: {
    status: storeListing.status,
    googlePlay: { title: play.appName, shortDescriptionCharacters: play.shortDescription.length, fullDescriptionCharacters: play.fullDescription.length, listingUrlVerified: Boolean(play.listingUrl) },
    appStore: { title: appStore.appName, subtitleCharacters: appStore.subtitle.length, promotionalTextCharacters: appStore.promotionalText.length, descriptionCharacters: appStore.description.length, keywordBytes: byteLength(appStore.keywords), listingUrlVerified: Boolean(appStore.listingUrl) },
    screenshots: "Not verified; release-build captures are still required.",
  },
  storeAccountPublication: "Not checked by this source audit; requires Google Play Console and App Store Connect evidence.",
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
