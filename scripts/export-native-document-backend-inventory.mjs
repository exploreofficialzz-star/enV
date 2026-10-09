import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = resolve(root, "apps/shared/catalog.json");
const outputPath = resolve(root, "audit/native-document-backend-inventory.md");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const tools = Array.isArray(catalog) ? catalog : catalog.tools;
if (!Array.isArray(tools)) throw new Error("Could not read tools from apps/shared/catalog.json.");

function family(id) {
  for (const prefix of ["docx", "pdf", "presentation", "spreadsheet", "image"]) {
    if (id.startsWith(`${prefix}-`)) return prefix;
  }
  return "document";
}

const records = tools
  .filter((tool) => tool.status === "active" && tool.engine?.type === "document-backend")
  .map((tool) => ({ id: tool.id, operation: tool.engine.op ?? tool.id, family: family(tool.id) }))
  .sort((a, b) => a.family.localeCompare(b.family) || a.operation.localeCompare(b.operation) || a.id.localeCompare(b.id));

const grouped = new Map();
for (const record of records) {
  const key = `${record.family}\0${record.operation}`;
  const group = grouped.get(key) ?? { family: record.family, operation: record.operation, ids: [] };
  group.ids.push(record.id);
  grouped.set(key, group);
}

const lines = [
  "# Native Document-Backend Inventory",
  "",
  "Generated from `apps/shared/catalog.json`; " + records.length + " active records in " + grouped.size + " family/operation groups.",
  "",
  "## Verified web/backend contract",
  "",
  "- Web UI: `src/components/engines/document-tools-engine.tsx`.",
  "- Server route: `server/routes/api/backend/documents.post.ts`; processor: `scripts/document/process.py`.",
  "- Web request: multipart POST to `/api/backend/documents`; append each input under `files`, and include `operation`, `params` (`{ pages, text }`), and `outputName` (`<operation>-output`).",
  "- Web defaults: `pages` is `1`; watermark `text` is `enV`. The file chooser accepts `.pdf,.docx,.pptx,.xlsx,.xls,.png,.jpg,.jpeg`; it allows multiple files for merger, comparison, and splitter operations.",
  "- Successful responses are files. The server returns the processor MIME type and a `Content-Disposition` filename; the web downloads the file and displays `<Operation Label> completed · <size to 1 decimal> KB`.",
  "- Errors: no selected file yields `Choose the document or file required by this tool.`; non-2xx JSON server messages surface from `{ error }`, otherwise web uses `Document service returned HTTP <status>.`.",
  "- Both native dispatchers already target this explicit backend route. This inventory does not imply offline execution.",
  "",
  "## Catalog inventory",
  "",
  "| Family | Operation | Active tool ID(s) | Count |",
  "|---|---|---|---:|",
];
for (const group of grouped.values()) {
  lines.push("| " + group.family + " | `" + group.operation + "` | " + group.ids.map((id) => "`" + id + "`").join(", ") + " | " + group.ids.length + " |");
}
lines.push(
  "",
  "## Source audit notes",
  "",
  "- The SVG→PNG converter remains separate from this inventory and Web-only: its web engine uses browser image decoding/canvas, and native coverage must remain excluded until both platforms have a real native rasterizer.",
  "- A document operation should be marked native/backend-executable only while both platforms preserve the multipart request fields, file requirements, response bytes/MIME/filename, and observable errors.",
  "",
);
await writeFile(outputPath, lines.join("\n"), "utf8");
console.log(`Wrote ${records.length} active document-backend records in ${grouped.size} operation groups to ${outputPath}.`);
