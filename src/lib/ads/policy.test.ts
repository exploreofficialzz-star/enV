import assert from "node:assert/strict";
import test from "node:test";
import { isAdsterraQualifiedTool, isHybridAccessToolId, isPaidHybridAccessToolId } from "./policy.ts";
const selected = { toolIds: "average-speed-calculator,json-formatter,average-speed-calculator" };
function tool(overrides: Record<string, unknown> = {}) {
  return {
    id: "average-speed-calculator", name: "Average Speed Calculator", category: "calculators",
    status: "active", clientSide: true, requiresBackend: false, requiresAuth: false,
    engine: { type: "calculator", id: "average-speed-calculator" }, ...overrides,
  } as Parameters<typeof isAdsterraQualifiedTool>[0];
}
test("Adsterra qualification includes ordinary active tools across eligible categories", () => {
  for (const category of ["calculators", "communication", "business", "files", "creator"]) {
    assert.equal(isAdsterraQualifiedTool(tool({ category })), true, category);
  }
});
test("Adsterra qualification excludes sensitive categories and Studio, AI, Lab and Sandbox identities", () => {
  for (const category of ["health", "finance", "earnings", "fitness", "personal", "ai", "lab", "labs", "studio", "studios"]) {
    assert.equal(isAdsterraQualifiedTool(tool({ category })), false, category);
  }
  assert.equal(isAdsterraQualifiedTool(tool({ id: "music-data-sandbox", name: "Music Data Sandbox", category: "audio" })), false);
  assert.equal(isAdsterraQualifiedTool(tool({ status: "planned" })), false);
  assert.equal(isAdsterraQualifiedTool(tool({ disclaimer: "finance" })), false);
});
test("hybrid online/offline access uses only the explicitly selected tool-ID list", () => {
  assert.equal(isHybridAccessToolId("average-speed-calculator", selected, tool()), true);
  assert.equal(isHybridAccessToolId("json-formatter", selected, tool({ id: "json-formatter", engine: { type: "codec" } })), false);
  assert.equal(isHybridAccessToolId("average-speed-calculator", { toolIds: "" }, tool()), false);
  assert.equal(isHybridAccessToolId("average-speed-calculator", selected, tool({ requiresBackend: true })), false);
  assert.equal(isHybridAccessToolId("average-speed-calculator", selected, tool({ requiresAuth: true })), false);
  assert.equal(isHybridAccessToolId("average-speed-calculator", selected, tool({ category: "fitness" })), false);
  assert.equal(isHybridAccessToolId("finance-apr-calculator", { toolIds: "finance-apr-calculator" }, tool({ id: "finance-apr-calculator" })), false);
});
test("sensitive categories and disclaimers are excluded case-insensitively", () => {
  for (const category of ["Health", "FINANCE", "Earnings", "FITNESS", "Personal"]) {
    const candidate = tool({ category });
    assert.equal(isAdsterraQualifiedTool(candidate), false, category);
    assert.equal(isHybridAccessToolId("average-speed-calculator", selected, candidate), false, category);
    assert.equal(isPaidHybridAccessToolId("average-speed-calculator", selected, candidate), false, category);
  }
  const sensitiveDisclaimer = tool({ disclaimer: "HEALTH" });
  assert.equal(isAdsterraQualifiedTool(sensitiveDisclaimer), false);
  assert.equal(isHybridAccessToolId("average-speed-calculator", selected, sensitiveDisclaimer), false);
  assert.equal(isPaidHybridAccessToolId("average-speed-calculator", selected, sensitiveDisclaimer), false);
});
test("paid access remains restricted to manual prices and the selected hybrid cohort", () => {
  assert.equal(isPaidHybridAccessToolId("json-formatter", selected, tool({ id: "json-formatter", engine: { type: "codec" } })), false);
  assert.equal(isPaidHybridAccessToolId("average-speed-calculator", { toolIds: "" }, tool()), false);
  assert.equal(isPaidHybridAccessToolId("average-speed-calculator", selected, tool({ requiresBackend: true })), false);
});

test("Adsterra excludes high-end, premium and frontier tools by their reviewed identity tags", () => {
  for (const tag of ["high-end", "premium", "frontier"]) {
    assert.equal(isAdsterraQualifiedTool(tool({ tags: [tag] })), false, tag);
  }
  assert.equal(isAdsterraQualifiedTool(tool({ name: "High End Video Renderer" })), false);
  assert.equal(isAdsterraQualifiedTool(tool({ keywords: ["frontier model"] })), false);
  assert.equal(isAdsterraQualifiedTool(tool({ description: "Premium video rendering and advanced output quality." })), false);
  assert.equal(isAdsterraQualifiedTool(tool({ description: "Uses a frontier AI model for generation." })), false);
  assert.equal(isAdsterraQualifiedTool(tool({ name: "AI Studio" })), false);
});
