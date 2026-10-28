import test from "node:test";
import assert from "node:assert/strict";
import {
  newSandboxFolder,
  newSandboxTrack,
  sandboxApplyTags,
  sandboxCaption,
  sandboxTrainerLyrics,
  sandboxManifest,
  sandboxReady,
  sandboxProblems,
  assertSandboxCapacity,
  assertSandboxFolder,
  uniqueSandboxId,
  sandboxFolderPath,
  SANDBOX_MB,
} from "./music-sandbox.ts";
import { groupSandboxEntries, type SandboxEntry } from "./music-sandbox-files.ts";

function fixture() {
  const folder = { ...newSandboxFolder("Afrobeats"), genre: "Afrobeats", subStyle: "afro-fusion" };
  const track = newSandboxTrack(folder, "afrobeats_0001");
  track.tags = {
    ...track.tags,
    language: ["English", "Yoruba"],
    license: "owned",
    source: "Private permission record",
    descriptions: [
      "Smooth guitar and shakers with a warm voice.",
      "A relaxed bilingual groove over soft percussion.",
    ],
    instruments: ["guitar", "shaker"],
    tempo_bpm: 104,
    key: "A minor",
  };
  track.audio = {
    filename: "original.wav",
    extension: "wav",
    size: SANDBOX_MB,
    format: "PCM",
    sampleRate: 44100,
    channels: 2,
    bitDepth: 16,
  };
  track.lyrics = "[verse 1 | English]\nHello\n\n[chorus | Yoruba]\nẸ káàrọ̀";
  track.licenseStatus = "cleared";
  track.reviewed = true;
  return { folder, track };
}
test("training readiness requires human review and cleared rights; blank technical guesses are allowed", () => {
  const { track } = fixture();
  assert.equal(sandboxReady(track), true);
  track.reviewed = false;
  assert.equal(sandboxReady(track), false);
  track.reviewed = true;
  track.licenseStatus = "pending";
  assert.equal(sandboxReady(track), false);
  track.licenseStatus = "cleared";
  track.tags.source = "";
  assert.equal(sandboxReady(track), false);
});
test("lyrics-only records can be reviewed without audio-only descriptions, vocals or BPM", () => {
  const { track } = fixture();
  track.audio = null;
  track.tags.descriptions = [];
  assert.deepEqual(sandboxProblems(track), []);
});
test("instrumental audio may omit lyrics and language", () => {
  const { track } = fixture();
  track.instrumental = true;
  track.lyrics = "";
  track.tags.language = [];
  assert.equal(sandboxReady(track), true);
});
test("captions cannot leak identity, source, license, custom fields, BPM or key", () => {
  const { track } = fixture();
  track.title = "Private title";
  track.custom = { artist: "A private name" };
  const caption = sandboxCaption(track);
  assert.match(caption, /Afrobeats, afro-fusion/);
  assert.match(caption, /sung in English and Yoruba/);
  for (const secret of [
    track.tags.id,
    track.tags.source,
    track.tags.license,
    track.tags.key,
    "104",
    track.title,
    "A private name",
  ])
    assert.ok(!caption.includes(secret));
});
test("training lyrics strip section languages and numbering while preserving Unicode and repeated choruses", () => {
  const { track } = fixture();
  assert.equal(sandboxTrainerLyrics(track.lyrics), "[Verse]\nHello\n\n[Chorus]\nẸ káàrọ̀");
  assert.equal(
    sandboxTrainerLyrics("[pre-chorus | Igbo]\nị\n[chorus]\nx\n[chorus]\nx"),
    "[Pre-Chorus]\nị\n[Chorus]\nx\n[Chorus]\nx",
  );
});
test("manifest filenames follow renamed IDs and nested folders", () => {
  const { folder, track } = fixture();
  const sub = { ...newSandboxFolder("Afro fusion", folder.key) };
  track.folderId = sub.key;
  track.tags.id = "renamed_0007";
  const manifest = sandboxManifest([track], [folder, sub]);
  assert.ok(manifest.includes("afrobeats/afro_fusion/renamed_0007.wav"));
  assert.ok(manifest.includes("renamed_0007.tags.json"));
  assert.ok(manifest.includes('"cleared","yes"'));
});
test("JSON edits validate known field types and preserve custom fields without prototype keys", () => {
  const { track } = fixture();
  const next = sandboxApplyTags(
    track,
    JSON.parse(
      '{"id":"renamed","language":["Igbo"],"custom_detail":"rare bell","__proto__":{"polluted":true}}',
    ),
  );
  assert.equal(next.tags.id, "renamed");
  assert.equal(next.custom.custom_detail, "rare bell");
  assert.equal(Object.hasOwn(next.custom, "__proto__"), false);
  assert.equal(track.tags.id, "afrobeats_0001");
  assert.throws(() => sandboxApplyTags(track, { language: "Igbo" }), /list/);
  assert.throws(() => sandboxApplyTags(track, { tempo_bpm: "120" }), /number/);
  assert.deepEqual(
    sandboxApplyTags(next, { ...next.tags }, true).custom,
    {},
    "Removing a custom JSON field must remove it from the saved record",
  );
});
test("folder limits include previous sessions and nested descendants", () => {
  const { folder, track } = fixture();
  folder.maxSongs = 1;
  const sub = newSandboxFolder("Afro fusion", folder.key);
  track.folderId = sub.key;
  assert.throws(() => assertSandboxCapacity(sub.key, [folder, sub], [track], 1, 0), /1-song limit/);
  assert.doesNotThrow(() =>
    assertSandboxCapacity(sub.key, [folder, sub], [track], 1, SANDBOX_MB, track.key),
  );
  folder.maxSongs = 100;
  folder.maxMB = 10;
  assert.throws(
    () => assertSandboxCapacity(sub.key, [folder, sub], [track], 1, 10 * SANDBOX_MB),
    /10 MB limit/,
  );
});
test("moving folders rejects cycles, export-name collisions and ancestor overcapacity", () => {
  const { folder, track } = fixture();
  const sub = newSandboxFolder("sub", folder.key),
    other = { ...newSandboxFolder("Other"), maxSongs: 1 };
  assert.throws(
    () => assertSandboxFolder({ ...folder, parentId: sub.key }, [folder, sub], []),
    /cannot be moved/,
  );
  assert.throws(
    () => assertSandboxFolder(newSandboxFolder("AFROBEATS"), [folder], []),
    /same export name/,
  );
  const otherTrack = { ...track, key: "other", folderId: other.key };
  assert.throws(
    () =>
      assertSandboxFolder({ ...folder, parentId: other.key }, [folder, other], [track, otherTrack]),
    /1-song limit/,
  );
});
test("duplicate imports receive unique IDs without replacing prior records", () => {
  const { track } = fixture();
  assert.equal(uniqueSandboxId(track.tags.id, [track]), "afrobeats_0001_002");
});
test("sidecars group by complete path so equal basenames in different subfolders remain separate", () => {
  const entry = (path: string): SandboxEntry => ({ path, size: 5, read: async () => new Blob() });
  const { groups } = groupSandboxEntries(
    ["jazz/song.wav", "jazz/song.tags.json", "jazz/song.lyrics.txt", "folk/song.flac"].map(entry),
  );
  assert.equal(groups.length, 2);
  assert.ok(groups[0]!.audio && groups[0]!.tags && groups[0]!.lyrics);
  assert.equal(groups[1]!.path, "folk");
  assert.throws(() => groupSandboxEntries(["song.wav", "song.mp3"].map(entry)), /Multiple audio/);
});
test("bad musical values and traversal IDs cannot be reviewed", () => {
  const { track } = fixture();
  track.tags.id = "../outside";
  track.tags.tempo_bpm = -1;
  assert.ok(sandboxProblems(track).length >= 2);
  assert.equal(sandboxReady(track), false);
  assert.equal(
    sandboxFolderPath({ ...newSandboxFolder("nested"), parentId: "missing" }, []),
    "nested",
  );
});
