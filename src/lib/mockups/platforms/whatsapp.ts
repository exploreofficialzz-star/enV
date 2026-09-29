import type { PlatformAdapter } from "./types.ts";

export const whatsappAdapter: PlatformAdapter = {
  id: "whatsapp",
  name: "WhatsApp",
  supports: {
    scenes: ["chat", "conversation", "group", "voice", "video", "notification", "typing", "receipt"],
    themes: ["light", "dark", "system"],
    media: ["image", "video", "audio", "document", "sticker", "gif", "location", "contact"],
  },
  featureFlags: [
    "one-to-one", "group-chat", "profile", "avatar", "online-state", "last-seen",
    "voice-call", "video-call", "text", "images", "video", "documents", "audio",
    "voice-notes", "stickers", "gifs", "location", "contacts", "links", "reactions",
    "replies", "forwarded", "edited", "deleted", "sent-delivered-read", "timestamps",
    "date-separators", "unread-markers", "typing-indicator", "attachment-menu",
    "emoji", "camera", "microphone", "send", "keyboard", "system-notice", "pinned-content",
  ],
  renderMessageMeta: (message) => {
    if (message.systemNotice) return message.systemNotice;
    const timestamp = message.timestamp ?? "";
    if (message.deleted) return `${timestamp} · deleted`;
    if (message.forwarded) return `${timestamp} · forwarded`;
    if (message.edited) return `${timestamp} · edited`;
    return timestamp;
  },
  messageRadius: 9,
  messageGap: 6,
  maxBubbleWidth: "82%",
  renderHeader: (profile) => ({
    title: profile.name,
    subtitle: profile.status ?? "online",
    showAvatar: true,
    notice: "Messages are end-to-end encrypted",
  }),
  ui: { fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif", headerHeight: 58, headerStyle: "standard", navigationStyle: "back", bubbleStyle: "rounded", composerStyle: "pill" },
  composer: {
    placeholder: "Message",
    actions: ["emoji", "attachment", "camera", "microphone", "send"],
  },
};
