/** @typedef {import("../types/tool").ToolMeta} ToolMeta */

/**
 * Catalogue categories whose generated long-tail records still reach a generic
 * heuristic renderer. Those records must remain non-indexable until a dedicated
 * tool contract and output implementation replaces the fallback.
 */
export const GENERIC_WORKFLOW_CATEGORIES = new Set([
  "events",
  "celebrations",
  "food",
  "travel",
  "photography",
]);

const AGENDA_THEMES = [
  "birthday", "concert", "conference", "dinner", "fundraiser", "graduation",
  "launch", "party", "sports-event", "webinar", "wedding", "workshop",
];
const SCHEDULE_THEMES = [
  "birthday", "concert", "conference", "dinner", "fundraiser", "graduation",
  "launch", "meeting", "party", "sports-event", "webinar", "wedding", "workshop",
];
const PAGE_THEMES = [
  "birthday", "concert", "conference", "dinner", "fundraiser", "graduation",
  "launch", "meeting", "party", "sports-event", "webinar", "wedding", "workshop",
];

const DEDICATED_EVENT_TEMPLATE_IDS = new Set([
  ...AGENDA_THEMES.map((theme) => `${theme}-agenda-generator`),
  ...SCHEDULE_THEMES.map((theme) => `${theme}-schedule-builder`),
  ...PAGE_THEMES.flatMap((theme) => [
    `${theme}-rsvp-page`,
    `${theme}-check-in-page`,
  ]),
]);

/** @param {ToolMeta} tool */
export function isGenericWorkflowPlaceholder(tool) {
  return GENERIC_WORKFLOW_CATEGORIES.has(tool.category)
    && tool.id !== "camera-studio"
    && !isDedicatedEventTemplateTool(tool);
}

/** @param {ToolMeta} tool */
export function isDedicatedEventTemplateTool(tool) {
  return tool.category === "events" && DEDICATED_EVENT_TEMPLATE_IDS.has(tool.id);
}

/** @param {ToolMeta} tool */
export function normalizeGenericWorkflowTool(tool) {
  if (!isGenericWorkflowPlaceholder(tool)) return tool;

  return {
    ...tool,
    status: "planned",
    clientSide: true,
    requiresBackend: false,
    requiresAuth: false,
  };
}

/** @template {ToolMeta} T @param {T[]} tools @returns {T[]} */
export function applyGenericWorkflowPolicy(tools) {
  return tools.map(normalizeGenericWorkflowTool);
}
