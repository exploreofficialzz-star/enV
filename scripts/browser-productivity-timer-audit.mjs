import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const argument = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const baseUrl = argument("base-url", "http://127.0.0.1:8080").replace(/\/$/, "");
const reportPath = argument("report", "");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = [];

async function audit(name, run) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await run(page);
    results.push({ tool: name, status: "passed" });
  } catch (error) {
    results.push({ tool: name, status: "failed", error: String(error?.stack ?? error) });
  } finally {
    await page.close();
  }
}

try {
  await audit("focus-timer", async (page) => {
    await page.goto(`${baseUrl}/tools/productivity/focus-timer`, { waitUntil: "networkidle" });
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
    await page.goto(`${baseUrl}/tools/productivity/pomodoro-timer`, { waitUntil: "networkidle" });
    await page.getByText("Round 1 · Focus", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByText("Round 1 · Break", { exact: true }).waitFor();
    await page.getByText("05:00", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByText("Round 2 · Focus", { exact: true }).waitFor();
    await page.getByText("25:00", { exact: true }).waitFor();
  });

  await audit("stopwatch", async (page) => {
    await page.goto(`${baseUrl}/tools/productivity/stopwatch`, { waitUntil: "networkidle" });
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

const report = { baseUrl, viewport: { width: 390, height: 844 }, total: results.length, passed: results.filter((r) => r.status === "passed").length, failed: results.filter((r) => r.status === "failed").length, results };
if (reportPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (report.failed > 0) process.exitCode = 1;
