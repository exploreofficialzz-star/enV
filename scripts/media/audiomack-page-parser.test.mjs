import test from "node:test";
import assert from "node:assert/strict";
import { parseAudiomackAlbumPage } from "./audiomack-page-parser.mjs";

const albumUrl = "https://audiomack.com/evadolee/album/promise-land?share-user-id=118614535";

test("extracts public Audiomack hydration entries even without type", () => {
  const hydration = {
    props: { pageProps: { album: {
      title: "Promise Land",
      type: "album",
      url_slug: "promise-land",
      artist: { url_slug: "evadolee" },
      tracks: [
        { title: "First song", url_slug: "first-song", track_number: 1, artist: { url_slug: "evadolee", name: "Evadolee" } },
        { title: "Second song", url_slug: "second-song", song_id: 42, artist: { url_slug: "evadolee" } },
      ],
    } } },
  };
  const html = '<html><head><meta property="og:title" content="Promise Land | Audiomack"></head><body>' +
    '<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify(hydration) + "</script></body></html>";
  const parsed = parseAudiomackAlbumPage(html, albumUrl);
  assert.equal(parsed.title, "Promise Land");
  assert.deepEqual(parsed.entries.map(entry => entry.webpageUrl), [
    "https://audiomack.com/evadolee/song/first-song",
    "https://audiomack.com/evadolee/song/second-song",
  ]);
});

test("does not mistake a bare album record for a downloadable song", () => {
  const html = '<script type="application/ld+json">' + JSON.stringify({
    type: "album", title: "Promise Land", url_slug: "promise-land",
    artist: { url_slug: "evadolee" },
  }) + "</script>";
  assert.equal(parseAudiomackAlbumPage(html, albumUrl).entries.length, 0);
});
