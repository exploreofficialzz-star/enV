import assert from "node:assert/strict";
import test from "node:test";
import { musicSourceKey } from "./audio-music-storage.ts";

test("Music Studio take storage keys distinguish file versions and MIME types", () => {
  const base = { name: "practice.wav", size: 1024, lastModified: 1_700_000_000_000, type: "audio/wav" };
  assert.equal(musicSourceKey(base), musicSourceKey({ ...base }));
  assert.notEqual(musicSourceKey(base), musicSourceKey({ ...base, lastModified: base.lastModified + 1 }));
  assert.notEqual(musicSourceKey(base), musicSourceKey({ ...base, size: 2048 }));
  assert.notEqual(musicSourceKey(base), musicSourceKey({ ...base, type: "audio/mpeg" }));
});
