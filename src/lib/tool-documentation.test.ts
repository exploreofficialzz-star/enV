import assert from "node:assert/strict";
import { test } from "node:test";
import { CATEGORIES } from "@/data/categories";
import type { ToolMeta } from "@/types/tool";
import { getSearchableTools, getToolsByCategory } from "@/lib/registry";
import { canonicalSeoTools, isIndexableTool } from "@/lib/seo-metadata";
import { getToolDocumentation, toolDocumentationSummary } from "@/lib/tool-documentation";

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

test("every canonical public tool has an individually grounded guide contract", () => {
  const toolMap = new Map<string, ToolMeta>();
  for (const tool of getSearchableTools()) toolMap.set(tool.id, tool);
  for (const tool of getToolsByCategory("accessibility")) toolMap.set(tool.id, tool);
  const publicTools = canonicalSeoTools([...toolMap.values()].filter(isIndexableTool));

  assert.ok(publicTools.length > 0, "The public guide inventory must not be empty.");
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

  for (const tool of publicTools) {
    const sections = getToolDocumentation(tool);
    const sectionIds = new Set(sections.map((section) => section.id));
    const whenToUse = sections.find((section) => section.id === "when-to-use");
    const normalizedDescription = String(tool.description ?? "").replace(/\\s+/g, " ").trim();
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
});

