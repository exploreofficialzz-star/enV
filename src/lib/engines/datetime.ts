import {
  addBusinessDays,
  differenceInBusinessDays,
  differenceInCalendarDays,
  differenceInYears,
  format,
  getISOWeek,
  intervalToDuration,
  isLeapYear,
  isValid,
  parseISO,
} from "date-fns";

function parseDate(value: string, label = "date"): Date {
  const v = value.trim();
  if (!v) throw new Error(`Enter a ${label}.`);
  const iso = parseISO(v);
  if (isValid(iso)) return iso;
  const d = new Date(v);
  if (isValid(d)) return d;
  throw new Error(`Could not read that ${label}. Use YYYY-MM-DD.`);
}

export function runDateTime(op: string, opts: Record<string, string>): { label: string; value: string }[] {
  switch (op) {
    case "age": {
      const birth = parseDate(opts.birth || opts.value, "birth date");
      const now = new Date();
      const years = differenceInYears(now, birth);
      const days = differenceInCalendarDays(now, birth);
      return [
        { label: "Age (years)", value: String(years) },
        { label: "Days lived", value: String(days) },
        { label: "Next birthday in", value: `${365 - (days % 365)} days (approx.)` },
      ];
    }
    case "date-diff": {
      const from = parseDate(opts.from, "start date");
      const to = parseDate(opts.to, "end date");
      const days = differenceInCalendarDays(to, from);
      return [
        { label: "Days", value: String(days) },
        { label: "Weeks", value: (days / 7).toFixed(1) },
      ];
    }
    case "workday": {
      const start = parseDate(opts.start || opts.from, "start date");
      const days = Number(opts.days);
      if (!Number.isFinite(days)) throw new Error("Enter how many business days to add.");
      return [{ label: "Result", value: format(addBusinessDays(start, days), "yyyy-MM-dd EEEE") }];
    }
    case "business-days": {
      const from = parseDate(opts.from, "start date");
      const to = parseDate(opts.to, "end date");
      return [{ label: "Weekdays", value: String(differenceInBusinessDays(to, from)) }];
    }
    case "duration": {
      const from = parseDate(opts.from, "start");
      const to = parseDate(opts.to, "end");
      const d = intervalToDuration({ start: from, end: to });
      return [
        { label: "Duration", value: `${d.days ?? 0}d ${d.hours ?? 0}h ${d.minutes ?? 0}m` },
        { label: "Total hours", value: (Math.abs(to.getTime() - from.getTime()) / 3600000).toFixed(2) },
      ];
    }
    case "timezone": {
      const raw = opts.time || new Date().toISOString();
      const date = parseDate(raw, "time");
      const fromTz = opts.fromTz || "UTC";
      const toTz = opts.toTz || "UTC";
      const fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: toTz,
        dateStyle: "medium",
        timeStyle: "medium",
      });
      void fromTz;
      return [
        { label: `In ${toTz}`, value: fmt.format(date) },
        { label: "Unix", value: String(Math.floor(date.getTime() / 1000)) },
      ];
    }
    case "unix": {
      const v = opts.value.trim();
      if (/^\d+$/.test(v)) {
        const ms = v.length > 11 ? Number(v) : Number(v) * 1000;
        const d = new Date(ms);
        if (!isValid(d)) throw new Error("That timestamp is out of range.");
        return [
          { label: "ISO", value: d.toISOString() },
          { label: "Local", value: d.toString() },
        ];
      }
      const d = parseDate(v);
      return [{ label: "Unix seconds", value: String(Math.floor(d.getTime() / 1000)) }];
    }
    case "format": {
      const d = parseDate(opts.value, "date");
      return [{ label: "Formatted", value: format(d, opts.pattern || "yyyy-MM-dd") }];
    }
    case "weekday": {
      const d = parseDate(opts.value, "date");
      return [{ label: "Weekday", value: format(d, "EEEE") }];
    }
    case "week-number": {
      const d = parseDate(opts.value, "date");
      return [{ label: "ISO week", value: String(getISOWeek(d)) }];
    }
    case "leap": {
      const year = Number(opts.year);
      if (!Number.isInteger(year)) throw new Error("Enter a year.");
      return [{ label: String(year), value: isLeapYear(new Date(year, 5, 1)) ? "Leap year" : "Not a leap year" }];
    }
    case "birthday": {
      const birth = parseDate(opts.birth || opts.value, "birth date");
      const now = new Date();
      const next = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
      if (next < now) next.setFullYear(now.getFullYear() + 1);
      return [{ label: "Days until birthday", value: String(differenceInCalendarDays(next, now)) }];
    }
    case "time-until":
    case "deadline": {
      const target = parseDate(opts.target || opts.value, "target date");
      const days = differenceInCalendarDays(target, new Date());
      const weekdays = differenceInBusinessDays(target, new Date());
      return [
        { label: "Calendar days", value: String(days) },
        { label: "Weekdays", value: String(weekdays) },
      ];
    }
    default:
      throw new Error("Unknown date operation.");
  }
}
