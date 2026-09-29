import type { Message, MockupPlatform, Profile, ThemeTokens } from "../schema.ts";

export interface PlatformAdapter {
  id: MockupPlatform;
  name: string;
  supports: { scenes: string[]; themes: string[]; media: string[] };
  renderMessageMeta(message: Message): string;
  messageRadius: number;
  messageGap: number;
  maxBubbleWidth: string;
  renderHeader(profile: Profile, tokens: ThemeTokens): { subtitle: string; showAvatar: boolean; title?: string; notice?: string };
  featureFlags?: string[];
  composer?: { placeholder: string; actions: string[] };
  ui: {
    fontFamily: string;
    headerHeight: number;
    headerStyle: "compact" | "standard" | "minimal" | "email" | "post";
    navigationStyle: "back" | "tabs" | "sidebar" | "none";
    bubbleStyle: "rounded" | "pill" | "square" | "plain";
    composerStyle: "rounded" | "pill" | "email" | "none";
  };
}
