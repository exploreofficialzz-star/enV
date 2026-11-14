import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCelebration,
  celebrationCountdown,
  getCelebrationEventInstant,
  parseCelebrationToolId,
} from "./celebration-engine-utils.ts";

const occasions = [
  "birthday", "anniversary", "graduation", "valentine", "christmas", "new-year",
  "congratulations", "thank-you", "appreciation", "farewell", "achievement", "party",
] as const;
const experiences = [
  "page-generator", "interactive-card", "invitation-generator", "countdown",
  "memory-page", "reveal-page", "quiz-generator", "surprise-page",
] as const;

test("all 93 existing Celebration catalog IDs resolve to a real experience", () => {
  const notCatalogued = new Set(["birthday-countdown", "valentine-reveal-page", "appreciation-reveal-page"]);
  let count = 0;
  for (const occasion of occasions) for (const experience of experiences) {
    const id = occasion + "-" + experience;
    if (notCatalogued.has(id)) continue;
    const parsed = parseCelebrationToolId(id);
    assert.deepEqual(parsed, { occasion, experience });
    const result = buildCelebration({ ...parsed, title: "Test occasion", honoree: "Alex", message: "A real message." });
    assert.match(result.text, /Test occasion/);
    assert.match(result.html, /<!doctype html>/i);
    count += 1;
  }
  assert.equal(count, 93);
});

test("local event times are converted using the requested IANA time zone", () => {
  assert.equal(getCelebrationEventInstant("2026-11-05T10:00", "Africa/Lagos").toISOString(), "2026-11-05T09:00:00.000Z");
  assert.throws(() => getCelebrationEventInstant("2026-03-08T02:30", "America/New_York"), /does not exist/);
  assert.throws(() => getCelebrationEventInstant("2026-11-01T01:30", "America/New_York"), /occurs twice/);
  assert.throws(() => getCelebrationEventInstant("2026-11-05T10:00", "Not/A_Zone"), /valid IANA time zone/);
});

test("HTML export escapes user content and rejects active RSVP URL schemes", () => {
  const result = buildCelebration({
    occasion: "birthday", experience: "invitation-generator",
    title: "<img src=x onerror=alert(1)>", honoree: "A & B",
    message: "<script>alert(1)</script>", rsvpUrl: "javascript:alert(1)",
  });
  assert.doesNotMatch(result.html, /<img src=x onerror/);
  assert.doesNotMatch(result.html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(result.html, /href="javascript:/);
  assert.match(result.checks.join(" "), /http or https/);
  const credentialUrl = buildCelebration({
    occasion: "party", experience: "invitation-generator", title: "Party",
    rsvpUrl: "https://guest@trusted.example/rsvp",
  });
  assert.doesNotMatch(credentialUrl.html, /href="https:\/\/guest@trusted\.example/);
  assert.match(credentialUrl.checks.join(" "), /http or https/);
});

test("the quiz export has bounded answer choices and reports the selected answer", () => {
  const result = buildCelebration({
    occasion: "anniversary", experience: "quiz-generator", title: "Our story",
    quizQuestion: "Which month did we meet?", quizOptions: "April\nJune\nOctober", quizAnswer: "June",
  });
  assert.match(result.html, /data-correct="true"/);
  assert.match(result.html, /data-feedback/);
  assert.doesNotMatch(result.html, /<script>alert/);
});

test("memory page embeds only complete safe image data and caps the gallery", () => {
  const result = buildCelebration({
    occasion: "graduation", experience: "memory-page", title: "The good days",
    photos: [
      "data:image/png;base64,AAAA",
      "data:image/svg+xml;base64,PHN2ZyBvbmVycm9yPSJ4Ii8+",
      'data:image/png;base64,AAAA"><svg onload=alert(1)>',
      ...Array.from({ length: 9 }, () => "data:image/jpeg;base64,BBBB"),
    ],
  });
  assert.equal((result.html.match(/<figure>/g) ?? []).length, 8);
  assert.doesNotMatch(result.html, /data:image\/svg\+xml/);
  assert.doesNotMatch(result.html, /<svg onload=/i);
});
test("countdown uses the event's time zone and handles past dates", () => {
  const input = { occasion: "party", experience: "countdown", date: "2026-11-05T10:00", timezone: "Africa/Lagos" } as const;
  const target = getCelebrationEventInstant(input.date, input.timezone).getTime();
  assert.deepEqual(celebrationCountdown(input, target - 1000), { complete: false, days: 0, hours: 0, minutes: 0, seconds: 1 });
  assert.deepEqual(celebrationCountdown(input, target + 1000), { complete: true, days: 0, hours: 0, minutes: 0, seconds: 0 });
});

test("uncatalogued combinations and unrelated tool IDs fail closed", () => {
  for (const id of ["birthday-countdown", "valentine-reveal-page", "appreciation-reveal-page"]) {
    assert.throws(() => parseCelebrationToolId(id), /not supported/);
  }
  assert.throws(() => parseCelebrationToolId("wedding-invitation-generator"));
  assert.throws(() => parseCelebrationToolId("birthday-rsvp-page"));
});
