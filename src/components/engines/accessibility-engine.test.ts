import test from "node:test";
import assert from "node:assert/strict";
import { colorStudioModeFromToolId, parseToolId } from "./accessibility-engine-utils.ts";

test("preserves hyphenated accessibility kinds", () => {
  assert.deepEqual(parseToolId("color-blindness-checker"), { kind: "color-blindness", action: "checker" });
  assert.deepEqual(parseToolId("font-size-simulator"), { kind: "font-size", action: "simulator" });
  assert.deepEqual(parseToolId("text-readability-preview"), { kind: "text-readability", action: "preview" });
  assert.deepEqual(parseToolId("keyboard-navigation-helper"), { kind: "keyboard-navigation", action: "helper" });
  assert.deepEqual(parseToolId("focus-state-checker"), { kind: "focus-state", action: "checker" });
});

test("maps legacy contrast action URLs to their corresponding Color Studio modes", () => {
  assert.equal(colorStudioModeFromToolId("contrast-checker"), "check");
  assert.equal(colorStudioModeFromToolId("contrast-generator"), "export");
  assert.equal(colorStudioModeFromToolId("contrast-helper"), "fix");
  assert.equal(colorStudioModeFromToolId("contrast-preview"), "preview");
  assert.equal(colorStudioModeFromToolId("contrast-simulator"), "vision");
  assert.equal(colorStudioModeFromToolId("color-blindness-checker"), "vision");
  assert.equal(colorStudioModeFromToolId("color-blindness-simulator"), "vision");
});
