import type { MockupPlatform } from "../schema.ts";
import type { PlatformAdapter } from "./types.ts";
import { whatsappAdapter } from "./whatsapp.ts";
import { instagramAdapter } from "./instagram.ts";
import { imessageAdapter } from "./imessage.ts";
import { messengerAdapter } from "./messenger.ts";
import { discordAdapter } from "./discord.ts";
import { telegramAdapter } from "./telegram.ts";
import { signalAdapter } from "./signal.ts";
import { xAdapter } from "./x.ts";
import { tiktokAdapter } from "./tiktok.ts";
import { snapchatAdapter } from "./snapchat.ts";
import { slackAdapter } from "./slack.ts";
import { googleMessagesAdapter } from "./google-messages.ts";
import { linkedinAdapter } from "./linkedin.ts";
import { redditAdapter } from "./reddit.ts";
import { threadsAdapter } from "./threads.ts";
import { emailAdapter } from "./email.ts";
import { gmailAdapter } from "./gmail.ts";
import { outlookAdapter } from "./outlook.ts";
import { aiChatAdapter } from "./ai-chat.ts";
import { smsAdapter } from "./sms.ts";
import { tinderAdapter } from "./tinder.ts";
import { youtubeAdapter } from "./youtube.ts";


const commonScenes = ["chat", "conversation", "group", "voice", "video", "notification", "typing", "receipt", "post"];
const commonThemes = ["light", "dark", "system"];
const commonMedia = ["image", "video", "audio", "document", "gif"];

type Config = Partial<Omit<PlatformAdapter, "id" | "name" | "ui">> & { name: string; scenes?: string[]; media?: string[]; ui?: Partial<PlatformAdapter["ui"]> };

const configs: Record<Exclude<MockupPlatform, "whatsapp">, Config> = {
  imessage: { name: "iMessage", messageRadius: 18, messageGap: 6, maxBubbleWidth: "78%", ui: { headerStyle: "standard", bubbleStyle: "pill", composerStyle: "pill" }, featureFlags: ["tapbacks", "read-receipts", "typing", "audio-messages"] },
  "instagram-dm": { name: "Instagram Direct", messageRadius: 20, messageGap: 5, maxBubbleWidth: "80%", ui: { headerStyle: "standard", navigationStyle: "tabs", bubbleStyle: "pill", composerStyle: "pill" }, featureFlags: ["reactions", "media", "stories", "voice-messages", "video-calls"] },
  messenger: { name: "Messenger", messageRadius: 18, messageGap: 5, maxBubbleWidth: "80%", ui: { bubbleStyle: "pill", composerStyle: "pill" }, featureFlags: ["reactions", "replies", "media", "voice-messages", "video-calls"] },
  telegram: { name: "Telegram", messageRadius: 12, messageGap: 4, maxBubbleWidth: "82%", ui: { bubbleStyle: "rounded", composerStyle: "pill" }, featureFlags: ["reactions", "replies", "stickers", "voice-messages", "video-calls"] },
  discord: { name: "Discord", messageRadius: 8, messageGap: 3, maxBubbleWidth: "86%", scenes: ["chat", "conversation", "group", "voice", "video", "notification", "typing", "receipt"], ui: { headerStyle: "compact", navigationStyle: "sidebar", bubbleStyle: "square", composerStyle: "rounded" }, featureFlags: ["threads", "reactions", "attachments", "voice", "video"] },
  snapchat: { name: "Snapchat", messageRadius: 18, messageGap: 5, maxBubbleWidth: "82%", ui: { bubbleStyle: "pill", composerStyle: "pill" }, featureFlags: ["snaps", "stories", "voice", "video"] },
  "x-dm": { name: "X Direct Messages", messageRadius: 18, messageGap: 5, maxBubbleWidth: "80%", ui: { headerStyle: "minimal", bubbleStyle: "pill", composerStyle: "pill" }, featureFlags: ["read-receipts", "reactions", "media"] },
  "google-messages": { name: "Google Messages", messageRadius: 18, messageGap: 6, maxBubbleWidth: "82%", ui: { bubbleStyle: "rounded", composerStyle: "pill" }, featureFlags: ["rcs", "typing", "read-receipts", "media", "group-chat"] },
  sms: { name: "SMS", messageRadius: 18, messageGap: 6, maxBubbleWidth: "82%", ui: { bubbleStyle: "rounded", composerStyle: "pill" }, featureFlags: ["text", "media", "delivery-state"] },
  signal: { name: "Signal", messageRadius: 16, messageGap: 6, maxBubbleWidth: "82%", ui: { bubbleStyle: "rounded", composerStyle: "pill" }, featureFlags: ["reactions", "read-receipts", "disappearing-messages", "pinned-messages", "voice", "video"] },
  slack: { name: "Slack", messageRadius: 8, messageGap: 3, maxBubbleWidth: "86%", scenes: ["chat", "conversation", "group", "voice", "video", "notification", "typing", "receipt"], ui: { headerStyle: "compact", navigationStyle: "sidebar", bubbleStyle: "square", composerStyle: "rounded" }, featureFlags: ["threads", "reactions", "huddles", "files", "mentions"] },
  notification: { name: "System Notification", messageRadius: 16, messageGap: 8, maxBubbleWidth: "92%", scenes: ["notification"], media: ["image"], ui: { headerStyle: "minimal", navigationStyle: "none", bubbleStyle: "rounded", composerStyle: "none" } },
  "linkedin-dm": { name: "LinkedIn Messaging", messageRadius: 16, messageGap: 6, maxBubbleWidth: "82%", ui: { bubbleStyle: "rounded", composerStyle: "rounded" }, featureFlags: ["reactions", "media", "read-receipts"] },
  reddit: { name: "Reddit Chat", messageRadius: 14, messageGap: 5, maxBubbleWidth: "82%", ui: { bubbleStyle: "rounded", composerStyle: "rounded" }, featureFlags: ["chat", "media", "reactions"] },
  tinder: { name: "Tinder", messageRadius: 18, messageGap: 6, maxBubbleWidth: "82%", scenes: ["chat", "conversation", "typing", "receipt"], ui: { bubbleStyle: "pill", composerStyle: "pill" }, featureFlags: ["matches", "media", "typing"] },
  "tiktok-chat": { name: "TikTok Messages", messageRadius: 18, messageGap: 5, maxBubbleWidth: "82%", ui: { bubbleStyle: "pill", composerStyle: "pill" }, featureFlags: ["media", "reactions", "voice-messages"] },
  threads: { name: "Threads Direct", messageRadius: 18, messageGap: 5, maxBubbleWidth: "82%" },
  "ai-chat": { name: "AI Chat", messageRadius: 16, messageGap: 8, maxBubbleWidth: "86%", scenes: ["chat", "conversation", "group", "voice", "video", "notification", "typing", "receipt"], ui: { headerStyle: "standard", bubbleStyle: "rounded", composerStyle: "rounded" }, featureFlags: ["streaming", "attachments", "voice", "model-label"] },
  email: { name: "Email", messageRadius: 4, messageGap: 8, maxBubbleWidth: "92%", scenes: ["conversation", "notification", "receipt", "post"] },
  gmail: { name: "Gmail", messageRadius: 4, messageGap: 8, maxBubbleWidth: "92%", scenes: ["conversation", "notification", "receipt", "post"] },
  outlook: { name: "Outlook", messageRadius: 4, messageGap: 8, maxBubbleWidth: "92%", scenes: ["conversation", "notification", "receipt", "post"] },
  "facebook-post": { name: "Facebook Post", messageRadius: 8, messageGap: 8, maxBubbleWidth: "94%", scenes: ["post", "notification"] },
  "instagram-post": { name: "Instagram Post", messageRadius: 8, messageGap: 8, maxBubbleWidth: "94%", scenes: ["post", "notification"] },
  "tiktok-post": { name: "TikTok Post", messageRadius: 8, messageGap: 8, maxBubbleWidth: "94%", scenes: ["post", "notification"] },
  "x-post": { name: "X Post", messageRadius: 8, messageGap: 8, maxBubbleWidth: "94%", scenes: ["post", "notification"] },
  "linkedin-post": { name: "LinkedIn Post", messageRadius: 8, messageGap: 8, maxBubbleWidth: "94%", scenes: ["post", "notification"] },
  "reddit-post": { name: "Reddit Post", messageRadius: 8, messageGap: 8, maxBubbleWidth: "94%", scenes: ["post", "notification"] },
  "youtube-community": { name: "YouTube Community", messageRadius: 8, messageGap: 8, maxBubbleWidth: "94%", scenes: ["post", "notification"] },
  "threads-post": { name: "Threads Post", messageRadius: 8, messageGap: 8, maxBubbleWidth: "94%", scenes: ["post", "notification"] },
};

function makeAdapter(id: Exclude<MockupPlatform, "whatsapp">, config: Config): PlatformAdapter {
  const scenes = config.scenes ?? commonScenes;
  const ui = {
    fontFamily: config.ui?.fontFamily ?? "-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    headerHeight: config.ui?.headerHeight ?? 58,
    headerStyle: config.ui?.headerStyle ?? "standard",
    navigationStyle: config.ui?.navigationStyle ?? "back",
    bubbleStyle: config.ui?.bubbleStyle ?? "rounded",
    composerStyle: config.ui?.composerStyle ?? "rounded",
  };
  return {
    id,
    name: config.name,
    supports: { scenes, themes: commonThemes, media: config.media ?? commonMedia },
    renderMessageMeta: (message) => message.edited ? "edited" : message.timestamp ?? "",
    messageRadius: config.messageRadius ?? 16,
    messageGap: config.messageGap ?? 6,
    maxBubbleWidth: config.maxBubbleWidth ?? "82%",
    renderHeader: (profile) => ({ title: profile.name, subtitle: profile.status ?? "online", showAvatar: true }),
    ui,
  };
}

export const PLATFORM_ADAPTERS: Record<MockupPlatform, PlatformAdapter> = {
  ...(Object.fromEntries(Object.entries(configs)
    .filter(([id]) => !["instagram-dm", "imessage", "messenger", "discord", "telegram", "signal", "x-dm", "tiktok-chat", "snapchat", "slack", "google-messages", "linkedin-dm", "reddit", "threads", "email", "gmail", "outlook", "ai-chat", "sms", "tinder", "youtube-community"].includes(id))
    .map(([id, config]) => [id, makeAdapter(id as Exclude<MockupPlatform, "whatsapp">, config)])) as Record<Exclude<MockupPlatform, "whatsapp" | "instagram-dm" | "imessage" | "messenger" | "discord">, PlatformAdapter>),
  whatsapp: whatsappAdapter,
  "instagram-dm": instagramAdapter,
  imessage: imessageAdapter,
  messenger: messengerAdapter,
  discord: discordAdapter,
  signal: signalAdapter,
  "x-dm": xAdapter,
  "tiktok-chat": tiktokAdapter,
  snapchat: snapchatAdapter,
  slack: slackAdapter,
  "google-messages": googleMessagesAdapter,
  "linkedin-dm": linkedinAdapter,
  reddit: redditAdapter,
  threads: threadsAdapter,
  email: emailAdapter,
  gmail: gmailAdapter,
  outlook: outlookAdapter,
  "ai-chat": aiChatAdapter,
  sms: smsAdapter,
  tinder: tinderAdapter,
  "youtube-community": youtubeAdapter,
};
