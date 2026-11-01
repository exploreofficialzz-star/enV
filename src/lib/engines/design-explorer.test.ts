import test from "node:test";
import assert from "node:assert/strict";
import { getGeneratedDesignGroup } from "./design-explorer.ts";

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
