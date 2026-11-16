import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
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
const page = await context.newPage({ viewport: { width: 390, height: 844 } });
const applicationWrites = [];
const pageErrors = [];

page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("request", (request) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) return;
  const url = new URL(request.url());
  if (url.origin === new URL(baseUrl).origin && url.pathname.startsWith("/api/")) {
    applicationWrites.push({ method: request.method(), path: url.pathname });
  }
});

async function readDownload(download) {
  const path = await download.path();
  assert.ok(path, "Browser download has a readable temporary file");
  return readFile(path);
}

function makeDocx() {
  const documentXml = strToU8(
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>DOCX local extraction marker</w:t></w:r></w:p></w:body></w:document>',
  );
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": documentXml,
  });
}

async function makePdf({ includeText = true } = {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 300]);
  if (includeText) {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("PDF local extraction marker", { x: 40, y: 220, size: 16, font });
  }
  return Buffer.from(await pdf.save());
}

try {
  const response = await page.goto(baseUrl + "/tools/files/file-to-txt", { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, "File to TXT Converter route returns HTTP 200");
  await page.getByRole("heading", { name: "File to TXT Converter" }).first().waitFor();
  await page.waitForFunction(
    () => document.documentElement.dataset.envToolHydrated === "file-to-txt",
    null,
    { timeout: 12000 },
  );

  const convert = page.getByRole("button", { name: "Convert", exact: true });
  assert.equal(await convert.isDisabled(), true, "Conversion remains disabled without text or a selected file");

  const manualText = "enV local text export\nSecond line remains intact\n";
  await page.getByLabel("Plain text to convert to TXT").fill(manualText);
  await convert.click();
  await page.locator("pre").filter({ hasText: "enV local text export" }).waitFor();
  const manualDownloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await page.getByRole("button", { name: "Download plain-text.txt" }).click();
  const manualDownload = await manualDownloadPromise;
  assert.equal(manualDownload.suggestedFilename(), "plain-text.txt");
  assert.equal((await readDownload(manualDownload)).toString("utf8"), manualText);

  const markdown = "# Local notes\n\nExtract this file to a plain-text download.\n";
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(markdown),
  });
  await page.getByText("notes.md", { exact: true }).first().waitFor();
  await convert.click();
  await page.locator("pre").filter({ hasText: "Extract this file" }).waitFor();
  const fileDownloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await page.getByRole("button", { name: "Download notes.txt" }).click();
  const fileDownload = await fileDownloadPromise;
  assert.equal(fileDownload.suggestedFilename(), "notes.txt");
  assert.equal((await readDownload(fileDownload)).toString("utf8"), markdown);

  const docxBytes = makeDocx();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "research.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(docxBytes),
  });
  await page.getByText("research.docx", { exact: true }).first().waitFor();
  await convert.click();
  await page.locator("pre").filter({ hasText: "DOCX local extraction marker" }).waitFor();
  const docxDownloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await page.getByRole("button", { name: "Download research.txt" }).click();
  const docxDownload = await docxDownloadPromise;
  assert.equal(docxDownload.suggestedFilename(), "research.txt");
  assert.equal((await readDownload(docxDownload)).toString("utf8"), "DOCX local extraction marker\\n");

  const pdfBytes = await makePdf();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "report.pdf",
    mimeType: "application/pdf",
    buffer: pdfBytes,
  });
  await page.getByText("report.pdf", { exact: true }).first().waitFor();
  await convert.click();
  await page.locator("pre").filter({ hasText: "PDF local extraction marker" }).waitFor({ timeout: 20000 });
  const pdfDownloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await page.getByRole("button", { name: "Download report.txt" }).click();
  const pdfDownload = await pdfDownloadPromise;
  assert.equal(pdfDownload.suggestedFilename(), "report.txt");
  assert.match((await readDownload(pdfDownload)).toString("utf8"), /PDF local extraction marker/);

  const scannedPdfBytes = await makePdf({ includeText: false });
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "scanned.pdf",
    mimeType: "application/pdf",
    buffer: scannedPdfBytes,
  });
  await page.getByText("scanned.pdf", { exact: true }).first().waitFor();
  await convert.click();
  await page.getByText("No selectable text was found", { exact: false }).waitFor({ timeout: 20000 });
  assert.equal(await page.getByRole("button", { name: "Download scanned.txt" }).count(), 0,
    "Image-only PDFs are not falsely reported as successfully OCR-extracted");

  assert.deepEqual(pageErrors, [], "File-to-TXT browser workflow has no uncaught page errors");
  assert.deepEqual(applicationWrites, [], "File-to-TXT processing does not send files or text to application API write endpoints");

  writeToolAuditReport({
    auditId: "file-to-txt-browser",
    toolResults: [{
      toolId: "file-to-txt",
      status: "passed",
      checks: ["routeRendering", "interactionExecution", "outputValidation", "runtimeErrorCheck", "fileImportExport"],
      notes: "Tested manual text entry and local Markdown file input; verified downloaded TXT filenames, content bytes, route hydration, no page errors and no application API write requests.",
    }],
    reportPath: process.argv.find((value) => value.startsWith("--report="))?.slice("--report=".length),
  });

  console.log(JSON.stringify({
    status: "passed",
    route: baseUrl + "/tools/files/file-to-txt",
    checks: [
      "tool route renders and hydrates",
      "Convert stays disabled without an input",
      "manual text exports to plain-text.txt with exact content",
      "local Markdown input exports to notes.txt with exact content",
      "local DOCX input exports to research.txt with extracted text",
      "selectable-text PDF input exports to report.txt with extracted text",
      "image-only PDF returns the explicit no-OCR error rather than false success",
      "downloaded files preserve the expected text",
      "no uncaught page errors or application API write requests",
    ],
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
