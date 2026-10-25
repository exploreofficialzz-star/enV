import test from "node:test";
import assert from "node:assert/strict";
import {
  isSafeMusicOrigin,
  parseMusicCollectionLines,
  protectedMusicPlatform,
  validateDirectMusicUrl,
} from "./music-downloader-policy.ts";

test("accepts direct HTTPS audio files and preserves query strings", () => {
  const result = validateDirectMusicUrl("https://cdn.example.org/artist/track.MP3?download=1");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.extension, "mp3");
    assert.equal(result.url, "https://cdn.example.org/artist/track.MP3?download=1");
  }
});

test("rejects non-HTTPS URLs, web pages, IP literals, and local hosts", () => {
  assert.equal(validateDirectMusicUrl("http://cdn.example.org/track.mp3").ok, false);
  assert.equal(validateDirectMusicUrl("https://cdn.example.org/playlist/123").ok, false);
  assert.equal(isSafeMusicOrigin("https://127.0.0.1/track.mp3").ok, false);
  assert.equal(isSafeMusicOrigin("https://router.local/track.mp3").ok, false);
});

test("recognizes protected streaming pages without treating them as audio downloads", () => {
  assert.equal(protectedMusicPlatform("https://open.spotify.com/album/example")?.label, "Spotify");
  assert.equal(protectedMusicPlatform("https://music.apple.com/us/album/example")?.label, "Apple Music");
  assert.equal(protectedMusicPlatform("https://music.youtube.com/playlist?list=example")?.label, "YouTube Music");
  assert.equal(validateDirectMusicUrl("https://open.spotify.com/track/example").ok, false);
  assert.equal(validateDirectMusicUrl("https://music.apple.com/us/album/example").ok, false);
});

test("parses titled rows, ignores M3U comments, deduplicates, and caps batch size", () => {
  const parsed = parseMusicCollectionLines("#EXTM3U\n#EXTINF:-1,ignored\nTrack A | https://cdn.example.org/a.mp3\nhttps://cdn.example.org/b.m4a\nhttps://cdn.example.org/a.mp3");
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].title, "Track A");
  assert.equal(parseMusicCollectionLines(JSON.stringify([{ title: "Track C", url: "https://cdn.example.org/c.flac" }])).entries.length, 1);
  assert.match(parseMusicCollectionLines(Array.from({ length: 51 }, (_, i) => "https://cdn.example.org/" + i + ".mp3").join("\n")).error ?? "", /50 tracks/);
});

test("rejects malformed JSON manifests", () => {
  assert.match(parseMusicCollectionLines("[not json]").error ?? "", /invalid/);
});
