import test from "node:test";
import assert from "node:assert/strict";
import { DEVICE_TEMPLATES } from "./devices.ts";
import { PLATFORM_ADAPTERS } from "./platforms/registry.ts";
import { compatibleDevice, compatibleScene } from "./compatibility.ts";

test("platform registry exposes every configured platform", () => {
  assert.equal(Object.keys(PLATFORM_ADAPTERS).length, 30);
  assert.ok(PLATFORM_ADAPTERS.whatsapp.supports.scenes.includes("group"));
});

test("device registry contains multiple families and variants", () => {
  assert.ok(DEVICE_TEMPLATES.some((d) => d.id === "iphone-pro-light"));
  assert.ok(DEVICE_TEMPLATES.some((d) => d.id === "android-fold-inner"));
  assert.ok(DEVICE_TEMPLATES.some((d) => d.family === "desktop"));
});

test("compatibility rejects unsupported scenes/devices", () => {
  assert.equal(compatibleScene(PLATFORM_ADAPTERS.tinder, "video"), false);
  assert.equal(compatibleDevice(PLATFORM_ADAPTERS.email, DEVICE_TEMPLATES.find((d) => d.id === "iphone-modern-light")!), false);
});
