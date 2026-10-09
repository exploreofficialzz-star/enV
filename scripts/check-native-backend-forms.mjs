import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");
const web = read("src/components/engines/backend-tool-engine.tsx");
const android = read("apps/android/app/src/main/java/com/chastech/env/NativeBackendToolForm.kt");
const ios = read("apps/ios/enV/ToolViews.swift");
const docWeb = read("src/components/engines/document-tools-engine.tsx");
const catalog = JSON.parse(readFileSync("apps/shared/catalog.json", "utf8"));
const documentsRoute = read("server/routes/api/backend/documents.post.ts");

// Generic web custom-backend contract: one freeform input, no option fields, JSON {}.
assert.match(web, /placeholder="Enter the input required by this tool/);
assert.match(web, /options:\{\}/);
assert.match(web, /Running…/);
assert.match(web, /env-\$\{toolId\}\.txt/);

// Native custom fields and request parameters must not invent inputs absent on web.
assert.match(android, /tool\.engine\.type == "custom"\) 6 else 2/);
assert.match(android, /backend && tool\.engine\.type != "custom"/);
assert.match(android, /else if \(tool\.engine\.type == "custom"\) "\{\}"/);
assert.match(android, /Enter the input required by this tool/);
assert.match(android, /tool\.engine\.type == "custom" -> "Run tool"/);
assert.match(android, /textSaver\.launch\("env-\$\{tool\.id\}\.txt"\)/);
assert.match(ios, /if tool\.engine\.type == "custom" \{/);
assert.match(ios, /tool\.engine\.type == "custom" \? "\{\}" : options/);
assert.match(ios, /Button\("Copy"\)/);
assert.match(ios, /Button\("Download"\)/);

// Keep the native document chooser aligned with the web input accept extensions.
assert.match(docWeb, /\.pdf,\.docx,\.pptx,\.xlsx,\.xls,\.png,\.jpg,\.jpeg/);
assert.match(android, /multiplePicker\.launch\(DOCUMENT_MIME_TYPES\)/);
for (const mime of ["application\/pdf", "image\/png", "image\/jpeg", "application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document", "application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation", "application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet", "application\/vnd\.ms-excel"]) {
  assert.match(android, new RegExp(mime));
}
assert.match(ios, /UTType\.pdf/);
assert.match(ios, /filenameExtension: "docx"/);
assert.match(ios, /filenameExtension: "pptx"/);
assert.match(ios, /filenameExtension: "xlsx"/);
assert.match(ios, /filenameExtension: "xls"/);

const docs = catalog.tools.filter((tool) => tool.engine?.type === "document-backend");
assert.ok(docs.length > 0, "catalog must include document-backend operations");
for (const tool of docs) {
  const op = tool.engine.op ?? tool.id;
  assert.ok(op.length > 0, `document operation missing for ${tool.id}`);
}
const operationList = documentsRoute.match(/const OPS = new Set\(\[([\s\S]*?)\]\);/);
assert.ok(operationList, "document API must define an explicit operation allowlist");
const apiOperations = [...operationList[1].matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]);
const catalogOperations = docs.map((tool) => tool.engine.op ?? tool.id);
assert.equal(new Set(apiOperations).size, apiOperations.length, "document API allowlist must not contain duplicate operations");
assert.deepEqual([...apiOperations].sort(), [...catalogOperations].sort(), "document API allowlist must exactly cover all catalog document-backend operations");
assert.match(docWeb, /multiple=\{\/merger\|comparison\|splitter\/\.test\(op\)\}/);
assert.match(android, /Regex\("merger\|comparison\|splitter"\)/);
assert.match(ios, /merger\|comparison\|splitter/);
assert.match(docWeb, /\.test\(op\).*pages/);
assert.match(android, /operation\.contains\("page-"\).*operation\.endsWith\("splitter"\)/s);
assert.match(ios, /operation\.contains\("page-"\).*operation\.hasSuffix\("splitter"\)/s);
assert.match(docWeb, /watermark/);
assert.match(android, /operation\.contains\("watermark"\)/);
assert.match(ios, /operation\.contains\("watermark"\)/);
assert.match(docWeb, /onClick=\{\(\)=>\{setFiles\(\[\]\);setOut\(""\);setErr\(null\)\}\}/);
assert.match(android, /if \(isDocument\) OutlinedButton\(onClick\s*=\s*\{\s*output = ""\s*error = ""\s*bytes = null\s*files = emptyList\(\)\s*\}\s*\)/s);
assert.match(ios, /Button\("Reset", action: reset\)\.buttonStyle\(\.bordered\)(?!\.disabled\(working\))/);
assert.match(ios, /private func reset\(\) \{ files = \[\]; output = ""; outputData = nil; error = nil \}/);
assert.doesNotMatch(ios, /private func reset\(\) \{[^}]*pages\s*=/);
assert.doesNotMatch(ios, /private func reset\(\) \{[^}]*watermarkText\s*=/);
assert.match(android, /if \(isDocument\) OutlinedButton\(onClick\s*=/);

console.log(`PASS: custom backend form contracts and document selectors match web behavior; ${docs.length} document operations audited.`);
