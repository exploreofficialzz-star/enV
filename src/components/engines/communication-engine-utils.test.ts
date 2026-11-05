import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCommunication,
  buildCommunicationCalendarIcs,
  buildSignatureHtml,
  communicationQualityChecks,
  getCommunicationEventInstant,
  getSmsMetrics,
  parseToolId,
  suggestGsm7Text,
} from "./communication-engine-utils.ts";

test("the catalog's 55 Communication tools all resolve to supported workflows", () => {
  const kinds = ["agenda", "announcement", "email", "follow-up", "invitation", "meeting", "message", "minutes", "reminder", "signature", "sms", "thank-you"];
  const actions = ["builder", "formatter", "generator", "planner", "template"];
  const missing = new Set(["email-generator", "email-planner", "email-template", "reminder-generator", "reminder-planner"]);
  let count = 0;
  for (const kind of kinds) for (const action of actions) {
    if (missing.has(kind + "-" + action)) continue;
    const parsed = parseToolId(kind + "-" + action);
    assert.equal(parsed.kind, kind);
    assert.equal(parsed.action, action);
    const output = buildCommunication({
      ...parsed, name: "Alex", subject: "Project update", purpose: "Confirm next steps",
      details: "The revised plan is ready.", date: "2026-11-05 10:00",
      duration: "30", items: "Welcome\nReview\nNext steps",
      actionItems: "Alex | Share notes | 2026-11-06",
      decisions: "Proceed with the revised plan",
      email: "alex@example.com", role: "Project lead", company: "Example",
    });
    assert.ok(output.length > 20, kind + "-" + action + " should produce useful content");
    count++;
  }
  assert.equal(count, 55);
});

test("SMS metrics account for GSM-7 extension characters and UCS-2", () => {
  assert.deepEqual(getSmsMetrics("Hello!"), {
    encoding: "GSM-7", characters: 6, units: 6, segments: 1,
    singleMessageLimit: 160, concatenatedLimit: 153,
  });
  const extension = getSmsMetrics("Price £10 ^");
  assert.equal(extension.encoding, "GSM-7");
  assert.equal(extension.units, 12);
  const longGsm = getSmsMetrics("a".repeat(161));
  assert.equal(longGsm.segments, 2);
  assert.equal(longGsm.concatenatedLimit, 153);
  const unicode = getSmsMetrics("Hello 😀");
  assert.equal(unicode.encoding, "UCS-2");
  assert.equal(unicode.units, 8);
  assert.equal(unicode.segments, 1);
});

test("agenda builder allocates a bounded meeting time across agenda items", () => {
  const output = buildCommunication({
    kind: "agenda", action: "builder", subject: "Planning", duration: "30",
    items: "Opening\nReview\nDecisions",
  });
  assert.match(output, /00:00–00:10/);
  assert.match(output, /00:10–00:20/);
  assert.match(output, /00:20–00:30/);
});

test("minutes capture decisions and owner-led action items", () => {
  const output = buildCommunication({
    kind: "minutes", action: "builder", subject: "Weekly review",
    details: "Reviewed launch readiness.", decisions: "Launch remains on Friday",
    actionItems: "Sam | Send checklist | 2026-11-06",
  });
  assert.match(output, /Launch remains on Friday/);
  assert.match(output, /Send checklist — Owner: Sam — Due: 2026-11-06/);
});

test("minutes require a next review date or review owner", () => {
  const input = {
    kind: "minutes", action: "builder", subject: "Weekly review",
    details: "Reviewed launch readiness.",
    actionItems: "Sam | Send checklist | 2026-11-06",
  } as const;
  const output = buildCommunication(input);
  const checks = communicationQualityChecks(input, output).join(" ");
  assert.match(checks, /next review date or review owner/);
});

test("an email address alone is a valid To recipient without a name placeholder", () => {
  const output = buildCommunication({
    kind: "email", action: "builder", email: "alex@example.com",
    subject: "Project update", details: "The revised plan is ready.",
  });
  assert.match(output, /To: alex@example\.com/);
  assert.doesNotMatch(output, /\[Recipient\] <alex@example/);
  assert.match(output, /Hello there,/);
});

test("email quality checks surface invalid recipient information without pretending to send", () => {
  const input = { kind: "email", action: "builder", email: "not-an-email", subject: "", details: "Here is the update." } as const;
  const output = buildCommunication(input);
  const checks = communicationQualityChecks(input, output).join(" ");
  assert.match(checks, /recipient email address/);
  assert.match(checks, /specific subject/);
});

test("email checks validate every Cc/Bcc address and detect visibility overlap", () => {
  const input = {
    kind: "email", action: "builder", email: "alex@example.com", subject: "Update",
    cc: "team@example.com; invalid-address", bcc: "TEAM@example.com", details: "Here is the update.",
  } as const;
  const output = buildCommunication(input);
  const checks = communicationQualityChecks(input, output).join(" ");
  assert.match(checks, /Check every Cc and Bcc address/);
  assert.match(checks, /appears in both Cc and Bcc/);
});

test("signature HTML escapes user-controlled content and preserves a plain-text alternative", () => {
  const input = { kind: "signature", action: "builder", name: "<Alex>", email: "alex@example.com", role: "Lead & maker" } as const;
  const html = buildSignatureHtml(input);
  assert.match(html, /&lt;Alex&gt;/);
  assert.match(html, /Lead &amp; maker/);
  assert.doesNotMatch(html, /<Alex>/);
  assert.match(buildCommunication(input), /alex@example.com/);
});

test("formatter preserves paragraph structure and normalizes whitespace", () => {
  const output = buildCommunication({
    kind: "email", action: "formatter",
    details: "  First paragraph.  \r\n\r\n\r\nSecond   paragraph.  ",
  });
  assert.equal(output, "First paragraph.\n\nSecond   paragraph.");
});

test("unknown communication tools are rejected rather than mapped to a generic output", () => {
  assert.throws(() => parseToolId("fax-generator"));
  assert.throws(() => parseToolId("email-translator"));
});


test("signature quality check accepts a valid email address", () => {
  const input = { kind: "signature", action: "builder", name: "Alex", email: "alex@example.com" } as const;
  const output = buildCommunication(input);
  const checks = communicationQualityChecks(input, output).join(" ");
  assert.doesNotMatch(checks, /email address/);
});


test("calendar export creates interoperable UTC event data and folds long lines", () => {
  const input = {
    kind: "meeting", action: "builder", subject: "Roadmap, review; draft",
    date: "2026-11-05T10:00", timezone: "Africa/Lagos", duration: "45",
    place: "Room A", details: "First line\nSecond line",
  } as const;
  const ics = buildCommunicationCalendarIcs(input);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /VERSION:2.0/);
  assert.match(ics, /SUMMARY:Roadmap\\, review\\; draft/);
  assert.match(ics, /DESCRIPTION:First line\\nSecond line/);
  assert.match(ics, /DTSTART:20261105T090000Z/);
  assert.match(ics, /DTEND:20261105T094500Z/);
  assert.match(ics, /BEGIN:VALARM/);
  for (const line of ics.split("\r\n").filter(Boolean)) {
    assert.ok(new TextEncoder().encode(line).length <= 75, "iCalendar content lines stay within 75 UTF-8 octets");
  }
});

test("calendar date conversion rejects nonexistent and repeated daylight-saving times", () => {
  assert.throws(
    () => getCommunicationEventInstant("2026-03-08T02:30", "America/New_York"),
    /does not exist/,
  );
  assert.throws(
    () => getCommunicationEventInstant("2026-11-01T01:30", "America/New_York"),
    /occurs twice/,
  );
});

test("calendar exports require a valid timezone and RSVP before the event", () => {
  assert.throws(() => buildCommunicationCalendarIcs({
    kind: "invitation", action: "builder", date: "2026-11-05T10:00",
    timezone: "Not/A_Timezone", rsvpBy: "2026-11-04T10:00",
  }), /valid IANA time zone/);
  assert.throws(() => buildCommunicationCalendarIcs({
    kind: "invitation", action: "builder", date: "2026-11-05T10:00",
    timezone: "Africa/Lagos", rsvpBy: "2026-11-05T10:00",
  }), /RSVP deadline must be earlier/);
});

test("GSM-7 alternative only replaces common smart punctuation and invisible spaces", () => {
  const original = "“Price”—it’s ready… now";
  const safe = suggestGsm7Text(original);
  assert.equal(safe, "\"Price\"-it's ready... now");
  assert.equal(getSmsMetrics(safe).encoding, "GSM-7");
  assert.notEqual(original, safe);
});

test("email quality checks detect duplicate recipients across To, Cc and Bcc", () => {
  const input = {
    kind: "email", action: "builder", email: "alex@example.com",
    cc: "team@example.com; Alex@example.com", bcc: "hidden@example.com",
    subject: "Update", details: "The plan is ready.",
  } as const;
  const checks = communicationQualityChecks(input, buildCommunication(input)).join(" ");
  assert.match(checks, /more than once across To, Cc and Bcc/);
});

test("email headers cannot inject extra header lines", () => {
  const input = {
    kind: "email", action: "builder", email: "alex@example.com",
    subject: "Update\r\nBcc: victim@example.com", details: "The plan is ready.",
  } as const;
  const output = buildCommunication(input);
  assert.doesNotMatch(output, /\r\nBcc: victim@example\.com/);
  assert.match(communicationQualityChecks(input, output).join(" "), /control characters/);
});
