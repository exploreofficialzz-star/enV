import test from "node:test";
import assert from "node:assert/strict";
import { getGeneratedDesignGroup, getGeneratedDesignTools } from "./design-explorer.ts";

test("every generated Design CSS family maps to one visible explorer group", () => {
  const familyGroups = {
    gradient: "effects",
    shadow: "effects",
    border: "effects",
    glass: "effects",
    neomorph: "effects",
    noise: "effects",
    button: "components",
    card: "components",
    badge: "components",
    input: "components",
    avatar: "components",
    pattern: "shapes",
    blob: "shapes",
    wave: "shapes",
  } as const;
  for (const [family, group] of Object.entries(familyGroups)) {
    assert.equal(getGeneratedDesignGroup({ type: "cssgen", op: family + ":generator" }), group);
    assert.equal(getGeneratedDesignGroup({ type: "cssgen", op: family + ":preview" }), group);
  }
});

test("generated color utilities are mapped to Color & palettes", () => {
  for (const op of ["picker", "palette", "contrast"]) {
    assert.equal(getGeneratedDesignGroup({ type: "color", op }), "color");
  }
});

test("unknown and non-Design engine families are not misclassified", () => {
  assert.equal(getGeneratedDesignGroup({ type: "cssgen", op: "unknown:generator" }), null);
  assert.equal(getGeneratedDesignGroup({ type: "custom", id: "sample" }), null);
  assert.equal(getGeneratedDesignGroup({ type: "image", op: "resize" }), null);
});


test("generated utilities are grouped once and never duplicate curated core tools", () => {
  const entries = [
    { id: "extra-color", engine: { type: "color", op: "palette" } },
    { id: "extra-gradient", engine: { type: "cssgen", op: "gradient:generator" } },
    { id: "extra-shadow", engine: { type: "cssgen", op: "shadow:builder" } },
    { id: "extra-border", engine: { type: "cssgen", op: "border:preview" } },
    { id: "extra-glass", engine: { type: "cssgen", op: "glass:generator" } },
    { id: "extra-neomorph", engine: { type: "cssgen", op: "neomorph:generator" } },
    { id: "extra-noise", engine: { type: "cssgen", op: "noise:generator" } },
    { id: "extra-button", engine: { type: "cssgen", op: "button:generator" } },
    { id: "extra-card", engine: { type: "cssgen", op: "card:generator" } },
    { id: "extra-badge", engine: { type: "cssgen", op: "badge:generator" } },
    { id: "extra-input", engine: { type: "cssgen", op: "input:generator" } },
    { id: "extra-avatar", engine: { type: "cssgen", op: "avatar:generator" } },
    { id: "extra-pattern", engine: { type: "cssgen", op: "pattern:generator" } },
    { id: "extra-blob", engine: { type: "cssgen", op: "blob:generator" } },
    { id: "extra-wave", engine: { type: "cssgen", op: "wave:generator" } },
    { id: "core-button", engine: { type: "cssgen", op: "button:generator" } },
    { id: "unknown", engine: { type: "custom", id: "other" } },
  ] as const;
  const coreIds = new Set(["core-button"]);
  const groups = ["color", "effects", "components", "shapes", "accessibility"] as const;
  const grouped = groups.flatMap((group) => getGeneratedDesignTools(entries, coreIds, group));
  assert.equal(grouped.length, 15);
  assert.equal(new Set(grouped.map((entry) => entry.id)).size, grouped.length);
  assert.deepEqual(new Set(grouped.map((entry) => entry.id)), new Set(entries.filter((entry) => entry.id.startsWith("extra-")).map((entry) => entry.id)));
});
