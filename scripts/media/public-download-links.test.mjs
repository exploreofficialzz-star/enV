import test from "node:test";
import assert from "node:assert/strict";
import { extractExplicitPublicAudioLink, isPublicMediaCollectionPage } from "./public-download-links.mjs";

test("extracts explicit file download link without API keys", () => {
  const page = '<h1>Free artist download</h1><a download="free-track.mp3" href="https://cdn.example.org/free-track.mp3?token=ok&amp;expires=123">Save track</a>';
  const url = extractExplicitPublicAudioLink(page, "https://artist.example/track");
  assert.equal(url.href, "https://cdn.example.org/free-track.mp3?token=ok&expires=123");
});

test("supports public relative downloadable audio links", () => {
  const page = '<a title="Download MP3" href="/files/song.mp3#ignored">Get MP3</a>';
  assert.equal(extractExplicitPublicAudioLink(page, "https://artist.example/track")?.href,
    "https://artist.example/files/song.mp3");
});

test("does not turn a streaming player or a generic hyperlink into a downloadable file", () => {
  for (const html of [
    '<audio src="https://cdn.example.org/stream.mp3"></audio>',
    '<a href="https://cdn.example.org/stream.mp3">Listen now</a>',
    '<a href="https://cdn.example.org/file.mp3">Play</a>',
    '<script>const stream = "https://cdn.example.org/stream.mp3"</script>',
    '<a href="javascript:alert(1)" download>Download</a>',
    '<a href="http://cdn.example.org/song.mp3" download>Download</a>',
    '<a href="https://127.0.0.1/song.mp3" download>Download</a>',
  ]) {
    const result = extractExplicitPublicAudioLink(html, "https://artist.example/song");
    if (html.includes("127.0.0.1")) {
      // This pure parser cannot DNS-validate. The caller's fetchPublic must do so.
      assert.equal(result?.hostname, "127.0.0.1");
    } else assert.equal(result, null, html);
  }
});

test("does not treat playlists or albums as a single downloadable track", () => {
  for (const url of [
    "https://audiomack.com/evadolee/album/promise-land",
    "https://music.youtube.com/playlist?list=test",
    "https://music.youtube.com/watch?v=test&list=test",
    "https://soundcloud.com/artist/sets/album",
    "https://boomplay.com/playlists/123",
  ]) assert.equal(isPublicMediaCollectionPage(url), true, url);
  assert.equal(isPublicMediaCollectionPage("https://audiomack.com/artist/song/test"), false);
});
