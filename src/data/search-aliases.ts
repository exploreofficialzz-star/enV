/**
 * Reviewed search phrasings per stable tool ID (requirements §3.1, §3.4).
 *
 * An alias is a phrase people may type for a tool that its name/keywords do not already cover.
 * Aliases rank just below an exact name match. They never assert that the tool does something.
 *
 * `source` records where the phrase came from. Only "search-console" and "bing-webmaster" (and
 * "opt-in-telemetry", if the owner ever approves it and updates the privacy policy) are measured
 * demand. "editorial-hypothesis" entries are plausible phrasings that have NOT been measured and
 * should be replaced or confirmed by scripts/learn-search-aliases.mjs.
 */
export type AliasSource = "editorial-hypothesis" | "search-console" | "bing-webmaster" | "opt-in-telemetry";
export type SearchAliasEntry = { phrases: readonly string[]; source: AliasSource; reviewed: boolean };

export const SEARCH_ALIASES: Readonly<Record<string, SearchAliasEntry>> = {
  "pdf-merger": { phrases: ["pdf joiner"], source: "editorial-hypothesis", reviewed: false },
  "image-compressor": { phrases: ["image size reducer", "reduce image size"], source: "editorial-hypothesis", reviewed: false },
  "image-resizer": { phrases: ["change image size"], source: "editorial-hypothesis", reviewed: false },
  "qr-generator": { phrases: ["qr maker", "qr code maker"], source: "editorial-hypothesis", reviewed: false },
  "json-formatter": { phrases: ["json viewer", "format json online"], source: "editorial-hypothesis", reviewed: false },
  "video-to-mp3": { phrases: ["mp4 to mp3", "convert mp4 to mp3"], source: "editorial-hypothesis", reviewed: false },
  "video-trimmer": { phrases: ["trim mp4", "cut video", "video cutter"], source: "editorial-hypothesis", reviewed: false },
  "video-to-gif": { phrases: ["mp4 to gif"], source: "editorial-hypothesis", reviewed: false },
  "exif-remover": { phrases: ["strip exif", "remove metadata from photo"], source: "editorial-hypothesis", reviewed: false },
  "heic-converter": { phrases: ["iphone photo to jpg", "heic to jpg"], source: "editorial-hypothesis", reviewed: false },
  "file-png-to-jpg-converter": { phrases: ["png to jpeg"], source: "editorial-hypothesis", reviewed: false },
  "lorem-ipsum-generator": { phrases: ["dummy text", "placeholder text"], source: "editorial-hypothesis", reviewed: false },
};
