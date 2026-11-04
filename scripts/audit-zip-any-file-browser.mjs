import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";

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

  const response = await page.goto(baseUrl + "/tools/productivity/zip-any-file", { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, "Zip any file route returns HTTP 200");
  await page.getByRole("heading", { name: "Zip any file" }).first().waitFor();
  await page.waitForFunction(() => document.documentElement.dataset.envToolHydrated === "zip-any-file");
  await page.getByRole("tab", { name: "Compress" }).waitFor();
  await page.getByText("Private and on-device", { exact: true }).waitFor();
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
  await page.getByText("single-test.zip", { exact: true }).waitFor();
  const extractedDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Extract files" }).click();
  const extractedDownload = await extractedDownloadPromise;
  assert.equal(extractedDownload.suggestedFilename(), "single.txt");
  assert.equal((await readDownload(extractedDownload)).toString("utf8"), "single-file extraction roundtrip");
  await page.getByRole("status").filter({ hasText: "Extraction completed." }).waitFor();

  assert.deepEqual(localWriteRequests, [], "Compression and extraction do not send files to application APIs");
  console.log(JSON.stringify({
    status: "passed",
    route: baseUrl + "/tools/productivity/zip-any-file",
    checks: [
      "tool route renders",
      "multiple local files compress into a readable ZIP",
      "single local file compresses into a readable ZIP",
      "single-file extraction restores the original bytes",
      "ZIP CRC checks pass",
      "compression and extraction make no application API write requests",
    ],
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
