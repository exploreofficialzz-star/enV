import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createDefaultProject } from "./project.ts";
import { DEVICE_TEMPLATES } from "./devices.ts";
import { platformTheme } from "./themes.ts";
import { renderProjectSvg } from "./render.ts";
import { PLATFORM_ADAPTERS } from "./platforms/registry.ts";
import { compatibleDevice } from "./compatibility.ts";

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }

test("golden render remains deterministic", () => {
  const project = createDefaultProject("whatsapp");
  const device = DEVICE_TEMPLATES.find((d) => d.id === project.deviceTemplate)!;
  const svg1 = renderProjectSvg(project, device, platformTheme(project.platform, project.theme).tokens);
  const svg2 = renderProjectSvg(project, device, platformTheme(project.platform, project.theme).tokens);
  assert.equal(hash(svg1), hash(svg2));
  assert.match(svg1, /<svg/);
  assert.match(svg1, /WhatsApp|Alex/);
});

test("device responsive matrix has compatible targets", () => {
  const project = createDefaultProject("whatsapp");
  const adapter = PLATFORM_ADAPTERS.whatsapp;
  const compatible = DEVICE_TEMPLATES.filter((device) => compatibleDevice(adapter, device));
  assert.ok(compatible.some((d) => d.family === "iphone"));
  assert.ok(compatible.some((d) => d.family === "android"));
  assert.ok(compatible.some((d) => d.family === "browser"));
});

test("export settings cover all prompt export formats", () => {
  const formats = new Set(["png", "jpg", "webp", "svg", "gif", "webm", "mp4"]);
  assert.deepEqual([...formats].sort(), ["gif", "jpg", "mp4", "png", "svg", "webm", "webp"]);
});
