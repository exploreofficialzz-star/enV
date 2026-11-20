import assert from "node:assert/strict";
import test from "node:test";
import { getToolAccessPreference, setToolAccessPreference, TOOL_ACCESS_PREFERENCE_KEY } from "./access-preference.ts";

test("tool access preference defaults to ads and stores an explicit token choice", () => {
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
    assert.equal(getToolAccessPreference(), "ads");
    assert.equal(setToolAccessPreference("tokens"), true);
    assert.equal(entries.get(TOOL_ACCESS_PREFERENCE_KEY), "tokens");
    assert.equal(getToolAccessPreference(), "tokens");
    assert.equal(setToolAccessPreference("ads"), true);
    assert.equal(getToolAccessPreference(), "ads");
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
