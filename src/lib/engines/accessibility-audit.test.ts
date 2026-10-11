import test from "node:test";
import assert from "node:assert/strict";
import { auditAccessibilityMarkup } from "./accessibility-audit.ts";

test("reports missing and filename-style alternative text with fixes", () => {
  const result = auditAccessibilityMarkup("alt-text-checker", '<img src="hero.jpg"><img src="logo.png" alt="logo.png"><img src="texture.png" alt="">');
  assert.equal(result.findings.filter((x) => x.rule === "image-alt").length, 1);
  assert.equal(result.findings.filter((x) => x.rule === "filename-alt").length, 1);
  assert.match(result.report, /assistive technology/);
  assert.match(result.report, /decorative/);
});

test("flags invalid roles, broken labelledby references, and duplicate IDs", () => {
  const result = auditAccessibilityMarkup("aria-checker", '<button role="pushbutton" aria-label="" aria-labelledby="missing" id="x"></button><p id="x"></p>');
  assert.deepEqual(new Set(result.findings.map((x) => x.rule)), new Set(["aria-valid-role", "aria-label", "aria-labelledby", "duplicate-id"]));
});

test("flags controls lacking a label but accepts a matching explicit label", () => {
  const bad = auditAccessibilityMarkup("form-checker", '<label for="name">Name</label><input id="name"><input id="other">');
  assert.equal(bad.findings.filter((x) => x.rule === "label").length, 1);
  const good = auditAccessibilityMarkup("form-checker", '<label for="name">Name</label><input id="name">');
  assert.equal(good.findings.length, 0);
  const wrapped = auditAccessibilityMarkup("form-checker", '<label>Email <input type="email"></label>');
  assert.equal(wrapped.findings.filter((x) => x.rule === "label").length, 0);
  const button = auditAccessibilityMarkup("form-checker", '<button type="submit">Save</button><button type="button"></button>');
  assert.equal(button.findings.filter((x) => x.rule === "button-name").length, 1);
});

test("flags positive tabindex, click-only custom elements, and motion without reduced mode", () => {
  const keyboard = auditAccessibilityMarkup("keyboard-navigation-checker", '<div tabindex="3">First</div><div onclick="go()">Open</div>');
  assert.ok(keyboard.findings.some((x) => x.rule === "tabindex"));
  assert.ok(keyboard.findings.some((x) => x.rule === "keyboard-operable"));
  const motion = auditAccessibilityMarkup("motion-checker", '.card { animation: spin 2s infinite; } @keyframes spin {}');
  assert.ok(motion.findings.some((x) => x.rule === "reduced-motion"));
});

test("reports outline removal without a replacement and makes no conformance claim", () => {
  const result = auditAccessibilityMarkup("focus-state-checker", 'button:focus { outline: none; }');
  assert.ok(result.findings.some((x) => x.rule === "focus-not-hidden"));
  assert.match(result.report, /separate axe-core scan/);
});

test("handles empty input as a clean but explicitly limited static review", () => {
  const result = auditAccessibilityMarkup("aria-checker", "");
  assert.equal(result.inspected, 0);
  assert.match(result.report, /separate axe-core scan/);
});
