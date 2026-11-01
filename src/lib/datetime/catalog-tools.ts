import type { ToolMeta } from "@/types/tool";

export const DATETIME_TOOL_EXTENSIONS: ToolMeta[] = [
  {
    id: "age-calculator", name: "Age Calculator", slug: "age-calculator",
    description: "Calculate your age in years, months, and days.",
    category: "datetime", keywords: ["age", "calculator", "years", "months", "days", "birthday"],
    tags: ["age", "calculator", "date"], icon: "Calendar", popularity: 83, featured: false,
    clientSide: true, requiresBackend: false, requiresAuth: false, status: "active",
    related: ["birthday-countdown", "date-difference", "time-until-calculator"],
    engine: { type: "datetime", op: "age" },
  },
  {
    id: "date-calculator", name: "Date Calculator", slug: "date-calculator",
    description: "Add or subtract years, months, weeks, and days from a date.",
    category: "datetime", keywords: ["date", "calculator", "add", "subtract", "years", "months", "weeks", "days"],
    tags: ["date", "arithmetic", "add", "subtract"], icon: "Calendar", popularity: 84, featured: false,
    clientSide: true, requiresBackend: false, requiresAuth: false, status: "active",
    related: ["date-difference", "workday-calculator", "business-day-calculator"],
    engine: { type: "datetime", op: "date-add" },
  },
  {
    id: "duration-calculator", name: "Duration Calculator", slug: "duration-calculator",
    description: "Calculate exact elapsed time between two date and time values.",
    category: "datetime", keywords: ["duration", "elapsed", "time", "hours", "minutes", "seconds"],
    tags: ["duration", "elapsed-time", "date"], icon: "Calendar", popularity: 85, featured: false,
    clientSide: true, requiresBackend: false, requiresAuth: false, status: "active",
    related: ["date-difference", "countdown", "time-until-calculator"],
    engine: { type: "datetime", op: "duration" },
  },
  {
    id: "meeting-time-planner", name: "Meeting Time Planner", slug: "meeting-time-planner",
    description: "Find shared working-hour slots across cities and export an ICS invite.",
    category: "datetime", keywords: ["meeting", "planner", "timezone", "working", "hours", "calendar", "ics"],
    tags: ["meeting", "timezone", "planner", "calendar"], icon: "Calendar", popularity: 91, featured: true,
    clientSide: true, requiresBackend: false, requiresAuth: false, status: "active",
    related: ["timezone-converter", "world-clock", "countdown"],
    engine: { type: "datetime", op: "meeting-planner" },
  },
];
