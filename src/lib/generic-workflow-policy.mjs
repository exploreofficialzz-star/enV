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


const CELEBRATION_OCCASIONS = [
  "birthday", "anniversary", "graduation", "valentine", "christmas", "new-year",
  "congratulations", "thank-you", "appreciation", "farewell", "achievement", "party",
];
const CELEBRATION_EXPERIENCES = [
  "page-generator", "interactive-card", "invitation-generator", "countdown",
  "memory-page", "reveal-page", "quiz-generator", "surprise-page",
];
const UNAVAILABLE_CELEBRATION_COMBINATIONS = new Set([
  "birthday-countdown",
  "valentine-reveal-page",
  "appreciation-reveal-page",
]);
const DEDICATED_CELEBRATION_TOOL_IDS = new Set(
  CELEBRATION_OCCASIONS.flatMap((occasion) =>
    CELEBRATION_EXPERIENCES
      .map((experience) => occasion + "-" + experience)
      .filter((id) => !UNAVAILABLE_CELEBRATION_COMBINATIONS.has(id)),
  ),
);

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
    && !isDedicatedEventTemplateTool(tool)
    && !isDedicatedCelebrationTool(tool);
}

export function isDedicatedCelebrationTool(tool) {
  return tool.category === "celebrations" && DEDICATED_CELEBRATION_TOOL_IDS.has(tool.id);
}

/** @param {ToolMeta} tool */
export function isDedicatedEventTemplateTool(tool) {
  return tool.category === "events" && DEDICATED_EVENT_TEMPLATE_IDS.has(tool.id);
}

/** @param {ToolMeta} tool @returns {ToolMeta} */
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

/** @param {ToolMeta[]} tools @returns {ToolMeta[]} */
export function applyGenericWorkflowPolicy(tools) {
  return tools.map(normalizeGenericWorkflowTool);
}
