import test from "node:test";
import assert from "node:assert/strict";
import { creatorFieldsFor, runCreatorTool } from "./creator.ts";
import { runGenerator } from "./generators.ts";

test("Spotify royalty scenario is based on the user's statement, not a fixed platform rate", () => {
  const out = runCreatorTool("spotify-revenue-calculator", {
    historyStreams: "2000", historyPayout: "4", forecastStreams: "10000",
    rightsShare: "80", distributionFee: "10", currency: "USD",
  });
  assert.match(out, /Historical payout per stream \(your statement\): USD 0\.002000/);
  assert.match(out, /Illustrative amount after entered shares\/fee: USD 14\.40/);
  assert.match(out, /not an official platform rate or payout promise/i);
});

test("Apple Music revenue tool asks for observed statements", () => {
  const fields = creatorFieldsFor("apple-music-revenue-calculator");
  assert.ok(fields.some((x) => x.name === "historyPayout"));
  assert.ok(fields.some((x) => x.name === "historyStreams"));
  assert.ok(!fields.some((x) => x.name === "perStream"));
  const musicFields = creatorFieldsFor("apple-music-revenue-calculator");
  assert.match(musicFields.find((x) => x.name === "historyStreams")!.label, /Plays \/ royalty units/);
  const out = runCreatorTool("apple-music-revenue-calculator", {
    historyStreams: "5000", historyPayout: "7.5", forecastStreams: "10000", rightsShare: "100", distributionFee: "0", currency: "USD",
  });
  assert.match(out, /Historical payout per play \/ royalty unit/);
});

test("Apple Music engagement uses Apple-specific artist signals, not Spotify fields", () => {
  const fields = creatorFieldsFor("apple-music-engagement-calculator");
  const names = fields.map((x) => x.name);
  assert.ok(names.includes("plays"));
  assert.ok(names.includes("shazams"));
  assert.ok(names.includes("radioSpins"));
  assert.ok(names.includes("purchases"));
  assert.ok(!names.includes("saves"));
  assert.ok(!names.includes("playlistAdds"));
  const out = runCreatorTool("apple-music-engagement-calculator", {
    listeners: "1000", plays: "2500", shazams: "50", radioSpins: "12", purchases: "8",
  });
  assert.match(out, /Plays per listener: 2\.50/);
  assert.match(out, /Shazam events per listener: 0\.050/);
  assert.match(out, /Radio spins: 12/);
});

test("Spotify engagement uses listener, stream, save and playlist metrics", () => {
  const out = runCreatorTool("spotify-engagement-calculator", {
    listeners: "1000", streams: "2500", saves: "150", playlistAdds: "40",
  });
  assert.match(out, /Streams per listener: 2\.50/);
  assert.match(out, /Save rate: 15\.00%/);
  assert.match(out, /Playlist-add rate: 4\.00%/);
});

test("YouTube engagement keeps CTR and average percentage viewed separate", () => {
  const out = runCreatorTool("youtube-engagement-calculator", {
    views: "10000", likes: "800", comments: "80", shares: "20",
    impressions: "20000", clicks: "1000", avgViewPct: "42",
  });
  assert.match(out, /Interaction rate by views: 9\.00%/);
  assert.match(out, /Thumbnail impressions click-through rate: 5\.00%/);
  assert.match(out, /Average percentage viewed: 42\.00%/);
  const replayed = runCreatorTool("youtube-engagement-calculator", {
    views: "10000", likes: "800", comments: "80", shares: "20", impressions: "0", clicks: "0", avgViewPct: "112",
  });
  assert.match(replayed, /Average percentage viewed: 112\.00%/);
});

test("posting-time helper ranks only activity windows supplied by the creator", () => {
  const out = runCreatorTool("instagram-posting-time-helper", {
    timezone: "Africa/Lagos", audienceWindows: "Mon 18:00 = 42\nWed 20:00 = 37\nSat 11:00 = 29", goal: "engage",
  });
  assert.match(out, /Mon 18:00 — activity score 42/);
  assert.match(out, /Wed 20:00 — activity score 37/);
  assert.match(out, /not an enV prediction/i);
});

test("posting-time helper refuses to invent a best time without data", () => {
  const out = runCreatorTool("youtube-posting-time-helper", { timezone: "Africa/Lagos", audienceWindows: "" });
  assert.match(out, /will not invent a universal best time/i);
});

test("content calendar schedules real dates on selected weekdays", () => {
  const out = runCreatorTool("youtube-content-calendar", {
    brand: "enV", topic: "Creator systems", goal: "grow", startDate: "2026-11-04",
    count: "3", days: "Mon, Wed, Fri", formatMix: "Tutorial, Case study",
  }, new Date("2026-11-04T12:00:00"));
  assert.match(out, /Wed, Nov 4, 2026/);
  assert.match(out, /Fri, Nov 6, 2026/);
  assert.match(out, /Mon, Nov 9, 2026/);
});

test("calendar rejects invalid posting days instead of silently guessing", () => {
  assert.throws(() => runCreatorTool("tiktok-content-calendar", {
    startDate: "2026-11-04", count: "2", days: "Not a day", formatMix: "Reel",
  }), /valid posting day/i);
  assert.throws(() => runCreatorTool("tiktok-content-calendar", {
    startDate: "2026-11-04", count: "2", days: "Mon, Someday", formatMix: "Reel",
  }), /valid posting day/i);
  assert.throws(() => runCreatorTool("tiktok-content-calendar", {
    startDate: "2026-02-31", count: "2", days: "Mon", formatMix: "Reel",
  }), /valid calendar start date/i);
});

test("creator copy variants use the user's brief and distinct creative angles", () => {
  const out = runCreatorTool("linkedin-caption-generator", {
    brand: "Studio North", topic: "Audience research", audience: "independent founders",
    goal: "educate", tone: "professional", proof: "interview customers before building", cta: "Share your process",
    keywords: "research, product", count: "4",
  });
  assert.match(out, /Studio North|Audience research/);
  assert.match(out, /interview customers before building/);
  assert.equal((out.match(/\n\n---\n\n/g) ?? []).length, 3);
});

test("podcast engagement reports host-specific engaged listeners and replay-aware consumption", () => {
  const fields = creatorFieldsFor("podcast-engagement-calculator");
  assert.ok(fields.some((x) => x.name === "engagedListeners"));
  const out = runCreatorTool("podcast-engagement-calculator", {
    listeners: "500", downloads: "700", engagedListeners: "350", followers: "250", completion: "108",
  });
  assert.match(out, /Downloads per unique listener: 1\.40/);
  assert.match(out, /Engaged-listener rate: 70\.00%/);
  assert.match(out, /Follower-to-listener ratio: 50\.00%/);
  assert.match(out, /Average episode consumption \/ completion: 108\.00%/);
  assert.match(out, /20 minutes or 40%/);
});

test("invalid numeric input produces a clear validation error", () => {
  assert.throws(() => runCreatorTool("x-engagement-calculator", {
    likes: "many", comments: "3", shares: "2", saves: "1", reach: "1000", followers: "300",
  }), /Likes must be a valid number/);
});


test("general hashtag generator creates a platform-aware draft from relevant keywords", () => {
  const out = runGenerator("hashtags", { seed: "Afro fusion music", niche: "independent artists", platform: "spotify", count: "12" });
  assert.match(out, /#afrofusionmusic/);
  assert.match(out, /#independentartists/);
  assert.match(out, /#IndependentArtist/);
  assert.match(out, /does not use live trend data/i);
});


test("content planners use platform-specific campaign mechanics and selected pillars", () => {
  const youtube = runCreatorTool("youtube-content-planner", { brand: "Studio", topic: "music production", count: "3", pillar: "teach" });
  const spotify = runCreatorTool("spotify-content-planner", { brand: "Artist", topic: "new single", count: "3" });
  assert.match(youtube, /Search-led tutorial|Retention reset|Thumbnail promise test/);
  assert.match(youtube, /Format: tutorial/);
  assert.match(youtube, /\/ teach/);
  assert.match(spotify, /Track story|Release runway|Fan conversion/);
  assert.doesNotMatch(spotify, /Search-led tutorial/);
});

test("posting time helper rejects malformed or duplicate analytics rows", () => {
  assert.throws(() => runCreatorTool("instagram-posting-time-helper", { audienceWindows: "Mon evening = 12" }), /Invalid activity window/);
  assert.throws(() => runCreatorTool("instagram-posting-time-helper", { audienceWindows: "Mon 18:00 = 12\nMonday 18:00 = 14" }), /duplicate/i);
});

test("creator engagement tools reject impossible negative or out-of-range data", () => {
  assert.throws(() => runCreatorTool("youtube-engagement-calculator", { views: "200", likes: "-1", comments: "2", shares: "3", impressions: "0", clicks: "0", avgViewPct: "45" }), /cannot be negative/i);
  assert.throws(() => runCreatorTool("podcast-engagement-calculator", { listeners: "10", downloads: "12", engagedListeners: "11", followers: "4", completion: "140" }), /Engaged listeners cannot exceed unique listeners/i);
});