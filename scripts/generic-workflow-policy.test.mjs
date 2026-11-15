import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyGenericWorkflowPolicy,
  isDedicatedCelebrationTool,
  isDedicatedEventTemplateTool,
  isGenericWorkflowPlaceholder,
  normalizeGenericWorkflowTool,
} from "../src/lib/generic-workflow-policy.mjs";

function tool(id, category, overrides = {}) {
  return {
    id,
    name: id,
    slug: id,
    description: "A generated catalogue task used to verify workflow publication policy.",
    category,
    keywords: [category, id],
    tags: [category],
    icon: "Wand2",
    popularity: 0,
    featured: false,
    clientSide: true,
    requiresBackend: false,
    requiresAuth: false,
    status: "active",
    related: [],
    engine: { type: "custom", id },
    ...overrides,
  };
}

test("generic cross-category workflow placeholders are planned and non-indexable", () => {
  const categories = ["events", "celebrations", "food", "travel", "photography"];
  for (const category of categories) {
    const candidate = tool(category + "-generic-planner", category);
    assert.equal(isGenericWorkflowPlaceholder(candidate), true);
    const normalized = normalizeGenericWorkflowTool(candidate);
    assert.equal(normalized.status, "planned", category);
    assert.equal(normalized.clientSide, true, category);
    assert.equal(normalized.requiresBackend, false, category);
    assert.equal(normalized.requiresAuth, false, category);
    assert.equal(candidate.status, "active", "normalization must not mutate the source record");
  }
});


test("all 93 implemented Celebrations operations remain active and outside generic fallback policy", () => {
  const occasions = [
    "birthday", "anniversary", "graduation", "valentine", "christmas", "new-year",
    "congratulations", "thank-you", "appreciation", "farewell", "achievement", "party",
  ];
  const experiences = [
    "page-generator", "interactive-card", "invitation-generator", "countdown",
    "memory-page", "reveal-page", "quiz-generator", "surprise-page",
  ];
  const unavailable = new Set([
    "birthday-countdown", "valentine-reveal-page", "appreciation-reveal-page",
  ]);
  const ids = occasions.flatMap((occasion) =>
    experiences.map((experience) => occasion + "-" + experience).filter((id) => !unavailable.has(id)),
  );
  assert.equal(ids.length, 93);
  assert.equal(new Set(ids).size, 93);

  for (const id of ids) {
    const candidate = tool(id, "celebrations", { engine: { type: "custom", id } });
    assert.equal(isDedicatedCelebrationTool(candidate), true, id);
    assert.equal(isGenericWorkflowPlaceholder(candidate), false, id);
    assert.equal(normalizeGenericWorkflowTool(candidate).status, "active", id);
  }

  const unsupported = tool("birthday-video-generator", "celebrations");
  assert.equal(isDedicatedCelebrationTool(unsupported), false);
  assert.equal(isGenericWorkflowPlaceholder(unsupported), true);
  assert.equal(normalizeGenericWorkflowTool(unsupported).status, "planned");
});

test("dedicated event templates remain active and are excluded from generic-placeholder checks", () => {
  const ids = [
    "birthday-agenda-generator",
    "conference-schedule-builder",
    "wedding-rsvp-page",
    "workshop-check-in-page",
    "sports-event-agenda-generator",
  ];
  for (const id of ids) {
    const candidate = tool(id, "events");
    assert.equal(isDedicatedEventTemplateTool(candidate), true, id);
    assert.equal(isGenericWorkflowPlaceholder(candidate), false, id);
    assert.equal(normalizeGenericWorkflowTool(candidate).status, "active", id);
  }
});

test("similarly named but unsupported event variants are not promoted", () => {
  const unsupported = [
    tool("meeting-agenda-generator", "events"),
    tool("birthday-ticket-mockup", "events"),
    tool("birthday-video-generator", "celebrations"),
    tool("meal-planner", "food"),
    tool("trip-itinerary-planner", "travel"),
    tool("passport-photo-cropper", "photography"),
  ];
  const normalized = applyGenericWorkflowPolicy(unsupported);
  assert.deepEqual(normalized.map((item) => item.status), [
    "planned", "planned", "planned", "planned", "planned", "planned",
  ]);
});

test("compact runtime summaries are normalized without engine metadata", () => {
  const compact = {
    id: "meal-planner",
    name: "Meal Planner",
    slug: "meal-planner",
    description: "Generated cross-category workflow summary.",
    category: "food",
    status: "active",
  };
  assert.equal(isGenericWorkflowPlaceholder(compact), true);
  assert.equal(normalizeGenericWorkflowTool(compact).status, "planned");
  assert.equal(applyGenericWorkflowPolicy([compact])[0].status, "planned");

  const cameraStudio = {
    id: "camera-studio",
    name: "Camera Studio",
    slug: "camera-studio",
    category: "photography",
    status: "active",
  };
  assert.equal(isGenericWorkflowPlaceholder(cameraStudio), false);
  assert.equal(normalizeGenericWorkflowTool(cameraStudio).status, "active");
});

test("native catalog exporter applies publication policy while matrix uses the canonical runtime registry", async () => {
  const { readFile } = await import("node:fs/promises");
  const [nativeExporter, matrixExporter] = await Promise.all([
    readFile(new URL("./export-native-catalog.mjs", import.meta.url), "utf8"),
    readFile(new URL("./export-native-execution-matrix.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(nativeExporter, /applyGenericWorkflowPolicy\(tools\)/);
  assert.match(nativeExporter, /const canonicalRuntimeTools = getAllTools\(\)/);
  assert.match(matrixExporter, /const catalog = getAllTools\(\)\.slice\(\)/);
  assert.match(matrixExporter, /Runtime registry contains duplicate IDs/);
});

test("native coverage and related-catalog audits use canonical availability sources", async () => {
  const { readFile } = await import("node:fs/promises");
  const [coverage, related] = await Promise.all([
    readFile(new URL("./check-native-coverage.mjs", import.meta.url), "utf8"),
    readFile(new URL("./check-native-related.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(coverage, /const catalog = getAllTools\(\)\.slice\(\)/);
  assert.match(coverage, /File & Folder Compare default native workflow/);
  assert.match(related, /applyGenericWorkflowPolicy\(baseWebTools\)/);
});

test("tools outside the generic workflow categories are preserved unchanged", () => {
  const source = [
    tool("password-generator", "security"),
    tool("temperature-converter", "converters", {
      engine: { type: "converter", system: "temperature" },
    }),
  ];
  const normalized = applyGenericWorkflowPolicy(source);
  assert.deepEqual(normalized, source);
  assert.notEqual(normalized, source, "policy returns a new array without mutating its input array");
});
