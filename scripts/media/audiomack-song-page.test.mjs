import test from "node:test";
import assert from "node:assert/strict";
import { isAudiomackSongUrl, parseAudiomackSongPage } from "./audiomack-song-page.mjs";

const track = "https://audiomack.com/test-artist/song/my-new-single?share-user-id=12";
test("individual Audiomack songs are not albums or playlists", () => {
  assert.equal(isAudiomackSongUrl(track), true);
  assert.equal(isAudiomackSongUrl("https://audiomack.com/song/test-artist/my-new-single"), true);
  assert.equal(isAudiomackSongUrl("https://audiomack.com/test-artist/album/my-new-single"), false);
  assert.equal(isAudiomackSongUrl("https://audiomack.com/test-artist/playlist/my-new-single"), false);
  assert.equal(isAudiomackSongUrl("https://not-audiomack.com/test-artist/song/my-new-single"), false);
  assert.equal(isAudiomackSongUrl("http://audiomack.com/test-artist/song/my-new-single"), false);
});
test("single track previews use public page metadata without requiring the legacy JSON API", () => {
  const html = '<html><head><meta property="og:title" content="My New Single | Audiomack"><meta name="author" content="Test Artist"></head><body><h1>My New Single</h1></body></html>';
  const parsed = parseAudiomackSongPage(html, track);
  assert.equal(parsed.title, "My New Single");
  assert.equal(parsed.uploader, "Test Artist");
  assert.equal(parsed.isPlaylist, false);
  assert.deepEqual(parsed.entries, []);
  assert.deepEqual(parsed.formats, []);
});
test("album, bot challenge and unlabelled pages do not masquerade as music tracks", () => {
  assert.equal(parseAudiomackSongPage('<meta property="og:title" content="Album">', "https://audiomack.com/test-artist/album/example"), null);
  assert.equal(parseAudiomackSongPage('<h1>Just a moment</h1>', track), null);
  assert.equal(parseAudiomackSongPage('<h1>Access denied</h1>', track), null);
  assert.equal(parseAudiomackSongPage('<html></html>', track), null);
});
