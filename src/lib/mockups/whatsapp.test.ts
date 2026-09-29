import test from "node:test";
import assert from "node:assert/strict";
import { whatsappAdapter } from "./platforms/whatsapp.ts";
import { createDefaultProject } from "./project.ts";
import { DEVICE_TEMPLATE_MAP } from "./devices.ts";
import { platformTheme } from "./themes.ts";
import { renderProjectSvg } from "./render.ts";

test("WhatsApp adapter exposes the benchmark feature surface", () => {
  const features = new Set(whatsappAdapter.featureFlags);
  for (const feature of ["group-chat", "voice-notes", "reactions", "replies", "edited", "deleted", "sent-delivered-read", "date-separators", "typing-indicator", "pinned-content"]) {
    assert.equal(features.has(feature), true, feature);
  }
  assert.deepEqual(whatsappAdapter.composer?.actions, ["emoji", "attachment", "camera", "microphone", "send"]);
  assert.equal(whatsappAdapter.renderHeader({ id: "them", name: "Alex", status: "last seen recently" }, platformTheme("whatsapp", "light").tokens).notice, "Messages are end-to-end encrypted");
});

test("WhatsApp rendering preserves structured message states", () => {
  const project = createDefaultProject("whatsapp");
  project.platform = "whatsapp";
  project.deviceTemplate = "iphone-pro-dark";
  project.messages = [
    { id: "m1", profileId: "them", text: "Original", timestamp: "9:41 AM", dateLabel: "Today", unread: true },
    { id: "m2", profileId: "me", text: "Reply", timestamp: "9:42 AM", state: "read", edited: true, forwarded: true, replyTo: "m1", reactions: [{ id: "r1", messageId: "m2", emoji: "❤️", profileId: "them" }] },
  ];
  const svg = renderProjectSvg(project, DEVICE_TEMPLATE_MAP.get(project.deviceTemplate)!, platformTheme("whatsapp", "dark").tokens);
  assert.match(svg, /Messages are end-to-end encrypted/);
  assert.match(svg, /Reply/);
  assert.match(svg, /Original/);
  assert.match(svg, /forwarded/);
  assert.match(svg, /❤️/);
  assert.match(svg, /✓✓/);
});
