import assert from "node:assert/strict";
import test from "node:test";
import {
  getToolAccessPreference,
  setToolAccessPreference,
  TOOL_ACCESS_PREFERENCE_KEY,
} from "./access-preference.ts";

test("tool access preference is isolated by tool id", () => {
  const entries = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value); },
    } },
  });
  try {
    assert.equal(getToolAccessPreference("json-formatter"), "ads");
    assert.equal(getToolAccessPreference("pdf-merger"), "ads");
    assert.equal(setToolAccessPreference("json-formatter", "tokens"), true);
    assert.equal(entries.get(`${TOOL_ACCESS_PREFERENCE_KEY}:json-formatter`), "tokens");
    assert.equal(getToolAccessPreference("json-formatter"), "tokens");
    assert.equal(getToolAccessPreference("pdf-merger"), "ads");
    assert.equal(setToolAccessPreference("json-formatter", "ads"), true);
    assert.equal(getToolAccessPreference("json-formatter"), "ads");
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("invalid tool ids cannot write shared access preferences", () => {
  const entries = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value); },
    } },
  });
  try {
    assert.equal(setToolAccessPreference("../wallet", "tokens"), false);
    assert.equal(entries.size, 0);
    assert.equal(getToolAccessPreference("../wallet"), "ads");
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
