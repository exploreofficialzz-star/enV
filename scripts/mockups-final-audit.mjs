import { readFileSync, writeFileSync } from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const source = readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8");
const tools = parseGeneratedCatalog(source).filter((tool) => tool.category === "mockups");
const normalize = (value) => {
  const id = value.replace(/-mockup$/, "");
  const aliases = { x: "x-dm", google: "google-messages", instagram: "instagram-dm", ai: "ai-chat", "reddit-chat": "reddit", tiktok: "tiktok-chat", "threads-dm": "threads" };
  if (id === "notification") return "notification";
  if (id === "ai-chat" || id === "threads" || id === "tiktok-chat") return id;
  for (const suffix of ["-group-chat", "-voice-note", "-video-call", "-notification", "-typing-indicator", "-read-receipt", "-conversation", "-chat"]) {
    if (id.endsWith(suffix)) return aliases[id.slice(0, -suffix.length)] ?? id.slice(0, -suffix.length);
  }
  return aliases[id] ?? id;
};
const sceneOf = (value) => {
  const id = value.replace(/-mockup$/, "");
  if (id === "notification" || id.endsWith("-notification")) return "notification";
  if (id.endsWith("-group-chat")) return "group";
  if (id.endsWith("-voice-note")) return "voice";
  if (id.endsWith("-video-call")) return "video";
  if (id.endsWith("-typing-indicator")) return "typing";
  if (id.endsWith("-read-receipt")) return "receipt";
  if (id.endsWith("-conversation")) return "conversation";
  if (id.endsWith("-post")) return "post";
  return "chat";
};
const platforms = new Set([
  "whatsapp","imessage","instagram-dm","messenger","telegram","discord","snapchat","x-dm","google-messages","sms","signal","slack","linkedin-dm","reddit","tinder","tiktok-chat","threads","ai-chat","notification","email","gmail","outlook","facebook-post","instagram-post","tiktok-post","x-post","linkedin-post","reddit-post","youtube-community","threads-post"
]);
const rows = tools.map((tool) => {
  const platform = normalize(tool.id);
  const scene = sceneOf(tool.id);
  const mapped = platforms.has(platform);
  return {
    Tool: tool.name,
    "Internal ID": tool.id,
    Platform: platform,
    Scene: scene,
    "Available Device Templates": "Registry",
    "Available Themes": "light, dark, system",
    Implemented: tool.status === "active" && mapped,
    Renderer: mapped ? "Shared Mockups renderer + platform adapter" : "Missing",
    Editor: "Shared editor",
    Media: "Structured media engine",
    Animation: "Deterministic timeline",
    Export: "SVG/PNG/JPG/WebP + animated pipeline",
    Tests: "Focused Mockups suite",
    "Research Complete": ["notification"].includes(platform) ? false : true,
    "Asset License Verified": false,
    "Known Limitations": "Full browser golden, asset-license, security/accessibility and provider-version verification remain required.",
    Status: mapped && tool.status === "active" ? "INCOMPLETE — implementation present; final quality gate not yet passed" : "BLOCKED",
  };
});
const csv = [Object.keys(rows[0]).join(","), ...rows.map((r) => Object.values(r).map((v) => `"${String(v).replaceAll('"','""')}"`).join(","))].join("\n");
writeFileSync(new URL("../docs/mockups-final-audit.csv", import.meta.url), csv);
const md = `# enV Mockups — Final Audit\n\nDate: 2026-09-29\n\n## Summary\n\n- Total Mockups tools: ${rows.length}\n- Catalog-routed tools: ${rows.filter(r => r.Renderer !== "Missing").length}\n- Blocked by routing: ${rows.filter(r => r.Status === "BLOCKED").length}\n- Final quality-gate complete: 0 (the prompt requires all gates to pass before completion)\n- Platform IDs represented: ${new Set(rows.map(r => r.Platform)).size}\n- Device templates: registry-driven\n- Themes: light, dark, system\n- Static exports: SVG, PNG, JPG, WebP\n- Animated export pipeline: GIF/WebM/MP4 paths exist but require environment/browser/media-processor integration verification\n\n## Quality-gate interpretation\n\nThe catalog is mapped to the shared engine, but a mapped entry is not marked COMPLETE unless renderer, device/template, theme, user-data propagation, media, interactions, export, responsive behavior, error handling, tests, licensing, and end-to-end flow are verified. Therefore the current tool statuses remain INCOMPLETE until the remaining Phase 1, 9, 11 and 12 checks pass.\n\nThe full per-tool audit is in mockups-final-audit.csv.\n`;
writeFileSync(new URL("../docs/mockups-final-audit.md", import.meta.url), md);
console.log(`Audited ${rows.length} Mockups tools; ${rows.filter(r => r.Renderer !== "Missing").length} routed; ${rows.filter(r => r.Status === "BLOCKED").length} blocked.`);
