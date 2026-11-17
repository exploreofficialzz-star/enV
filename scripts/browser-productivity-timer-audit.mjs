import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { writeToolAuditReport } from "./write-tool-audit-report.mjs";

const argument = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const baseUrl = argument("base-url", "http://127.0.0.1:8080").replace(/\/$/, "");
const reportPath = argument("report", "");
const toolAuditReportPath = process.env.TOOL_AUDIT_REPORT_PATH || "";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = [];

const timerToolNames = {
  "focus-timer": "Focus Timer",
  "pomodoro-timer": "Pomodoro Timer",
  stopwatch: "Stopwatch",
};

async function openTool(page, toolId) {
  const response = await page.goto(`${baseUrl}/tools/productivity/${toolId}`, { waitUntil: "networkidle" });
  if (!response?.ok()) throw new Error(`Detail route returned HTTP ${response?.status() ?? 0}.`);
  const heading = (await page.locator("h1").first().textContent())?.trim() ?? "";
  if (heading !== timerToolNames[toolId]) {
    throw new Error(`Expected tool heading "${timerToolNames[toolId]}", received "${heading}".`);
  }
  await page.waitForFunction(
    (id) => document.documentElement.dataset.envToolHydrated === id,
    toolId,
    { timeout: 10_000 },
  );
}

async function audit(toolId, run) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  try {
    await run(page);
    if (browserErrors.length) {
      throw new Error(`Browser runtime errors: ${browserErrors.join(" | ")}`);
    }
    results.push({
      toolId,
      tool: toolId,
      status: "passed",
      checks: ["routeRendering", "interactionExecution", "outputValidation", "runtimeErrorCheck"],
      notes: "The timer route rendered and hydrated, its timer controls completed the exercised workflow and expected states, and no browser runtime errors were observed.",
    });
  } catch (error) {
    results.push({
      toolId,
      tool: toolId,
      status: "blocked",
      blockedChecks: ["routeRendering", "interactionExecution", "outputValidation", "runtimeErrorCheck"],
      error: String(error?.stack ?? error),
      notes: [String(error?.message ?? error), ...browserErrors].join(" "),
    });
  } finally {
    await page.close();
  }
}

try {
  await audit("focus-timer", async (page) => {
    await openTool(page, "focus-timer");
    await page.getByLabel(/Focus minutes/).fill("2");
    await page.getByLabel(/Break minutes/).fill("1");
    await page.getByText("02:00", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByText("01:59", { exact: true }).waitFor({ timeout: 3_000 });
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Resume" }).click();
    await page.getByRole("button", { name: "Reset" }).click();
    await page.getByText("02:00", { exact: true }).waitFor();
  });

  await audit("pomodoro-timer", async (page) => {
    await openTool(page, "pomodoro-timer");
    await page.getByText("Round 1 · Focus", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByText("Round 1 · Break", { exact: true }).waitFor();
    await page.getByText("05:00", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByText("Round 2 · Focus", { exact: true }).waitFor();
    await page.getByText("25:00", { exact: true }).waitFor();
  });

  await audit("stopwatch", async (page) => {
    await openTool(page, "stopwatch");
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByText(/^00:01\.\d{2}$/).waitFor({ timeout: 3_000 });
    await page.getByRole("button", { name: "Lap" }).click();
    await page.getByText("Lap 1", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Resume" }).waitFor();
    await page.getByRole("button", { name: "Reset" }).click();
    await page.getByText("00:00.00", { exact: true }).waitFor();
    await page.getByText("Lap 1", { exact: true }).waitFor({ state: "detached" });
  });
} finally {
  await browser.close();
}

const report = {
  baseUrl,
  viewport: { width: 390, height: 844 },
  total: results.length,
  passed: results.filter((result) => result.status === "passed").length,
  failed: results.filter((result) => result.status !== "passed").length,
  results,
};
if (reportPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
writeToolAuditReport({
  auditId: "productivity-timers-browser",
  reportPath: toolAuditReportPath,
  toolResults: results.map((result) => ({
    toolId: result.toolId,
    status: result.status,
    ...(result.status === "passed" ? { checks: result.checks } : { blockedChecks: result.blockedChecks }),
    notes: result.notes ?? result.error ?? "",
  })),
});
console.log(JSON.stringify(report, null, 2));
if (report.failed > 0) process.exitCode = 1;
