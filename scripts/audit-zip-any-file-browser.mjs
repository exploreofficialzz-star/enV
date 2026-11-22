import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";
import { writeToolAuditReport } from "./write-tool-audit-report.mjs";

const baseUrl = (process.env.EN_V_BROWSER_AUDIT_BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const localWriteRequests = [];

page.on("request", (request) => {
  if (!["POST", "PUT", "PATCH"].includes(request.method())) return;
  const url = new URL(request.url());
  if (url.origin === new URL(baseUrl).origin) localWriteRequests.push({ method: request.method(), path: url.pathname });
});

async function readDownload(download) {
  const path = await download.path();
  assert.ok(path, "Browser download has a readable temporary file");
  return readFile(path);
}

async function inspectZip(bytes) {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/zip" });
  const reader = new ZipReader(new BlobReader(blob), { useWebWorkers: false });
  try {
    const entries = await reader.getEntries();
    const files = new Map();
    for (const entry of entries) {
      if (entry.directory) continue;
      files.set(entry.filename, await entry.getData(new TextWriter(), { checkCrc32: true }));
    }
    return files;
  } finally {
    await reader.close();
  }
}

try {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined });
    Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: undefined });
  });

  const response = await page.goto(baseUrl + "/tools/files/zip-any-file", { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, "Zip any file route returns HTTP 200");
  await page.getByRole("heading", { name: "Zip any file" }).first().waitFor();
  await page.waitForFunction(() => document.documentElement.dataset.envToolHydrated === "zip-any-file");
  await page.getByRole("tab", { name: "Compress" }).waitFor();
  await page.getByRole("button", { name: "Drop files here or choose files" }).waitFor();
  assert.equal(await page.getByText("Private and on-device", { exact: true }).count(), 0, "The tool interface does not repeat privacy explanations.");
  localWriteRequests.length = 0;

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([
    { name: "alpha.txt", mimeType: "text/plain", buffer: Buffer.from("enV local archive test: alpha") },
    { name: "beta.md", mimeType: "text/markdown", buffer: Buffer.from("# beta\n\nmultiple file compression works") },
  ]);
  await page.getByText("2 files", { exact: false }).waitFor();
  const multiDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Create ZIP archive" }).click();
  const multiDownload = await multiDownloadPromise;
  const multiFiles = await inspectZip(await readDownload(multiDownload));
  assert.equal(multiFiles.get("alpha.txt"), "enV local archive test: alpha");
  assert.equal(multiFiles.get("beta.md"), "# beta\n\nmultiple file compression works");
  await page.getByRole("status").filter({ hasText: "Your ZIP archive is ready." }).waitFor();

  await fileInput.setInputFiles([
    { name: "single.txt", mimeType: "text/plain", buffer: Buffer.from("single-file extraction roundtrip") },
  ]);
  await page.getByText("1 file", { exact: false }).waitFor();
  const singleDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Create ZIP archive" }).click();
  const singleDownload = await singleDownloadPromise;
  const singleZip = await readDownload(singleDownload);
  const singleFiles = await inspectZip(singleZip);
  assert.equal(singleFiles.get("single.txt"), "single-file extraction roundtrip");

  await page.getByRole("tab", { name: "Extract" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "single-test.zip",
    mimeType: "application/zip",
    buffer: singleZip,
  });
  await page.getByText("single-test.zip", { exact: true }).first().waitFor();
  const extractedDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Extract files" }).click();
  const extractedDownload = await extractedDownloadPromise;
  assert.equal(extractedDownload.suggestedFilename(), "single.txt");
  assert.equal((await readDownload(extractedDownload)).toString("utf8"), "single-file extraction roundtrip");
  await page.getByRole("status").filter({ hasText: "Extraction completed." }).waitFor();

  await page.getByRole("tab", { name: "Compress" }).click();
  await page.evaluate(() => {
    const capture = { calls: [], chunks: [], bytes: [] };
    Object.defineProperty(window, "__envZipSaveCapture", { configurable: true, value: capture });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async (options) => {
        capture.calls.push({
          active: navigator.userActivation?.isActive === true,
          suggestedName: options?.suggestedName,
        });
        return {
          createWritable: async () => new WritableStream({
            write(chunk) { capture.chunks.push(Array.from(new Uint8Array(chunk))); },
            close() { capture.bytes = capture.chunks.flat(); },
          }),
        };
      },
    });
  });
  await fileInput.setInputFiles({
    name: "gesture.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("save picker must be called during the click gesture"),
  });
  await page.getByText("1 file", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Create ZIP archive" }).click();
  await page.getByRole("status").filter({ hasText: "Your ZIP archive is ready." }).waitFor();
  const saveCapture = await page.evaluate(() => window.__envZipSaveCapture);
  assert.equal(saveCapture.calls.length, 1, "The native save picker is requested exactly once");
  assert.equal(saveCapture.calls[0].active, true, "The save picker is called while transient user activation is active");
  assert.match(saveCapture.calls[0].suggestedName, /\.zip$/);
  const pickerFiles = await inspectZip(Buffer.from(saveCapture.bytes));
  assert.equal(pickerFiles.get("gesture.txt"), "save picker must be called during the click gesture");

  await page.getByRole("tab", { name: "Extract" }).click();
  await page.evaluate(() => {
    const capture = { calls: [], chunks: [], bytes: [] };
    Object.defineProperty(window, "__envZipFolderCapture", { configurable: true, value: capture });
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async (options) => {
        capture.calls.push({
          active: navigator.userActivation?.isActive === true,
          mode: options?.mode,
        });
        return {
          getDirectoryHandle: async () => { throw new DOMException("No child folder expected in this test.", "NotFoundError"); },
          getFileHandle: async (_name, fileOptions) => {
            if (!fileOptions?.create) throw new DOMException("The output file does not exist yet.", "NotFoundError");
            return {
              createWritable: async () => new WritableStream({
                write(chunk) { capture.chunks.push(Array.from(new Uint8Array(chunk))); },
                close() { capture.bytes = capture.chunks.flat(); },
              }),
            };
          },
        };
      },
    });
  });
  await fileInput.setInputFiles({
    name: "folder-picker-test.zip",
    mimeType: "application/zip",
    buffer: singleZip,
  });
  await page.getByText("folder-picker-test.zip", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Extract files" }).click();
  await page.getByRole("status").filter({ hasText: "Extraction completed." }).waitFor();
  const folderCapture = await page.evaluate(() => window.__envZipFolderCapture);
  assert.equal(folderCapture.calls.length, 1, "The native folder picker is requested exactly once");
  assert.equal(folderCapture.calls[0].active, true, "The folder picker is called while transient user activation is active");
  assert.equal(folderCapture.calls[0].mode, "readwrite");
  assert.deepEqual(Buffer.from(folderCapture.bytes), Buffer.from("single-file extraction roundtrip"));

  await page.getByRole("tab", { name: "Compress" }).click();
  await page.evaluate(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async () => { throw new DOMException("The browser did not grant a save gesture.", "NotAllowedError"); },
    });
  });
  await fileInput.setInputFiles({
    name: "fallback.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("blocked save picker falls back to a normal browser download"),
  });
  await page.getByText("1 file", { exact: false }).waitFor();
  const blockedPickerDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Create ZIP archive" }).click();
  const blockedPickerDownload = await blockedPickerDownloadPromise;
  const blockedPickerFiles = await inspectZip(await readDownload(blockedPickerDownload));
  assert.equal(blockedPickerFiles.get("fallback.txt"), "blocked save picker falls back to a normal browser download");
  await page.getByRole("status").filter({ hasText: "Your ZIP archive is ready." }).waitFor();

  assert.deepEqual(localWriteRequests, [], "Compression and extraction do not send files to application APIs");
  writeToolAuditReport({
    auditId: "zip-any-file-browser",
    toolResults: [{
      toolId: "zip-any-file",
      status: "passed",
      checks: ["routeRendering", "interactionExecution", "outputValidation", "runtimeErrorCheck", "fileImportExport", "savePickerUserActivation", "directoryPickerUserActivation", "savePickerFallback"],
      notes: "Verified multi-file and single-file local ZIP creation, CRC-checked reads, extraction round-trip, active-user-gesture save and folder picker access, blocked-save-picker download fallback, byte preservation and zero application API write requests.",
    }],
    reportPath: process.argv.find((value) => value.startsWith("--report="))?.slice("--report=".length),
  });
  console.log(JSON.stringify({
    status: "passed",
    route: baseUrl + "/tools/files/zip-any-file",
    checks: [
      "tool route renders",
      "multiple local files compress into a readable ZIP",
      "single local file compresses into a readable ZIP",
      "single-file extraction restores the original bytes",
      "save picker is requested during active user activation",
      "extraction folder picker is requested during active user activation",
      "a blocked save picker falls back to a normal browser download",
      "ZIP CRC checks pass",
      "compression and extraction make no application API write requests",
    ],
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
