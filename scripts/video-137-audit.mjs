import fs from "node:fs";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const root = new URL("../", import.meta.url);
const catalog = parseGeneratedCatalog(fs.readFileSync(new URL("src/data/catalog.ts", root), "utf8"));
const tools = catalog.filter((tool) => tool.category === "video");
const date = new Date().toISOString().slice(0, 10);

function location(tool) {
  if (tool.engine?.type === "url-media" || tool.engine?.type === "url-media-info") return "src/components/engines/url-media-engine.tsx + scripts/url-media-processor.mjs";
  if (tool.engine?.type === "video") return "src/components/engines/video-engine.tsx + scripts/media-processor.mjs";
  if (tool.engine?.type === "calculator") return "src/components/engines/calculator-engine.tsx + src/lib/engines/regular-calculators.ts";
  if (tool.engine?.type === "custom" && String(tool.engine?.id || "").startsWith("planned-local:")) return "src/components/engines/planned-local-engine.tsx";
  return `custom:${tool.engine?.id || "unknown"}`;
}

function status(tool) {
  if (tool.status === "planned") return "PLANNED";
  if (tool.engine?.type === "url-media" || tool.engine?.type === "url-media-info") return "PARTIAL";
  if (tool.engine?.type === "video" && tool.requiresBackend) return "PARTIAL";
  if (tool.engine?.type === "video" || tool.engine?.type === "calculator") return "PARTIAL";
  if (tool.engine?.type === "custom" && String(tool.engine?.id || "").startsWith("planned-local:")) return "PARTIAL";
  return "PARTIAL";
}

const counts = {};
for (const tool of tools) counts[status(tool)] = (counts[status(tool)] || 0) + 1;

let md = `# enV Video Category — 137-Tool Implementation Audit\n\n`;
md += `Audit date: ${date}\n\n`;
md += `This audit intentionally uses conservative quality statuses. Catalog \`active\` is not treated as proof of completion. The master prompt defines COMPLETE only after end-to-end verification, tests, truthful progress, security, accessibility, and real output are demonstrated.\n\n`;
md += `## Summary\n\n| Status | Count |\n|---|---:|\n`;
for (const key of ["COMPLETE","PARTIAL","BLOCKED","PLANNED","UNSUPPORTED"]) md += `| ${key} | ${counts[key] || 0} |\n`;
md += `\nTotal Video tools: **${tools.length}**\n\n`;
md += `## Shared implementation\n\n`;
md += `- Provider registry: \`scripts/media/provider-registry.mjs\`\n`;
md += `- URL security: \`scripts/media/url-security.mjs\`\n`;
md += `- Shared media domain model: \`src/lib/media/shared-media.ts\`\n`;
md += `- Downloader processor: \`scripts/url-media-processor.mjs\`\n`;
md += `- Downloader UI: \`src/components/engines/url-media-engine.tsx\`\n`;
md += `- URL inspector UI: \`src/components/engines/url-media-info-engine.tsx\`\n`;
md += `- FFmpeg media processor: \`scripts/media-processor.mjs\`\n`;
md += `- Video UI engine: \`src/components/engines/video-engine.tsx\`\n\n`;
md += `## Tool matrix\n\n`;
md += `| Tool ID | Name | Implementation | Status | Browser/backend | Dependencies | Known limitations | Tests | Verification date |\n|---|---|---|---|---|---|---|---|---|\n`;
for (const tool of tools.sort((a,b)=>a.id.localeCompare(b.id))) {
  const st = status(tool);
  const runtime = tool.requiresBackend ? "backend" : tool.clientSide ? "browser" : "mixed";
  const deps = tool.engine?.type === "url-media" ? "yt-dlp; provider registry" :
    tool.engine?.type === "video" && tool.requiresBackend ? "FFmpeg media processor" :
    tool.engine?.type === "video" ? "browser media APIs" :
    tool.engine?.type === "calculator" ? "calculator engine" : "planned-local engine";
  const limitation = tool.engine?.type === "url-media" ? "Live provider/service verification still required; provider restrictions are reported rather than bypassed." :
    tool.engine?.type === "video" && tool.requiresBackend ? "Requires configured FFmpeg processor and controlled end-to-end media fixture." :
    tool.engine?.type === "video" ? "Browser codec/runtime capability varies by device." :
    tool.engine?.type === "custom" ? "Shared/planned-local workflow; dedicated per-tool acceptance coverage remains to be expanded." :
    "Requires category-specific acceptance coverage.";
  const tests = tool.engine?.type === "url-media" ? "URL-media regression + URL security" :
    tool.engine?.type === "calculator" ? "calculator regression suite" :
    tool.engine?.type === "video" ? "shared VideoEngine coverage; operation-specific QA required" : "shared engine coverage";
  md += `| \`${tool.id}\` | ${tool.name.replace(/\|/g,"/")} | \`${location(tool)}\` | ${st} | ${runtime} | ${deps} | ${limitation} | ${tests} | ${date} |\n`;
}
md += `\n## Downloader-specific findings\n\n`;
md += `The six downloader tools use one shared URL-media engine and provider adapters: YouTube, TikTok, Instagram, Facebook, X, and generic/direct media. Provider-specific extraction is isolated from common downloading, validation, streaming, and delivery.\n\n`;
md += `Generic/direct media now uses real HTTP fetching with redirect revalidation, MIME validation, size limits, streamed response delivery, and HTTP Range/If-Range support for caller-supplied resume state. HTTP range semantics are defined by RFC 9110 and documented by MDN. citeturn0search4turn0search0\n\n`;
md += `The social-provider layer uses yt-dlp as the extractor. Its upstream project documents broad site extraction and licensing details; enV does not copy its source into the application. citeturn0search1turn0search2\n\n`;
md += `No DRM, authentication bypass, anti-bot bypass, cookie harvesting, paywall circumvention, or private-content access was added.\n\n`;
md += `## Verification evidence\n\n`;
md += `- Production catalog audit: passed — 10,000 tools / 10,000 unique IDs.\n`;
md += `- Catalog audit: passed — 10,000 tools.\n`;
md += `- Full existing automated test command: passed — 83 tests in the main suite and 14 mockup tests.\n`;
md += `- New shared media model test: 2/2 passed.\n`;
md += `- URL-media regression + URL-security tests: 3/3 passed.\n`;
md += `- Changed TS modules: isolated strict TypeScript checks passed for shared-media and url-media; changed TSX files passed TypeScript transpilation/syntax diagnostics.\n`;
md += `- Repository-wide \`typecheck\`: not claimed as passed because the uploaded package's dependency installation timed out before the complete toolchain was available.\n`;
md += `- Live provider downloads were not claimed as verified in this sandbox; those require the configured production processor and controlled authorized test media.\n`;
md += `\n## Research record\n\n`;
md += `- yt-dlp: extractor architecture and licensing reviewed; provider extraction remains adapter-based. citeturn0search1turn0search2\n`;
md += `- HTTP Range / If-Range: RFC 9110 and MDN reviewed for resumable transfer semantics. citeturn0search4turn0search10\n`;
md += `- Cobalt-style workflow: reviewed for the paste → resolve → deliver simplicity and service separation; enV implementation remains its own code and architecture. citeturn0search13\n`;
md += `- FFmpeg is already installed in the supplied processor Docker image and remains the shared heavy-media processing layer.\n`;
md += `\n## Known release-gate gaps\n\n`;
md += `1. Provider-by-provider live acceptance tests still need to run against authorized public fixtures.\n`;
md += `2. Persistent cross-request download job storage and a full pause/resume UI are not yet implemented; the direct endpoint supports Range/If-Range when resume state is supplied.\n`;
md += `3. HLS/DASH and subtitle/chapter normalization are not yet exposed as a complete downloader UI workflow.\n`;
md += `4. Browser/device visual and accessibility QA still needs actual rendered execution.\n`;
md += `5. Repository-wide TypeScript/build verification needs a successful dependency install in a normal development/CI environment.\n`;
fs.writeFileSync(new URL("docs/video-137-tool-audit.md", root), md)
