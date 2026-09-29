import test from "node:test";
import assert from "node:assert/strict";
import { parseToolId } from "./accessibility-engine-utils.ts";

test("preserves hyphenated accessibility kinds", () => {
  assert.deepEqual(parseToolId("color-blindness-checker"), { kind: "color-blindness", action: "checker" });
  assert.deepEqual(parseToolId("font-size-simulator"), { kind: "font-size", action: "simulator" });
  assert.deepEqual(parseToolId("text-readability-preview"), { kind: "text-readability", action: "preview" });
  assert.deepEqual(parseToolId("keyboard-navigation-helper"), { kind: "keyboard-navigation", action: "helper" });
  assert.deepEqual(parseToolId("focus-state-checker"), { kind: "focus-state", action: "checker" });
});
