import assert from "node:assert/strict";
import test from "node:test";
import {
  eventFieldsForTool,
  eventTemplateFileName,
  eventTemplateForTool,
  generateEventTemplate,
  initialEventValues,
  isEventTemplateTool,
} from "./event-templates.ts";

const agendaIds = [
  "birthday-agenda-generator", "concert-agenda-generator", "conference-agenda-generator", "dinner-agenda-generator",
  "fundraiser-agenda-generator", "graduation-agenda-generator", "launch-agenda-generator", "party-agenda-generator",
  "sports-event-agenda-generator", "webinar-agenda-generator", "wedding-agenda-generator", "workshop-agenda-generator",
];
const scheduleIds = [
  "birthday-schedule-builder", "concert-schedule-builder", "conference-schedule-builder", "dinner-schedule-builder",
  "fundraiser-schedule-builder", "graduation-schedule-builder", "launch-schedule-builder", "meeting-schedule-builder",
  "party-schedule-builder", "sports-event-schedule-builder", "webinar-schedule-builder", "wedding-schedule-builder", "workshop-schedule-builder",
];
const pageThemes = ["birthday", "concert", "conference", "dinner", "fundraiser", "graduation", "launch", "meeting", "party", "sports-event", "webinar", "wedding", "workshop"];
const rsvpIds = pageThemes.map((theme) => `${theme}-rsvp-page`);
const checkInIds = pageThemes.map((theme) => `${theme}-check-in-page`);
const allIds = [...agendaIds, ...scheduleIds, ...rsvpIds, ...checkInIds];

test("Events template engine supports exactly the 51 roadmap IDs", () => {
  assert.equal(allIds.length, 51);
  assert.equal(allIds.filter(isEventTemplateTool).length, 51);
  assert.equal(eventTemplateForTool("birthday-event-qr-generator"), undefined);
  assert.equal(isEventTemplateTool("birthday-ticket-mockup"), false);
  assert.equal(eventFieldsForTool("unknown-event-tool").length, 0);
});

test("agenda uses one-based item numbering, optional plain-text date/location, and useful fallbacks", () => {
  const id = "sports-event-agenda-generator";
  assert.equal(generateEventTemplate(id, { title: "Match day", dateTime: "Sat 4pm local", location: "North field", items: "Doors\n\nKickoff\nWrap-up" }), "Sports Event agenda\n\nMatch day\nDate / time: Sat 4pm local\nLocation: North field\n\n1. Doors\n2. Kickoff\n3. Wrap-up");
  assert.equal(generateEventTemplate("birthday-agenda-generator", { items: " " }), "Birthday agenda\n\nEvent agenda\n\n1. Welcome\n2. Main activity\n3. Break\n4. Closing");
});

test("schedule is distinct from agenda and retains supplied date/time wording without timezone conversion", () => {
  assert.equal(generateEventTemplate("meeting-schedule-builder", { title: "Planning session", dateTime: "2026-11-01 1:30 AM local", items: "Introductions\nDecision" }), "Meeting schedule\n\nPlanning session\nDate / time: 2026-11-01 1:30 AM local\n\n1. Introductions\n2. Decision");
});

test("RSVP output is escaped static HTML and clearly does not collect responses", () => {
  const id = "wedding-rsvp-page";
  const values = { title: "A & B <Wedding>", body: "Dinner with \"friends\" & family", dateTime: "June 4, 6 pm", location: "Garden", contact: "Rae <host@example.test>" };
  const output = generateEventTemplate(id, values);
  assert.ok(output.startsWith("<!doctype html>"));
  assert.ok(output.includes("<title>A &amp; B &lt;Wedding&gt;</title>"));
  assert.ok(output.includes("Dinner with &quot;friends&quot; &amp; family"));
  assert.ok(output.includes("Rae &lt;host@example.test&gt;"));
  assert.ok(output.includes("does not collect or store RSVPs"));
  assert.equal(eventTemplateFileName(id), "env-wedding-rsvp-page.html");
  assert.deepEqual(initialEventValues(id), { title: "Wedding event", dateTime: "", location: "", body: "You're invited to the wedding event.", contact: "the event organizer" });
});

test("check-in output is static HTML and never implies live arrival tracking", () => {
  const id = "conference-check-in-page";
  const output = generateEventTemplate(id, { title: "Check in", guest: "Alex & Jo", location: "Hall A" });
  assert.ok(output.startsWith("<!doctype html>"));
  assert.ok(output.includes("Guest: Alex &amp; Jo"));
  assert.ok(output.includes("Location:</strong> Hall A"));
  assert.ok(output.includes("does not verify or record arrivals"));
  assert.equal(eventTemplateFileName(id), "env-conference-check-in-page.html");
});

test("event export names distinguish plain-text agendas from HTML pages", () => {
  assert.equal(eventTemplateFileName("workshop-agenda-generator"), "env-workshop-agenda-generator.txt");
  assert.equal(eventTemplateFileName("workshop-schedule-builder"), "env-workshop-schedule-builder.txt");
  assert.throws(() => generateEventTemplate("__proto__", {}), /Unsupported event template/);
});
