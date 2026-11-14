import assert from "node:assert/strict";
import { test } from "node:test";
import { CATEGORIES } from "@/data/categories";
import type { ToolMeta } from "@/types/tool";
import { getToolDocumentation } from "@/lib/tool-documentation";

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
      whenToUse.paragraphs[0].includes(description),
      category.id + ": the guide must carry this tool's own catalogue task description",
    );
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
  assert.ok(whenToUse?.paragraphs[0].includes(tool.description));
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
      description: "Calculate absolute value\\nfrom the number provided.",
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
    const normalizedDescription = sample.description.replace(/\\s+/g, " ").trim();
    assert.ok(
      whenToUse.paragraphs[0].includes(normalizedDescription),
      sample.id + ": engine fallback must include the individual catalogue task",
    );
    assert.ok(
      whenToUse.paragraphs[0].startsWith("This guide is specific to " + sample.name + "."),
      sample.id + ": engine fallback must identify the individual tool",
    );
    assert.ok(
      whenToUse.paragraphs[1].startsWith("For " + sample.name + ", "),
      sample.id + ": example must be framed around the individual tool",
    );
  }
});

