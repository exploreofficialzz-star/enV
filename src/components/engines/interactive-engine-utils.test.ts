import test from "node:test";
import assert from "node:assert/strict";
import { buildInteractiveOutput, parseInteractiveToolId } from "./interactive-engine-utils.ts";

test("parses supported workflows and families", () => {
  assert.deepEqual(parseInteractiveToolId("ask-out-generator"), { family: "ask-out", workflow: "generator" });
  assert.deepEqual(parseInteractiveToolId("story-page-builder"), { family: "story", workflow: "page-builder" });
  assert.throws(() => parseInteractiveToolId("story-generator"));
});

test("builds a real interactive HTML page", () => {
  const out = buildInteractiveOutput("choice", "shareable-page", { title: "Pick", recipient: "Sam", body: "Choose one", optionA: "Tea", optionB: "Coffee", date: "" });
  assert.match(out, /<!doctype html>/i);
  assert.match(out, /Tea/);
  assert.match(out, /Coffee/);
  assert.match(out, /onclick=/);
});

test("rejects invalid countdowns and missing choices", () => {
  assert.throws(() => buildInteractiveOutput("countdown", "page-builder", { title: "T", recipient: "R", body: "B", optionA: "", optionB: "", date: "2000-01-01T00:00" }), /future/);
  assert.throws(() => buildInteractiveOutput("choice", "page-builder", { title: "T", recipient: "R", body: "B", optionA: "", optionB: "B", date: "" }), /first option/);
});
