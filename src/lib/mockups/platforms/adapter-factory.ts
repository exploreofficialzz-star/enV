import type { MockupPlatform } from "../schema.ts";
import type { PlatformAdapter } from "./types.ts";

type AdapterConfig = Omit<PlatformAdapter, "renderMessageMeta" | "renderHeader" | "supports" | "id" | "name"> & {
  id: MockupPlatform;
  name: string;
  scenes: string[];
  media: string[];
  themes?: string[];
  headerSubtitle?: (status?: string) => string;
  meta?: (timestamp: string, edited?: boolean, deleted?: boolean, forwarded?: boolean) => string;
};

export function createPlatformAdapter(config: AdapterConfig): PlatformAdapter {
  return {
    id: config.id,
    name: config.name,
    supports: { scenes: config.scenes, themes: config.themes ?? ["light", "dark", "system"], media: config.media },
    renderMessageMeta: (message) => config.meta?.(message.timestamp ?? "", message.edited, message.deleted, message.forwarded) ?? message.timestamp ?? "",
    messageRadius: config.messageRadius,
    messageGap: config.messageGap,
    maxBubbleWidth: config.maxBubbleWidth,
    renderHeader: (profile) => ({ title: profile.name, subtitle: config.headerSubtitle?.(profile.status) ?? profile.status ?? "online", showAvatar: true }),
    featureFlags: config.featureFlags,
    composer: config.composer,
    ui: config.ui,
  };
}
