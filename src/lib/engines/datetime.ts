import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInMonths,
  differenceInYears,
  format,
  getISOWeek,
  getISOWeekYear,
  isLeapYear,
  isValid,
  parseISO,
} from "date-fns";

type DateTimeRow = { label: string; value: string };
type ZoneChoice = { label: string; zone: string };

function normalizeCityAlias(value: string): string {
  return value.trim().replace(/_/g, " ").replace(/\s+/g, " ").toLowerCase();
}

const IANA_CITY_ZONES: Record<string, string> = (() => {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  const supported = typeof intl.supportedValuesOf === "function"
    ? intl.supportedValuesOf("timeZone")
    : [];
  const aliases = new Map<string, Set<string>>();
  for (const zone of supported) {
    if (!zone.includes("/") || zone.startsWith("Etc/")) continue;
    const city = zone.slice(zone.lastIndexOf("/") + 1);
    const key = normalizeCityAlias(city);
    if (!key) continue;
    const ids = aliases.get(key) ?? new Set<string>();
    ids.add(zone);
    aliases.set(key, ids);
  }
  const unique: Record<string, string> = {};
  for (const [alias, ids] of aliases) {
    if (ids.size === 1) unique[alias] = [...ids][0];
  }
  return unique;
})();

const CITY_ZONES: Record<string, string> = {
  accra: "Africa/Accra",
  amsterdam: "Europe/Amsterdam",
  athens: "Europe/Athens",
  auckland: "Pacific/Auckland",
  bangkok: "Asia/Bangkok",
  beijing: "Asia/Shanghai",
  berlin: "Europe/Berlin",
  cairo: "Africa/Cairo",
  chicago: "America/Chicago",
  delhi: "Asia/Kolkata",
  dubai: "Asia/Dubai",
  dublin: "Europe/Dublin",
  hongkong: "Asia/Hong_Kong",
  istanbul: "Europe/Istanbul",
  jakarta: "Asia/Jakarta",
  johannesburg: "Africa/Johannesburg",
  lagos: "Africa/Lagos",
  lisbon: "Europe/Lisbon",
  london: "Europe/London",
  "los angeles": "America/Los_Angeles",
  madrid: "Europe/Madrid",
  manila: "Asia/Manila",
  melbourne: "Australia/Melbourne",
  mumbai: "Asia/Kolkata",
  nairobi: "Africa/Nairobi",
  "new delhi": "Asia/Kolkata",
  "new york": "America/New_York",
  paris: "Europe/Paris",
  "rio de janeiro": "America/Sao_Paulo",
  rome: "Europe/Rome",
  singapore: "Asia/Singapore",
  sydney: "Australia/Sydney",
  tokyo: "Asia/Tokyo",
  toronto: "America/Toronto",
  "san francisco": "America/Los_Angeles",
  "sao paulo": "America/Sao_Paulo",
  seoul: "Asia/Seoul",
  "kuala lumpur": "Asia/Kuala_Lumpur",
  "cape town": "Africa/Johannesburg",
  utc: "UTC",
};

function parseDate(value: string, label = "date"): Date {
  const raw = value?.trim() ?? "";
  if (!raw) throw new Error(`Enter a ${label}.`);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const result = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    if (
      result.getFullYear() === Number(dateOnly[1]) &&
      result.getMonth() === Number(dateOnly[2]) - 1 &&
      result.getDate() === Number(dateOnly[3])
    ) return result;
    throw new Error(`Could not read that ${label}. Use a valid YYYY-MM-DD date.`);
  }
  const parsed = parseISO(raw);
  if (isValid(parsed)) return parsed;
  const fallback = new Date(raw);
  if (isValid(fallback)) return fallback;
  throw new Error(`Could not read that ${label}. Use YYYY-MM-DD.`);
}

function parseInstant(value: string, label = "date and time"): Date {
  const raw = value?.trim() ?? "";
  if (!raw) throw new Error(`Enter a ${label}.`);
  const parsed = new Date(raw);
  if (!isValid(parsed)) throw new Error(`Could not read that ${label}. Use an ISO-8601 date/time.`);
  return parsed;
}

function resolveZone(raw: string): ZoneChoice {
  const input = raw.trim();
  if (!input) throw new Error("Enter a time zone or city.");
  const key = normalizeCityAlias(input);
  const mapped = CITY_ZONES[key] ?? IANA_CITY_ZONES[key] ?? input;
  try {
    new Intl.DateTimeFormat("en", { timeZone: mapped }).format(new Date(0));
    return { label: input, zone: mapped };
  } catch {
    throw new Error(`Unknown city or time zone: ${input}. Use a city name or IANA ID such as Africa/Lagos.`);
  }
}

function parseZoneList(value: string, limit = 20): ZoneChoice[] {
  const raw = (value || "").split(/[\r\n,;]+/).map((part) => part.trim()).filter(Boolean);
  if (!raw.length) throw new Error("Enter at least one city or IANA time zone.");
  const unique = new Map<string, ZoneChoice>();
  for (const item of raw) {
    const zone = resolveZone(item);
    unique.set(zone.zone, zone);
    if (unique.size >= limit) break;
  }
  return [...unique.values()];
}

function zonedParts(instant: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function zoneOffsetMilliseconds(instant: Date, zone: string): number {
  const parts = zonedParts(instant, zone);
  const representedAsUtc = Date.UTC(
    parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second,
  );
  return representedAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function offsetLabel(instant: Date, zone: string): string {
  const minutes = Math.round(zoneOffsetMilliseconds(instant, zone) / 60_000);
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function formatInZone(instant: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "shortOffset",
  }).format(instant);
}

function parseWallTimeInZone(rawValue: string, zone: string): { instant: Date; overlap: boolean } {
  const raw = rawValue.trim();
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)) {
    return { instant: parseInstant(raw, "time"), overlap: false };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (!match) throw new Error("Enter a local time as YYYY-MM-DDTHH:mm, or include an explicit UTC offset.");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0"] = match;
  const parts = {
    year: Number(yearText), month: Number(monthText), day: Number(dayText),
    hour: Number(hourText), minute: Number(minuteText), second: Number(secondText),
  };
  const naiveUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const validCalendarDate = new Date(naiveUtc);
  if (
    validCalendarDate.getUTCFullYear() !== parts.year ||
    validCalendarDate.getUTCMonth() + 1 !== parts.month ||
    validCalendarDate.getUTCDate() !== parts.day ||
    parts.hour > 23 || parts.minute > 59 || parts.second > 59
  ) throw new Error("Enter a valid local date and time.");

  // Resolve the offset on both sides of a DST transition. A nonexistent wall time
  // is rejected; repeated times choose the earlier occurrence, consistently on all platforms.
  const offsets = new Set<number>();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    offsets.add(zoneOffsetMilliseconds(new Date(naiveUtc + hours * 3_600_000), zone));
  }
  const candidates = [...offsets]
    .map((offset) => new Date(naiveUtc - offset))
    .filter((candidate) => {
      const resolved = zonedParts(candidate, zone);
      return resolved.year === parts.year && resolved.month === parts.month &&
        resolved.day === parts.day && resolved.hour === parts.hour &&
        resolved.minute === parts.minute && resolved.second === parts.second;
    })
    .sort((a, b) => a.getTime() - b.getTime());
  if (!candidates.length) {
    throw new Error(`That local time does not exist in ${zone} because the clock moves forward for daylight saving time. Choose another time.`);
  }
  return { instant: candidates[0], overlap: candidates.length > 1 };
}

function parseWeekendDays(value?: string): Set<number> {
  if (!value?.trim()) return new Set([0, 6]);
  const days = value.split(/[,\s]+/).map((item) => Number(item.trim()));
  if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("Weekend days must be numbers from 0 (Sunday) to 6 (Saturday).");
  }
  return new Set(days);
}

function parseExcludedDates(value?: string): Set<string> {
  const items = (value || "").split(/[\r\n,;]+/).map((item) => item.trim()).filter(Boolean);
  const excluded = new Set<string>();
  for (const item of items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item)) {
      throw new Error(`Invalid excluded date: ${item}. Use YYYY-MM-DD.`);
    }
    const parsed = parseDate(item, "excluded date");
    if (dateKey(parsed) !== item) {
      throw new Error(`Invalid excluded date: ${item}. Use a real calendar date in YYYY-MM-DD format.`);
    }
    excluded.add(item);
  }
  return excluded;
}

function dateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function isWorkingDate(date: Date, weekends: Set<number>, excluded: Set<string>): boolean {
  return !weekends.has(date.getDay()) && !excluded.has(dateKey(date));
}

function countWorkingDays(
  from: Date,
  to: Date,
  options: Record<string, string>,
  includeEnd = true,
): number {
  const weekends = parseWeekendDays(options.weekendDays);
  const excluded = parseExcludedDates(options.excludedDates);
  const direction = from <= to ? 1 : -1;
  let cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  let count = 0;
  for (let iterations = 0; iterations < 366_000; iterations++) {
    cursor = addDays(cursor, direction);
    if (cursor.getTime() === end.getTime() && !includeEnd) break;
    if (direction > 0 ? cursor > end : cursor < end) break;
    if (isWorkingDate(cursor, weekends, excluded)) count += direction;
  }
  return count;
}

function addWorkingDays(start: Date, amount: number, options: Record<string, string>): Date {
  if (!Number.isFinite(amount)) throw new Error("Enter how many business days to add.");
  const weekends = parseWeekendDays(options.weekendDays);
  const excluded = parseExcludedDates(options.excludedDates);
  const direction = amount < 0 ? -1 : 1;
  let remaining = Math.floor(Math.abs(amount));
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let iterations = 0; remaining > 0 && iterations < 366_000; iterations++) {
    cursor = addDays(cursor, direction);
    if (isWorkingDate(cursor, weekends, excluded)) remaining--;
  }
  if (remaining > 0) throw new Error("That workday range is too large.");
  return cursor;
}

function calendarSpan(from: Date, to: Date) {
  const direction = from <= to ? 1 : -1;
  const start = direction > 0 ? from : to;
  const end = direction > 0 ? to : from;
  const years = differenceInYears(end, start);
  const afterYears = addYears(start, years);
  const months = differenceInMonths(end, afterYears);
  const afterMonths = addMonths(afterYears, months);
  const days = differenceInCalendarDays(end, afterMonths);
  return { direction, years, months, days, totalDays: differenceInCalendarDays(to, from) };
}

function addDateSpan(start: Date, options: Record<string, string>, multiplier = 1): Date {
  const direction = options.direction === "subtract" ? -1 : 1;
  const amount = (key: string) => {
    const parsed = Number(options[key] || 0);
    if (!Number.isFinite(parsed)) throw new Error(`Enter a valid number for ${key}.`);
    return Math.trunc(parsed) * direction * multiplier;
  };
  let result = addYears(start, amount("years"));
  result = addMonths(result, amount("months"));
  result = addWeeks(result, amount("weeks"));
  result = addDays(result, amount("days"));
  return result;
}

function floorDiv(value: bigint, divisor: bigint): bigint {
  let quotient = value / divisor;
  const remainder = value % divisor;
  if (remainder < 0n) quotient -= 1n;
  return quotient;
}

function unixTimestampRows(raw: string): DateTimeRow[] {
  const input = raw.trim();
  if (!input) throw new Error("Enter a date or Unix timestamp.");
  let totalNanoseconds: bigint;
  let precision = "date input";
  if (/^-?\d+$/.test(input)) {
    const digits = input.replace(/^-/, "").length;
    const value = BigInt(input);
    if (digits <= 10) { totalNanoseconds = value * 1_000_000_000n; precision = "seconds"; }
    else if (digits <= 13) { totalNanoseconds = value * 1_000_000n; precision = "milliseconds"; }
    else if (digits <= 16) { totalNanoseconds = value * 1_000n; precision = "microseconds"; }
    else if (digits <= 19) { totalNanoseconds = value; precision = "nanoseconds"; }
    else throw new Error("Timestamp is too large. Enter seconds, milliseconds, microseconds or nanoseconds.");
  } else {
    const parsed = parseInstant(input, "date");
    totalNanoseconds = BigInt(Math.trunc(parsed.getTime())) * 1_000_000n;
  }
  const seconds = floorDiv(totalNanoseconds, 1_000_000_000n);
  const nanos = totalNanoseconds - seconds * 1_000_000_000n;
  const millis = seconds * 1_000n + nanos / 1_000_000n;
  const numericMillis = Number(millis);
  if (!Number.isSafeInteger(numericMillis)) throw new Error("Timestamp is outside the supported date range.");
  const date = new Date(numericMillis);
  if (!isValid(date)) throw new Error("That timestamp is out of range.");
  const base = new Date(Number(seconds) * 1000).toISOString().replace(/\.\d{3}Z$/, "");
  const iso = `${base}.${String(nanos).padStart(9, "0")}Z`;
  return [
    { label: "Detected precision", value: precision },
    { label: "ISO UTC", value: iso },
    { label: "Local", value: date.toString() },
    { label: "Unix seconds", value: seconds.toString() },
    { label: "Unix milliseconds", value: millis.toString() },
    { label: "Unix microseconds", value: (totalNanoseconds / 1_000n).toString() },
    { label: "Unix nanoseconds", value: totalNanoseconds.toString() },
  ];
}

function meetingSlots(options: Record<string, string>, now: Date): DateTimeRow[] {
  const zones = parseZoneList(options.zones, 8);
  if (zones.length < 2) throw new Error("Add at least two cities or time zones to compare.");
  const anchor = resolveZone(options.sourceTz || zones[0].zone);
  const date = parseDate(options.date, "meeting date");
  const workStart = options.workStart || "09:00";
  const workEnd = options.workEnd || "17:00";
  const duration = Math.max(5, Math.min(480, Math.trunc(Number(options.durationMinutes) || 30)));
  const interval = Math.max(5, Math.min(120, Math.trunc(Number(options.intervalMinutes) || 30)));
  const startLocal = parseWallTimeInZone(`${dateKey(date)}T${workStart}`, anchor.zone).instant;
  let endLocal = parseWallTimeInZone(`${dateKey(date)}T${workEnd}`, anchor.zone).instant;
  if (endLocal <= startLocal) endLocal = new Date(endLocal.getTime() + 86_400_000);
  const workStartMinutes = clockMinutes(workStart);
  const workEndMinutes = clockMinutes(workEnd);
  const slots: Array<{ instant: Date; value: string }> = [];
  for (let cursor = startLocal.getTime(); cursor + duration * 60_000 <= endLocal.getTime(); cursor += interval * 60_000) {
    const instant = new Date(cursor);
    const end = new Date(cursor + duration * 60_000);
    const localTimes = zones.map((choice) => {
      const a = zonedParts(instant, choice.zone);
      const b = zonedParts(end, choice.zone);
      const startMinutes = a.hour * 60 + a.minute;
      const endMinutes = b.hour * 60 + b.minute;
      const sameLocalDay = a.year === b.year && a.month === b.month && a.day === b.day;
      return { choice, a, startMinutes, endMinutes, sameLocalDay };
    });
    const suitable = localTimes.every(({ startMinutes, endMinutes, sameLocalDay }) =>
      sameLocalDay && startMinutes >= workStartMinutes && endMinutes <= workEndMinutes
    );
    if (suitable) {
      slots.push({
        instant,
        value: localTimes.map(({ choice, a }) =>
          `${choice.label}: ${String(a.hour).padStart(2, "0")}:${String(a.minute).padStart(2, "0")} (${offsetLabel(instant, choice.zone)})`
        ).join(" | "),
      });
    }
  }
  if (!slots.length) return [{ label: "Available slots", value: "No shared working-hours slots found for that date and these working-hour settings." }];
  const shown = slots.slice(0, 8);
  const rows: DateTimeRow[] = [
    { label: "Available slots", value: `${slots.length} matching slots; showing the first ${shown.length}. This checks working hours, not personal calendar free/busy.` },
    ...shown.map((slot, index) => ({ label: `Option ${index + 1}`, value: slot.value })),
  ];
  const first = shown[0].instant;
  const end = new Date(first.getTime() + duration * 60_000);
  const stamp = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//enV//Date Time Planner//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", "UID:env-" + stamp(first) + "-meeting@envtools.store", "DTSTAMP:" + stamp(now),
    "DTSTART:" + stamp(first), "DTEND:" + stamp(end), "SUMMARY:Meeting", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  rows.push({ label: "ICS for option 1", value: ics });
  return rows;
}

function clockMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error("Enter working hours as HH:mm using a 24-hour clock.");
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function runDateTime(op: string, opts: Record<string, string>, now = new Date()): DateTimeRow[] {
  switch (op) {
    case "age": {
      const birth = parseDate(opts.birth || opts.value, "birth date");
      const today = now;
      if (birth > today) throw new Error("Birth date cannot be in the future.");
      const years = differenceInYears(today, birth);
      const months = differenceInMonths(today, addYears(birth, years));
      const days = differenceInCalendarDays(today, addMonths(addYears(birth, years), months));
      return [
        { label: "Age", value: `${years} years, ${months} months, ${days} days` },
        { label: "Days lived", value: String(differenceInCalendarDays(today, birth)) },
      ];
    }
    case "date-diff": {
      const from = parseDate(opts.from, "start date");
      const to = parseDate(opts.to, "end date");
      const span = calendarSpan(from, to);
      const sign = span.direction < 0 ? "-" : "";
      return [
        { label: "Calendar span", value: `${sign}${span.years} years, ${span.months} months, ${span.days} days` },
        { label: "Total days", value: String(span.totalDays) },
        { label: "Weeks", value: (span.totalDays / 7).toFixed(2) },
        { label: "Calendar hours (24-hour days)", value: String(span.totalDays * 24) },
      ];
    }
    case "date-add": {
      const start = parseDate(opts.start || opts.value, "start date");
      const repeat = Math.max(1, Math.min(100, Math.trunc(Number(opts.repeatCount) || 1)));
      const units = ["years", "months", "weeks", "days"].map((key) => Number(opts[key] || 0));
      if (units.some((value) => !Number.isFinite(value) || !Number.isInteger(value))) {
        throw new Error("Years, months, weeks and days must be whole numbers.");
      }
      if (!units.some(Boolean)) throw new Error("Enter at least one date unit to add or subtract.");
      if (repeat > 1) {
        const rows: DateTimeRow[] = [{ label: "Start date", value: format(start, "yyyy-MM-dd EEEE") }];
        let cursor = start;
        for (let i = 1; i <= repeat; i++) {
          cursor = addDateSpan(cursor, opts);
          rows.push({ label: `Occurrence ${i}`, value: format(cursor, "yyyy-MM-dd EEEE") });
        }
        return rows;
      }
      const result = addDateSpan(start, opts);
      return [
        { label: "Result", value: format(result, "yyyy-MM-dd EEEE") },
        { label: "Date", value: format(result, "yyyy-MM-dd") },
      ];
    }
    case "workday": {
      const start = parseDate(opts.start || opts.from, "start date");
      const days = Number(opts.days);
      const result = addWorkingDays(start, days, opts);
      return [{ label: "Result", value: format(result, "yyyy-MM-dd EEEE") }];
    }
    case "business-days": {
      const from = parseDate(opts.from, "start date");
      const to = parseDate(opts.to, "end date");
      const includeEnd = opts.includeEnd !== "false";
      const result = countWorkingDays(from, to, opts, includeEnd);
      return [
        { label: "Working days", value: String(result) },
        { label: "Range rule", value: `Start date excluded; end date ${includeEnd ? "included" : "excluded"}.` },
        { label: "Custom excluded dates", value: parseExcludedDates(opts.excludedDates).size ? String(parseExcludedDates(opts.excludedDates).size) : "None supplied" },
      ];
    }
    case "duration": {
      const from = parseInstant(opts.from, "start date and time");
      const to = parseInstant(opts.to, "end date and time");
      const milliseconds = Math.abs(to.getTime() - from.getTime());
      const totalSeconds = Math.floor(milliseconds / 1000);
      const days = Math.floor(totalSeconds / 86_400);
      const hours = Math.floor((totalSeconds % 86_400) / 3_600);
      const minutes = Math.floor((totalSeconds % 3_600) / 60);
      const seconds = totalSeconds % 60;
      return [
        { label: "Elapsed duration", value: `${days}d ${hours}h ${minutes}m ${seconds}s` },
        { label: "Total hours", value: (milliseconds / 3_600_000).toFixed(3) },
        { label: "Total seconds", value: (milliseconds / 1000).toFixed(3) },
      ];
    }
    case "countdown": {
      const target = parseInstant(opts.target, "target date and time");
      const diff = target.getTime() - now.getTime();
      if (diff <= 0) {
        return [
          { label: "Status", value: "The target time has arrived." },
          { label: "Difference", value: `${Math.abs(diff / 1000).toFixed(0)} seconds ago` },
        ];
      }
      const totalSeconds = Math.floor(diff / 1000);
      return [
        { label: "Countdown", value: `${Math.floor(totalSeconds / 86400)}d ${Math.floor((totalSeconds % 86400) / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m ${totalSeconds % 60}s` },
        { label: "Target", value: target.toLocaleString() },
        { label: "Total seconds", value: String(totalSeconds) },
      ];
    }
    case "world-clock": {
      const zones = parseZoneList(opts.zones, 20);
      return zones.map(({ label, zone }) => ({
        label,
        value: `${formatInZone(now, zone)} · ${offsetLabel(now, zone)}`,
      }));
    }
    case "timezone": {
      const from = resolveZone(opts.fromTz || "UTC");
      const to = resolveZone(opts.toTz || "America/New_York");
      const converted = parseWallTimeInZone(opts.time || "", from.zone);
      const source = converted.instant;
      const destination = formatInZone(source, to.zone);
      const sourceDate = zonedParts(source, from.zone);
      const destinationDate = zonedParts(source, to.zone);
      const dateChange = Date.UTC(destinationDate.year, destinationDate.month - 1, destinationDate.day) -
        Date.UTC(sourceDate.year, sourceDate.month - 1, sourceDate.day);
      const dayShift = Math.round(dateChange / 86_400_000);
      const rows: DateTimeRow[] = [
        { label: `In ${from.label}`, value: `${formatInZone(source, from.zone)} · ${offsetLabel(source, from.zone)}` },
        { label: `In ${to.label}`, value: `${destination} · ${offsetLabel(source, to.zone)}` },
        { label: "Date change", value: dayShift === 0 ? "Same calendar day" : dayShift > 0 ? `${dayShift} day(s) later` : `${Math.abs(dayShift)} day(s) earlier` },
        { label: "Unix seconds", value: String(Math.floor(source.getTime() / 1000)) },
      ];
      if (converted.overlap) rows.push({ label: "DST note", value: "This local time occurs twice; the earlier occurrence was selected." });
      return rows;
    }
    case "unix": {
      const raw = opts.value || "";
      const inputs = raw.split(/[\r\n,;]+/).map((item) => item.trim()).filter(Boolean);
      if (!inputs.length) throw new Error("Enter a date or Unix timestamp.");
      if (inputs.length === 1) return unixTimestampRows(inputs[0]);
      if (inputs.length > 100) throw new Error("Batch conversion is limited to 100 timestamps.");
      return inputs.map((item, index) => {
        const rows = unixTimestampRows(item);
        return { label: `Timestamp ${index + 1}`, value: `${rows[1].value} | ${rows[6].value} ns` };
      });
    }
    case "format": {
      const date = parseDate(opts.value, "date");
      return [{ label: "Formatted", value: format(date, opts.pattern || "yyyy-MM-dd") }];
    }
    case "weekday": {
      const date = parseDate(opts.value, "date");
      return [{ label: "Weekday", value: format(date, "EEEE") }];
    }
    case "week-number": {
      const date = parseDate(opts.value, "date");
      return [
        { label: "ISO week", value: String(getISOWeek(date)) },
        { label: "ISO week-year", value: String(getISOWeekYear(date)) },
      ];
    }
    case "leap": {
      const year = Number(opts.year);
      if (!Number.isInteger(year) || year < 1 || year > 9999) throw new Error("Enter a year from 1 to 9999.");
      return [{ label: String(year), value: isLeapYear(new Date(year, 5, 1)) ? "Leap year" : "Not a leap year" }];
    }
    case "birthday": {
      const birth = parseDate(opts.birth || opts.value, "birth date");
      
      const thisYear = now.getFullYear();
      let month = birth.getMonth();
      let day = birth.getDate();
      if (month === 1 && day === 29 && !isLeapYear(new Date(thisYear, 5, 1))) {
        if (opts.leapBirthday === "mar-1") { month = 2; day = 1; }
        else day = 28;
      }
      const next = new Date(thisYear, month, day);
      if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(thisYear + 1);
      return [{ label: "Days until birthday", value: String(differenceInCalendarDays(next, new Date(now.getFullYear(), now.getMonth(), now.getDate()))) }];
    }
    case "time-until": {
      const target = parseDate(opts.target || opts.value, "target date");
      const today = now;
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const span = calendarSpan(start, target);
      const sign = span.direction < 0 ? "-" : "";
      return [
        { label: "Calendar span", value: `${sign}${span.years} years, ${span.months} months, ${span.days} days` },
        { label: "Total days", value: String(span.totalDays) },
      ];
    }
    case "deadline": {
      const target = parseDate(opts.target || opts.value, "deadline");
      const today = now;
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const includeEnd = opts.includeEnd === "true";
      return [
        { label: "Calendar days remaining", value: String(differenceInCalendarDays(target, start)) },
        { label: "Working days remaining", value: String(countWorkingDays(start, target, opts, includeEnd)) },
        { label: "Deadline weekday", value: format(target, "EEEE") },
        { label: "End-date rule", value: includeEnd ? "Deadline date included" : "Deadline date excluded" },
      ];
    }
    case "meeting-planner":
      return meetingSlots(opts, now);
    default:
      throw new Error("Unknown date operation.");
  }
}
