/**
 * Curated workflow collections (requirements §3.5).
 *
 * EDITORIAL DRAFT: membership was chosen from tool names and categories in the registry and has not
 * been reviewed by a person who has used each tool. Every member ID is mechanically validated in
 * src/lib/discovery-collections.test.ts (exists, active/beta, discoverable, canonical, unique), and
 * descriptions deliberately make no capability claims beyond the tool names.
 */
export type DiscoveryCollection = {
  id: string;
  title: string;
  description: string;
  toolIds: readonly string[];
  curation: "draft-unreviewed";
};

export const DISCOVERY_COLLECTIONS: readonly DiscoveryCollection[] = [
  { id: "pdf-essentials", title: "PDF essentials", description: "Tools for working with PDF files.", curation: "draft-unreviewed",
    toolIds: ["pdf-merger", "pdf-splitter", "pdf-compressor", "pdf-rotator", "pdf-to-word", "pdf-watermark-tool"] },
  { id: "image-basics", title: "Image basics", description: "Tools for resizing, compressing, converting and inspecting images.", curation: "draft-unreviewed",
    toolIds: ["image-compressor", "image-resizer", "heic-converter", "file-png-to-jpg-converter", "file-jpg-to-png-converter", "image-watermark", "image-color-picker", "exif-viewer", "exif-remover"] },
  { id: "video-basics", title: "Video basics", description: "Tools for trimming and converting video.", curation: "draft-unreviewed",
    toolIds: ["video-trimmer", "video-compressor", "video-to-gif", "video-to-mp3", "video-to-mp4"] },
  { id: "developer-everyday", title: "Everyday developer utilities", description: "Formatting, encoding and lookup utilities.", curation: "draft-unreviewed",
    toolIds: ["json-formatter", "json-to-csv", "csv-to-json", "base64-encoder", "url-encoder", "regex-tester", "unix-timestamp-converter", "slug-generator"] },
  { id: "text-case", title: "Text case", description: "Tools for changing the case of text.", curation: "draft-unreviewed",
    toolIds: ["title-case-converter", "sentence-case-converter", "camel-case-converter", "snake-case-converter", "kebab-case-converter", "uppercase-converter", "lowercase-converter"] },
  { id: "security-basics", title: "Passwords and hashes", description: "Password generation and hashing tools.", curation: "draft-unreviewed",
    toolIds: ["password-generator", "hash-generator", "sha256-hash"] },
  { id: "money-planning", title: "Money planning", description: "Loan, savings and interest calculators.", curation: "draft-unreviewed",
    toolIds: ["loan-calculator", "mortgage-calculator", "compound-interest-calculator", "savings-goal-calculator", "tip-calculator"] },
  { id: "focus-and-timing", title: "Focus and timing", description: "Timers and stopwatches.", curation: "draft-unreviewed",
    toolIds: ["pomodoro-timer", "focus-timer", "stopwatch"] },
  { id: "qr-codes", title: "QR codes", description: "Tools for creating QR codes.", curation: "draft-unreviewed",
    toolIds: ["qr-generator", "event-qr-generator"] },
] as const;
