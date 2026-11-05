export type Kind =
  | "email" | "message" | "sms" | "meeting" | "agenda" | "minutes"
  | "signature" | "invitation" | "announcement" | "thank-you" | "follow-up" | "reminder";
export type Action = "generator" | "template" | "builder" | "planner" | "formatter";

export type CommunicationInput = {
  kind: Kind;
  action: Action;
  name?: string;
  audience?: string;
  subject?: string;
  date?: string;
  place?: string;
  purpose?: string;
  details?: string;
  tone?: string;
  items?: string;
  email?: string;
  cc?: string;
  bcc?: string;
  channel?: string;
  duration?: string | number;
  timezone?: string;
  rsvpBy?: string;
  role?: string;
  company?: string;
  phone?: string;
  website?: string;
  decisions?: string;
  actionItems?: string;
  nextStep?: string;
};

export type SmsMetrics = {
  encoding: "GSM-7" | "UCS-2";
  characters: number;
  units: number;
  segments: number;
  singleMessageLimit: number;
  concatenatedLimit: number;
};

const ACTIONS: Action[] = ["generator", "template", "builder", "planner", "formatter"];
const KINDS: Kind[] = [
  "thank-you", "follow-up", "email", "message", "sms", "meeting", "agenda",
  "minutes", "signature", "invitation", "announcement", "reminder",
];

const GSM_BASIC = new Set(Array.from(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
));
const GSM_EXTENSION = new Set(["\f", "^", "{", "}", "\\", "[", "~", "]", "|", "€"]);

const clean = (value?: string | number) => String(value ?? "").trim();
const lines = (value?: string) => String(value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

export function parseToolId(toolId: string): { kind: Kind; action: Action } {
  const action = ACTIONS.find((candidate) => toolId.endsWith("-" + candidate));
  if (!action) throw new Error("Unsupported communication action: " + toolId);
  const prefix = toolId.slice(0, -(action.length + 1));
  const kind = KINDS.find((candidate) => candidate === prefix);
  if (!kind) throw new Error("Unsupported communication type: " + toolId);
  return { kind, action };
}

export function kindLabel(kind: Kind) {
  const labels: Record<Kind, string> = {
    email: "Email", message: "Message", sms: "SMS", meeting: "Meeting", agenda: "Agenda",
    minutes: "Meeting minutes", signature: "Email signature", invitation: "Invitation",
    announcement: "Announcement", "thank-you": "Thank-you note", "follow-up": "Follow-up",
    reminder: "Reminder",
  };
  return labels[kind];
}

export function getSmsMetrics(value: string): SmsMetrics {
  const characters = Array.from(value).length;
  const chars = Array.from(value);
  const gsm = chars.every((character) => GSM_BASIC.has(character) || GSM_EXTENSION.has(character));
  if (gsm) {
    const units = chars.reduce((sum, character) => sum + (GSM_EXTENSION.has(character) ? 2 : 1), 0);
    const segments = units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153);
    return { encoding: "GSM-7", characters, units, segments, singleMessageLimit: 160, concatenatedLimit: 153 };
  }
  const units = chars.reduce((sum, character) => sum + (character.codePointAt(0)! > 0xffff ? 2 : 1), 0);
  const segments = units === 0 ? 0 : units <= 70 ? 1 : Math.ceil(units / 67);
  return { encoding: "UCS-2", characters, units, segments, singleMessageLimit: 70, concatenatedLimit: 67 };
}


const EVENT_KINDS = new Set<Kind>(["meeting", "agenda", "invitation", "reminder"]);
const GSM_SAFE_REPLACEMENTS: Record<string, string> = {
  "\u2018": "'", "\u2019": "'", "\u201A": "'", "\u201B": "'",
  "\u201C": "\"", "\u201D": "\"", "\u201E": "\"", "\u201F": "\"",
  "\u2013": "-", "\u2014": "-", "\u2212": "-", "\u2011": "-",
  "\u2026": "...", "\u2022": "-", "\u00A0": " ", "\u2007": " ",
  "\u2009": " ", "\u202F": " ", "\u200B": "", "\u200C": "",
  "\u200D": "", "\uFEFF": "", "\u00AD": "",
};
export function suggestGsm7Text(value: string): string {
  return Array.from(value, (character) => GSM_SAFE_REPLACEMENTS[character] ?? character).join("");
}
type LocalDateTimeParts = { year: number; month: number; day: number; hour: number; minute: number };
function parseLocalDateTime(value: string): LocalDateTimeParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("Use a local date and time in YYYY-MM-DDTHH:mm format.");
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]) };
  if (parts.year < 1970 || parts.year > 9999 || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31 || parts.hour > 23 || parts.minute > 59) throw new Error("Enter a real calendar date and time.");
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
  if (check.getUTCFullYear() !== parts.year || check.getUTCMonth() + 1 !== parts.month || check.getUTCDate() !== parts.day || check.getUTCHours() !== parts.hour || check.getUTCMinutes() !== parts.minute) throw new Error("Enter a real calendar date and time.");
  return parts;
}
function zonedPartsAt(instantMs: number, timeZone: string): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const values = Object.fromEntries(formatter.formatToParts(new Date(instantMs)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute };
}
export function getCommunicationEventInstant(value: string, timeZone: string): Date {
  const parts = parseLocalDateTime(value);
  if (!timeZone.trim()) throw new Error("Choose a time zone before exporting the event.");
  const wallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const offsets = new Set<number>();
  try {
    for (let hours = -48; hours <= 48; hours += 3) {
      const instantMs = wallClockAsUtc + hours * 60 * 60 * 1000;
      const local = zonedPartsAt(instantMs, timeZone);
      offsets.add(Math.round((Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - instantMs) / 60000));
    }
  } catch {
    throw new Error("Choose a valid IANA time zone, such as Africa/Lagos or Europe/London.");
  }
  const matches = [...offsets].map((offset) => wallClockAsUtc - offset * 60000).filter((candidate) => {
    const actual = zonedPartsAt(candidate, timeZone);
    return actual.year === parts.year && actual.month === parts.month && actual.day === parts.day && actual.hour === parts.hour && actual.minute === parts.minute;
  });
  if (matches.length === 0) throw new Error("That local time does not exist because the clocks change in this time zone. Choose another time.");
  if (matches.length > 1) throw new Error("That local time occurs twice because the clocks change in this time zone. Choose a time outside the repeated hour.");
  return new Date(matches[0]);
}
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let current = "";
  for (const character of line) {
    if (current && encoder.encode(current + character).length > 75) { folded.push(current); current = " " + character; }
    else current += character;
  }
  folded.push(current);
  return folded.join("\r\n");
}
function stableCalendarUid(value: string): string {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16) + "@envtools.store";
}
export function buildCommunicationCalendarIcs(input: CommunicationInput): string {
  if (!EVENT_KINDS.has(input.kind)) throw new Error("Calendar export is available for meetings, agendas, invitations and reminders.");
  const start = getCommunicationEventInstant(clean(input.date), clean(input.timezone));
  const requestedDuration = clean(input.duration);
  const duration = requestedDuration ? Number(requestedDuration) : input.kind === "invitation" ? 60 : input.kind === "reminder" ? 15 : 30;
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) throw new Error("Set an event duration between 5 and 480 minutes.");
  if (input.kind === "invitation" && clean(input.rsvpBy)) {
    const rsvp = getCommunicationEventInstant(clean(input.rsvpBy), clean(input.timezone));
    if (rsvp.getTime() >= start.getTime()) throw new Error("The RSVP deadline must be earlier than the event.");
  }
  const end = new Date(start.getTime() + duration * 60000);
  const title = clean(input.subject) || kindLabel(input.kind);
  const description = [
    clean(input.purpose) ? "Purpose: " + clean(input.purpose) : "", clean(input.details),
    clean(input.items) ? "Agenda:\n" + clean(input.items) : "",
    clean(input.decisions) ? "Decisions:\n" + clean(input.decisions) : "",
    clean(input.actionItems) ? "Action items:\n" + clean(input.actionItems) : "",
    clean(input.nextStep) ? "Next step / RSVP: " + clean(input.nextStep) : "",
    clean(input.rsvpBy) ? "RSVP by: " + clean(input.rsvpBy) : "",
    clean(input.name) ? "Audience / attendees: " + clean(input.name) : "",
  ].filter(Boolean).join("\n\n");
  const utc = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const uid = stableCalendarUid([input.kind, title, clean(input.date), clean(input.timezone), clean(input.name)].join("|"));
  const lines = [
    "BEGIN:VCALENDAR", "PRODID:-//enV//Communication Tools//EN", "VERSION:2.0", "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH", "BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + utc(new Date()), "DTSTART:" + utc(start),
    "DTEND:" + utc(end), "X-WR-TIMEZONE:" + escapeIcsText(clean(input.timezone)),
    "SUMMARY:" + escapeIcsText(title), "DESCRIPTION:" + escapeIcsText(description),
    "LOCATION:" + escapeIcsText(clean(input.place)), "STATUS:CONFIRMED", "TRANSP:OPAQUE",
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15M", "DESCRIPTION:" + escapeIcsText(title),
    "END:VALARM", "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
function cleanHeader(value?: string): string {
  return clean(value).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ").trim();
}
function addressList(value?: string): string[] {
  return clean(value).split(/[;,]/).map((address) => address.trim()).filter(Boolean);
}

function formatCommunication(value: string, kind: Kind) {
  const cleaned = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "").trimStart())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return kindLabel(kind) + " formatter\n\nPaste your content above to format it.";
  return cleaned.split("\n\n").map((paragraph) => paragraph.split("\n").join("\n")).join("\n\n");
}

function agendaLines(value: string, durationValue: string | number) {
  const items = lines(value);
  if (!items.length) return ["1. Welcome and objectives", "2. Main discussion", "3. Decisions and next steps"].join("\n");
  const duration = Math.max(5, Math.min(480, Number(durationValue) || 30));
  const base = Math.floor(duration / items.length);
  let remainder = duration % items.length;
  let elapsed = 0;
  return items.map((item, index) => {
    const minutes = base + (remainder-- > 0 ? 1 : 0);
    const start = elapsed;
    elapsed += minutes;
    const stamp = (minute: number) => String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
    return (index + 1) + ". " + stamp(start) + "–" + stamp(elapsed) + "  " + item;
  }).join("\n");
}

function actionItemLines(value: string) {
  const parsed = lines(value).map((line, index) => {
    const [owner = "", task = "", due = ""] = line.split("|").map((part) => part.trim());
    return (index + 1) + ". " + (task || owner) + (owner && task ? " — Owner: " + owner : "") + (due ? " — Due: " + due : " — Due: Not set");
  });
  return parsed.length ? parsed.join("\n") : "1. [Owner] — [Action] — [Due date]";
}

function templateFor(kind: Kind) {
  const templates: Record<Kind, string> = {
    email: "To: [Name] <[email]>\nCc: [optional]\nSubject: [Specific subject]\n\nHello [Name],\n\n[Purpose in the first sentence]\n[Essential context and details]\n\n[Clear request or next step, with a date if relevant]\n\nBest regards,\n[Your name]",
    message: "To: [Person / group]\nChannel: [WhatsApp / Slack / Teams / other]\n\n[One clear update]\n[Context the reader needs]\n\nNext step: [Owner + action + timing]",
    sms: "[Name], [one clear message]. [Action and deadline].",
    meeting: "MEETING BRIEF\n[Meeting title]\nDate/time: [Date + time zone]\nDuration: [Minutes]\nLocation/link: [Place or meeting link]\nPurpose: [Outcome required]\nAttendees: [Names]\nPreparation: [Pre-read or materials]",
    agenda: "MEETING AGENDA\n[Meeting title] · [Date/time]\nObjective: [Decision or outcome]\n\n1. Welcome and context — [Owner] — [Minutes]\n2. [Topic] — [Owner] — [Minutes]\n3. [Topic] — [Owner] — [Minutes]\n4. Decisions and actions — [Owner] — [Minutes]",
    minutes: "MEETING MINUTES\nMeeting: [Title] · Date: [Date/time]\nAttendees: [Names]\n\nKey discussion\n[Concise outcome-focused notes]\n\nDecisions\n[Decision — rationale — decision owner]\n\nAction register\n[Owner] | [Action] | [Due date]\n\nNext review: [Date/time]",
    signature: "[Full name]\n[Role] · [Company]\n[Email] · [Phone]\n[Website]\n[Optional short disclaimer]",
    invitation: "YOU'RE INVITED\n[Event name]\nWhen: [Date, time and time zone]\nWhere: [Venue or link]\n\n[What guests can expect]\n\nPlease RSVP by [Date] via [Contact / link].\nAccess notes: [Optional]",
    announcement: "[Clear headline]\n\nWhat is happening: [Change / news]\nWho is affected: [Audience]\nWhen it takes effect: [Date/time]\nWhat you need to do: [Action]\nQuestions: [Contact / channel]",
    "thank-you": "Hello [Name],\n\nThank you for [specific reason]. [A personal detail that shows why it mattered].\n\n[Next step or continued appreciation, if relevant]\n\nWarm regards,\n[Your name]",
    "follow-up": "Subject: Follow-up — [Topic]\n\nHello [Name],\n\nI am following up on [previous conversation / date]. [Brief recap].\n\nCould you [specific next step] by [date]? Please let me know if another time works better.\n\nBest regards,\n[Your name]",
    reminder: "REMINDER — [Task / event]\nWhen: [Date, time and time zone]\nWhere: [Location / link]\n\n[Essential details]\nAction needed: [Action]\nBy: [Deadline]\nContact: [Name / channel]",
  };
  return templates[kind];
}

function planFor(input: CommunicationInput, title: string, recipient: string) {
  const purpose = clean(input.purpose) || "[Define the outcome]";
  const items = lines(input.items);
  switch (input.kind) {
    case "email":
      return "EMAIL PLAN\n\nAudience: " + recipient + "\nSubject: " + title + "\nGoal: " + purpose +
        "\n\nBefore sending\n1. Confirm every recipient and remove anyone who should not see the thread.\n2. Put the main point in the first two lines.\n3. Separate background from the request.\n4. State one owner and a specific response date.\n5. Check links, attachments and confidential information.";
    case "message":
      return "MESSAGE PLAN\n\nChannel: " + (clean(input.channel) || "Choose the right channel") + "\nAudience: " + recipient +
        "\nGoal: " + purpose + "\n\n1. Decide whether this belongs in a shared thread or a private message.\n2. Lead with the update or question.\n3. Include only context the audience needs.\n4. Mention only people who need to act.\n5. End with an owner or next step.";
    case "sms": {
      const sample = clean(input.details) || clean(input.purpose);
      const metrics = getSmsMetrics(sample);
      return "SMS PLAN\n\nAudience: " + recipient + "\nGoal: " + purpose +
        "\n\n1. Put the essential information first.\n2. Use one clear action and deadline.\n3. Remove links or details the recipient does not need.\n4. Confirm the recipient and consent before sending.\n5. Preview encoding and segment count before using an SMS provider.\n\nCurrent draft: " +
        (metrics.units ? metrics.encoding + " · " + metrics.units + " units · " + metrics.segments + " segment(s)" : "No draft text yet.");
    }
    case "meeting":
    case "agenda":
      return "MEETING PLAN\n\n" + title + "\nOutcome: " + purpose +
        "\nDate/time: " + (clean(input.date) || "[Set date and time]") +
        "\nDuration: " + (clean(input.duration) || "30") + " minutes\n\nPreparation\n1. Invite only people needed for the outcome.\n2. Share the agenda and pre-read in advance.\n3. Give each topic an owner and timebox.\n4. Reserve time for decisions and risks.\n5. End with named actions and deadlines.\n\nAgenda\n" + agendaLines(input.items || "", input.duration || 30);
    case "minutes":
      return "MINUTES PLAN\n\nMeeting: " + title + "\nPurpose: " + purpose +
        "\n\nCapture only the record people need:\n1. Attendance and apologies.\n2. Concise discussion summary by agenda item.\n3. Decisions, rationale and decision owner.\n4. Action items with owner and due date.\n5. Next review date and unresolved issues.\n\nAction item format: Owner | Task | Due date\n" + (items.length ? items.join("\n") : "[Add action items]");
    case "signature":
      return "SIGNATURE PLAN\n\n1. Use the same professional name and role used in your correspondence.\n2. Add one reliable contact route and one useful website.\n3. Keep the design compact and readable on mobile.\n4. Use a short disclaimer only when it is actually required.\n5. Test both the HTML and plain-text versions.";
    case "invitation":
      return "INVITATION PLAN\n\nEvent: " + title + "\nAudience: " + recipient +
        "\nPurpose: " + purpose +
        "\n\n1. State the event and who should attend.\n2. Confirm the exact date, local time and time zone.\n3. Include venue or working meeting link and access notes.\n4. Give an RSVP deadline and response route.\n5. Send a reminder only through a connected, consented service.";
    case "announcement":
      return "ANNOUNCEMENT PLAN\n\nSubject: " + title + "\nAudience: " + recipient + "\nPurpose: " + purpose +
        "\n\n1. Put the change or news in the headline.\n2. Explain who is affected and what changes.\n3. State the effective date and any transition period.\n4. Give the required action and support contact.\n5. Use one source of truth for later updates.";
    case "thank-you":
      return "THANK-YOU PLAN\n\nRecipient: " + recipient + "\nReason: " + purpose +
        "\n\n1. Name the specific contribution.\n2. Explain its real impact.\n3. Add a personal detail rather than generic praise.\n4. Offer a meaningful next step only when appropriate.\n5. Keep the message timely and sincere.";
    case "follow-up":
      return "FOLLOW-UP PLAN\n\nRecipient: " + recipient + "\nTopic: " + title + "\nGoal: " + purpose +
        "\n\n1. Refer to the prior exchange and date.\n2. Summarize the open point in one sentence.\n3. Ask one answerable question.\n4. Offer a reasonable deadline or alternative.\n5. Track the next follow-up so the recipient is not repeatedly chased.";
    case "reminder":
      return "REMINDER PLAN\n\nFor: " + recipient + "\nTask: " + title + "\nGoal: " + purpose +
        "\n\n1. Confirm the correct date, time zone and location.\n2. Put the action or preparation first.\n3. Include any materials or access link.\n4. Choose a sensible notice period.\n5. Schedule delivery only in a connected calendar or messaging service.";
  }
}

export function buildCommunication(input: CommunicationInput) {
  const kind = input.kind;
  const action = input.action;
  const recipient = input.kind === "email"
    ? cleanHeader(input.name) || cleanHeader(input.audience) || "[Recipient]"
    : clean(input.name) || clean(input.audience) || "[Recipient]";
  const title = clean(input.subject) || kindLabel(kind);
  const purpose = clean(input.purpose);
  const details = clean(input.details) || purpose;
  const date = clean(input.date) || "[Date / time]";
  const place = clean(input.place) || "[Location / channel]";
  const tone = clean(input.tone) || "professional";

  if (action === "template") return templateFor(kind);
  if (action === "formatter") return formatCommunication(input.details || input.purpose || "", kind);
  if (action === "planner") return planFor(input, title, recipient);

  switch (kind) {
    case "email": {
      const displayName = cleanHeader(input.name) || cleanHeader(input.audience);
      const emailAddress = cleanHeader(input.email);
      const greetingName = displayName || "there";
      const greeting = tone === "friendly" || tone === "warm" ? "Hi " + greetingName + "," : "Hello " + greetingName + ",";
      const closing = tone === "warm" ? "With appreciation," : tone === "friendly" ? "Thanks," : "Best regards,";
      const toRecipient = emailAddress ? (displayName ? displayName + " <" + emailAddress + ">" : emailAddress) : recipient;
      const headers = [
        "To: " + toRecipient,
        clean(input.cc) ? "Cc: " + cleanHeader(input.cc) : "",
        clean(input.bcc) ? "Bcc: " + cleanHeader(input.bcc) : "",
        "Subject: " + cleanHeader(title),
      ].filter(Boolean);
      const body = details || "[Add the main information]";
      const next = clean(input.nextStep) ? "\n\nNext step: " + clean(input.nextStep) : "";
      return (action === "builder" ? headers.join("\n") + "\n\n" : "Subject: " + title + "\n\n") +
        greeting + "\n\n" + body + next + "\n\n" + closing + "\n[Your name]";
    }
    case "message": {
      const message = details || "[Write the update or question]";
      const next = clean(input.nextStep) ? "\n\nNext step: " + clean(input.nextStep) : "";
      if (action === "builder") {
        return "To: " + recipient + "\nChannel: " + (clean(input.channel) || "General") +
          "\nTopic: " + title + "\n\n" + message + next;
      }
      return message + next;
    }
    case "sms": {
      const greeting = recipient !== "[Recipient]" ? recipient + ", " : "";
      const message = details || "[Write one clear message]";
      return greeting + message + (clean(input.nextStep) ? " " + clean(input.nextStep) : "");
    }
    case "meeting":
      return "MEETING BRIEF\n" + title + "\n\nDate/time: " + date +
        (clean(input.timezone) ? " (" + clean(input.timezone) + ")" : "") +
        "\nDuration: " + (clean(input.duration) || "30") + " minutes\nLocation/link: " + place +
        "\nAttendee(s): " + recipient + "\nPurpose / outcome: " + (purpose || "[State the decision or outcome]") +
        "\nPreparation: " + (details || "[Add pre-read or preparation notes]");
    case "agenda":
      return "AGENDA\n" + title + "\nDate/time: " + date + (clean(input.timezone) ? " (" + clean(input.timezone) + ")" : "") + "\nLocation: " + place +
        "\nObjective: " + (purpose || "[Outcome required]") + "\n\n" +
        agendaLines(input.items || details, input.duration || 30) +
        "\n\nClose: confirm decisions, owners and due dates.";
    case "minutes":
      return "MEETING MINUTES\n" + title + "\nDate/time: " + date + (clean(input.timezone) ? " (" + clean(input.timezone) + ")" : "") +
        "\nLocation: " + place + "\nAttendees: " + recipient +
        "\n\nDiscussion summary\n" + (details || "[Summarize outcomes by agenda item]") +
        "\n\nDecisions\n" + (lines(input.decisions).map((item, index) => (index + 1) + ". " + item).join("\n") || "[Record each decision and its owner]") +
        "\n\nAction register\n" + actionItemLines(input.actionItems || input.items || "") +
        "\n\nNext review: " + (clean(input.nextStep) || "[Date / owner]");
    case "signature": {
      const identity = [recipient, clean(input.role), clean(input.company)].filter(Boolean).join(" · ");
      const contacts = [clean(input.email), clean(input.phone), clean(input.website)].filter(Boolean);
      return [identity, ...contacts, clean(input.details)].filter(Boolean).join("\n");
    }
    case "invitation":
      return "YOU'RE INVITED\n" + title + "\n\nWhen: " + date +
        (clean(input.timezone) ? " (" + clean(input.timezone) + ")" : "") +
        "\nWhere: " + place + "\n\n" + (details || "[What guests can expect]") +
        "\n\nPlease RSVP by: " + (clean(input.rsvpBy) || "[RSVP deadline]") +
        (clean(input.nextStep) ? "\nRSVP: " + clean(input.nextStep) : "\nRSVP: [Response link or contact]") +
        "\n\nPlease share any access or dietary requirements with the organiser.";
    case "announcement":
      return "ANNOUNCEMENT\n" + title + "\n\nWhat is happening\n" + (details || "[Explain the update]") +
        "\n\nWho is affected\n" + recipient +
        "\n\nEffective date\n" + date +
        "\n\nWhat to do next\n" + (clean(input.nextStep) || purpose || "[State the required action]") +
        (clean(input.place) ? "\n\nQuestions / channel\n" + clean(input.place) : "");
    case "thank-you":
      return (tone === "friendly" ? "Hi " : "Dear ") + recipient + ",\n\nThank you for " +
        (purpose || "[the specific contribution]") + ".\n\n" +
        (details || "[Describe why it mattered and the impact it had.]") +
        (clean(input.nextStep) ? "\n\n" + clean(input.nextStep) : "") +
        "\n\n" + (tone === "professional" ? "With sincere thanks," : "Warm regards,") + "\n[Your name]";
    case "follow-up":
      return "Subject: Follow-up — " + title + "\n\nHello " + recipient + "," +
        "\n\nI am following up on " + (purpose || "[our previous conversation / topic]") + "." +
        "\n\n" + (details || "[Briefly recap the open point.]") +
        "\n\nCould you " + (clean(input.nextStep) || "[confirm the next step]") +
        (date !== "[Date / time]" ? " by " + date : " when convenient") +
        "?\n\nBest regards,\n[Your name]";
    case "reminder":
      return "REMINDER — " + title + "\nFor: " + recipient + "\nWhen: " + date +
        (clean(input.timezone) ? " (" + clean(input.timezone) + ")" : "") +
        "\nWhere: " + place + "\n\n" + (details || "[Essential details]") +
        "\n\nAction needed: " + (clean(input.nextStep) || purpose || "[State the action]") +
        "\n\nPlease contact the organiser if anything has changed.";
  }
}

export function communicationQualityChecks(input: CommunicationInput, output: string): string[] {
  const checks: string[] = [];
  const kind = input.kind;
  if (kind !== "signature" && input.action !== "template" && input.action !== "formatter" && input.action !== "planner" && !clean(input.details) && !clean(input.purpose)) {
    checks.push("Add the message details or purpose so the draft contains your real information.");
  }
  if (kind === "email") {
    if (!clean(input.email) && !clean(input.name) && !clean(input.audience)) checks.push("Add a recipient before using this email.");
    if (clean(input.email) && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(clean(input.email))) checks.push("Check the recipient email address; it does not look complete.");
    if (!clean(input.subject)) checks.push("Add a specific subject so the email is easy to find later.");
    const addressPattern = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
    const ccAddresses = addressList(input.cc);
    const bccAddresses = addressList(input.bcc);
    if ([...ccAddresses, ...bccAddresses].some((address) => !addressPattern.test(address))) checks.push("Check every Cc and Bcc address; separate addresses with commas or semicolons.");
    const toAddress = clean(input.email) || (addressPattern.test(clean(input.name)) ? clean(input.name) : "");
    const allAddresses = [toAddress, ...ccAddresses, ...bccAddresses].filter(Boolean).map((address) => address.toLowerCase());
    if (new Set(allAddresses).size !== allAddresses.length) checks.push("An address appears more than once across To, Cc and Bcc; review recipient visibility.");
    if ([input.email, input.cc, input.bcc, input.subject].some((value) => /[\r\n\u0000-\u001f\u007f]/.test(String(value ?? "")))) checks.push("Remove line breaks and control characters from email headers before using this draft.");
  }
  if (kind === "sms" && output.trim()) {
    const metrics = getSmsMetrics(output);
    if (metrics.segments > 3) checks.push("This draft uses " + metrics.segments + " SMS segments. Shorten it or confirm the provider's segment and cost rules.");
    if (metrics.encoding === "UCS-2") checks.push("This message uses UCS-2 because of its characters; the single-message limit is 70 units instead of 160 GSM-7 units.");
  }
  if (kind === "minutes" && !clean(input.actionItems) && !clean(input.items)) checks.push("Add named owners and due dates to the action register.");
  if (kind === "minutes" && !clean(input.nextStep)) checks.push("Add the next review date or review owner.");
  if (EVENT_KINDS.has(kind)) {
    if (!clean(input.date)) checks.push("Add the event date and local time.");
    else {
      try {
        const start = getCommunicationEventInstant(clean(input.date), clean(input.timezone));
        if (kind === "invitation" && clean(input.rsvpBy)) {
          const rsvp = getCommunicationEventInstant(clean(input.rsvpBy), clean(input.timezone));
          if (rsvp.getTime() >= start.getTime()) checks.push("The RSVP deadline must be earlier than the event.");
        }
      } catch (error) {
        checks.push(error instanceof Error ? error.message : "Check the event date, time and time zone.");
      }
    }
    if (!clean(input.timezone)) checks.push("Add the time zone so people in different regions see the intended local time.");
    const duration = clean(input.duration);
    if (duration && (!Number.isInteger(Number(duration)) || Number(duration) < 5 || Number(duration) > 480)) checks.push("Set an event duration between 5 and 480 minutes.");
    if ((kind === "meeting" || kind === "agenda") && !duration) checks.push("Set a duration so agenda timeboxes can be checked.");
  }
  if (kind === "invitation" && !clean(input.rsvpBy)) checks.push("Set an RSVP deadline.");
  if (kind === "signature" && !clean(input.email) && !clean(input.phone) && !clean(input.website)) checks.push("Add at least one way for people to contact you.");
  if (kind === "signature" && clean(input.email) && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(clean(input.email))) checks.push("Check the email address in this signature.");
  if (kind === "announcement" && !clean(input.date)) checks.push("Add the effective date, or state that the change takes effect immediately.");
  if (kind === "announcement" && !clean(input.nextStep)) checks.push("State what the audience should do next, or explicitly say no action is required.");
  return [...new Set(checks)];
}

export function buildSignatureHtml(input: CommunicationInput) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  const escape = (value: string) => value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
  const values = [
    clean(input.name) || clean(input.audience),
    [clean(input.role), clean(input.company)].filter(Boolean).join(" · "),
    clean(input.email), clean(input.phone), clean(input.website), clean(input.details),
  ].filter(Boolean);
  return "<!doctype html>\n<html><head><meta charset=\"utf-8\"><title>Email signature</title></head><body>\n" +
    "<table cellpadding=\"0\" cellspacing=\"0\" role=\"presentation\"><tr><td>" +
    values.map((value, index) => "<div style=\"font-family:Arial,sans-serif;color:#222;line-height:1.5;" +
      (index === 0 ? "font-weight:700;" : "") + "\">" + escape(value) + "</div>").join("\n") +
    "</td></tr></table>\n</body></html>";
}
