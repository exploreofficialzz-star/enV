import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
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
const pageErrors = [];
const applicationWrites = [];
const toolResults = [];

page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("request", (request) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) return;
  const url = new URL(request.url());
  if (url.origin === new URL(baseUrl).origin && url.pathname.startsWith("/api/")) {
    applicationWrites.push({ method: request.method(), path: url.pathname });
  }
});

async function runTool(toolId, title, operation, notes, category = "files", options = {}) {
  let check = "routeRendering";
  const completedChecks = [];
  const errorsBefore = pageErrors.length;
  const writesBefore = applicationWrites.length;
  try {
    const response = await page.goto(baseUrl + "/tools/" + category + "/" + toolId, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200, toolId + " route returns HTTP 200");
    await page.getByRole("heading", { name: options.heading ?? title }).first().waitFor();
    await page.waitForFunction(
      (id) => document.documentElement.dataset.envToolHydrated === id,
      options.hydratedToolId ?? toolId,
      { timeout: 12000 },
    );
    completedChecks.push("routeRendering");

    check = "interactionExecution";
    await operation();
    completedChecks.push("interactionExecution");

    check = "outputValidation";
    assert.equal(pageErrors.length, errorsBefore, toolId + " has no uncaught browser page errors");
    assert.equal(applicationWrites.length, writesBefore, toolId + " makes no application API write requests");
    completedChecks.push("outputValidation");

    check = "runtimeErrorCheck";
    completedChecks.push("runtimeErrorCheck");
    toolResults.push({ toolId, status: "passed", checks: completedChecks, notes });
    console.log("PASS " + toolId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    toolResults.push({
      toolId,
      status: "blocked",
      checks: completedChecks,
      blockedChecks: [check],
      notes: reason,
    });
    console.error("BLOCKED " + toolId + " at " + check + ": " + reason);
  }
}

async function runFileTransform({
  id,
  title,
  category = "files",
  inputName,
  inputMimeType,
  inputText,
  outputName,
  validatePreview,
  validateDownload,
  notes,
}) {
  await runTool(id, title, async () => {
    const fileInput = page.locator('input[type="file"]');
    assert.equal(await fileInput.count(), 1, id + " exposes exactly one local file input");
    const convert = page.getByRole("button", { name: "Convert", exact: true });
    assert.equal(await convert.isDisabled(), true, id + " disables conversion until a file is selected");
    await fileInput.setInputFiles({
      name: inputName,
      mimeType: inputMimeType,
      buffer: Buffer.from(inputText),
    });
    await convert.click();

    const downloadButton = page.getByRole("button", { name: /^Download / });
    await downloadButton.waitFor({ state: "visible", timeout: 10000 });
    const preview = await page.locator("pre").first().innerText();
    validatePreview(preview);

    const downloadPromise = page.waitForEvent("download");
    await downloadButton.click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), outputName, id + " downloads with the correct extension");
    const downloadPath = await download.path();
    assert.ok(downloadPath, id + " produces a readable local download");
    const downloaded = await readFile(downloadPath);
    validateDownload(downloaded.toString("utf8"));
  }, notes, category);
}

async function runTextTransform({ id, title, category = "files", input, validate, notes, heading = title, hydratedToolId = id, inputSelector = "#text-in", buttonName = "Run" }) {
  await runTool(id, title, async () => {
    await page.locator(inputSelector).fill(input);
    await page.getByRole("button", { name: buttonName, exact: true }).click();
    const output = page.locator('pre[aria-label="Formatted output"]');
    await output.waitFor({ timeout: 10000 });
    const value = await output.innerText();
    validate(value);
    await page.getByRole("button", { name: "Download", exact: true }).waitFor();
  }, notes, category, { heading, hydratedToolId });
}

try {
  await runFileTransform({
    id: "csv-to-json",
    title: "CSV to JSON Converter",
    inputName: "people.csv",
    inputMimeType: "text/csv",
    inputText: 'name,note\n"Ada","needs, commas"',
    outputName: "people.json",
    validatePreview(value) {
      assert.deepEqual(JSON.parse(value), [{ name: "Ada", note: "needs, commas" }]);
    },
    validateDownload(value) {
      assert.deepEqual(JSON.parse(value), [{ name: "Ada", note: "needs, commas" }]);
    },
    notes: "Imported a local CSV file containing a quoted comma, validated the JSON preview, and verified the downloaded JSON file.",
  });

  await runFileTransform({
    id: "json-to-csv",
    title: "JSON to CSV Converter",
    inputName: "people.json",
    inputMimeType: "application/json",
    inputText: '[{"name":"Ada","age":36},{"name":"Lin","age":29}]',
    outputName: "people.csv",
    validatePreview(value) {
      assert.match(value, /name,age/);
      assert.match(value, /Ada,36/);
      assert.match(value, /Lin,29/);
    },
    validateDownload(value) {
      assert.match(value, /name,age/);
      assert.match(value, /Ada,36/);
      assert.match(value, /Lin,29/);
    },
    notes: "Imported a local JSON array, validated the CSV preview, and verified the downloaded CSV file.",
  });

  await runTextTransform({
    id: "css-minifier-advanced",
    title: "Advanced CSS Minifier",
    category: "developer",
    heading: "Markup & Style Studio",
    hydratedToolId: "markup-studio",
    inputSelector: "#dev-input",
    buttonName: "Minify",
    input: "/* remove this comment */ .card { color: red; margin: 0; }",
    validate(value) {
      assert.equal(value, ".card{color:red;margin:0}");
    },
    notes: "Rendered the canonical Advanced CSS Minifier route and verified local CSS comment/whitespace minification.",
  });

  await runTextTransform({
    id: "json-to-xml",
    title: "JSON to XML",
    input: '{"name":"Ada","active":true}',
    validate(value) {
      assert.match(value, /<root>/);
      assert.match(value, /<name>[\s\S]*Ada[\s\S]*<\/name>/);
      assert.match(value, /<active>[\s\S]*true[\s\S]*<\/active>/);
    },
    notes: "Converted a JSON object to XML and verified root, text and boolean elements.",
  });

  await runTextTransform({
    id: "xml-to-json",
    title: "XML to JSON",
    input: "<root><name>Ada</name><active>true</active></root>",
    validate(value) {
      const parsed = JSON.parse(value);
      assert.equal(parsed.root.name, "Ada");
      assert.equal(parsed.root.active, "true");
    },
    notes: "Converted nested XML elements to JSON and verified the nested object and scalar values.",
  });

  await runTextTransform({
    id: "json-to-yaml",
    title: "JSON to YAML",
    input: '{"name":"Ada","active":true,"count":3}',
    validate(value) {
      assert.match(value, /name:\s*["']?Ada["']?/);
      assert.match(value, /active:\s*true/);
      assert.match(value, /count:\s*3/);
    },
    notes: "Converted JSON string, boolean and numeric values to YAML-like output and checked all fields.",
  });

  await runTextTransform({
    id: "yaml-to-json",
    title: "YAML to JSON",
    input: "name: Ada\nactive: true\ncount: 3",
    validate(value) {
      assert.deepEqual(JSON.parse(value), { name: "Ada", active: true, count: 3 });
    },
    notes: "Converted a supported simple YAML mapping to JSON and verified string, boolean and numeric scalar types.",
  });

  await runTool("file-size-converter", "File Size Converter", async () => {
    await page.locator("#from-amount").fill("1000");
    await page.getByLabel("From unit").selectOption("B");
    await page.getByLabel("To unit").selectOption("kB");
    await page.getByText(/1000\s+B\s*=\s*1\s+kB/).waitFor();
  }, "Converted 1,000 bytes to 1 kilobyte using explicit units and verified the live conversion result.");

  await runTool("mime-type-lookup", "MIME Type Lookup", async () => {
    await page.getByPlaceholder("e.g. .webp, image/png, pdf").fill(".pdf");
    await page.getByText(/application\/pdf/).first().waitFor();
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "mislabeled.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("%PDF-1.7\n", "ascii"),
    });
    await page.getByText("Signature match", { exact: true }).waitFor();
    await page.getByText("PDF (application/pdf)", { exact: false }).waitFor();
    await page.getByText("The detected signature does not match the filename extension.", { exact: false }).waitFor();
  }, "Searched the local MIME reference and inspected the first 64 bytes of a deliberately mislabeled file, verifying signature and extension mismatch reporting.");

  const reportPath = process.argv.find((value) => value.startsWith("--report="))?.slice("--report=".length);
  assert.equal(toolResults.length, 9, "The report includes all nine remaining Files tool IDs");
  writeToolAuditReport({
    auditId: "files-eight-and-css-advanced-browser",
    toolResults,
    reportPath,
  });
  const passed = toolResults.filter((item) => item.status === "passed").length;
  const blocked = toolResults.filter((item) => item.status === "blocked").length;
  console.log(JSON.stringify({ passed, blocked, expected: 9, reportPath: reportPath ?? null }, null, 2));
  assert.equal(blocked, 0, "All nine expected tool routes must pass; blocked IDs fail this CI audit.");
} finally {
  await context.close();
  await browser.close();
}
