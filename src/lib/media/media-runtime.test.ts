import assert from "node:assert/strict";
import test from "node:test";
import { MediaJobController, chooseMediaRuntime } from "./media-runtime.ts";

const adapter = {
  kind: "browser" as const,
  canHandle: () => true,
  execute: async (_request: unknown, _signal: AbortSignal, onProgress: (value: number) => void) => { onProgress(100); return new Blob(["ok"], { type: "text/plain" }); },
};

const installDomGlobals = () => Object.defineProperties(globalThis, {
  window: { value: {}, configurable: true },
  document: { value: {}, configurable: true },
});

test("media runtime chooses an available browser adapter", () => {
  installDomGlobals();
  assert.equal(chooseMediaRuntime({ id: "x", toolId: "test", operation: "noop" }, [adapter]), "browser");
});

test("media job controller records completion", async () => {
  installDomGlobals();
  const controller = new MediaJobController([adapter]);
  const result = await controller.run({ toolId: "test", operation: "noop" });
  assert.equal(result.runtime, "browser");
  assert.equal(controller.get(result.id)?.status, "completed");
});
