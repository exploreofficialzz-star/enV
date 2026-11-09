import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdPageUnits } from "./page-units.ts";

const completeEnvironment = {
  enabled: "true",
  privacyConfigured: "true",
  clientId: "ca-pub-2492078126313994",
  inFeedSlotId: "1114660052",
  inFeedLayoutKey: "-fb+5w+4e-db+86",
  inArticleSlotId: "2060910216",
  multiplexSlotId: "5437048449",
};

test("editorial page units remain disabled until both global gates are enabled", () => {
  assert.equal(resolveAdPageUnits({ ...completeEnvironment, enabled: "false" }), null);
  assert.equal(resolveAdPageUnits({ ...completeEnvironment, privacyConfigured: "false" }), null);
  assert.equal(resolveAdPageUnits({ ...completeEnvironment, clientId: "" }), null);
});

test("valid publisher values resolve to three distinct page-unit formats", () => {
  const units = resolveAdPageUnits(completeEnvironment);
  assert.ok(units);
  assert.deepEqual(units["in-feed"], {
    format: "in-feed",
    clientId: "ca-pub-2492078126313994",
    slotId: "1114660052",
    layoutKey: "-fb+5w+4e-db+86",
  });
  assert.deepEqual(units["in-article"], {
    format: "in-article",
    clientId: "ca-pub-2492078126313994",
    slotId: "2060910216",
  });
  assert.deepEqual(units.multiplex, {
    format: "multiplex",
    clientId: "ca-pub-2492078126313994",
    slotId: "5437048449",
  });
});

test("in-feed requires both a valid slot and its publisher layout key", () => {
  const units = resolveAdPageUnits({
    ...completeEnvironment,¶»§q«^