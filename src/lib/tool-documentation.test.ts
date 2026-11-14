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
