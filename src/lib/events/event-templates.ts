export type EventOperation = "agenda" | "schedule" | "rsvp" | "check-in";
export type EventField = {
  name: string;
  label: string;
  type: "text" | "textarea";
  defaultValue: string;
};
export type EventValues = Record<string, string>;

type EventTemplate = { operation: EventOperation; theme: string };

const agendaThemes = ["birthday", "concert", "conference", "dinner", "fundraiser", "graduation", "launch", "party", "sports-event", "webinar", "wedding", "workshop"];
const scheduleThemes = ["birthday", "concert", "conference", "dinner", "fundraiser", "graduation", "launch", "meeting", "party", "sports-event", "webinar", "wedding", "workshop"];
const pageThemes = ["birthday", "concert", "conference", "dinner", "fundraiser", "graduation", "launch", "meeting", "party", "sports-event", "webinar", "wedding", "workshop"];

const templates: Record<string, EventTemplate> = {};
const titleCase = (slug: string) => slug.split("-").map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join(" ");
for (const theme of agendaThemes) templates[`${theme}-agenda-generator`] = { operation: "agenda", theme: titleCase(theme) };
for (const theme of scheduleThemes) templates[`${theme}-schedule-builder`] = { operation: "schedule", theme: titleCase(theme) };
for (const theme of pageThemes) {
  templates[`${theme}-rsvp-page`] = { operation: "rsvp", theme: titleCase(theme) };
  templates[`${theme}-check-in-page`] = { operation: "check-in", theme: titleCase(theme) };
}

const clean = (value: string | undefined, fallback: string) => (value ?? "").trim() || fallback;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));

export function eventTemplateForTool(toolId: string): EventTemplate | undefined {
  return Object.hasOwn(templates, toolId) ? templates[toolId] : undefined;
}

export function isEventTemplateTool(toolId: string): boolean {
  return Object.hasOwn(templates, toolId);
}

export function eventFieldsForTool(toolId: string): EventField[] {
  const template = eventTemplateForTool(toolId);
  if (!template) return [];
  if (template.operation === "agenda" || template.operation === "schedule") {
    const label = template.operation === "agenda" ? "Agenda" : "Schedule";
    return [
      { name: "title", label: "Title", type: "text", defaultValue: `Event ${label.toLowerCase()}` },
      { name: "dateTime", label: "Date / time (optional)", type: "text", defaultValue: "" },
      { name: "location", label: "Location (optional)", type: "text", defaultValue: "" },
      { name: "items", label: "Agenda items (one per line)", type: "textarea", defaultValue: "Welcome\nMain activity\nBreak\nClosing" },
    ];
  }
  if (template.operation === "rsvp") {
    return [
      { name: "title", label: "Page title", type: "text", defaultValue: `${template.theme} event` },
      { name: "dateTime", label: "Date / time (optional)", type: "text", defaultValue: "" },
      { name: "location", label: "Location (optional)", type: "text", defaultValue: "" },
      { name: "body", label: "Event details", type: "textarea", defaultValue: `You're invited to the ${template.theme.toLowerCase()} event.` },
      { name: "contact", label: "Organizer / RSVP contact", type: "text", defaultValue: "the event organizer" },
    ];
  }
  return [
    { name: "title", label: "Page title", type: "text", defaultValue: `${template.theme} check-in` },
    { name: "dateTime", label: "Date / time (optional)", type: "text", defaultValue: "" },
    { name: "location", label: "Location (optional)", type: "text", defaultValue: "" },
    { name: "body", label: "Event details", type: "textarea", defaultValue: `Welcome to the ${template.theme.toLowerCase()} event.` },
    { name: "guest", label: "Guest name", type: "text", defaultValue: "Guest" },
  ];
}

export function initialEventValues(toolId: string): EventValues {
  return Object.fromEntries(eventFieldsForTool(toolId).map((field) => [field.name, field.defaultValue]));
}

export function eventTemplateFileName(toolId: string): string {
  return `env-${toolId}.${eventTemplateForTool(toolId)?.operation === "rsvp" || eventTemplateForTool(toolId)?.operation === "check-in" ? "html" : "txt"}`;
}

export function generateEventTemplate(toolId: string, values: EventValues): string {
  const template = eventTemplateForTool(toolId);
  if (!template) throw new Error(`Unsupported event template: ${toolId}`);
  if (template.operation === "agenda" || template.operation === "schedule") {
    const title = clean(values.title, template.operation === "agenda" ? "Event agenda" : "Event schedule");
    const items = clean(values.items, "Welcome\nMain activity\nBreak\nClosing").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const details = [
      values.dateTime?.trim() ? `Date / time: ${values.dateTime.trim()}` : "",
      values.location?.trim() ? `Location: ${values.location.trim()}` : "",
    ].filter(Boolean);
    const header = `${template.theme} ${template.operation}`;
    return `${header}\n\n${title}${details.length ? `\n${details.join("\n")}` : ""}\n\n${items.map((item, index) => `${index + 1}. ${item}`).join("\n")}`;
  }

  const title = escapeHtml(clean(values.title, `${template.theme} event`));
  const details = escapeHtml(clean(values.body, `You're invited to the ${template.theme.toLowerCase()} event.`));
  const date = values.dateTime?.trim() ? `<p><strong>Date / time:</strong> ${escapeHtml(values.dateTime.trim())}</p>` : "";
  const location = values.location?.trim() ? `<p><strong>Location:</strong> ${escapeHtml(values.location.trim())}</p>` : "";
  const eventLabel = escapeHtml(template.theme);
  if (template.operation === "rsvp") {
    const contact = escapeHtml(clean(values.contact, "the event organizer"));
    return `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>\n<body><main><h1>${title}</h1><p>${details}</p>${date}${location}<section aria-labelledby="rsvp-heading"><h2 id="rsvp-heading">How to RSVP</h2><p>Contact ${contact} to respond. This static page does not collect or store RSVPs.</p></section><p>Event type: ${eventLabel}</p></main></body>\n</html>`;
  }
  const guest = escapeHtml(clean(values.guest, "Guest"));
  return `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>\n<body><main><h1>${title}</h1><p>${details}</p>${date}${location}<section aria-labelledby="checkin-heading"><h2 id="checkin-heading">Check-in information</h2><p>Guest: ${guest}</p><p>Please check in with event staff on arrival. This static page does not verify or record arrivals.</p></section><p>Event type: ${eventLabel}</p></main></body>\n</html>`;
}
