import test from "node:test";
import assert from "node:assert/strict";
import {
  audiomackApiConfigured,
  audiomackPathParts,
  audiomackOAuthHeader,
  inspectAudiomackOfficial,
  resolveAudiomackOfficialAudio,
} from "./audiomack-api.mjs";

const env = {
  URL_MEDIA_AUDIOMACK_CONSUMER_KEY: "server-test-key",
  URL_MEDIA_AUDIOMACK_CONSUMER_SECRET: "server-test-secret",
};
const song = "https://audiomack.com/evadolee/song/example-song";
const album = "https://audiomack.com/evadolee/album/promise-land?share-user-id=118614535";

test("Audiomack app credentials are opt-in and never exposed to frontend", () => {
  assert.equal(audiomackApiConfigured({}), false);
  assert.equal(audiomackApiConfigured(env), true);
  const header = audiomackOAuthHeader("GET", "https://api.audiomack.com/v1/music/song/evadolee/example-song",
    env.URL_MEDIA_AUDIOMACK_CONSUMER_KEY, env.URL_MEDIA_AUDIOMACK_CONSUMER_SECRET, "nonce123", 12345678);
  assert.match(header, /^OAuth /);
  assert.match(header, /oauth_signature=/);
  assert.doesNotMatch(header, /server-test-secret/);
  assert.throws(() => audiomackOAuthHeader("GET", "https://evil.example/v1/music", "key", "secret"));
});

test("public song and album URL patterns support canonical links and share queries", () => {
  assert.deepEqual(audiomackPathParts(song), { kind: "song", artist: "evadolee", slug: "example-song" });
  assert.deepEqual(audiomackPathParts(album), { kind: "album", artist: "evadolee", slug: "promise-land" });
  assert.equal(audiomackPathParts("https://evil.example/evadolee/album/promise-land"), null);
});

test("official public album metadata returns a track collection without a listener account", async () => {
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url, init });
    return { ok: true, json: async () => ({
      id: 7, title: "Promise Land", uploader: { name: "Evadolee" }, tracks: [
        { id: 8, title: "Example Song", url_slug: "example-song", uploader: { url_slug: "evadolee" } },
      ],
    }) };
  };
  const info = await inspectAudiomackOfficial(album, undefined, env, fetcher);
  assert.equal(info.title, "Promise Land");
  assert.equal(info.isPlaylist, true);
  assert.equal(info.entries[0].webpageUrl, song);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.method, "GET");
  assert.equal(requests[0].init.headers.authorization.startsWith("OAuth "), true);
});

test("official API refuses to download a stream-only track", async () => {
  const fetcher = async () => ({ ok: true, json: async () => ({
    id: 8, title: "Example Song", stream_only: "yes",
  }) });
  await assert.rejects(resolveAudiomackOfficialAudio(song, undefined, env, fetcher), /DOWNLOAD_NOT_PERMITTED/);
});

test("official API requires an explicit non-stream-only flag before downloading", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, method: init.method });
    return {
      ok: true,
      json: async () => init.method === "GET"
        ? { id: 8, stream_only: "no" }
        : "https://audio.example/public-track.mp3?Expires=9999999999",
    };
  };
  const source = await resolveAudiomackOfficialAudio(song, undefined, env, fetcher);
  assert.equal(source.hostname, "audio.example");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[1].url, "https://api.audiomack.com/v1/music/8/play");
});

test("official API rejects credential failures without requiring a listener login", async () => {
  await assert.rejects(
    inspectAudiomackOfficial(song, undefined, env, async () => ({ ok: false, status: 401 })),
    /server's Audiomack API credentials were refused/,
  );
});
