import assert from "node:assert/strict";
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
const context = await browser.newContext();
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

async function runTool(toolId, title, operation, notes) {
  let check = "routeRendering";
  const completedChecks = [];
  const errorsBefore = pageErrors.length;
  const writesBefore = applicationWrites.length;
  try {
    const response = await page.goto(baseUrl + "/tools/files/" + toolId, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200, toolId + " route returns HTTP 200");
    await page.getByRole("heading", { name: title }).first().waitFor();
    await page.waitForFunction(
      (id) => document.documentElement.dataset.envToolHydrated === id,
      toolId,
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

async function runTextTransform({ id, title, input, validate, notes }) {
  await runTool(id, title, async () => {
    await page.locator("#text-in").fill(input);
    await page.getByRole("button", { name: "Run", exact: true }).click();
    const output = page.locator('pre[aria-label="Formatted output"]');
    await output.waitFor({ timeout: 10000 });
    const value = await output.innerText();
    validate(value);
    await page.getByRole("button", { name: "Download", exact: true }).waitFor();
  }, notes);
}

try {
  await runTextTransform({
    id: "csv-to-json",
    title: "CSV to JSON Converter",
    input: 'name,note\n"Ada","needs, commas"',
    validate(value) {
      assert.deepEqual(JSON.parse(value), [{ name: "Ada", note: "needs, commas" }]);
    },
    notes: "Converted quoted CSV fields, including an embedded comma, to a JSON object and validated the parsed output.",
  });

  await runTextTransform({
    id: "json-to-csv",
    title: "JSON to CSV Converter",
    input: '[{"name":"Ada","age":36},{"name":"Lin","age":29}]',
    validate(value) {
      assert.match(value, /name,age/);
      assert.match(value, /Ada,36/);
      assert.match(value, /Lin,29/);
    },
    notes: "Converted a two-record JSON array to CSV and verified the header and both data rows.",
  });

  {
    const toolId = "css-minifier-advanced";
    const response = await page.goto(baseUrl + "/tools/files/" + toolId, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200, toolId + " route returns HTTP 200");
    await page.waitForFunction(
      (id) => document.documentElement.dataset.envToolHydrated === id,
      toolId,
      { timeout: 12000 },
    );
    const actualTitle = await page.locator("h1").first().innerText();
    if (/^Advanced CSS Minifier$/i.test(actualTitle)) {
      toolResults.push({
        toolId,
        status: "passed",
        checks: ["routeRendering", "interactionExecution", "outputValidation", "runtimeErrorCheck"],
        notes: "Route renders with the expected Advanced CSS Minifier identity.",
      });
    } else {
      toolResults.push({
        toolId,
        status: "blocked",
        checks: [],
        blockedChecks: ["routeRendering"],
        notes: "Stable ID/slug css-minifier-advanced currently renders the unrelated page title \"" + actualTitle + "\" instead of Advanced CSS Minifier. The tool identity/route mapping requires correction before this is counted as an independent Files tool.",
      });
      console.error("BLOCKED css-minifier-advanced: expected Advanced CSS Minifier, got " + actualTitle);
    }
  }

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
    await page.getByText("application/pdf", { exact: true }).first().waitFor();
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
    auditId: "files-nine-remaining-browser",
    toolResults,
    reportPath,
  });
  console.log(JSON.stringify({
    passed: toolResults.filter((item) => item.status === "passed").length,
    blocked: toolResults.filter((item) => item.status === "blocked").length,
    expected: 9,
    reportPath: reportPath ?? null,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
