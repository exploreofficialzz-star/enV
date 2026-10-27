import test from "node:test";
import assert from "node:assert/strict";
import { archiveItemIdentifier, archiveMetadataUrl, isArchiveItemPage, parseArchiveAudioItem } from "./archive-org.mjs";

const item = "https://archive.org/details/authorized_recordings_2026";
test("Archive.org metadata provider accepts only valid HTTPS public item IDs", () => {
  assert.equal(archiveItemIdentifier(item), "authorized_recordings_2026");
  assert.equal(archiveMetadataUrl(item), "https://archive.org/metadata/authorized_recordings_2026");
  assert.equal(isArchiveItemPage(item), true);
  assert.equal(isArchiveItemPage("https://archive.org/download/authorized_recordings_2026/test.mp3"), false);
  for (const url of ["http://archive.org/details/example", "https://evil.example/details/album_id",
    "https://archive.org/details/..", "https://archive.org/details/%2Fetc", "https://archive.org/details/a"]) {
    assert.equal(archiveItemIdentifier(url), null, url);
  }
});

test("Archive.org adapter lists real audio files without collecting hidden or video resources", () => {
  const payload = { metadata: { title: "Public live recording", creator: "Artist" }, files: [
    { name: "song-one.mp3", size: "1234", source: "original" },
    { name: "sets/song two.flac", size: "777", source: "original", title: "Track two" },
    { name: "cover.jpg", size: "10" },
    { name: "private.mp3", private: "true" },
    { name: "../escape.mp3" },
    { name: "huge.wav", size: String(51 * 1024 * 1024) },
  ] };
  const parsed = parseArchiveAudioItem(payload, item);
  assert.equal(parsed.title, "Public live recording");
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].webpageUrl, "https://archive.org/download/authorized_recordings_2026/song-one.mp3");
  assert.equal(parsed.entries[1].webpageUrl, "https://archive.org/download/authorized_recordings_2026/sets/song%20two.flac");
  assert.equal(parsed.entries[1].title, "Track two");
  assert.equal(parsed.truncated, false);
});

test("Archive.org catalog limits previews and rejects dark/private items", () => {
  const files = Array.from({length: 60}, (_, i) => ({name: "track-" + i + ".mp3", size: "10"}));
  const itemData = parseArchiveAudioItem({metadata: {title: "Album"}, files}, item);
  assert.equal(itemData.entries.length, 50);
  assert.equal(itemData.truncated, true);
  assert.equal(parseArchiveAudioItem({is_dark: true, files}, item), null);
  assert.equal(parseArchiveAudioItem({files: [{name: "track.mp3", private: true}]}, item), null);
  assert.equal(parseArchiveAudioItem({files: [{name: "cover.jpg"}]}, item), null);
});
