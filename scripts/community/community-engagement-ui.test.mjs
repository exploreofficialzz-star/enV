import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [
  web, android, ios, androidWallet, iosWallet, server, identityRoute,
  publicFeed, publicIndex, publicDetail, toolRoute, footer, seoGenerator, seoMetadata,
] = await Promise.all([
  read("src/components/tools/tool-community-panel.tsx"),
  read("apps/android/app/src/main/java/com/chastech/env/NativeToolCommunityPanel.kt"),
  read("apps/ios/enV/ToolViews.swift"),
  read("apps/android/app/src/main/java/com/chastech/env/billing/OfflineWalletNativeApi.kt"),
  read("apps/ios/enV/OfflineWalletNativeAPI.swift"),
  read("src/lib/community/community.server.ts"),
  read("server/routes/api/community/identity.get.ts"),
  read("src/lib/community/public-feed.functions.ts"),
  read("src/routes/community/index.tsx"),
  read("src/routes/community/tools/$category/$slug.tsx"),
  read("src/routes/tools/$category/$slug.tsx"),
  read("src/components/layout/footer.tsx"),
  read("scripts/generate-seo-artifacts.mjs"),
  read("src/lib/seo-metadata.ts"),
]);

function assertOrdered(source, like, comments, dislike, platform) {
  const positions = [source.indexOf(like), source.indexOf(comments), source.indexOf(dislike)];
  assert.ok(positions.every((position) => position >= 0), platform + " exposes Like, Comments and Dislike controls");
  assert.ok(positions[0] < positions[1] && positions[1] < positions[2], platform + " keeps Dislike in the third action position");
}

test("Web, Android and iOS use the compact Like / Comments / Dislike action order", () => {
  assertOrdered(web, 'aria-label={"Like, " + likes}', 'aria-label={"Open " + commentCount + " comments"}', 'aria-label={"Dislike, " + dislikes}', "Web");
  assertOrdered(android, 'onClick = { sendReaction("like") }', "showComments = true", 'onClick = { sendReaction("dislike") }', "Android");
  assertOrdered(ios, 'await react("like")', "showingComments = true", 'await react("dislike")', "iOS");
});

test("the duplicated reaction/count strip is removed on all three products", () => {
  assert.doesNotMatch(web, /aria-label=\{compactCount\(likes \+ dislikes\) \+ " reactions"\}/);
  assert.doesNotMatch(android, /Text\("👍 \$\{compactCommunityCount\(current\?\.likes \?\? 0\)\} {2}👎/);
  assert.doesNotMatch(android, /Text\("💬 \$\{compactCommunityCount\(current\?\.commentCount \?\? 0\)\} {3}👁/);
  const iosPanel = ios.split("struct ToolCommunityPanel: View")[1]?.split("struct ToolDestinationView: View")[0] ?? "";
  assert.doesNotMatch(iosPanel, /Image\(systemName: "hand\.thumbsup\.fill"\)/);
  assert.doesNotMatch(iosPanel, /Image\(systemName: "eye"\)/);
});

test("comments open in overlays with replies and moderation controls", () => {
  assert.match(web, /role="dialog" aria-modal="true"/);
  assert.match(web, /event\.key !== "Tab"/, "Web comments dialog traps keyboard focus");
  assert.match(web, /previousFocus\?\.focus\(\)/, "Web comments dialog restores focus on close");
  assert.match(android, /DialogProperties\(usePlatformDefaultWidth = false\)/);
  assert.match(ios, /\.fullScreenCover\(isPresented: \$showingComments\)\s*\{\s*commentsOverlay\s*\}/);
  for (const source of [web, android, ios]) {
    assert.match(source, /Reply/);
    assert.match(source, /Report/);
  }
  assert.ok(!web.includes("Share feedback and discuss this tool with other users."));
  assert.ok(!android.includes('Text("Community")'));
  assert.ok(!ios.includes('enVCharacterSpacedText("Community")'));
});

test("comments retain verified account identity, guest anonymity and guest display-name choice", () => {
  assert.match(web, /useCurrentUserState/);
  assert.match(web, /accountUser/);
  assert.match(web, /setIdentityMode\("public"\)/);
  assert.match(web, /setIdentityMode\("anonymous"\)/);
  assert.match(web, /Choose a display name/);

  assert.match(android, /NativeCommunityApi\.identity\(\)/);
  assert.match(android, /accountSignedIn/);
  assert.match(android, /communityBearerToken\(context\)/);
  assert.match(androidWallet, /fun communityBearerToken\(context: Context\)/);
  assert.match(android, /Display name/);

  const iosPanel = ios.split("struct ToolCommunityPanel: View")[1]?.split("struct ToolDestinationView: View")[0] ?? "";
  const iosClient = ios.split("private enum NativeCommunityClient")[1]?.split("private enum NativeCommunityIdentity")[0] ?? "";
  assert.match(iosClient, /static func identity\(\)/);
  assert.match(iosClient, /communityBearerToken\(\)/);
  assert.match(iosPanel, /accountSignedIn/);
  assert.match(iosPanel, /Choose a public display name/);
  assert.match(iosWallet, /static func communityBearerToken\(\)/);

  assert.match(identityRoute, /getCommunityIdentity/);
  assert.match(server, /async function communityUserId/);
  assert.match(server, /requireOfflineBillingUser/);
  assert.match(server, /select name from "user"/);
  assert.match(server, /userId \? await accountDisplayName\(userId\) : body\.displayName/);
});

test("comment composers disclose public visibility before submission on every product", () => {
  const notice = "Comments are public and may appear in search results. Do not include private information.";
  assert.ok(web.includes(notice));
  assert.ok(android.includes(notice));
  assert.ok(ios.includes(notice));
});

test("public discussion index and per-tool pages expose public comments for search discovery", () => {
  assert.match(publicFeed, /loadPublicCommunityIndex/);
  assert.match(publicFeed, /loadPublicCommunityToolFeed/);
  assert.match(publicIndex, /CollectionPage/);
  assert.match(publicIndex, /Public tool discussions/);
  assert.match(publicIndex, /<AppShell>/);
  assert.match(publicDetail, /<AppShell>/);
  assert.doesNotMatch(publicIndex, /<main/);
  assert.doesNotMatch(publicDetail, /<main/);
  assert.match(publicDetail, /CollectionPage/);
  assert.match(publicDetail, /"@type": "Comment"/);
  assert.match(toolRoute, /loadPublicCommunityToolFeed/);
  assert.match(toolRoute, /initialCommunityFeed=\{communityFeed\}/);
  assert.match(web, /discussionHref/);
  assert.match(footer, /to: "\/community", label: "Public discussions"/);
  assert.match(seoGenerator, /"\/community"/);
  assert.match(seoGenerator, /Public tool discussions/);
});

test("public comment text is safely escaped before JSON-LD is embedded in HTML", () => {
  assert.match(seoMetadata, /children: structuredDataJson/);
  assert.ok(seoMetadata.includes(String.raw`.replace(/</g, "\\u003c")`));
  assert.ok(seoMetadata.includes(String.raw`.replace(/>/g, "\\u003e")`));
  assert.ok(seoMetadata.includes(String.raw`.replace(/&/g, "\\u0026")`));
  assert.ok(seoMetadata.includes(String.raw`.replace(/\u2028/g, "\\u2028")`));
  assert.ok(seoMetadata.includes(String.raw`.replace(/\u2029/g, "\\u2029")`));
});

test("engagement counters remain wired to likes, dislikes, comments and views", () => {
  assert.match(web, /counts\.likes/);
  assert.match(web, /counts\.dislikes/);
  assert.match(web, /counts\.comments/);
  assert.match(web, /counts\.views/);
  assert.match(android, /optInt\("likes"\)/);
  assert.match(android, /optInt\("dislikes"\)/);
  assert.match(android, /optInt\("comments"\)/);
  assert.match(android, /optInt\("views"\)/);
  const iosPanel = ios.split("struct ToolCommunityPanel: View")[1]?.split("struct ToolDestinationView: View")[0] ?? "";
  assert.match(iosPanel, /counts\.likes/);
  assert.match(iosPanel, /counts\.dislikes/);
  assert.match(iosPanel, /counts\.comments/);
  // Views remain a backend metric, not a fourth visible action in the compact UI.
  assert.match(server, /views:num\(views\[0\]\?\.total\)/);
  assert.match(server, /views30Days:num\(views\[0\]\?\.recent\)/);
});
