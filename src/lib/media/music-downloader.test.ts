import test from "node:test";
import assert from "node:assert/strict";
import {
  isSafeMusicOrigin,
  isLikelyMusicCollectionUrl,
  parseMusicCollectionLines,
  protectedMusicPlatform,
  validateDirectMusicUrl,
  validateMusicSourceUrl,
} from "./music-downloader-policy.ts";
import { extractMusicMetadata } from "./music-metadata.ts";
import { getUrlMediaConfig, inspectUrlMedia, downloadUrlMedia } from "./url-media.ts";
import { downloadMusicWithSingleRetry, shouldRetryMusicDownload } from "./music-download-retry.ts";

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
  assert.equal(isSafeMusicOrigin("https://8.8.8.8/track.mp3").ok, false);
});

test("blocks DRM/app-only catalogs while leaving public extractors available", () => {
  assert.equal(protectedMusicPlatform("https://open.spotify.com/album/example")?.label, "Spotify");
  assert.equal(protectedMusicPlatform("https://music.apple.com/us/album/example")?.label, "Apple Music");
  assert.equal(protectedMusicPlatform("https://pandora.com/artist/song")?.label, "Pandora");
  assert.equal(protectedMusicPlatform("https://music.youtube.com/playlist?list=example"), null);
  assert.equal(protectedMusicPlatform("https://audiomack.com/artist/song"), null);
  assert.equal(validateDirectMusicUrl("https://open.spotify.com/track/example").ok, false);
  assert.equal(validateDirectMusicUrl("https://music.apple.com/us/album/example").ok, false);
  assert.equal(parseMusicCollectionLines("https://open.spotify.com/album/example").entries.length, 0);
  assert.match(parseMusicCollectionLines("https://open.spotify.com/album/example").error ?? "", /protected streaming/i);
});

test("accepts supported public music pages for server-side resolution", () => {
  const samples = [
    "https://audiomack.com/artist/song",
    "https://www.boomplay.com/songs/123",
    "https://music.youtube.com/playlist?list=example",
    "https://www.youtube.com/watch?v=example",
    "https://www.mixcloud.com/artist/show/",
    "https://soundcloud.com/artist/track",
    "https://artist.bandcamp.com/album/example",
    "https://archive.org/details/authorized-audio",
  ];
  for (const url of samples) {
    const result = validateMusicSourceUrl(url);
    assert.equal(result.ok, true, url);
    if (result.ok) assert.equal(result.kind, "provider-page", url);
    assert.equal(parseMusicCollectionLines(url).entries[0]?.url, url);
  }
  assert.equal(validateMusicSourceUrl("https://example.com/not-audio-or-provider").ok, false);
});

test("detects collection pages without incorrectly retrying album URLs as single songs", () => {
  for (const link of [
    "https://audiomack.com/evadolee/album/promise-land?share-user-id=118614535",
    "https://www.youtube.com/playlist?list=PL_example",
    "https://music.youtube.com/watch?v=abc&list=PL_example",
    "https://soundcloud.com/artist/sets/collection",
    "https://artist.bandcamp.com/album/release",
    "https://www.boomplay.com/albums/12345",
  ]) assert.equal(isLikelyMusicCollectionUrl(link), true, link);
  for (const link of [
    "https://audiomack.com/evadolee/song/demo",
    "https://music.youtube.com/watch?v=abc",
    "https://soundcloud.com/artist/track",
    "https://artist.bandcamp.com/track/song",
    "https://www.boomplay.com/songs/12345",
    "not a url",
  ]) assert.equal(isLikelyMusicCollectionUrl(link), false, link);
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


function id3TextFrame(id: string, value: string): Uint8Array {
  const text = new TextEncoder().encode(value);
  const payload = new Uint8Array(text.length + 1);
  payload[0] = 3;
  payload.set(text, 1);
  const frame = new Uint8Array(10 + payload.length);
  for (let index = 0; index < 4; index += 1) frame[index] = id.charCodeAt(index);
  const size = payload.length;
  frame[4] = (size >>> 24) & 0xff;
  frame[5] = (size >>> 16) & 0xff;
  frame[6] = (size >>> 8) & 0xff;
  frame[7] = size & 0xff;
  frame.set(payload, 10);
  return frame;
}

function id3Fixture(frames: Uint8Array[]): Uint8Array {
  const size = frames.reduce((sum, frame) => sum + frame.length, 0);
  const header = new Uint8Array(10);
  header.set([0x49, 0x44, 0x33, 3, 0, 0]);
  header[6] = (size >>> 21) & 0x7f;
  header[7] = (size >>> 14) & 0x7f;
  header[8] = (size >>> 7) & 0x7f;
  header[9] = size & 0x7f;
  const output = new Uint8Array(10 + size);
  output.set(header, 0);
  let offset = 10;
  for (const frame of frames) {
    output.set(frame, offset);
    offset += frame.length;
  }
  return output;
}

test("extracts embedded ID3 title, artist, album, year, genre, track and duration", () => {
  const bytes = id3Fixture([
    id3TextFrame("TIT2", "Northern Lights"),
    id3TextFrame("TPE1", "Mira Stone"),
    id3TextFrame("TALB", "After Hours"),
    id3TextFrame("TDRC", "2024-06-18"),
    id3TextFrame("TCON", "Alternative"),
    id3TextFrame("TRCK", "03/11"),
    id3TextFrame("TLEN", "242000"),
  ]);
  const metadata = extractMusicMetadata(bytes, "fallback.mp3");
  assert.equal(metadata.title, "Northern Lights");
  assert.equal(metadata.artist, "Mira Stone");
  assert.equal(metadata.album, "After Hours");
  assert.equal(metadata.year, "2024");
  assert.equal(metadata.genre, "Alternative");
  assert.equal(metadata.trackNumber, "03/11");
  assert.equal(metadata.durationSeconds, 242);
});

test("uses a readable filename as the title when the audio contains no title tag", () => {
  const metadata = extractMusicMetadata(new Uint8Array(), "Northern%20Lights.mp3");
  assert.equal(metadata.title, "Northern Lights");
});

test("Vercel preview music requests use the active origin rather than browser-to-Render CORS", async () => {
  assert.equal(getUrlMediaConfig().endpoint, "/api/backend/url-media");
  const previous = globalThis.fetch;
  const called: Array<{ url: string; body: Record<string, unknown>; credentials?: RequestCredentials }> = [];
  globalThis.fetch = async (input, init) => {
    called.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      credentials: init?.credentials,
    });
    if (String(input).endsWith("/info")) return new Response(JSON.stringify({
      provider: "audiomack", title: "Promise Land", isPlaylist: true, entries: [
        { title: "Test Track", webpageUrl: "https://audiomack.com/evadolee/song/test-track" }
      ], formats: [],
    }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(new Blob([new Uint8Array([73, 68, 51])], { type: "audio/mpeg" }), { status: 200 });
  };
  try {
    const info = await inspectUrlMedia("https://audiomack.com/evadolee/album/promise-land", undefined, undefined, { includePlaylist: true });
    assert.equal(info.title, "Promise Land");
    assert.equal(info.entries?.length, 1);
    const blob = await downloadUrlMedia({ url: "https://audiomack.com/evadolee/song/test-track", audioOnly: true, format: "mp3" });
    assert.equal(blob.size, 3);
    assert.deepEqual(called.map((x) => x.url), ["/api/backend/url-media/info", "/api/backend/url-media/download"]);
    assert.ok(called.every((x) => x.credentials === "same-origin"));
    assert.equal(called[0].body.includePlaylist, true);
  } finally {
    globalThis.fetch = previous;
  }
});

test("unreachable preview media API shows an actionable error instead of Failed to fetch", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  try {
    await assert.rejects(inspectUrlMedia("https://audiomack.com/artist/song/test"), /media API could not be reached from this deployment/);
  } finally {
    globalThis.fetch = previous;
  }
});


test("music retry only targets transient source failures, not access restrictions", () => {
  assert.equal(shouldRetryMusicDownload(Object.assign(new Error("Audiomack returned an empty or invalid JSON response"), { code: "SOURCE_UNAVAILABLE" })), true);
  assert.equal(shouldRetryMusicDownload(Object.assign(new Error("The source took too long to respond"), { code: "NETWORK_TIMEOUT" })), true);
  assert.equal(shouldRetryMusicDownload(Object.assign(new Error("HTTP 503"), { code: "PROVIDER_ERROR" })), true);
  assert.equal(shouldRetryMusicDownload(Object.assign(new Error("Please retry later"), { code: "RATE_LIMITED" })), false);
  assert.equal(shouldRetryMusicDownload(Object.assign(new Error("content is restricted"), { code: "DOWNLOAD_NOT_PERMITTED" })), false);
  assert.equal(shouldRetryMusicDownload(Object.assign(new Error("Track not found"), { code: "SOURCE_UNAVAILABLE" })), false);
});

test("music retry makes at most two attempts and honors abort", async () => {
  const controller = new AbortController();
  let calls = 0;
  let notices = 0;
  const downloaded = await downloadMusicWithSingleRetry(async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error("The source took too long to respond"), { code: "NETWORK_TIMEOUT" });
    return "verified audio";
  }, controller.signal, () => { notices += 1; }, async () => {});
  assert.equal(downloaded, "verified audio");
  assert.equal(calls, 2);
  assert.equal(notices, 1);
  calls = 0;
  await assert.rejects(downloadMusicWithSingleRetry(async () => {
    calls += 1;
    throw Object.assign(new Error("The source took too long to respond"), { code: "NETWORK_TIMEOUT" });
  }, controller.signal, () => {}, async () => {}), /took too long/);
  assert.equal(calls, 2);
  const aborted = new AbortController();
  aborted.abort();
  calls = 0;
  await assert.rejects(downloadMusicWithSingleRetry(async () => {
    calls += 1;
    throw Object.assign(new Error("The source took too long to respond"), { code: "NETWORK_TIMEOUT" });
  }, aborted.signal, () => {}, async () => {}));
  assert.equal(calls, 1);
});
