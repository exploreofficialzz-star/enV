import fs from "node:fs";
import assert from "node:assert/strict";
import { runDateTime } from "../src/lib/engines/datetime.ts";
import { DATETIME_TOOL_EXTENSIONS } from "../src/lib/datetime/catalog-tools.ts";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";
const source = fs.readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const baseTools = parseGeneratedCatalog(source);
const tools = [...baseTools, ...DATETIME_TOOL_EXTENSIONS.filter((extension) => !baseTools.some((tool) => tool.id === extension.id))];
const dt = tools.filter((t) => t.category === "datetime");
const missing = dt.filter((t) => t.status !== "active" || t.engine?.type !== "datetime");
console.log(`Date & Time audit: ${dt.length} tools; ${dt.length - missing.length} active; ${missing.length} missing`);
if (missing.length) {
  console.error(missing.map((t) => `${t.id}: ${t.status}/${t.engine?.type}`).join("\n"));
  process.exit(1);
}

const expectedNative = [
  "age-calculator", "birthday-countdown", "business-day-calculator", "countdown",
  "date-calculator", "date-difference", "date-formatter", "deadline-calculator",
  "duration-calculator", "leap-year-checker", "meeting-time-planner",
  "time-until-calculator", "timezone-converter", "unix-timestamp-converter",
  "week-number-calculator", "weekday-calculator", "workday-calculator", "world-clock",
].sort();
for (const platform of ["android", "ios"]) {
  const coverage = fs.readFileSync(new URL(`../apps/${platform}/native-family-coverage/datetime.txt`, import.meta.url), "utf8")
    .trim().split(/\r?\n/).sort();
  assert.deepEqual(coverage, expectedNative, `${platform} Date & Time native coverage matches all supported operations`);
}

const fixedNow = new Date("2025-01-15T12:00:00Z");
const age = runDateTime("age", { birth: "1990-02-01" }, fixedNow);
assert.match(age.find((row) => row.label === "Age")?.value ?? "", /^\d+ years, \d+ months, \d+ days$/);

const birthdayDefault = runDateTime("birthday", { birth: "2000-02-29" }, fixedNow);
assert.equal(birthdayDefault[0].value, "44");
const birthdayMarchFirst = runDateTime("birthday", { birth: "2000-02-29", leapBirthday: "mar-1" }, fixedNow);
assert.equal(birthdayMarchFirst[0].value, "45");

const countdown = runDateTime("countdown", { target: "2025-01-15T13:00:00Z" }, fixedNow);
assert.equal(countdown.find((row) => row.label === "Total seconds")?.value, "3600");

const dateDifference = runDateTime("date-diff", { from: "2024-01-01", to: "2024-01-05" });
assert.equal(dateDifference.find((row) => row.label === "Total days")?.value, "4");
assert.match(dateDifference.find((row) => row.label === "Calendar span")?.value ?? "", /0 years, 0 months, 4 days/);

const monthEnd = runDateTime("date-add", { start: "2024-01-31", months: "1" });
assert.match(monthEnd[0].value, /2024-02-29/);

const converted = runDateTime("timezone", {
  time: "2024-01-01T09:00", fromTz: "UTC", toTz: "America/New_York",
});
assert.equal(converted.find((row) => row.label === "Unix seconds")?.value, "1704099600");
assert.match(converted.find((row) => row.label === "In America/New_York")?.value ?? "", /04:00/);
assert.throws(() => runDateTime("timezone", {
  time: "2024-03-10T02:30", fromTz: "America/New_York", toTz: "UTC",
}), /does not exist/);
const repeatedTime = runDateTime("timezone", {
  time: "2024-11-03T01:30", fromTz: "America/New_York", toTz: "UTC",
});
assert.equal(repeatedTime.find((row) => row.label === "Unix seconds")?.value, "1730611800");
assert.match(repeatedTime.find((row) => row.label === "DST note")?.value ?? "", /earlier occurrence was selected/);
assert.throws(() => runDateTime("business-days", {
  from: "2024-01-05", to: "2024-01-09", excludedDates: "2024-02-30",
}), /Invalid date|excluded date/i);

assert.equal(runDateTime("business-days", {
  from: "2024-01-05", to: "2024-01-09", includeEnd: "true", excludedDates: "2024-01-08",
})[0].value, "1");
assert.match(runDateTime("workday", { start: "2024-01-08", days: "-1" })[0].value, /2024-01-05/);
assert.equal(runDateTime("world-clock", { zones: "Lagos\nLondon" }).length, 2);
assert.equal(runDateTime("world-clock", { zones: "Stockholm, Kathmandu, Brisbane" }).length, 3);
assert.throws(() => runDateTime("world-clock", { zones: "A city that is not real" }), /Unknown city or time zone/);

const micros = runDateTime("unix", { value: "1704067200000000" });
assert.equal(micros.find((row) => row.label === "Detected precision")?.value, "microseconds");
assert.equal(micros.find((row) => row.label === "Unix seconds")?.value, "1704067200");

const meeting = runDateTime("meeting-planner", {
  date: "2024-01-15", zones: "Lagos\nLondon\nNew York", sourceTz: "Lagos",
  workStart: "09:00", workEnd: "17:00", durationMinutes: "30", intervalMinutes: "30",
});
assert.ok(meeting.some((row) => row.label === "Option 1"));
const ics = meeting.find((row) => row.label === "ICS for option 1")?.value ?? "";
assert.match(ics, /UID:env-/);
assert.match(ics, /DTSTAMP:/);

console.log("Date & Time behaviour audit PASS: calculations, DST handling, workday rules, world clock, timestamp precision and meeting planner.");
