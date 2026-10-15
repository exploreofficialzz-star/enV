import { writeFile } from "node:fs/promises";
import { tools } from "../src/data/catalog.ts";
import { businessStudioRouteForTool } from "../src/lib/business-studios-catalog.ts";

const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const businessTools = tools.filter((tool) => tool.category === "business");
const rows = businessTools.map((tool) => {
  const route = businessStudioRouteForTool(tool);
  if (!route) throw new Error(`Unmapped Business tool: ${tool.slug}`);
  return {
    legacy_category: tool.category,
    legacy_slug: tool.slug,
    legacy_path: `/tools/${tool.category}/${tool.slug}`,
    engine_operation: route.mode,
    studio: route.studio,
    studio_title: route.studioTitle,
    studio_entry: route.href,
    mode: route.mode,
    status: "legacy-link-preserved",
  };
});
rows.push({
  legacy_category: "calculators",
  legacy_slug: "break-even-calculator",
  legacy_path: "/tools/calculators/break-even-calculator",
  engine_operation: "break-even",
  studio: "finance",
  studio_title: "Finance Metrics Studio",
  studio_entry: "/tools/business/finance-studio?mode=break-even",
  mode: "break-even",
  status: "redirect-to-studio",
});
const headers = ["legacy_slug", "legacy_category", "legacy_path", "engine_operation", "studio", "studio_title", "studio_entry", "mode", "status"];
const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => escapeCsv(row[key])).join(","))].join("\n") + "\n";
await writeFile("docs/business-studios-slug-map.csv", csv);
if (businessTools.length !== 104 || rows.length !== 105) throw new Error(`Expected 104 Business tools + redirect row; got ${businessTools.length} tools and ${rows.length} rows`);
console.log(`Exported ${businessTools.length} Business legacy slugs + 1 retired break-even redirect to docs/business-studios-slug-map.csv`);
