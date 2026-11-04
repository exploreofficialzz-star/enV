/**
 * Operation-aware Web local-execution policy shared by billing-profile generation,
 * offline package eligibility, and policy regression tests.
 *
 * Catalogue flags are the first gate. A small number of hybrid engines expose exact
 * local sub-operations even when the legacy tool-level flags still point at a backend;
 * those are explicit allowlist overrides, never inferred from category names alone.
 */

/**
 * @typedef {object} OfflineToolRecord
 * @property {string} id
 * @property {string} category
 * @property {string} status
 * @property {boolean} clientSide
 * @property {boolean} requiresBackend
 * @property {boolean} requiresAuth
 * @property {{type?: string, op?: string}} [engine]
 */

export const OFFLINE_LOCAL_DOCUMENT_TOOL_IDS = new Set([
  "pdf-merger", "pdf-metadata-viewer", "pdf-metadata-tool", "pdf-page-extractor",
  "pdf-splitter", "pdf-rotator", "docx-text-extractor", "text-to-docx", "txt-to-docx",
  "markdown-to-docx",
]);

const LOCAL_ENGINE_TYPES = new Set([
  "calculator", "converter", "datetime", "text", "codec", "color", "qr", "barcode",
  "generator", "image", "cssgen", "mockup", "post", "device", "seo", "file-converter",
  "developer", "pdf", "mime", "security", "creator", "business", "audio", "network",
  "ai", "video", "document",
]);

const LOCAL_CUSTOM_CATEGORIES = new Set([
  "accessibility", "career", "celebrations", "communication", "ecommerce", "events",
  "food", "gaming", "interactive", "marketing", "mockups", "personal", "photography",
  "productivity", "relationships", "screenshots", "social", "streaming", "travel", "webdesign",
]);

const LOCAL_NAMED_CUSTOM_TOOLS = new Set([
  "a-book", "zip-any-file", "music-downloader", "song-metadata-analyzer",
  "qr-payload-inspector", "image-comparison-tool", "image-screenshot-tool",
  "image-print-layout-helper",
]);

const SERVER_AUDIO_OPERATIONS = new Set([
  "server-mp3", "server-wav", "server-ogg", "server-flac", "server-volume",
  "server-bitrate", "server-sample-rate", "server-channels", "server-merge",
]);

const SERVER_VIDEO_OPERATIONS = new Set([
  "video-merge", "video-replace-audio", "video-to-mp4", "video-to-mp3", "video-to-gif",
  "video-to-webm", "video-to-mov", "video-to-avi", "video-resize", "video-crop",
  "video-rotate", "video-mute", "video-fps", "video-bitrate", "video-resolution-presets",
  "video-audio-volume",
]);

const SERVER_TOOL_IDS = new Set([
  "audio-to-mp3-server", "audio-to-wav-server", "audio-to-ogg-server", "audio-to-flac-server",
  "audio-bitrate-converter", "audio-merger", "audio-to-text", "audio-to-subtitles",
  "video-merger", "video-audio-replacer", "video-to-mp4", "video-to-mp3", "video-to-gif",
  "video-to-webm", "video-to-mov", "video-to-avi", "video-resize", "video-crop",
  "video-rotate", "video-mute", "video-fps", "video-bitrate", "video-resolution-presets",
  "video-audio-volume", "video-cropper", "video-to-text", "video-to-subtitles",
  "youtube-audio-extractor", "url-media-inspector", "video-url-downloader",
  "youtube-video-downloader", "tiktok-video-downloader", "facebook-video-downloader",
  "instagram-video-downloader", "x-video-downloader", "whois-lookup", "dns-lookup",
  "website-screenshot", "media-backend-checker",
]);

const REMOTE_ENGINE_TYPES = new Set(["url-media", "url-media-info"]);

/**
 * @param {OfflineToolRecord | null | undefined} tool
 */
export function offlineRemoteOperationReason(tool) {
  const toolId = typeof tool?.id === "string" ? tool.id : "";
  const engine = tool?.engine ?? {};
  const engineType = typeof engine.type === "string" ? engine.type : "";
  const op = typeof engine.op === "string" ? engine.op : "";
  if (SERVER_TOOL_IDS.has(toolId)) return "This tool operation is served by an enV backend or external media resolver.";
  if (engineType === "audio" && SERVER_AUDIO_OPERATIONS.has(op)) return "This audio operation uploads its file to the configured enV media processor.";
  if (engineType === "video" && SERVER_VIDEO_OPERATIONS.has(op)) return "This video operation uploads its file to the configured enV media processor.";
  if (REMOTE_ENGINE_TYPES.has(engineType)) return "This tool reads or processes remote media URLs and requires a network service.";
  if (engineType === "document-backend" && !OFFLINE_LOCAL_DOCUMENT_TOOL_IDS.has(toolId)) {
    return "This document operation requires the enV document-processing backend.";
  }
  return null;
}

/**
 * @param {OfflineToolRecord | null | undefined} tool
 */
export function isOfflineLocalToolRecord(tool) {
  if (!tool || typeof tool.id !== "string" || !["active", "beta"].includes(tool.status)) return false;
  // These document operations are implemented in runLocalDocument even though their
  // legacy catalog entry still has document-backend flags. All other document operations
  // remain online-only.
  if (OFFLINE_LOCAL_DOCUMENT_TOOL_IDS.has(tool.id)) return true;
  if (offlineRemoteOperationReason(tool)) return false;
  if (tool.requiresAuth || tool.requiresBackend || tool.clientSide !== true) return false;

  const engineType = typeof tool.engine?.type === "string" ? tool.engine.type : "unknown";
  if (LOCAL_ENGINE_TYPES.has(engineType)) return true;
  if (engineType === "custom") {
    return LOCAL_NAMED_CUSTOM_TOOLS.has(tool.id) || LOCAL_CUSTOM_CATEGORIES.has(tool.category);
  }
  // Screenshot and mockup categories dispatch to their own local engines before the
  // generic engine switch. They are included only after the ordinary metadata gates.
  return false;
}
