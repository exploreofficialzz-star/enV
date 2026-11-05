import type { ToolMeta } from "@/types/tool";
import { isEventTemplateTool } from "@/lib/events/event-templates";

/**
 * Resolve the selected engine before TanStack commits the tool route.
 *
 * The platform stays on its current screen during this invisible preparation;
 * once the selected engine is available, the complete tool page is committed in
 * one navigation. The matching imports are shared with React.lazy in ToolEngine.
 */
export async function preloadToolEngine(tool: ToolMeta): Promise<void> {
  let pending: Promise<unknown> | null = null;

  if (tool.id === "camera-studio") {
    pending = import("@/components/engines/camera-studio-engine");
  } else if (tool.category === "mockups") {
    pending = import("@/components/engines/mockups-category-engine");
  } else if (tool.category === "screenshots") {
    pending = Promise.all([
      import("@/components/engines/screenshot-engine"),
      import("@/components/screenshots/screenshot-studio"),
    ]);
  } else if (tool.category === "events" && isEventTemplateTool(tool.id)) {
    pending = import("@/components/engines/event-template-engine");
  } else if (tool.id === "a-book") {
    pending = import("@/components/engines/a-book-engine");
  } else if (tool.id === "zip-any-file") {
    pending = import("@/components/engines/zip-archive-engine");
  } else if (tool.id === "music-downloader") {
    pending = import("@/components/engines/music-downloader-engine");
  } else if (tool.id === "song-metadata-analyzer") {
    pending = import("@/components/engines/ai-music-data-sandbox");
  } else if (tool.id === "qr-payload-inspector") {
    pending = import("@/components/engines/barcode-reader-engine");
  } else if (tool.category === "ecommerce") {
    pending = import("@/components/engines/ecommerce-engine");
  } else if (tool.status === "planned") {
    return;
  } else if (tool.requiresBackend && tool.engine.type === "custom") {
    pending = import("@/components/engines/backend-tool-engine");
  } else if (tool.category === "accessibility") {
    pending = import("@/components/engines/accessibility-engine");
  } else if (tool.category === "developer" && tool.tags.includes("developer-studio")) {
    pending = tool.slug === "ux-ui-studio"
      ? import("@/components/engines/ux-ui-studio-engine")
      : import("@/components/engines/developer-studio-engine");
  } else if (tool.category === "audio" && ["audio-bitrate-calculator", "audio-file-size-calculator"].includes(tool.id)) {
    pending = import("@/components/engines/audio-engine");
  } else {
    switch (tool.engine.type) {
      case "calculator": pending = import("@/components/engines/calculator-engine"); break;
      case "converter": pending = import("@/components/engines/converter-engine"); break;
      case "text":
      case "generator":
      case "codec":
      case "datetime":
      case "seo": pending = import("@/components/engines/io-engines"); break;
      case "color": pending = import("@/components/engines/color-engine"); break;
      case "qr":
      case "barcode": pending = import("@/components/engines/qr-engine"); break;
      case "image": pending = import("@/components/engines/image-engine"); break;
      case "cssgen": pending = import("@/components/engines/cssgen-engine"); break;
      case "mockup":
      case "post": pending = import("@/components/engines/mockup-engine"); break;
      case "file-converter": pending = import("@/components/engines/file-converter-engine"); break;
      case "developer": pending = import("@/components/engines/developer-engine"); break;
      case "pdf": pending = import("@/components/engines/pdf-engine"); break;
      case "mime": pending = import("@/components/engines/mime-engine"); break;
      case "security": pending = import("@/components/engines/security-engine"); break;
      case "creator": pending = import("@/components/engines/creator-engine"); break;
      case "business": pending = import("@/components/engines/business-engine"); break;
      case "audio": pending = import("@/components/engines/audio-engine"); break;
      case "network": pending = import("@/components/engines/network-engine"); break;
      case "ai": pending = import("@/components/engines/ai-engine"); break;
      case "video": pending = import("@/components/engines/video-engine"); break;
      case "url-media": pending = import("@/components/engines/url-media-engine"); break;
      case "url-media-info": pending = import("@/components/engines/url-media-info-engine"); break;
      case "custom":
        if (["image-comparison", "image-screenshot", "image-print-layout"].includes(tool.engine.id)) {
          pending = import("@/components/engines/image-tools-engine");
        } else if (tool.engine.id === "transcription") {
          pending = import("@/components/engines/transcription-engine");
        } else if (tool.category === "productivity") {
          pending = import("@/components/engines/productivity-engine");
        } else if (tool.category === "personal") {
          pending = import("@/components/engines/personal-engine");
        } else if (tool.category === "communication") {
          pending = import("@/components/engines/communication-engine");
        } else if (tool.category === "streaming") {
          pending = import("@/components/engines/streaming-engine");
        } else if (tool.category === "marketing") {
          pending = import("@/components/engines/marketing-engine");
        } else if (tool.category === "webdesign") {
          pending = import("@/components/engines/webdesign-engine");
        } else if (tool.category === "career") {
          pending = import("@/components/engines/career-engine");
        } else if (tool.category === "relationships") {
          pending = import("@/components/engines/relationship-engine");
        } else if (tool.category === "interactive") {
          pending = import("@/components/engines/interactive-engine");
        } else if (tool.category === "gaming") {
          pending = import("@/components/engines/gaming-engine");
        } else if (tool.category === "social") {
          pending = import("@/components/engines/social-engine");
        } else if (["events", "celebrations", "food", "travel", "photography"].includes(tool.category)) {
          pending = import("@/components/engines/planned-local-engine");
        }
        break;
      case "document": pending = import("@/components/engines/document-engine"); break;
      case "document-backend": pending = import("@/components/engines/document-tools-engine"); break;
      default: break;
    }
  }

  if (pending) await pending;
}


// Warm the shared engine library after the platform paints. This is deliberately
// background work: it gives the service worker one common set of engine chunks
// for all tool routes, including tools whose *operations* still need a backend.
const ALL_TOOL_ENGINE_MODULES: Array<() => Promise<unknown>> = [
  () => import("@/components/engines/calculator-engine"),
  () => import("@/components/engines/converter-engine"),
  () => import("@/components/engines/color-engine"),
  () => import("@/components/engines/cssgen-engine"),
  () => import("@/components/engines/image-engine"),
  () => import("@/components/engines/mockup-engine"),
  () => import("@/components/engines/qr-engine"),
  () => import("@/components/engines/barcode-reader-engine"),
  () => import("@/components/engines/io-engines"),
  () => import("@/components/engines/document-engine"),
  () => import("@/components/engines/file-converter-engine"),
  () => import("@/components/engines/developer-engine"),
  () => import("@/components/engines/developer-studio-engine"),
  () => import("@/components/engines/ux-ui-studio-engine"),
  () => import("@/components/engines/pdf-engine"),
  () => import("@/components/engines/mime-engine"),
  () => import("@/components/engines/security-engine"),
  () => import("@/components/engines/productivity-engine"),
  () => import("@/components/engines/personal-engine"),
  () => import("@/components/engines/communication-engine"),
  () => import("@/components/engines/streaming-engine"),
  () => import("@/components/engines/marketing-engine"),
  () => import("@/components/engines/accessibility-engine"),
  () => import("@/components/engines/creator-engine"),
  () => import("@/components/engines/business-engine"),
  () => import("@/components/engines/audio-engine"),
  () => import("@/components/engines/network-engine"),
  () => import("@/components/engines/ai-engine"),
  () => import("@/components/engines/video-engine"),
  () => import("@/components/engines/url-media-engine"),
  () => import("@/components/engines/url-media-info-engine"),
  () => import("@/components/engines/webdesign-engine"),
  () => import("@/components/engines/ecommerce-engine"),
  () => import("@/components/engines/career-engine"),
  () => import("@/components/engines/relationship-engine"),
  () => import("@/components/engines/interactive-engine"),
  () => import("@/components/engines/gaming-engine"),
  () => import("@/components/engines/screenshot-engine"),
  () => import("@/components/screenshots/screenshot-studio"),
  () => import("@/components/engines/mockups-category-engine"),
  () => import("@/components/engines/social-engine"),
  () => import("@/components/engines/planned-local-engine"),
  () => import("@/components/engines/transcription-engine"),
  () => import("@/components/engines/image-tools-engine"),
  () => import("@/components/engines/document-tools-engine"),
  () => import("@/components/engines/backend-tool-engine"),
  () => import("@/components/engines/event-template-engine"),
  () => import("@/components/engines/a-book-engine"),
  () => import("@/components/engines/music-downloader-engine"),
  () => import("@/components/engines/ai-music-data-sandbox"),
  () => import("@/components/engines/zip-archive-engine"),
  () => import("@/components/engines/camera-studio-engine"),
  () => import("@/components/world-lab/world-lab"),
  () => import("@/components/game-studio/game-studio"),
];

/** Preload all route engines without gating the platform or showing progress UI. */
export async function preloadAllToolEngineModules(): Promise<void> {
  if (typeof window === "undefined" || !navigator.onLine) return;
  let next = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (next < ALL_TOOL_ENGINE_MODULES.length) {
      const load = ALL_TOOL_ENGINE_MODULES[next++];
      try { await load(); } catch { /* A failed optional chunk is retried when its tool is opened. */ }
    }
  });
  await Promise.all(workers);
}
