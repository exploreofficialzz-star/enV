import test from "node:test";
import assert from "node:assert/strict";
import {
  PLATFORMS,
  PLATFORM_PRESETS,
  getPlacement,
  parsePlatformOp,
} from "./platform-presets.ts";

test("music release and podcast artwork presets use official square formats", () => {
  const spotify = getPlacement("spotify", "image");
  const apple = getPlacement("apple-music", "image");
  const appleDirect = getPlacement("apple-music", "cover");
  const podcast = getPlacement("podcast", "image");
  assert.deepEqual([spotify?.variants[0]?.width, spotify?.variants[0]?.height], [3000, 3000]);
  assert.deepEqual([spotify?.minWidth, spotify?.minHeight], [640, 640]);
  assert.deepEqual([apple?.variants[0]?.width, apple?.variants[0]?.height], [3000, 3000]);
  assert.deepEqual([apple?.minWidth, apple?.minHeight], [1400, 1400]);
  assert.deepEqual([appleDirect?.minWidth, appleDirect?.minHeight], [4000, 4000]);
  assert.deepEqual([podcast?.variants[0]?.width, podcast?.variants[0]?.height], [3000, 3000]);
  assert.deepEqual([podcast?.minWidth, podcast?.minHeight], [1400, 1400]);
  assert.equal(podcast?.alphaAllowed, false);
  for (const preset of [spotify, apple, appleDirect, podcast]) {
    assert.equal(preset?.confidence, "official");
    assert.deepEqual(preset?.formats, ["jpeg", "png"]);
  }
});

test("music artwork presets retain official source records and appear in the shared picker", () => {
  assert.equal(PLATFORMS.spotify.verified, "2026-11-04");
  assert.equal(PLATFORMS["apple-music"].verified, "2026-11-04");
  assert.equal(PLATFORMS.podcast.verified, "2026-11-04");
  assert.match(PLATFORMS.spotify.sourceUrl, /support\.spotify\.com/);
  assert.match(PLATFORMS["apple-music"].sourceUrl, /artists\.apple\.com/);
  assert.match(PLATFORMS.podcast.sourceUrl, /podcasters\.apple\.com/);
  for (const platform of ["spotify", "apple-music", "podcast"]) {
    assert.ok(PLATFORM_PRESETS.some((item) => item.platform === platform && item.contentType === "image"));
  }
});

test("cover-art operations can resolve the platform-specific square presets", () => {
  assert.deepEqual(parsePlatformOp("spotify-cover-resizer"), {
    platform: "spotify", placement: "cover", kind: "resizer",
  });
  assert.deepEqual(parsePlatformOp("apple-music-cover-resizer"), {
    platform: "apple-music", placement: "cover", kind: "resizer",
  });
  assert.deepEqual(parsePlatformOp("podcast-cover-resizer"), {
    platform: "podcast", placement: "cover", kind: "resizer",
  });
});
