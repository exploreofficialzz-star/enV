import test from "node:test";
import assert from "node:assert/strict";
import { extractExplicitPublicAudioLink, extractExplicitPublicAudioLinks, probeExplicitPublicAudioLink, isPublicMediaCollectionPage } from "./public-download-links.mjs";

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

test("extensionless signed artist download links are discovered but never trusted without MIME validation", async () => {
  const html = '<a download href="https://files.example.org/dl?id=123&amp;sig=xyz">Save audio</a>';
  const link = extractExplicitPublicAudioLink(html, "https://artist.example.org/song");
  assert.equal(link.href, "https://files.example.org/dl?id=123&sig=xyz");
  const safeFetch = async (url, options) => {
    assert.equal(options.method, "HEAD");
    return { url: new URL(url), response: {
      ok: true, status: 200, headers: new Headers({ "content-type": "audio/mpeg" }), body: null,
    } };
  };
  assert.equal((await probeExplicitPublicAudioLink(link, safeFetch)).href, link.href);
});

test("download buttons to HTML pages, DRM manifests, or octet-stream without attachment are not accepted", async () => {
  const links = extractExplicitPublicAudioLinks(
    '<a download href="/player.m3u8">Download</a><a href="/download?id=2">Download track</a>' +
    '<a href="/archive.flac">Listen</a>', "https://artist.example.org/music");
  assert.deepEqual(links.map((link) => link.pathname), ["/download"]);
  for (const type of ["text/html", "application/json", "application/octet-stream"]) {
    const safeFetch = async (url) => ({ url: new URL(url), response: {
      ok: true, status: 200, headers: new Headers({ "content-type": type }), body: null,
    } });
    assert.equal(await probeExplicitPublicAudioLink(links[0], safeFetch), null);
  }
});

test("public download link HEAD fallback validates audio and cancels the ranged GET body", async () => {
  const link = new URL("https://artist.example.org/download/abc");
  let calls = 0;
  let cancelled = false;
  const safeFetch = async (url, options) => {
    calls++;
    return { url: new URL(url), response: options.method === "HEAD"
      ? { ok: false, status: 405, headers: new Headers(), body: null }
      : { ok: true, status: 206, headers: new Headers({ "content-type": "audio/flac" }),
          body: { cancel: async () => { cancelled = true; } } } };
  };
  assert.equal((await probeExplicitPublicAudioLink(link, safeFetch)).href, link.href);
  assert.equal(calls, 2);
  assert.equal(cancelled, true);
});

test("public audio discovery works identically for different provider pages", () => {
  for (const pageUrl of [
    "https://audiomack.com/artist/song/sample",
    "https://soundcloud.com/artist/song",
    "https://artist.bandcamp.com/track/song",
    "https://www.boomplay.com/songs/123",
  ]) {
    const result = extractExplicitPublicAudioLink('<a download href="https://cdn.example.org/authorized-song.mp3">Download</a>', pageUrl);
    assert.equal(result?.hostname, "cdn.example.org");
  }
});
