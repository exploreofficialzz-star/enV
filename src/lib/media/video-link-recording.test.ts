import { parseScreenRecordingPostLink } from "./video-link-recording.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  autoStopReason,
  buildRecordingFileName,
  containerMimeType,
  describeCaptureError,
  detectCaptureSupport,
  estimateRecordingBytes,
  fileExtensionForMime,
  formatBytes,
  formatDuration,
  MAX_RECORDING_BYTES,
  MAX_RECORDING_SECONDS,
  parseTimeOffset,
  parseVideoLink,
  pickRecorderMimeType,
  popupWindowFeatures,
  protectedVideoPlatform,
  QUALITY_PRESETS,
} from "./video-link-recording.ts";

function ok(raw: string, parentHost?: string) {
  const result = parseVideoLink(raw, { parentHost });
  assert.equal(result.ok, true, `${raw} should be accepted`);
  if (!result.ok) throw new Error("unreachable");
  return result;
}

test("accepts public HTTPS platform pages and normalises the host", () => {
  const result = ok("https://www.YouTube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(result.platform, "youtube");
  assert.equal(result.platformLabel, "YouTube");
  assert.equal(result.host, "youtube.com");
  assert.equal(result.kind, "platform-page");
});

test("adds https:// when the scheme is missing", () => {
  assert.equal(ok("youtu.be/dQw4w9WgXcQ").url, "https://youtu.be/dQw4w9WgXcQ");
});

test("rejects empty input, HTTP, app schemes, credentials, local hosts and IP literals", () => {
  for (const raw of [
    "",
    "   ",
    "http://youtube.com/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "intent://example.com#Intent;end",
    "https://user:pass@example.com/video",
    "https://localhost/video.mp4",
    "https://printer.local/video.mp4",
    "https://intranet/video.mp4",
    "https://127.0.0.1/video.mp4",
    "https://8.8.8.8/video.mp4",
    "https://[::1]/video.mp4",
  ]) {
    assert.equal(parseVideoLink(raw).ok, false, `${raw} should be rejected`);
  }
});

test("blocks DRM-protected subscription catalogues with a clear reason", () => {
  assert.equal(protectedVideoPlatform("https://www.netflix.com/watch/80100172")?.label, "Netflix");
  assert.equal(protectedVideoPlatform("https://www.disneyplus.com/video/abc")?.label, "Disney+");
  assert.equal(protectedVideoPlatform("https://tv.apple.com/us/show/x")?.label, "Apple TV");
  assert.equal(protectedVideoPlatform("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), null);
  const blocked = parseVideoLink("https://www.hulu.com/watch/123");
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.platform, "Hulu");
    assert.match(blocked.reason, /DRM/);
  }
});

test("builds YouTube nocookie embeds for watch, short, shorts and embed links", () => {
  assert.equal(
    ok("https://www.youtube.com/watch?v=dQw4w9WgXcQ").embedUrl,
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1",
  );
  assert.match(ok("https://youtu.be/dQw4w9WgXcQ?t=1m30s").embedUrl ?? "", /start=90/);
  assert.match(ok("https://youtube.com/shorts/dQw4w9WgXcQ").embedUrl ?? "", /embed\/dQw4w9WgXcQ/);
  assert.match(ok("https://m.youtube.com/live/dQw4w9WgXcQ").embedUrl ?? "", /embed\/dQw4w9WgXcQ/);
  // Playlist-only and malformed identifiers have no single video to embed.
  assert.equal(ok("https://www.youtube.com/playlist?list=PL123").embedUrl, null);
  assert.equal(ok("https://www.youtube.com/watch?v=short").embedUrl, null);
});

test("builds Vimeo, Dailymotion, TikTok and Instagram embeds only for single videos", () => {
  assert.equal(ok("https://vimeo.com/76979871").embedUrl, "https://player.vimeo.com/video/76979871");
  assert.equal(ok("https://vimeo.com/76979871/abcdef1234").embedUrl, "https://player.vimeo.com/video/76979871?h=abcdef1234");
  assert.equal(ok("https://vimeo.com/channels/staffpicks").embedUrl, null);
  assert.equal(ok("https://www.dailymotion.com/video/x8abcd1").embedUrl, "https://www.dailymotion.com/embed/video/x8abcd1");
  assert.equal(ok("https://dai.ly/x8abcd1").embedUrl, "https://www.dailymotion.com/embed/video/x8abcd1");
  assert.equal(ok("https://www.tiktok.com/@someone/video/7234567890123456789").embedUrl, "https://www.tiktok.com/embed/v2/7234567890123456789");
  assert.equal(ok("https://vm.tiktok.com/ZMabc123/").embedUrl, null);
  assert.equal(ok("https://www.instagram.com/reel/Cxyz12345/").embedUrl, "https://www.instagram.com/reel/Cxyz12345/embed/");
  assert.equal(ok("https://www.instagram.com/someone/p/Cxyz12345/").embedUrl, "https://www.instagram.com/p/Cxyz12345/embed/");
  assert.equal(ok("https://www.instagram.com/someone/").embedUrl, null);
});

test("builds Facebook plugin embeds only for video-looking links and keeps the original URL encoded", () => {
  const video = ok("https://www.facebook.com/watch/?v=123456789");
  assert.ok(video.embedUrl?.startsWith("https://www.facebook.com/plugins/video.php?"));
  assert.ok(video.embedUrl?.includes(encodeURIComponent("https://www.facebook.com/watch/?v=123456789")));
  assert.equal(ok("https://www.facebook.com/someone").embedUrl, null);
  assert.ok(ok("https://fb.watch/abc123/").embedUrl);
});

test("Twitch embeds require the embedding page's host", () => {
  assert.equal(ok("https://www.twitch.tv/videos/123456789").embedUrl, null);
  assert.equal(
    ok("https://www.twitch.tv/videos/123456789", "envtools.store").embedUrl,
    "https://player.twitch.tv/?video=v123456789&parent=envtools.store&autoplay=false",
  );
  assert.equal(
    ok("https://clips.twitch.tv/FunnySlug-abc", "envtools.store").embedUrl,
    "https://clips.twitch.tv/embed?clip=FunnySlug-abc&parent=envtools.store&autoplay=false",
  );
});

test("X, Reddit, LinkedIn and unknown sites open on the original page without an embed", () => {
  for (const [raw, platform] of [
    ["https://x.com/someone/status/1234567890", "x"],
    ["https://twitter.com/someone/status/1234567890", "x"],
    ["https://www.reddit.com/r/videos/comments/abc/title/", "reddit"],
    ["https://www.linkedin.com/posts/someone_activity-123", "linkedin"],
    ["https://news.example.org/story/clip", "other"],
  ] as const) {
    const result = ok(raw);
    assert.equal(result.platform, platform);
    assert.equal(result.embedUrl, null);
    assert.equal(result.kind, "platform-page");
  }
  assert.equal(ok("https://news.example.org/story/clip").platformLabel, "news.example.org");
});

test("direct HTTPS video files play in the page and keep their query string", () => {
  const result = ok("https://cdn.example.org/clips/demo.MP4?token=abc");
  assert.equal(result.kind, "direct-video");
  assert.equal(result.platform, "direct");
  assert.equal(result.embedUrl, "https://cdn.example.org/clips/demo.MP4?token=abc");
  assert.equal(parseVideoLink("https://cdn.example.org/clips/demo.mp4").ok, true);
  assert.equal(ok("https://cdn.example.org/clips/demo.html").kind, "platform-page");
});

test("parses time offsets", () => {
  assert.equal(parseTimeOffset("90"), 90);
  assert.equal(parseTimeOffset("1m30s"), 90);
  assert.equal(parseTimeOffset("1h2m3s"), 3723);
  assert.equal(parseTimeOffset("abc"), 0);
  assert.equal(parseTimeOffset(""), 0);
  assert.equal(parseTimeOffset(null), 0);
});

test("prefers MP4 and falls back to WebM, or null when nothing is supported", () => {
  assert.equal(pickRecorderMimeType((mime) => mime.startsWith("video/mp4")), "video/mp4;codecs=avc1.640028,mp4a.40.2");
  assert.equal(pickRecorderMimeType((mime) => mime === "video/webm;codecs=vp9,opus"), "video/webm;codecs=vp9,opus");
  assert.equal(pickRecorderMimeType((mime) => mime === "video/webm"), "video/webm");
  assert.equal(pickRecorderMimeType(() => false), null);
  assert.equal(pickRecorderMimeType(() => { throw new Error("no"); }), null);
});

test("derives file extensions, container types and safe file names", () => {
  assert.equal(fileExtensionForMime("video/mp4;codecs=avc1"), "mp4");
  assert.equal(fileExtensionForMime("video/webm;codecs=vp9,opus"), "webm");
  assert.equal(containerMimeType("video/webm;codecs=vp9,opus"), "video/webm");
  assert.equal(
    buildRecordingFileName("www.example.com", "video/webm", new Date(2026, 10, 16, 9, 5, 7)),
    "enV-recording-www.example.com-20261116-090507.webm",
  );
  assert.equal(
    buildRecordingFileName("../../evil host", "video/mp4", new Date(2026, 0, 2, 3, 4, 5)),
    "enV-recording-evil-host-20260102-030405.mp4",
  );
  assert.equal(buildRecordingFileName("", "video/mp4", new Date(2026, 0, 2, 3, 4, 5)), "enV-recording-video-20260102-030405.mp4");
});

test("formats durations and sizes", () => {
  assert.equal(formatDuration(0), "00:00");
  assert.equal(formatDuration(65.9), "01:05");
  assert.equal(formatDuration(3725), "1:02:05");
  assert.equal(formatDuration(Number.NaN), "00:00");
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
});

test("estimates size and applies the duration and size limits", () => {
  assert.equal(estimateRecordingBytes(QUALITY_PRESETS.standard, 10, false), 3_125_000);
  assert.ok(estimateRecordingBytes(QUALITY_PRESETS.standard, 10, true) > 3_125_000);
  assert.equal(autoStopReason(10, 1000), null);
  assert.equal(autoStopReason(MAX_RECORDING_SECONDS, 0), "duration");
  assert.equal(autoStopReason(10, MAX_RECORDING_BYTES), "size");
  assert.ok(QUALITY_PRESETS.smooth.frameRate === 60 && QUALITY_PRESETS.standard.frameRate === 30);
});

test("detects capture support without touching browser globals", () => {
  assert.deepEqual(detectCaptureSupport({}), { screenCapture: false, mediaRecorder: false });
  assert.deepEqual(
    detectCaptureSupport({ mediaDevices: { getDisplayMedia: () => undefined }, MediaRecorder: class {} }),
    { screenCapture: true, mediaRecorder: true },
  );
  assert.deepEqual(detectCaptureSupport({ mediaDevices: null }), { screenCapture: false, mediaRecorder: false });
});

test("explains capture failures in plain language", () => {
  assert.match(describeCaptureError({ name: "NotAllowedError" }), /not allowed/i);
  assert.match(describeCaptureError({ name: "NotFoundError" }), /No screen/);
  assert.match(describeCaptureError(new Error("custom failure")), /custom failure/);
  assert.match(describeCaptureError(undefined), /could not be started/);
});

test("popup features open a phone-sized window without an opener", () => {
  const features = popupWindowFeatures();
  assert.match(features, /noopener/);
  assert.match(features, /noreferrer/);
  assert.match(features, /width=430/);
});


test("screen-recording policy accepts the supported original platform pages", () => {
  const cases = [
    ["https://www.tiktok.com/@creator/video/1234567890", "TikTok"],
    ["https://www.instagram.com/reel/ABCdef12345/", "Instagram"],
    ["https://www.facebook.com/reel/1234567890", "Facebook"],
    ["https://www.youtube.com/shorts/abcdefghijk", "YouTube"],
    ["https://x.com/creator/status/123456789", "X"],
    ["https://www.snapchat.com/spotlight/example", "Snapchat"],
    ["https://www.threads.net/@creator/post/example", "Threads"],
    ["https://www.linkedin.com/posts/example", "LinkedIn"],
    ["https://www.reddit.com/r/videos/comments/example", "Reddit"],
    ["https://www.twitch.tv/videos/12345", "Twitch"],
    ["https://vimeo.com/123456", "Vimeo"],
    ["https://www.dailymotion.com/video/abcdef", "Dailymotion"],
  ] as const;
  for (const [url, label] of cases) {
    const result = parseScreenRecordingPostLink(url);
    assert.equal(result.ok, true, url);
    if (result.ok) assert.equal(result.platformLabel, label);
  }
});

test("screen-recording policy rejects direct media URLs, protected streaming services and unsafe hosts", () => {
  for (const url of [
    "https://cdn.example.com/video.mp4",
    "https://evil-tiktok.com/@creator/video/1",
    "https://tiktok.com.attacker.example/@creator/video/1",
    "http://instagram.com/reel/ABCdef12345/",
    "https://user:pass@x.com/creator/status/1",
    "https://netflix.com/watch/123",
  ]) {
    assert.equal(parseScreenRecordingPostLink(url).ok, false, url);
  }
});
