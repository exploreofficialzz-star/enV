import test from "node:test";
import assert from "node:assert/strict";
import { buildRelationshipOutput, parseRelationshipToolId, scoreRelationshipQuiz } from "./relationship-engine-utils.ts";

test("relationship parser covers catalog workflow families", () => {
  for (const id of ["crush-generator","crush-quiz","ask-out-message-builder","valentine-countdown-page","memory-reveal-page","surprise-interactive-page"]) {
    assert.doesNotThrow(() => parseRelationshipToolId(id));
  }
});

test("quiz scoring is based on completed answers", () => {
  assert.equal(scoreRelationshipQuiz("crush", ["a","b","c","d","e"]), 100);
  assert.equal(scoreRelationshipQuiz("crush", ["a","","","",""]), 20);
});

test("message and page workflows generate real output", () => {
  const input = { person:"Alex", otherPerson:"Sam", details:"Let’s celebrate a great memory together.", tone:"warm", date:new Date(Date.now()+86400000).toISOString().slice(0,16), answers:["yes","yes","yes","yes","yes"] };
  assert.match(buildRelationshipOutput("friendship","message-builder",input), /Sam/);
  assert.match(buildRelationshipOutput("surprise","interactive-page",input), /Show message/);
  assert.match(buildRelationshipOutput("couple","countdown-page",input), /setInterval/);
});

test("past countdown dates are rejected", () => {
  const input = { person:"A", otherPerson:"B", details:"Hello", tone:"warm", date:"2000-01-01T00:00", answers:[] };
  assert.throws(() => buildRelationshipOutput("couple","countdown-page",input), /future/);
});
