import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const sharedPicker = read("src/components/tools/file-dropzone.tsx");
assert.match(sharedPicker, /matchesAcceptedType/, "The shared picker validates extensions and MIME types.");
assert.match(sharedPicker, /onDragOver/, "The shared picker supports drag and drop.");
assert.match(sharedPicker, /onDrop/, "The shared picker receives dropped files.");
assert.match(sharedPicker, /event\.key !== "Enter"/, "The shared picker supports keyboard activation.");
assert.match(sharedPicker, /aria-disabled/, "The shared picker exposes disabled state to assistive technology.");
assert.match(sharedPicker, /role="alert"/, "Unsupported files produce an accessible validation message.");

const genericUploadSurfaces = [
  "src/components/ai/ai-assist-panel.tsx",
  "src/components/engines/document-tools-engine.tsx",
  "src/components/engines/transcription-engine.tsx",
  "src/components/engines/mime-engine.tsx",
  "src/components/engines/image-tools-engine.tsx",
  "src/components/engines/pdf-engine.tsx",
  "src/components/engines/video-engine.tsx",
  "src/components/engines/audio-engine.tsx",
  "src/components/engines/audio-extra-tools.tsx",
  "src/components/engines/color-engine.tsx",
  "src/components/engines/developer-engine.tsx",
  "src/components/engines/business-engine.tsx",
  "src/components/engines/music-sandbox-editor.tsx",
  "src/components/engines/music-downloader-engine.tsx",
  "src/components/engines/barcode-reader-engine.tsx",
  "src/components/engines/file-converter-engine.tsx",
  "src/components/engines/file-workspace-engine.tsx",
  "src/components/engines/zip-archive-engine.tsx",
  "src/components/engines/developer-recipe-workbench.tsx",
  "src/components/engines/music-live-video-studio.tsx",
  "src/components/engines/a-book-engine.tsx",
  "src/components/world-lab/time-controller.tsx",
  "src/components/world-lab/world-layers-panel.tsx",
  "src/components/screenshots/panels-scene.tsx",
  "src/components/engines/image-engine-legacy.tsx",
  "src/components/engines/image/metadata-studio.tsx",
  "src/components/engines/image/watermark-studio.tsx",
  "src/components/engines/image/compose-studio.tsx",
];

for (const path of genericUploadSurfaces) {
  const source = read(path);
  assert.ok(source.includes("FileDropzone"), path + " must use the shared file picker.");
  if (path !== "src/components/engines/music-live-video-studio.tsx" &&
      path !== "src/components/engines/a-book-engine.tsx" &&
      path !== "src/components/engines/file-workspace-engine.tsx") {
    assert.doesNotMatch(source, /type=["']file["']/i, path + " must not introduce an independent raw file input.");
  }
}

// These remaining file controls are narrowly scoped project, backup, preset, or asset imports.
// Ordinary audio/image/document selection in these experiences already uses FileDropzone.
const specialistImporters = {
  "src/components/engines/a-book-engine.tsx": "A Book keeps its explicit full-library backup restore action; note attachments use FileDropzone.",
  "src/components/engines/music-live-video-studio.tsx": "Only the portable sound-preset JSON importer remains a toolbar action; backing audio uses FileDropzone.",
  "src/components/engines/ai-music-data-sandbox.tsx": "A purpose-built local multi-file music library and drag/drop asset workflow.",
  "src/components/engines/audio-music-studio.tsx": "A waveform editor with source handoff, arrangement tracks, and studio-specific import controls.",
  "src/components/engines/mockups-category-engine.tsx": "Mockups imports media and structured project JSON from its project toolbar.",
  "src/components/engines/ux-ui-studio-engine.tsx": "The design canvas imports fonts, images, screenshots, icons, presets, and structured layers into editor-specific panels.",
  "src/components/game-studio/game-studio.tsx": "Game Studio imports project bundles and typed scene assets into its asset pipeline.",
  "src/components/world-lab/world-lab.tsx": "World Lab imports native project and CAD exchange files from its project toolbar.",
};
for (const [path, rationale] of Object.entries(specialistImporters)) {
  assert.ok(read(path).length > 0, path + " remains a reviewed specialist importer: " + rationale);
}

const fileWorkspace = read("src/components/engines/file-workspace-engine.tsx");
assert.match(fileWorkspace, /FileDropzone/, "File workspace file selections use the shared picker.");
assert.match(fileWorkspace, /showDirectoryPicker/, "Directory selection keeps the native folder picker where supported.");
assert.match(fileWorkspace, /setAttribute\("webkitdirectory"/, "Directory selection keeps its browser folder-input fallback.");

const liveVideo = read("src/components/engines/music-live-video-studio.tsx");
assert.match(liveVideo, /FileDropzone/, "Live backing audio must use the shared picker.");
assert.match(liveVideo, /\.env-audio-preset\.json|audio-preset/i, "The specialist sound-preset import remains available.");
const aBook = read("src/components/engines/a-book-engine.tsx");
assert.match(aBook, /FileDropzone/, "A Book note attachments use the shared picker.");
assert.match(aBook, /\.abook|application\/zip/, "A Book still supports local backup restore.");

const serverBackedCopy = [
  ["src/components/engines/transcription-engine.tsx", /configured enV transcription service/],
  ["src/components/engines/video-engine.tsx", /configured enV processing endpoint/],
  ["src/components/engines/document-tools-engine.tsx", /enV document processor/],
  ["src/components/engines/audio-engine.tsx", /configured enV media endpoint/],
];
for (const [path, pattern] of serverBackedCopy) {
  assert.match(read(path), pattern, path + " must disclose the destination for server-backed file processing.");
}

// File to TXT also supports direct, unrestricted plain-text entry inside its card wrapper.
const fileToTxt = read("src/components/engines/file-converter-engine.tsx");
assert.match(fileToTxt, /<Textarea[\s\S]*?value=\{plainText\}/, "File to TXT must offer a controlled plain-text editor.");
assert.match(fileToTxt, /No built-in word or character limit\./, "Direct text entry must not advertise an artificial limit.");
assert.match(fileToTxt, /new Blob\(\[plainText\]/, "Manually entered text must be downloadable as a TXT blob.");
assert.doesNotMatch(fileToTxt, /maxLength=/, "The File to TXT input must not impose a maxLength.");

// Remove explanatory filler from ZIP and business cards while preserving actual controls.
const zipUi = read("src/components/engines/zip-archive-engine.tsx");
assert.doesNotMatch(zipUi, /Private and on-device|This browser can extract a single small file directly|Files stay on this device/i);
const registry = read("src/lib/registry.ts");
assert.match(registry, /id: "zip-any-file"[\s\S]*?description: "Create ZIP archives from files or folders, or extract an archive\."/);
const business = read("src/components/engines/business-engine.tsx");
assert.doesNotMatch(business, /Privacy-first:|Privacy: document details/i);

console.log(JSON.stringify({
  status: "passed",
  sharedPicker: "keyboard, drag/drop, accepted-type validation and accessible errors",
  standardizedSurfaces: genericUploadSurfaces.length,
  reviewedSpecialistImporters: Object.keys(specialistImporters).length,
  checks: [
    "generic file uploads use FileDropzone",
    "server-backed uploads disclose their destination",
    "project, preset and library import exceptions are explicitly classified",
    "ZIP card copy is concise and redundant explanations are absent",
  ],
}, null, 2));
