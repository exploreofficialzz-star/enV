import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { detectProvider, createProviderAdapter, createProviderRequestArgs } from "./media/provider-registry.mjs";
import { parseYtDlpJson } from "./media/yt-dlp-output.mjs";
import { parseAudiomackAlbumPage } from "./media/audiomack-page-parser.mjs";
import { urlMediaProcessorPath } from "../processor/url-media-route.mjs";

const source = await readFile(new URL("./url-media-processor.mjs", import.meta.url), "utf8");
const registry = await readFile(new URL("./media/provider-registry.mjs", import.meta.url), "utf8");
const dockerfile = await readFile(new URL("../processor/Dockerfile", import.meta.url), "utf8");
const gateway = await readFile(new URL("../processor/server.mjs", import.meta.url), "utf8");

assert.match(source, /assertPublicHostname/);
assert.match(source, /handleDirectDownload/);
assert.match(source, /fetchPublic/);
assert.match(source, /if \(provider === "generic"\)/);
assert.match(source, /"--js-runtimes", "node"/);
assert.match(source, /parseYtDlpJson\(stdout\)/);
assert.match(source, /MAX_YTDLP_STDOUT_CHARS/);
assert.doesNotMatch(source, /stdout = stdout\.slice\(-12000\)/);
assert.match(source, /--no-playlist/);
assert.match(source, /--max-filesize/);
assert.match(source, /duration <=\?/);
assert.match(source, /verifyDownloadedMedia/);
assert.match(registry, /URL_MEDIA_\$\{provider\.toUpperCase\(\)\}_COOKIES_FILE/);
assert.match(source, /errorPayload/);
assert.match(source, /content-range/);
assert.match(source, /FFPROBE_BIN/);
assert.match(source, /OUTPUT_VERIFICATION_FAILED/);
assert.match(source, /if-range/);
assert.match(source, /from "\.\/media\/provider-registry\.mjs"/);
assert.match(source, /from "\.\/media\/url-security\.mjs"/);
assert.match(source, /parseAudiomackAlbumPage/);
assert.match(source, /classifyProviderFailure\(provider, detail/);
assert.match(source, /runYtdlpWithGenericFallback/);
assert.match(source, /shouldTryGenericExtractor/);
assert.match(dockerfile, /COPY scripts\/media\/extraction-strategy\.mjs/);
assert.match(dockerfile, /node --check scripts\/media\/extraction-strategy\.mjs/);
assert.match(source, /detailCodes/);
assert.match(source, /inspectAudiomackAlbumPage/);
assert.match(source, /audiomackPageFallbackFailure/);
assert.match(source, /legacy album API extractor cannot recover those links/);
assert.match(source, /public collection page did not expose readable song links/);
assert.match(dockerfile, /COPY scripts\/media\/provider-registry\.mjs \.\/scripts\/media\/provider-registry\.mjs/);
assert.match(dockerfile, /COPY scripts\/media\/audiomack-page-parser\.mjs \.\/scripts\/media\/audiomack-page-parser\.mjs/);
assert.match(dockerfile, /node --check scripts\/media\/audiomack-page-parser\.mjs/);
assert.match(dockerfile, /COPY scripts\/media\/provider-errors\.mjs \.\/scripts\/media\/provider-errors\.mjs/);
assert.match(dockerfile, /node --check scripts\/media\/provider-errors\.mjs/);
assert.match(dockerfile, /COPY scripts\/media\/url-security\.mjs \.\/scripts\/media\/url-security\.mjs/);
assert.match(dockerfile, /yt-dlp\[default,curl-cffi\]/);
assert.match(dockerfile, /--pre/);
assert.match(dockerfile, /node --version/);
assert.match(dockerfile, /COPY scripts\/media\/yt-dlp-output\.mjs \.\/scripts\/media\/yt-dlp-output\.mjs/);
assert.match(dockerfile, /COPY processor\/url-media-route\.mjs \.\/processor\/url-media-route\.mjs/);
assert.match(gateway, /urlMediaProcessorPath\(req\.method \|\| "GET", pathname\)/);
assert.ok(gateway.indexOf("urlMediaProcessorPath(req.method || \"GET\", pathname)") < gateway.indexOf('if (pathname.startsWith("/api/"))'));

assert.equal(urlMediaProcessorPath("POST", "/api/backend/url-media/info"), "/info");
assert.equal(urlMediaProcessorPath("POST", "/api/backend/url-media/download"), "/download");
assert.equal(urlMediaProcessorPath("GET", "/api/backend/url-media/download"), null);
assert.equal(urlMediaProcessorPath("POST", "/api/backend/tool"), null);

for (const provider of ["youtube", "tiktok", "facebook", "instagram", "x", "audiomack", "soundcloud", "bandcamp", "mixcloud", "audius", "jamendo", "hearthis", "bandlab", "boomplay", "zingmp3", "netease", "yandex-music", "archive", "audioboom", "reverbnation", "soundclick", "spreaker", "podomatic", "freesound"]) {
  assert.match(registry, new RegExp(provider));
}
assert.match(registry, /export function createProviderAdapter/);
assert.match(registry, /"generic"/);
for (const url of [
  "https://www.youtube.com/watch?v=example",
  "https://youtube.com/watch?v=example",
  "https://m.youtube.com/watch?v=example",
  "https://music.youtube.com/watch?v=example",
  "https://www.youtube-nocookie.com/embed/example",
  "https://youtu.be/example",
]) {
  assert.equal(detectProvider(new URL(url)), "youtube", `${url} should be detected as YouTube`);
}
assert.equal(detectProvider(new URL("https://vt.tiktok.com/ZSydNwHA1/")), "tiktok");
assert.deepEqual(createProviderRequestArgs("generic", {}), []);
assert.deepEqual(createProviderAdapter("audiomack", "mp3", true).post, ["--extract-audio", "--audio-format", "mp3", "--audio-quality", "192K", "--embed-metadata"]);
assert.deepEqual(createProviderRequestArgs("tiktok", {}), ["--impersonate", "chrome"]);
assert.deepEqual(createProviderRequestArgs("youtube", { URL_MEDIA_YOUTUBE_COOKIES_FILE: "/etc/secrets/youtube.txt" }), ["--cookies", "/etc/secrets/youtube.txt"]);
assert.equal(detectProvider(new URL("https://example.com/video.mp4")), "generic");
assert.equal(detectProvider(new URL("https://audiomack.com/artist/song")), "audiomack");
assert.equal(detectProvider(new URL("https://on.soundcloud.com/example")), "soundcloud");
assert.equal(detectProvider(new URL("https://artist.bandcamp.com/album/record")), "bandcamp");
assert.equal(detectProvider(new URL("https://zingmp3.vn/album/example")), "zingmp3");
assert.equal(detectProvider(new URL("https://music.163.com/#/album?id=123")), "netease");
assert.equal(detectProvider(new URL("https://music.yandex.com/album/123")), "yandex-music");
assert.match(source, /includePlaylist = false/);
assert.match(source, /--yes-playlist/);
assert.match(source, /--flat-playlist/);
assert.match(source, /"--playlist-end", "50"/);
assert.deepEqual(parseYtDlpJson('{"title":"clean"}'), { title: "clean" });
assert.deepEqual(parseYtDlpJson('WARNING: extractor note\n{"title":"after warning"}\nfinished'), { title: "after warning" });
assert.deepEqual(parseYtDlpJson('preamble\n{\n  "title": "pretty",\n  "description": "brace } in string"\n}\ntrailer'), {
  title: "pretty", description: "brace } in string",
});
assert.equal(parseYtDlpJson(JSON.stringify({ title: "large", description: "x".repeat(20000) })).description.length, 20000);
assert.throws(() => parseYtDlpJson("not metadata"), /invalid metadata/);

console.log("URL media shared-engine regressions passed");


assert.match(source, /const PUBLIC_ERROR_MESSAGES =/);
assert.match(source, /We couldn’t reach this source\. Check the URL and try again later\./);
assert.match(source, /PUBLIC_ERROR_MESSAGES\[code\]/);
assert.doesNotMatch(source, /const clean = message\.startsWith/);
assert.doesNotMatch(source, /catch \(error\) \{ console\.error\(error\)/);
assert.match(source, /route=\/info causeType=/);
assert.match(source, /route=\/download causeType=/);
assert.match(source, /REQUEST_TOO_LARGE/);


const audiomackAlbumFixture = `<!doctype html>
<html><head>
<meta property="og:title" content="Evado Promise land" />
<meta name="music:musician" content="Evado" />
</head><body>
<h1>Evado Promise land</h1>
<a href="/evadolee/song/promise-land/">Promise land</a>
<a href="https://audiomack.com/evadolee/song/dna">DNA</a>
<script type="application/ld+json">
{"@type":"MusicAlbum","track":{"itemListElement":[{"item":{"@type":"MusicRecording","name":"By Now","url":"https://audiomack.com/evadolee/song/by-now"}}]}}
</script>
</body></html>`;

const audiomackAlbumPage = parseAudiomackAlbumPage(
  audiomackAlbumFixture,
  "https://audiomack.com/evadolee/album/promise-land?share-user-id=118614535",
);
assert.equal(audiomackAlbumPage.title, "Promise Land");
assert.equal(audiomackAlbumPage.entries.length, 3);
assert.deepEqual(
  audiomackAlbumPage.entries.map((entry) => entry.title),
  ["Promise land", "DNA", "By Now"],
);
assert.ok(audiomackAlbumPage.entries.every((entry) => entry.webpageUrl.startsWith("https://audiomack.com/evadolee/song/")));
assert.equal(audiomackAlbumPage.uploader, "Evado");
assert.throws(() => parseAudiomackAlbumPage("<a href='https://example.com/other/song'>wrong</a>", "https://example.com/album"));

