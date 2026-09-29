export type MockupPlatform =
  | "whatsapp" | "imessage" | "instagram-dm" | "messenger" | "telegram" | "discord"
  | "snapchat" | "x-dm" | "google-messages" | "sms" | "signal" | "slack"
  | "linkedin-dm" | "reddit" | "tinder" | "tiktok-chat" | "threads" | "ai-chat" | "notification"
  | "notification" | "email" | "gmail" | "outlook" | "facebook-post" | "instagram-post" | "tiktok-post"
  | "x-post" | "linkedin-post" | "reddit-post" | "youtube-community" | "threads-post";

export type MockupScene =
  | "chat" | "conversation" | "group" | "voice" | "video" | "notification"
  | "typing" | "receipt" | "post";

export type MockupTheme = "light" | "dark" | "system";
export type DeviceTemplateId = string;

export interface Profile {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  status?: string;
  verified?: boolean;
}

export interface MediaAsset {
  id: string;
  kind: "image" | "video" | "audio" | "gif" | "document" | "avatar";
  name: string;
  mimeType: string;
  url: string;
  width?: number;
  height?: number;
  durationMs?: number;
  source?: "upload" | "generated" | "licensed" | "original";
  license?: string;
  waveform?: number[];
  thumbnailUrl?: string;
  objectFit?: "contain" | "cover" | "fill";
  crop?: { x: number; y: number; width: number; height: number };
  scale?: number;
}

export interface Reaction {
  id: string;
  messageId: string;
  emoji: string;
  profileId: string;
}

export interface Reply {
  messageId: string;
  parentMessageId: string;
}

export interface Message {
  id: string;
  profileId: string;
  kind?: "message" | "system" | "notice";
  text?: string;
  media?: MediaAsset[];
  timestamp?: string;
  dateLabel?: string;
  state?: "sending" | "sent" | "delivered" | "read";
  edited?: boolean;
  deleted?: boolean;
  forwarded?: boolean;
  replyTo?: string;
  reactions?: Reaction[];
  typing?: boolean;
  pinned?: boolean;
  unread?: boolean;
  systemNotice?: string;
  attachmentLabel?: string;
}

export interface TimelineEvent {
  id: string;
  atMs: number;
  type: "typing" | "message" | "state" | "reaction" | "playback" | "scroll" | "call";
  targetId?: string;
  value?: string | number | boolean;
}

export interface DeviceTemplate {
  id: DeviceTemplateId;
  name: string;
  family: "iphone" | "android" | "tablet" | "desktop" | "browser" | "watch" | "custom";
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  bezelPx: number;
  radiusPx: number;
  safeTopPx: number;
  safeBottomPx: number;
  statusBar: boolean;
  navigationBar: "gesture" | "three-button" | "none";
  cutout: "dynamic-island" | "notch" | "punch-hole" | "none";
  darkFrame?: boolean;
}

export interface ThemeTokens {
  background: string;
  surface: string;
  text: string;
  secondaryText: string;
  accent: string;
  outgoing: string;
  incoming: string;
  separator: string;
  status: string;
  header: string;
}

export interface ThemeDefinition {
  id: MockupTheme;
  name: string;
  tokens: ThemeTokens;
}

export interface ExportSettings {
  format: "png" | "jpg" | "webp" | "svg" | "gif" | "webm" | "mp4";
  scale: 1 | 2 | 3;
  width?: number;
  height?: number;
  transparent: boolean;
  durationMs?: number;
  fps?: number;
}

export interface MockupProject {
  schemaVersion: 1;
  id: string;
  name: string;
  platform: MockupPlatform;
  scene: MockupScene;
  deviceTemplate: DeviceTemplateId;
  theme: MockupTheme;
  profiles: Profile[];
  messages: Message[];
  media: MediaAsset[];
  timeline: TimelineEvent[];
  exportSettings: ExportSettings;
  createdAt: string;
  updatedAt: string;
}
