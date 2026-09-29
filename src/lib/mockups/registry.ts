import type { MockupPlatform, MockupScene } from "./schema.ts";
import { DEVICE_TEMPLATES } from "./devices.ts";

export const PLATFORM_IDS: MockupPlatform[] = [
  "whatsapp", "imessage", "instagram-dm", "messenger", "telegram", "discord", "snapchat", "x-dm", "google-messages", "sms", "signal", "slack", "linkedin-dm", "reddit", "tinder", "tiktok-chat", "threads", "ai-chat", "email", "gmail", "outlook", "facebook-post", "instagram-post", "tiktok-post", "x-post", "linkedin-post", "reddit-post", "youtube-community", "threads-post",
];

export const SCENE_IDS: MockupScene[] = ["chat", "conversation", "group", "voice", "video", "notification", "typing", "receipt", "post"];

export function compatibleDevices(platform: MockupPlatform) {
  if (platform.endsWith("-post")) return DEVICE_TEMPLATES;
  if (["email", "gmail", "outlook", "discord", "slack"].includes(platform)) return DEVICE_TEMPLATES;
  return DEVICE_TEMPLATES.filter((d) => d.family !== "watch");
}
