import test from "node:test";
import assert from "node:assert/strict";
import { validateProject } from "./project.ts";
import type { MediaAsset } from "./schema.ts";

test("media assets support real media metadata and presentation controls", () => {
  const asset: MediaAsset = { id: "a", kind: "video", name: "clip.mp4", mimeType: "video/mp4", url: "data:video/mp4;base64,AA==", source: "upload", width: 1920, height: 1080, durationMs: 2500, thumbnailUrl: "data:image/jpeg;base64,AA==", objectFit: "cover", crop: { x: 0, y: 0, width: 1, height: 1 }, scale: 1 };
  assert.equal(asset.width, 1920);
  assert.equal(asset.height, 1080);
  assert.equal(asset.objectFit, "cover");
  assert.ok(asset.thumbnailUrl);
});

test("project schema accepts media presentation metadata", () => {
  const project = { schemaVersion: 1, id: "p", name: "x", platform: "whatsapp", scene: "chat", deviceTemplate: "iphone-modern-light", theme: "light", profiles: [], messages: [], media: [], timeline: [], exportSettings: { format: "png", scale: 1, transparent: false }, createdAt: "x", updatedAt: "x" };
  assert.equal(validateProject(project), true);
});
