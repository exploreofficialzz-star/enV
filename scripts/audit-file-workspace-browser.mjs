import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";

const baseUrl = (process.env.EN_V_BROWSER_AUDIT_BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const applicationWrites = [];

page.on("request", (request) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) return;
  const url = new URL(request.url());
  if (url.origin === new URL(baseUrl).origin && url.pathname.startsWith("/api/")) {
    applicationWrites.push({ method: request.method(), path: url.pathname });
  }
});

await page.addInitScript(() => {
  const queue = [];
  const makeDirectory = (files) => {
    const root = { directories: new Map(), files: new Map() };
    for (const item of files) {
      const parts = item.path.split("/").filter(Boolean);
      let current = root;
      for (const part of parts.slice(0, -1)) {
        if (!current.directories.has(part)) current.directories.set(part, { directories: new Map(), files: new Map() });
        current = current.directories.get(part);
      }
      current.files.set(parts.at(-1), item.content);
    }
    const handle = (node) => ({
      async *entries() {
        for (const [name, content] of node.files) {
          yield [name, { getFile: async () => new File([content], name, { type: "text/plain" }) }];
        }
        for (const [name, child] of node.directories) yield [name, handle(child)];
      },
    });
    return handle(root);
  };
  Object.defineProperty(window, "__envFolderFixtures", { value: queue, configurable: false });
  Object.defineProperty(window, "showDirectoryPicker", {
    configurable: true,
    value: async () => {
      const fixture = queue.shift();
      if (!fixture) throw new Error("The browser audit did not provide a folder fixture.");
      return makeDirectory(fixture);
    },
  });
});

async function openTool(slug, title) {
  const response = await page.goto(baseUrl + "/tools/files/" + slug, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, slug + " route returns HTTP 200");
  await page.getByRole("heading", { name: title }).first().waitFor();
  await page.locator('section[data-file-workspace-ready="true"]').waitFor({ timeout: 15_000 });
}

async function inspectZip(bytes) {
  const reader = new ZipReader(new BlobReader(new Blob([new Uint8Array(bytes)], { type: "application/zip" })), { useWebWorkers: false });
  try {
    const entries = await reader.getEntries();
    const result = new Map();
    for (const entry of entries) if (!entry.directory) result.set(entry.filename, await entry.getData(new TextWriter(), { checkCrc32: true }));
    return result;
  } finally {
    await reader.close();
  }
}

async function readDownload(download) {
  const path = await download.path();
  assert.ok(path, "Browser download has a readable temporary file");
  return readFile(path);
}

function file(name, content) {
  return { name, mimeType: "text/plain", buffer: Buffer.from(content) };
}

async function selectFilesAndWait(files) {
  const input = page.locator('section input[type="file"]').first();
  await input.setInputFiles(files);
  try {
    await page.getByText(files.length + " selected", { exact: false }).waitFor({ timeout: 10_000 });
  } catch (cause) {
    const inputs = await page.locator('input[type="file"]').evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.getAttribute("name"),
        multiple: element.hasAttribute("multiple"),
        webkitdirectory: element.hasAttribute("webkitdirectory"),
        fileNames: Array.from(element.files ?? []).map((selected) => selected.name),
        parent: element.parentElement?.outerHTML.slice(0, 240),
      })),
    );
    const section = await page.locator("section").first().innerText().catch(() => "no workspace section");
    const errors = await page.getByRole("alert").allTextContents();
    throw new Error(
      "Selected files did not appear in the workspace. Inputs: " + JSON.stringify(inputs)
      + ". Section: " + section + ". Errors: " + JSON.stringify(errors)
      + ". Cause: " + String(cause),
    );
  }
}

async function clickAndDownload(buttonName) {
  const pendingDownload = page.waitForEvent("download", { timeout: 20_000 })
    .then((download) => ({ download }))
    .catch((cause) => ({ cause }));
  await page.getByRole("button", { name: buttonName }).click();
  const result = await pendingDownload;
  if (result.cause) {
    const error = (await page.getByRole("alert").allTextContents()).join(" | ");
    const status = (await page.getByRole("status").allTextContents()).join(" | ");
    throw new Error(
      "No download followed " + buttonName + ". Error: " + (error || "none")
      + ". Status: " + (status || "none")
      + ". Cause: " + String(result.cause),
    );
  }
  return result.download;
}

try {
  await openTool("file-organizer", "File Organizer");
  await selectFilesAndWait([
    file("report.txt", "organizer report"),
    file("photo.png", "image placeholder bytes"),
  ]);
  const organizerDownload = await clickAndDownload("Organize copies into ZIP");
  const organizerFiles = await inspectZip(await readDownload(organizerDownload));
  assert.equal(organizerFiles.get("Documents/report.txt"), "organizer report");
  assert.equal(organizerFiles.get("Images/photo.png"), "image placeholder bytes");

  await openTool("batch-file-renamer", "Batch File Renamer");
  await selectFilesAndWait([file("alpha.txt", "alpha"), file("beta.txt", "beta")]);
  await page.getByLabel("Prefix").fill("copy-");
  await page.getByLabel("Suffix").fill("-ready");
  const renameDownload = await clickAndDownload("Export renamed ZIP");
  const renamedFiles = await inspectZip(await readDownload(renameDownload));
  assert.equal(renamedFiles.get("001-copy-alpha-ready.txt"), "alpha");
  assert.equal(renamedFiles.get("002-copy-beta-ready.txt"), "beta");

  await openTool("duplicate-file-finder", "Duplicate File Finder");
  await selectFilesAndWait([
    file("first.txt", "same content"), file("copy.txt", "same content"), file("different.txt", "other content"),
  ]);
  await page.getByRole("button", { name: "Find identical files" }).click();
  await page.getByText("Duplicate group 1", { exact: false }).waitFor();
  const duplicateReport = await page.locator("pre").innerText();
  assert.match(duplicateReport, /SHA-256 [a-f0-9]{64}/);
  assert.match(duplicateReport, /first\.txt/);
  assert.match(duplicateReport, /copy\.txt/);
  assert.doesNotMatch(duplicateReport, /different\.txt/);

  await openTool("folder-size-analyzer", "Folder Size Analyzer");
  await page.evaluate((files) => window.__envFolderFixtures.push(files), [
    { path: "docs/notes.txt", content: "alpha" },
    { path: "images/pixel.png", content: "1234567" },
  ]);
  await page.getByRole("button", { name: "Choose folder" }).click();
  await page.getByRole("button", { name: "Analyze storage" }).click();
  await page.getByText("Files scanned: 2", { exact: true }).waitFor();
  const folderReport = await page.locator("pre").innerText();
  assert.match(folderReport, /Documents/);
  assert.match(folderReport, /Images/);

  await openTool("file-search", "File Search");
  await page.evaluate((files) => window.__envFolderFixtures.push(files), [
    { path: "reports/notes.txt", content: "first line\nfind this exact phrase\nlast line" },
    { path: "reports/other.txt", content: "unrelated content" },
  ]);
  await page.getByRole("button", { name: "Choose folder" }).click();
  await page.getByPlaceholder("Search names or text inside files").fill("exact phrase");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText("Search complete.", { exact: false }).waitFor();
  const searchReport = await page.locator("pre").innerText();
  assert.match(searchReport, /notes\.txt:2/);
  assert.match(searchReport, /find this exact phrase/);

  await openTool("file-compare", "File & Folder Compare");
  await page.evaluate((fixtures) => window.__envFolderFixtures.push(...fixtures), [
    [
      { path: "common.txt", content: "same" },
      { path: "diff.txt", content: "old" },
      { path: "Old.txt", content: "left" },
      { path: "case.txt", content: "lowercase" },
    ],
    [
      { path: "common.txt", content: "same" },
      { path: "diff.txt", content: "new" },
      { path: "new.txt", content: "right" },
      { path: "Case.txt", content: "uppercase" },
    ],
  ]);
  await page.getByRole("button", { name: "Choose first folder" }).click();
  await page.getByRole("button", { name: "Choose second folder" }).click();
  await page.getByRole("button", { name: "Compare sets" }).click();
  await page.getByText("Comparison results", { exact: true }).waitFor();
  const comparison = (await page.locator("section").textContent()) ?? "";
  assert.match(comparison, /common\.txt[\s\S]*same/);
  assert.match(comparison, /diff\.txt[\s\S]*changed/);
  assert.match(comparison, /Old\.txt[\s\S]*removed/);
  assert.match(comparison, /new\.txt[\s\S]*added/);
  assert.match(comparison, /case\.txt[\s\S]*removed/);
  assert.match(comparison, /Case\.txt[\s\S]*added/);

  assert.deepEqual(applicationWrites, [], "File workspace operations do not send file content or writes to application APIs");
  console.log(JSON.stringify({
    status: "passed",
    checks: [
      "organizer ZIP contains correct type folders and original bytes",
      "batch rename exports deterministic names and preserves file bytes",
      "duplicate finder verifies identical content using SHA-256",
      "folder analyzer indexes a locally selected directory",
      "File Search exposes folder selection and searches text content",
      "folder comparison reports same, changed, added and removed paths",
      "case-sensitive paths remain distinct",
      "workspace operations issue no application API write requests",
    ],
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
