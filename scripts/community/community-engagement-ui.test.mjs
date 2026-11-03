import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [web, android, ios] = await Promise.all([
  readFile(resolve(root, "src/components/tools/tool-community-panel.tsx"), "utf8"),
  readFile(resolve(root, "apps/android/app/src/main/java/com/chastech/env/NativeToolCommunityPanel.kt"), "utf8"),
  readFile(resolve(root, "apps/ios/enV/ToolViews.swift"), "utf8"),
]);

function assertOrdered(source, like, comments, dislike, platform) {
  const positions = [source.indexOf(like), source.indexOf(comments), source.indexOf(dislike)];
  assert.ok(positions.every((position) => position >= 0), platform + " exposes Like, Comments and Dislike controls");
  assert.ok(positions[0] < positions[1] && positions[1] < positions[2], platform + " keeps Dislike in the third action position");
}

test("tool engagement uses the compact Like / Comments / Dislike action order", () => {
  assertOrdered(web, 'aria-label={"Like, " + likes}', 'aria-label={"Open " + commentCount + " comments"}', 'aria-label={"Dislike, " + dislikes}', "Web");
  assertOrdered(android, 'onClick = { sendReaction("like") }', "showComments = true", 'onClick = { sendReaction("dislike") }', "Android");
  assertOrdered(ios, 'await react("like")', "showingComments = true", 'await react("dislike")', "iOS");
});

test("comments open in an overlay rather than an always-visible community feed", () => {
  assert.match(web, /role="dialog" aria-modal="true"/);
  assert.match(web, /event\.key !== "Tab"/, "Web comments dialog traps keyboard focus");
  assert.match(web, /previousFocus\?\.focus\(\)/, "Web comments dialog restores focus on close");
  assert.match(android, /DialogProperties\(usePlatformDefaultWidth = false\)/);
  assert.match(ios, /\.fullScreenCover\(isPresented: \$showingComments\)\s*\{\s*commentsOverlay\s*\}/);
  assert.ok(!web.includes("Share feedback and discuss this tool with other users."));
  assert.ok(!android.includes('Text("Community")'));
  assert.ok(!ios.includes('enVCharacterSpacedText("Community")'));
});

test("engagement counters retain likes, dislikes, comments and views", () => {
  assert.match(web, /counts\.likes/);
  assert.match(web, /counts\.dislikes/);
  assert.match(web, /counts\.comments/);
  assert.match(web, /counts\.views/);
  assert.match(android, /optInt\("likes"\)/);
  assert.match(android, /optInt\("dislikes"\)/);
  assert.match(android, /optInt\("comments"\)/);
  assert.match(android, /optInt\("views"\)/);
  assert.match(ios, /counts\.likes/);
  assert.match(ios, /counts\.dislikes/);
  assert.match(ios, /counts\.comments/);
  assert.match(ios, /counts\.views/);
});
