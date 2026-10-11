import assert from "node:assert/strict";
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

const cases = [
  { id: "ai-meeting-agenda-generator", inputs: { "Meeting goal": "Choose a launch date", Topics: "Progress\nDecision" }, includes: "Meeting goal: Choose a launch date" },
  { id: "blog-outline-generator", inputs: { "Topic / subject": "Gardening", Audience: "new growers", Goal: "Build confidence" }, includes: "Title: Gardening" },
  { id: "call-to-action-generator", inputs: { "Topic / subject": "Meal prep" }, includes: "Get started with Meal prep" },
  { id: "expand-helper", inputs: { Text: "A useful idea" }, includes: "A useful idea.\n\nKey context:" },
  { id: "faq-generator", inputs: { "Topic / subject": "Meal prep", Audience: "students", "Key points": "Storage\nCost" }, includes: "Q: Storage about Meal prep?" },
  { id: "feature-benefit-generator", inputs: { "Topic / subject": "Collaboration", Audience: "teams", "Main benefit": "Shared workspace, Fast search" }, includes: "Feature: Shared workspace", includesAll: ["Feature: Fast search"] },
  { id: "meeting-action-items", inputs: { "Rough notes": "Sam — draft\nLee — review" }, includes: "Action items\n1. Sam — draft" },
  { id: "product-title-generator", inputs: { "Topic / subject": "Focus app", "Main benefit": "Plan a calmer day" }, includes: "Focus app — Plan a calmer day" },
  { id: "pros-cons-generator", inputs: { "Topic / subject": "Pilot a new workflow", "Option / decision": "Launch now vs wait" }, includes: "Decision worksheet: Launch now vs wait" },
  { id: "shorten-helper", inputs: { Text: Array.from({ length: 29 }, (_, index) => `word${index + 1}`).join(" ") }, includes: "word28…", excludes: "word29" },
  { id: "tiktok-caption-helper", inputs: { "Topic / subject": "Quiet mornings", Audience: "students", Options: "2" }, includes: "Quiet mornings made simple. Save this for later." },
  { id: "youtube-description-helper", inputs: { "Topic / subject": "Urban gardening", Audience: "beginners", Tone: "professional", "Key points": "Tools\nPlanning" }, includes: "break down Urban gardening for beginners in a clear and professional way" },
  { id: "youtube-title-helper", inputs: { "Topic / subject": "Learning SQL", Audience: "analysts", Options: "2" }, includes: "Learning SQL: What analysts Should Know" },
];

const results = [];
try {
  for (const testCase of cases) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.goto(`${baseUrl}/tools/ai/${testCase.id}`, { waitUntil: "networkidle" });
      for (const [label, value] of Object.entries(testCase.inputs)) {
        const control = page.getByLabel(label, { exact: true });
        if (label === "Tone") await control.selectOption(value);
        else await control.fill(value);
      }
      await page.getByRole("button", { name: "Generate", exact: true }).click();
      const output = page.locator("pre").last();
      await output.waitFor({ state: "visible" });
      const text = await output.innerText();
      assert.ok(text.includes(testCase.includes), `${testCase.id}: output did not include ${JSON.stringify(testCase.includes)}`);
      for (const expected of testCase.includesAll ?? []) assert.ok(text.includes(expected), `${testCase.id}: output did not include ${JSON.stringify(expected)}`);
      if (testCase.excludes) assert.ok(!text.includes(testCase.excludes), `${testCase.id}: output unexpectedly included ${JSON.stringify(testCase.excludes)}`);
      results.push({ tool: testCase.id, status: "passed", outputPreview: text.slice(0, 140) });
    } catch (error) {
      results.push({ tool: testCase.id, status: "failed", error: String(error?.stack ?? error) });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const report = {
  baseUrl,
  viewport: { width: 390, height: 844 },
  total: results.length,
  passed: results.filter((result) => result.status === "passed").length,
  failed: results.filter((result) => result.status === "failed").length,
  results,
};
if (reportPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (report.failed > 0) process.exitCode = 1;
