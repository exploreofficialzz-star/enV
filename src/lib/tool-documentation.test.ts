import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { CATEGORIES } from "@/data/categories";
import type { ToolMeta } from "@/types/tool";
import { getSearchableTools, getToolsByCategory, getToolById, getToolByPath } from "@/lib/registry";
import { developerModeForLegacySlug, developerStudioForLegacySlug } from "@/lib/developer-studios-catalog";
import { runDeveloperStudio } from "@/lib/engines/developer-studios";
import { canonicalSeoTools, isIndexableTool } from "@/lib/seo-metadata";
import { getToolDocumentation, toolTaskGuidanceSource, toolDocumentationSummary } from "@/lib/tool-documentation";
import { groupToolsBySubcategory } from "@/lib/category-tool-groups";
import { parseMarketingToolId } from "@/components/engines/marketing-engine-utils";
import { parseSocialToolId } from "@/components/engines/social-engine-utils";
import { parseInteractiveToolId } from "@/components/engines/interactive-engine-utils";
import { parseGamingToolId } from "@/components/engines/gaming-engine-utils";
import { parseCareerToolId } from "@/components/engines/career-engine-utils";
import { parseRelationshipToolId } from "@/components/engines/relationship-engine-utils";
import { parseWebDesignToolId } from "@/components/engines/webdesign-engine-utils";
import { parseEcommerceToolId } from "@/components/engines/ecommerce-engine-utils";
import { parseStreamingToolId } from "@/components/engines/streaming-engine-utils";
import { parseToolId as parseCommunicationToolId } from "@/components/engines/communication-engine-utils";

const TOOL_ENGINE_SOURCE = readFileSync(
  new URL("../components/tools/tool-engine.tsx", import.meta.url),
  "utf8",
);

function switchEngineRenderers(source: string): Map<string, string> {
  const switchStart = source.indexOf("switch (tool.engine.type)");
  if (switchStart < 0) return new Map();
  const open = source.indexOf("{", switchStart);
  if (open < 0) return new Map();

  let depth = 0;
  let close = -1;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) {
      close = index;
      break;
    }
  }
  if (close < 0) return new Map();

  const renderers = new Map<string, string>();
  let pendingCases: string[] = [];
  for (const line of source.slice(open + 1, close).split("\n")) {
    for (const match of line.matchAll(/case\s+"([^"]+)"\s*:/g)) {
      pendingCases.push(match[1]);
    }
    const returnedComponent = line.match(/\breturn\s+<([A-Z][A-Za-z0-9]*)\b/);
    if (returnedComponent && pendingCases.length) {
      for (const engineType of pendingCases) {
        if (engineType !== "custom") renderers.set(engineType, returnedComponent[1]);
      }
      pendingCases = [];
    }
  }
  return renderers;
}

const ENGINE_RENDERERS = switchEngineRenderers(TOOL_ENGINE_SOURCE);
const LAZY_ENGINE_COMPONENTS = new Set(
  [...TOOL_ENGINE_SOURCE.matchAll(/const\s+([A-Z][A-Za-z0-9]*)\s*=\s*lazy\(/g)]
    .map((match) => match[1]),
);

const DIRECT_TOOL_RENDERERS: Record<string, string> = {
  "smartphone-prototype-lab": "SmartphonePrototypeLabEngine",
  "scene-studio": "SceneStudioEngine",
  "camera-studio": "CameraStudioEngine",
  "a-book": "ABookEngine",
  "zip-any-file": "ZipArchiveEngine",
  "music-downloader": "MusicDownloaderEngine",
  "song-metadata-analyzer": "AiMusicDataSandbox",
  "qr-payload-inspector": "BarcodeReaderEngine",
  "flashcard-generator": "DocumentEngine",
  "password-generator": "SecurityEngine",
  "password-strength-checker": "SecurityEngine",
};

const CATEGORY_RENDERERS: Record<string, string> = {
  mockups: "MockupsCategoryEngine",
  screenshots: "ScreenshotEngine",
  ecommerce: "EcommerceEngine",
  accessibility: "AccessibilityEngine",
  celebrations: "CelebrationEngine",
};

const CUSTOM_ENGINE_ID_RENDERERS: Record<string, string> = {
  "image-comparison": "ImageToolsEngine",
  "image-screenshot": "ImageToolsEngine",
  "image-print-layout": "ImageToolsEngine",
  transcription: "TranscriptionEngine",
};

const CUSTOM_CATEGORY_RENDERERS: Record<string, string> = {
  productivity: "ProductivityEngine",
  personal: "PersonalEngine",
  communication: "CommunicationEngine",
  streaming: "StreamingEngine",
  marketing: "MarketingEngine",
  webdesign: "WebDesignEngine",
  career: "CareerEngine",
  relationships: "RelationshipEngine",
  interactive: "InteractiveEngine",
  gaming: "GamingEngine",
  social: "SocialEngine",
};

function runtimeRendererCandidates(tool: ToolMeta): string[] {
  const direct = DIRECT_TOOL_RENDERERS[tool.id];
  if (direct) return [direct];

  const categoryRenderer = CATEGORY_RENDERERS[tool.category];
  if (categoryRenderer) return [categoryRenderer];

  if (tool.category === "developer" && tool.tags.includes("developer-studio")) {
    return [tool.slug === "ux-ui-studio" ? "UxUiStudioEngine" : "DeveloperStudioEngine"];
  }
  if (tool.category === "files" && tool.engine.type === "custom") {
    return ["FileWorkspaceEngine"];
  }
  if (tool.requiresBackend && tool.engine.type === "custom") {
    return ["BackendToolEngine"];
  }
  if (tool.engine.type === "custom") {
    const byEngineId = CUSTOM_ENGINE_ID_RENDERERS[tool.engine.id ?? ""];
    if (byEngineId) return [byEngineId];
    if (tool.category === "events") return ["EventTemplateEngine"];
    const byCategory = CUSTOM_CATEGORY_RENDERERS[tool.category];
    return byCategory ? [byCategory] : [];
  }

  const renderer = ENGINE_RENDERERS.get(tool.engine.type);
  return renderer ? [renderer] : [];
}

function hasImportedRuntimeRenderer(tool: ToolMeta): boolean {
  const candidates = runtimeRendererCandidates(tool);
  if (!candidates.length) return false;

  return candidates.every((component) => {
    if (!LAZY_ENGINE_COMPONENTS.has(component)) return false;
    if (DIRECT_TOOL_RENDERERS[tool.id] === component) {
      const exactDoubleQuotedRoute =
        'if (tool.id === "' + tool.id + '") return <' + component;
      const exactSingleQuotedRoute =
        "if (tool.id === '" + tool.id + "') return <" + component;
      return TOOL_ENGINE_SOURCE.includes(exactDoubleQuotedRoute)
        || TOOL_ENGINE_SOURCE.includes(exactSingleQuotedRoute);
    }
    return TOOL_ENGINE_SOURCE.includes("<" + component);
  });
}



test("category workflow groups require repeated catalogue subcategories and preserve all tools", () => {
  const makeTool = (id: string, subcategory?: string): ToolMeta => ({
    id,
    name: id,
    slug: id,
    description: "A representative category task for grouping tests.",
    category: "audio",
    ...(subcategory ? { subcategory } : {}),
    keywords: ["audio"],
    tags: [],
    icon: "AudioLines",
    popularity: 0,
    featured: false,
    clientSide: true,
    requiresBackend: false,
    requiresAuth: false,
    status: "active",
    related: [],
    engine: { type: "audio", op: "convert" },
  });

  assert.equal(
    groupToolsBySubcategory([makeTool("plain-a"), makeTool("plain-b")]),
    null,
    "A category without subcategory evidence must retain its flat layout.",
  );
  assert.equal(
    groupToolsBySubcategory([
      makeTool("music-a", "Music"),
      makeTool("music-b", "Music"),
      makeTool("plain-a"),
      makeTool("plain-b"),
    ]),
    null,
    "One repeated subcategory is not enough to introduce workflow sections.",
  );

  const grouped = groupToolsBySubcategory([
    makeTool("music-a", "Music"),
    makeTool("music-b", " music "),
    makeTool("edit-a", "Editing"),
    makeTool("edit-b", "Editing"),
    makeTool("one-off", "Recording"),
    makeTool("uncategorized"),
  ]);

  assert.deepEqual(grouped?.map((group) => group.label), [
    "Music",
    "Editing",
    "Other tools",
  ]);
  assert.deepEqual(grouped?.map((group) => group.tools.map((tool) => tool.id)), [
    ["music-a", "music-b"],
    ["edit-a", "edit-b"],
    ["one-off", "uncategorized"],
  ]);
  assert.equal(
    grouped?.flatMap((group) => group.tools).length,
    6,
    "Grouping must not drop catalogue tools.",
  );
});

test("tool-guide fallbacks include a distinct catalogue task statement for every category", () => {
  for (const category of CATEGORIES) {
    const name = "Example " + category.name + " Task";
    const description = "Prepare a " + category.name.toLowerCase() + " example using the task controls shown on the page.";
    const tool: ToolMeta = {
      id: "documentation-coverage-" + category.id,
      name,
      slug: "documentation-coverage-" + category.id,
      description,
      category: category.id,
      keywords: [category.name.toLowerCase(), "documentation", "coverage"],
      tags: ["documentation", "coverage"],
      icon: "FileText",
      popularity: 0,
      featured: false,
      clientSide: true,
      requiresBackend: false,
      requiresAuth: false,
      status: "active",
      related: [],
      engine: { type: "custom", id: "documentation-coverage-" + category.id },
    };

    const sections = getToolDocumentation(tool);
    const whenToUse = sections.find((section) => section.id === "when-to-use");
    assert.ok(whenToUse, category.id + ": guide must include a when-to-use section");
    assert.ok(
      whenToUse.paragraphs[0].startsWith("This guide is specific to " + name + "."),
      category.id + ": the guide must identify the individual tool",
    );
    if (toolDocumentationSummary(tool) === description) {
      assert.ok(
        !whenToUse.paragraphs[0].includes(description),
        category.id + ": the guide body must not repeat the exact page-introduction summary",
      );
    } else {
      assert.ok(
        whenToUse.paragraphs[0].includes(description),
        category.id + ": a separately summarized catalogue task must appear in the guide body",
      );
    }
    assert.ok(
      whenToUse.paragraphs[1].startsWith("For " + name + ", "),
      category.id + ": the example must be framed around the individual tool",
    );
  }
});

test("planned tool guides retain a truthful planned-status explanation with the task statement", () => {
  const tool: ToolMeta = {
    id: "planned-guide-coverage",
    name: "Planned Example File Inspector",
    slug: "planned-example-file-inspector",
    description: "Inspect file names and metadata when the planned interface becomes available.",
    category: "files",
    keywords: ["file", "metadata", "planned"],
    tags: ["file", "planned"],
    icon: "FileText",
    popularity: 0,
    featured: false,
    clientSide: false,
    requiresBackend: false,
    requiresAuth: false,
    status: "planned",
    related: [],
    engine: { type: "custom", id: "planned-example-file-inspector" },
  };

  const sections = getToolDocumentation(tool);
  const whenToUse = sections.find((section) => section.id === "when-to-use");
  const availability = sections.find((section) => section.id === "availability-and-account");
  assert.ok(whenToUse?.paragraphs[0].startsWith("This guide is specific to " + tool.name + "."));
  if (toolDocumentationSummary(tool) === tool.description) {
    assert.ok(!whenToUse?.paragraphs[0].includes(tool.description), "The planned task description must not be duplicated verbatim.");
  } else {
    assert.ok(whenToUse?.paragraphs[0].includes(tool.description));
  }
  assert.ok(availability?.paragraphs.some((paragraph) => paragraph.includes("currently marks this tool as planned")));
});

test("generic engine guide branches preserve each tool's catalogue task statement", () => {
  const samples: Array<{
    id: string;
    name: string;
    description: string;
    category: ToolMeta["category"];
    engine: ToolMeta["engine"];
  }> = [
    {
      id: "coverage-calculator-operation",
      name: "Example Absolute Value Operation",
      description: "Calculate absolute value\nfrom the number provided.",
      category: "calculators",
      engine: { type: "calculator", formula: "|n|" },
    },
    {
      id: "coverage-converter-operation",
      name: "Example Unit Conversion",
      description: "Convert a source length into a supported target unit.",
      category: "converters",
      engine: { type: "converter", system: "length" },
    },
    {
      id: "coverage-image-operation",
      name: "Example Image Crop",
      description: "Crop an image to the dimensions selected in the form.",
      category: "image",
      engine: { type: "image", op: "crop" },
    },
    {
      id: "coverage-developer-operation",
      name: "Example Source Formatter",
      description: "Format source code using the syntax and options listed by the tool.",
      category: "developer",
      engine: { type: "developer", op: "format" },
    },
    {
      id: "coverage-file-operation",
      name: "Example File Converter",
      description: "Convert a supported input file into the selected output format.",
      category: "files",
      engine: { type: "file-converter", op: "convert" },
    },
    {
      id: "coverage-qr-operation",
      name: "Example QR Generator",
      description: "Create a QR code from the exact payload entered by the user.",
      category: "qr",
      engine: { type: "qr", preset: "url" },
    },
    {
      id: "coverage-url-media-operation",
      name: "Example Media URL Inspector",
      description: "Inspect metadata returned for a media URL from a supported source.",
      category: "video",
      engine: { type: "url-media-info", provider: "generic" },
    },
    {
      id: "coverage-security-operation",
      name: "Example Security Inspector",
      description: "Inspect the supplied value for the security condition named by the tool.",
      category: "security",
      engine: { type: "security", op: "inspect" },
    },
    {
      id: "coverage-ai-operation",
      name: "Example AI Draft",
      description: "Draft a response from the prompt and constraints entered by the user.",
      category: "ai",
      engine: { type: "ai", op: "draft" },
    },
  ];

  for (const sample of samples) {
    const tool: ToolMeta = {
      ...sample,
      slug: sample.id,
      keywords: [sample.name.toLowerCase(), "documentation", "coverage"],
      tags: ["documentation", "coverage"],
      icon: "FileText",
      popularity: 0,
      featured: false,
      clientSide: true,
      requiresBackend: false,
      requiresAuth: false,
      status: "active",
      related: [],
    };
    assert.equal(
      toolTaskGuidanceSource(tool),
      "engine-specific",
      sample.id + ": shared engine-family guidance must be classified as engine-specific",
    );
    const whenToUse = getToolDocumentation(tool).find((section) => section.id === "when-to-use");
    assert.ok(whenToUse, sample.id + ": guide must include a when-to-use section");
    const normalizedDescription = sample.description.replace(/\s+/g, " ").trim();
    assert.ok(
      whenToUse.paragraphs[0].startsWith("This guide is specific to " + sample.name + "."),
      sample.id + ": engine fallback must identify the individual tool",
    );
    if (toolDocumentationSummary(tool) === normalizedDescription) {
      assert.ok(
        !whenToUse.paragraphs[0].includes(normalizedDescription),
        sample.id + ": engine fallback must not duplicate the page-introduction summary",
      );
    } else {
      assert.ok(
        whenToUse.paragraphs[0].includes(normalizedDescription),
        sample.id + ": engine fallback must include a catalogue task not already shown in the introduction",
      );
    }
    assert.ok(
      whenToUse.paragraphs[1].startsWith("For " + sample.name + ", "),
      sample.id + ": example must be framed around the individual tool",
    );
  }
});

test("hand-written tool guidance is wrapped with catalogue identity without repeating the introduction", () => {
  const samples: Array<{
    id: string;
    name: string;
    description: string;
    category: ToolMeta["category"];
    engine: ToolMeta["engine"];
    expectedGuidance: string;
  }> = [
    {
      id: "json-formatter",
      name: "JSON Formatter",
      description: "Format JSON data with readable indentation and check its syntax.",
      category: "developer",
      engine: { type: "developer", op: "format" },
      expectedGuidance: "working with JSON as structured data",
    },
    {
      id: "qr-generator",
      name: "QR Code Generator",
      description: "Create a QR code from a text value or URL for scanning.",
      category: "qr",
      engine: { type: "qr", preset: "url" },
      expectedGuidance: "encodes text or a URL into a QR image",
    },
    {
      id: "password-generator",
      name: "Password Generator",
      description: "Generate a unique password using the length and character options shown.",
      category: "security",
      engine: { type: "security", op: "password" },
      expectedGuidance: "generates a password using the length and character options",
    },
    {
      id: "unix-timestamp-converter",
      name: "Unix Timestamp Converter",
      description: "Convert Unix timestamps into human-readable dates and back again.",
      category: "converters",
      engine: { type: "converter", system: "datetime" },
      expectedGuidance: "translate between Unix timestamps and human-readable dates",
    },
    {
      id: "youtube-content-calendar",
      name: "YouTube Content Calendar",
      description: "Create a dated publishing plan from a campaign, start date, posting days, post count and format mix.",
      category: "creators",
      engine: { type: "creator", op: "youtube-content-calendar" },
      expectedGuidance: "dated publishing plan",
    },
    {
      id: "youtube-content-planner",
      name: "YouTube Content Planner",
      description: "Generate platform-aware content ideas for a chosen audience and campaign.",
      category: "creators",
      engine: { type: "creator", op: "youtube-content-planner" },
      expectedGuidance: "generates a set of content ideas",
    },
    {
      id: "qr-payload-inspector", name: "QR & Barcode Reader",
      description: "Scan QR codes and 1D/2D barcodes using your camera or an image file.",
      category: "qr", engine: { type: "custom", id: "qr-payload-inspector" },
      expectedGuidance: "decodes QR codes and supported 1D/2D barcode formats",
    },
    {
      id: "zip-any-file", name: "Zip any file",
      description: "Create ZIP archives from files or folders, or extract an archive.",
      category: "files", engine: { type: "custom", id: "zip-any-file" },
      expectedGuidance: "two separate workflows: create a ZIP",
    },
    {
      id: "file-to-txt", name: "File to TXT Converter",
      description: "Type or paste plain text, or extract readable text from supported files and save it as a TXT file.",
      category: "files", engine: { type: "file-converter", op: "file-to-txt" },
      expectedGuidance: "extract readable text locally from supported text files, DOCX documents and selectable-text PDFs",
    },
    {
      id: "file-organizer", name: "File Organizer",
      description: "Sort selected files into clear folders by type and export an organized copy.",
      category: "files", engine: { type: "custom", id: "file-organizer" },
      expectedGuidance: "classifies the selected file set into folders",
    },
    {
      id: "batch-file-renamer", name: "Batch File Renamer",
      description: "Preview and apply consistent prefixes, suffixes, numbering and literal replacements.",
      category: "files", engine: { type: "custom", id: "batch-file-renamer" },
      expectedGuidance: "previews a numbered name for each selected file",
    },
    {
      id: "duplicate-file-finder", name: "Duplicate File Finder",
      description: "Find identical files using SHA-256 content verification after size filtering.",
      category: "files", engine: { type: "custom", id: "duplicate-file-finder" },
      expectedGuidance: "calculates SHA-256 digests for the same-size candidates",
    },
    {
      id: "folder-size-analyzer", name: "Folder Size Analyzer",
      description: "Inspect folder contents, total storage, file-type breakdowns and the largest files.",
      category: "files", engine: { type: "custom", id: "folder-size-analyzer" },
      expectedGuidance: "reports its file count, combined byte size",
    },
    {
      id: "file-search", name: "File Search",
      description: "Find files by name and search inside supported text files with clear file and line references.",
      category: "files", engine: { type: "custom", id: "file-search" },
      expectedGuidance: "looks for a case-insensitive phrase in selected filenames",
    },
    {
      id: "file-compare", name: "File & Folder Compare",
      description: "Compare two selected file sets to identify added, missing, changed and identical files.",
      category: "files", engine: { type: "custom", id: "file-compare" },
      expectedGuidance: "compares two selected file sets by relative path",
    },
    {
      id: "a-book", name: "A book",
      description: "A private local notes and document workspace. Create notes, attach files, organize and search your writing, and process PDFs on this device.",
      category: "productivity", engine: { type: "custom", id: "a-book" },
      expectedGuidance: "private on-device notes and document workspace",
    },
    {
      id: "song-metadata-analyzer", name: "AI Music Data Sandbox",
      description: "Organize, tag and prepare music for training, right on your device.",
      category: "audio", engine: { type: "custom", id: "song-metadata-analyzer" },
      expectedGuidance: "local music-record workspace",
    },
    {
      id: "camera-studio", name: "Camera Studio",
      description: "Take photos and record videos. Switch between the front and back cameras, zoom in or out, adjust brightness, apply color filters, and save your captures to your device.",
      category: "photography", engine: { type: "custom", id: "camera-studio" },
      expectedGuidance: "browser capture workspace",
    },
    { id: "birthday-page-generator", name: "Birthday Page Generator", description: "Create a celebration page with event details, a message and an optional schedule.", category: "celebrations", engine: { type: "custom", id: "birthday-page-generator" }, expectedGuidance: "standalone HTML programme page" },
    { id: "anniversary-interactive-card", name: "Anniversary Interactive Card", description: "Create a card with a message that the recipient can reveal.", category: "celebrations", engine: { type: "custom", id: "anniversary-interactive-card" }, expectedGuidance: "second message panel that the recipient opens" },
    { id: "graduation-invitation-generator", name: "Graduation Invitation Generator", description: "Prepare a celebration invitation with event details and an RSVP option.", category: "celebrations", engine: { type: "custom", id: "graduation-invitation-generator" }, expectedGuidance: "themed HTML invitation and a copyable text version" },
    { id: "party-countdown", name: "Party Countdown", description: "Calculate the time remaining until a party using the event time zone.", category: "celebrations", engine: { type: "custom", id: "party-countdown" }, expectedGuidance: "updates the days, hours, minutes and seconds" },
    { id: "thank-you-memory-page", name: "Thank You Memory Page", description: "Create a page of written memories and a photo gallery.", category: "celebrations", engine: { type: "custom", id: "thank-you-memory-page" }, expectedGuidance: "written memories and an optional photo gallery" },
    { id: "farewell-reveal-page", name: "Farewell Reveal Page", description: "Create a page with a message that visitors reveal when they are ready.", category: "celebrations", engine: { type: "custom", id: "farewell-reveal-page" }, expectedGuidance: "visitor selects Reveal the message" },
    { id: "achievement-quiz-generator", name: "Achievement Quiz Generator", description: "Create a multiple-choice quiz and identify the correct answer.", category: "celebrations", engine: { type: "custom", id: "achievement-quiz-generator" }, expectedGuidance: "small multiple-choice quiz" },
    { id: "christmas-surprise-page", name: "Christmas Surprise Page", description: "Create a page with an introductory message and hidden surprise content.", category: "celebrations", engine: { type: "custom", id: "christmas-surprise-page" }, expectedGuidance: "button that opens the surprise content" },
    {
      id: "youtube-posting-time-helper",
      name: "YouTube Posting Time Helper",
      description: "Rank audience posting windows from activity scores supplied from YouTube analytics.",
      category: "creators",
      engine: { type: "creator", op: "youtube-posting-time-helper" },
      expectedGuidance: "ranks posting windows from audience-activity scores",
    },
  ];

  for (const sample of samples) {
    const tool: ToolMeta = {
      ...sample,
      slug: sample.id,
      keywords: [sample.name.toLowerCase(), "documentation", "coverage"],
      tags: ["documentation", "coverage"],
      icon: "FileText",
      popularity: 0,
      featured: false,
      clientSide: true,
      requiresBackend: false,
      requiresAuth: false,
      status: "active",
      related: [],
    };
    const whenToUse = getToolDocumentation(tool).find((section) => section.id === "when-to-use");
    assert.ok(whenToUse, sample.id + ": guide must include a when-to-use section");
    assert.ok(
      whenToUse.paragraphs[0].startsWith("This guide is specific to " + sample.name + "."),
      sample.id + ": hand-written guidance must carry the tool identity",
    );
    assert.ok(
      whenToUse.paragraphs[0].includes(sample.expectedGuidance),
      sample.id + ": the operation-specific guidance must remain present",
    );
    if (toolDocumentationSummary(tool) === tool.description) {
      assert.ok(
        !whenToUse.paragraphs[0].includes(tool.description),
        sample.id + ": the exact page introduction must not be repeated in the guide body",
      );
    }
    assert.ok(
      whenToUse.paragraphs[1].startsWith("For " + sample.name + ", "),
      sample.id + ": examples must be framed around the named tool",
    );
  }
});

test("task-guidance source identifies the correct specificity layer", () => {
  const makeTool = (
    id: string,
    name: string,
    category: ToolMeta["category"],
    engine: ToolMeta["engine"],
  ): ToolMeta => ({
    id,
    name,
    slug: id,
    description: "A representative task for checking guide source classification.",
    category,
    keywords: [],
    tags: [],
    icon: "FileText",
    popularity: 0,
    featured: false,
    clientSide: true,
    requiresBackend: false,
    requiresAuth: false,
    status: "active",
    related: [],
    engine,
  });

  assert.equal(
    toolTaskGuidanceSource(makeTool(
      "percentage-calculator",
      "Percentage Calculator",
      "calculators",
      { type: "calculator", formula: "percentage" },
    )),
    "operation-specific",
    "A narrow tool/operation rule must be labelled operation-specific.",
  );
  const percentage = makeTool(
    "percentage-calculator",
    "Percentage Calculator",
    "calculators",
    { type: "calculator", formula: "percentage" },
  );
  assert.equal(
    toolTaskGuidanceSource(percentage),
    "operation-specific",
    "A registered calculator with a successful synthetic example must receive operation-specific guidance.",
  );
  const percentageGuide = getToolDocumentation(percentage).find((section) => section.id === "when-to-use");
  assert.ok(percentageGuide, "Registered calculator guide must include its operation-specific section.");
  assert.match(percentageGuide.paragraphs[0], /registered calculator operation "percentage"/);
  assert.match(percentageGuide.paragraphs[0], /P% of A = A × P \\ 100|P% of A = A × P \/ 100/);
  assert.match(percentageGuide.paragraphs[1], /synthetic registry test/);
  assert.match(percentageGuide.paragraphs[1], /Amount: 3/);
  assert.match(percentageGuide.paragraphs[1], /Percent: 7%/);
  assert.match(percentageGuide.paragraphs[1], /0\\.21/);
  assert.match(percentageGuide.paragraphs[2], /actual measured values|own correctly measured values/);

  assert.equal(
    toolTaskGuidanceSource(makeTool(
      "generic-calculation",
      "Generic Calculation",
      "calculators",
      { type: "calculator", formula: "generic" },
    )),
    "engine-specific",
    "An unmatched calculator must inherit engine-level task guidance.",
  );
  assert.equal(
    toolTaskGuidanceSource(makeTool(
      "generic-business-workflow",
      "Generic Business Workflow",
      "business",
      { type: "custom", id: "generic-business-workflow" },
    )),
    "category-guidance",
    "A custom tool without a narrower rule must inherit category guidance.",
  );
  assert.equal(
    toolTaskGuidanceSource(makeTool(
      "unlisted-workflow",
      "Unlisted Workflow",
      "unlisted" as ToolMeta["category"],
      { type: "custom", id: "unlisted-workflow" },
    )),
    "catalogue-fallback",
    "An unknown category must fail closed to catalogue purpose and generic usage advice.",
  );
});

test("every canonical public tool has a complete guide structure tied to its catalogue record", () => {
  const toolMap = new Map<string, ToolMeta>();
  for (const tool of getSearchableTools()) toolMap.set(tool.id, tool);
  for (const tool of getToolsByCategory("accessibility")) toolMap.set(tool.id, tool);
  const publicTools = canonicalSeoTools([...toolMap.values()].filter(isIndexableTool));

  assert.ok(publicTools.length > 0, "The public guide inventory must not be empty.");
  const categoryOperationParsers: Partial<Record<string, (toolId: string) => unknown>> = {
    marketing: parseMarketingToolId,
    social: parseSocialToolId,
    interactive: parseInteractiveToolId,
    gaming: parseGamingToolId,
    career: parseCareerToolId,
    relationships: parseRelationshipToolId,
    webdesign: parseWebDesignToolId,
    ecommerce: parseEcommerceToolId,
    streaming: (toolId) => {
      const parsed = parseStreamingToolId(toolId);
      assert.ok(parsed, toolId + ": streaming tool ID must resolve to a supported platform operation");
      return parsed;
    },
    communication: parseCommunicationToolId,
  };

  const requiredSections = [
    "purpose-and-scope",
    "when-to-use",
    "before-you-begin",
    "how-to-use",
    "inputs-and-options",
    "results-and-output",
    "processing-and-privacy",
    "availability-and-account",
    "limitations-and-responsible-use",
    "troubleshooting",
  ];

  const missingRuntimeRoutes: string[] = [];
  const taskGuidanceSourceCounts = new Map<string, number>();
  for (const tool of publicTools) {
    const taskGuidanceSource = toolTaskGuidanceSource(tool);
    assert.ok(
      ["operation-specific", "engine-specific", "category-guidance", "catalogue-fallback"].includes(taskGuidanceSource),
      tool.id + ": guide's task-specific usage advice must expose a recognised source classification",
    );
    taskGuidanceSourceCounts.set(taskGuidanceSource, (taskGuidanceSourceCounts.get(taskGuidanceSource) ?? 0) + 1);
    const operationParser = categoryOperationParsers[tool.category];
    if (tool.engine.type === "custom" && !tool.requiresBackend && operationParser) {
      assert.doesNotThrow(
        () => operationParser(tool.id),
        tool.id + ": public custom tool must parse to a supported operation in its category engine",
      );
    }
    if (!hasImportedRuntimeRenderer(tool)) {
      missingRuntimeRoutes.push(
        tool.id + " (engine=" + tool.engine.type + ", category=" + tool.category + ", engineId=" + ("id" in tool.engine ? tool.engine.id : "") + ")",
      );
    }
    const sections = getToolDocumentation(tool);
    const sectionIds = new Set(sections.map((section) => section.id));
    const whenToUse = sections.find((section) => section.id === "when-to-use");
    const normalizedDescription = String(tool.description ?? "").replace(/\s+/g, " ").trim();
    const summary = toolDocumentationSummary(tool);

    assert.ok(whenToUse, tool.id + ": public guide must include a when-to-use section");
    assert.ok(
      whenToUse.paragraphs[0].startsWith("This guide is specific to " + tool.name + "."),
      tool.id + ": guide must identify this individual tool",
    );
    assert.ok(
      whenToUse.paragraphs[1].startsWith("For " + tool.name + ", "),
      tool.id + ": guide example must be framed around this individual tool",
    );

    if (summary === normalizedDescription) {
      assert.ok(
        !whenToUse.paragraphs[0].includes(normalizedDescription),
        tool.id + ": guide body must not repeat the exact page introduction",
      );
    } else {
      assert.ok(
        whenToUse.paragraphs[0].includes(normalizedDescription),
        tool.id + ": guide must retain the catalogue task when the page summary is independently generated",
      );
    }

    for (const sectionId of requiredSections) {
      assert.ok(sectionIds.has(sectionId), tool.id + ": missing required guide section " + sectionId);
    }
  }

  assert.equal(
    [...taskGuidanceSourceCounts.values()].reduce((total, count) => total + count, 0),
    publicTools.length,
    "Every canonical public tool must have exactly one task-guidance source classification.",
  );
  assert.deepEqual(
    missingRuntimeRoutes,
    [],
    "Every public indexable tool must resolve to an imported runtime renderer through an exact or category-level ToolEngine route.",
  );
});


test("all registered categories have distinct, task-oriented descriptions and blurbs", () => {
  assert.equal(CATEGORIES.length, 43, "The category registry should contain the current 43 category records.");
  const ids = CATEGORIES.map((category) => category.id);
  const descriptions = CATEGORIES.map((category) => category.description.trim());
  const blurbs = CATEGORIES.map((category) => category.blurb.trim());
  assert.equal(new Set(ids).size, CATEGORIES.length, "Category IDs must be unique.");
  assert.equal(new Set(descriptions).size, CATEGORIES.length, "Every category needs a distinct explanation.");
  assert.equal(new Set(blurbs).size, CATEGORIES.length, "Every category needs a distinct short task blurb.");
  for (const category of CATEGORIES) {
    assert.ok(category.description.trim().length >= 60, category.id + ": category description must explain a real task scope.");
    assert.ok(category.blurb.trim().length >= 18, category.id + ": category blurb must communicate a distinct task.");
  }
});

test("category grouping uses only repeated subcategory metadata and preserves every visible tool", () => {
  const tool = (id: string, subcategory?: string): ToolMeta => ({
    id, name: id, slug: id, description: "A category grouping fixture for a concrete tool task.",
    category: "files", ...(subcategory ? { subcategory } : {}), keywords: [], tags: [], icon: "FileText",
    popularity: 0, featured: false, clientSide: true, requiresBackend: false, requiresAuth: false,
    status: "active", related: [], engine: { type: "custom", id },
  });
  const input = [tool("rename-a", "Organization"), tool("rename-b", "Organization"),
    tool("compare-a", "Verification"), tool("compare-b", "Verification"),
    tool("single", "Sparse"), tool("unlabelled")];
  const groups = groupToolsBySubcategory(input);
  assert.ok(groups, "Two repeated subcategories should create groups.");
  assert.deepEqual(groups.map((group) => group.label), ["Organization", "Verification", "Other tools"]);
  assert.deepEqual(groups.flatMap((group) => group.tools.map((item) => item.id)).sort(), input.map((item) => item.id).sort(),
    "Every visible tool must appear exactly once after grouping.");
  assert.equal(groupToolsBySubcategory([tool("a", "One"), tool("b", "One")]), null,
    "A single repeated subcategory does not justify fabricated group structure.");
});


test("all 93 supported Celebration IDs receive operation-specific documentation", () => {
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
  const expectedGuidance = new Map([
    ["page-generator", "standalone HTML programme page"],
    ["interactive-card", "second message panel that the recipient opens"],
    ["invitation-generator", "themed HTML invitation and a copyable text version"],
    ["countdown", "updates the days, hours, minutes and seconds"],
    ["memory-page", "written memories and an optional photo gallery"],
    ["reveal-page", "visitor selects Reveal the message"],
    ["quiz-generator", "small multiple-choice quiz"],
    ["surprise-page", "button that opens the surprise content"],
  ]);
  let count = 0;
  for (const occasion of occasions) {
    for (const experience of experiences) {
      const id = occasion + "-" + experience;
      if (unavailable.has(id)) continue;
      const tool: ToolMeta = {
        id,
        name: id,
        slug: id,
        description: "Create a celebration page for the selected occasion using the fields provided.",
        category: "celebrations",
        keywords: [],
        tags: [],
        icon: "PartyPopper",
        popularity: 0,
        featured: false,
        clientSide: true,
        requiresBackend: false,
        requiresAuth: false,
        status: "active",
        related: [],
        engine: { type: "custom", id },
      };
      assert.equal(toolTaskGuidanceSource(tool), "operation-specific", id);
      const whenToUse = getToolDocumentation(tool).find((section) => section.id === "when-to-use");
      assert.ok(whenToUse, id + ": missing its individual 'when to use' guide section");
      assert.ok(whenToUse.paragraphs[0].includes(expectedGuidance.get(experience) ?? ""), id + ": wrong or missing operation guidance");
      assert.ok(whenToUse.paragraphs[0].startsWith("This guide is specific to " + id + "."), id + ": guide identity is missing");
      count += 1;
    }
  }
  assert.equal(count, 93, "Every supported Celebration operation must receive the source-specific guide rule.");
});


test("keeps Advanced CSS Minifier and JSON-to-CSV as separate stable tool identities", () => {
  const searchable = getSearchableTools();
  const css = searchable.find((tool) => tool.id === "css-minifier-advanced");
  const jsonToCsv = searchable.find((tool) => tool.id === "json-to-csv");

  assert.ok(css, "Advanced CSS Minifier remains searchable");
  assert.equal(css.name, "Advanced CSS Minifier");
  assert.equal(css.category, "developer");
  assert.equal(css.slug, "css-minifier-advanced");
  assert.equal(css.engine.type, "text");
  assert.equal(css.engine.type === "text" ? css.engine.op : null, "css-minify");
  assert.equal(getToolById("css-minifier-advanced")?.id, "css-minifier-advanced");
  assert.equal(getToolByPath("developer", "css-minifier-advanced")?.id, "css-minifier-advanced");

  assert.ok(jsonToCsv, "JSON-to-CSV remains a separate Files tool");
  assert.equal(jsonToCsv.name, "JSON to CSV Converter");
  assert.equal(jsonToCsv.category, "files");
  assert.equal(jsonToCsv.engine.type, "file-converter");
  assert.equal(jsonToCsv.engine.type === "file-converter" ? jsonToCsv.engine.op : null, "json-to-csv");
  assert.equal(getToolByPath("files", "json-to-csv")?.id, "json-to-csv");
  assert.equal(searchable.filter((tool) => tool.id === "css-minifier-advanced").length, 1);
  assert.equal(searchable.filter((tool) => tool.id === "json-to-csv").length, 1);
});


test("preserves Advanced CSS Minifier identity and operation through Markup & Style Studio", async () => {
  const css = getToolById("css-minifier-advanced");
  assert.ok(css);
  const studio = developerStudioForLegacySlug(css.slug);
  assert.equal(studio.id, "markup-studio");
  assert.equal(developerModeForLegacySlug(studio, css.slug), "css");
  assert.equal(css.engine.type === "text" ? css.engine.op : null, "css-minify");

  const output = await runDeveloperStudio(
    "css-minify",
    "/* remove this comment */ .card { color: red; margin: 0; }",
  );
  assert.equal(output, ".card{color:red;margin:0}");

  const routeSource = readFileSync(new URL("../routes/tools/$category/$slug.tsx", import.meta.url), "utf8");
  assert.ok(routeSource.includes('const legacyEngineOp = "op" in tool.engine ? tool.engine.op : undefined;'));
  assert.ok(routeSource.includes("op: legacyEngineOp"), "Legacy redirect must forward the original engine operation to its Studio");
});

test("Scene Studio is searchable, indexable and has its own practical guide", () => {
  const tool = getSearchableTools().find((candidate) => candidate.id === "scene-studio");
  assert.ok(tool, "Scene Studio must appear in the searchable runtime registry");
  assert.equal(tool.category, "video");
  assert.equal(tool.status, "active");
  assert.equal(isIndexableTool(tool), true);
  assert.ok(canonicalSeoTools(getSearchableTools()).some((candidate) => candidate.id === "scene-studio"));
  assert.equal(toolTaskGuidanceSource(tool), "operation-specific");
});
