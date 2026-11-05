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
  {
    id: "ai-meeting-agenda-generator",
    inputs: { "Meeting goal": "Choose a launch date", "Meeting duration (minutes)": "30", Topics: "Progress\nDecision" },
    includes: "Planned duration: 30 minutes",
    includesAll: ["1. Progress — 15 min", "2. Decision — 15 min"],
  },
  {
    id: "blog-outline-generator",
    inputs: {
      "Topic / subject": "Urban gardening", Audience: "apartment renters", Goal: "Help readers grow herbs",
      "Editorial angle": "Low-cost methods for small spaces", "Verified facts / points to include": "Use containers\nCheck sunlight",
      "Reader next step": "Start with one herb pot",
    },
    includes: "CONTENT BRIEF",
    includesAll: ["Low-cost methods for small spaces", "Use containers", "Start with one herb pot"],
  },
  {
    id: "call-to-action-generator",
    inputs: {
      "Topic / subject": "Meal prep", Audience: "busy students", "Action to ask for": "Download the planner",
      "Specific benefit (optional)": "plan meals in one place",
    },
    includes: "Download the planner to plan meals in one place",
  },
  {
    id: "expand-helper",
    inputs: {
      "Text / notes to expand": "A useful idea", "Who is this for?": "new growers",
      "Why does it matter?": "Small spaces make growing food feel difficult.",
      "Real example / supporting detail": "A pot of basil beside a bright window.",
      "Next step for the reader": "Choose one herb to grow.",
    },
    includes: "WHY IT MATTERS\nSmall spaces make growing food feel difficult.",
    includesAll: ["A pot of basil beside a bright window.", "Choose one herb to grow."],
  },
  {
    id: "faq-generator",
    inputs: {
      "Topic / subject": "Meal prep", Audience: "students", "Questions (one per line)": "How long does it keep?\nCan I freeze it?",
      "Verified answers (Question | Answer)": "How long does it keep? | Refrigerated meals should be used within the safe storage window for their ingredients.",
    },
    includes: "A: Refrigerated meals should be used within the safe storage window",
    includesAll: ["NEEDS AN ANSWER", "Can I freeze it?"],
  },
  {
    id: "feature-benefit-generator",
    inputs: {
      "Topic / subject": "Collaboration", Audience: "teams", "Features (one per line)": "Shared workspace\nFast search",
      "Actual customer outcomes (same order)": "Everyone works from the same project view",
    },
    includes: "Customer outcome: Everyone works from the same project view",
    includesAll: ["Evidence to support the claim", "Feature: Fast search"],
  },
  {
    id: "meeting-action-items",
    inputs: {
      "Action items (Owner | Action | Due date | Priority)": "Sam | Draft launch brief | Friday | High\nLee | Review pricing | Monday | Medium",
    },
    includes: "Owner: Sam | Action: Draft launch brief | Due: Friday | Priority: High",
    includesAll: ["Status has not been inferred"],
  },
  {
    id: "product-title-generator",
    inputs: {
      "Topic / subject": "Focus app", "Specific product benefit (optional)": "Plan a calmer day",
      "Target customer (optional)": "remote teams", "Primary keyword (optional)": "Daily planner",
    },
    includes: "Daily planner — Plan a calmer day",
    includesAll: ["The Daily planner guide for remote teams"],
  },
  {
    id: "pros-cons-generator",
    inputs: {
      "Option / decision": "Launch now vs wait", "Observed upsides (one per line)": "Reach early users",
      "Known risks / costs (one per line)": "Support load may increase", "Decision criteria (one per line)": "Weekly active use",
    },
    includes: "UPSIDE TO VERIFY\n• Reach early users",
    includesAll: ["RISKS / COSTS TO CHECK", "DECISION CRITERIA", "Separate measured results from assumptions"],
  },
  {
    id: "shorten-helper",
    inputs: {
      Text: "Our tool helps teams manage projects. It keeps deadlines visible. It stores files securely. It sends weekly reminders.",
      "Target words": "10",
    },
    includes: "Our tool helps teams manage projects. It keeps deadlines visible…",
    excludes: "It stores files securely.",
  },
  {
    id: "tiktok-caption-helper",
    inputs: {
      "Topic / subject": "Quiet mornings", Audience: "students", Tone: "professional",
      "Opening angle": "One habit to try", "Call to action": "Save this checklist", Options: "2",
    },
    includes: "One habit to try: Quiet mornings. Save this checklist",
  },
  {
    id: "youtube-description-helper",
    inputs: {
      "Topic / subject": "Urban gardening", Audience: "beginners", Tone: "professional",
      "Video points (one per line)": "Tools\nPlanning", "Chapters / timestamps (optional)": "0:00 Introduction\n1:20 Choose a container",
      "Links / resources (optional)": "https://example.com/guide", "Viewer next step": "Subscribe for the next lesson",
    },
    includes: "WHAT YOU'LL LEARN",
    includesAll: ["CHAPTERS", "0:00 Introduction", "LINKS / RESOURCES", "Subscribe for the next lesson"],
  },
  {
    id: "youtube-title-helper",
    inputs: {
      "Topic / subject": "Learning SQL", Audience: "analysts", "Primary keyword (optional)": "SQL reporting",
      "Video angle": "a practical guide to advanced reporting", Options: "8",
    },
    includes: "SQL reporting",
  },
];

const results = [];
try {
  for (const testCase of cases) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.goto(`${baseUrl}/tools/ai/${testCase.id}`, { waitUntil: "networkidle" });
      for (const [label, value] of Object.entries(testCase.inputs)) {
        const control = page.getByLabel(label, { exact: true });
        if (label === "Tone") await control.selectOption(value.toLowerCase());
        else await control.fill(value);
      }
      await page.getByRole("button", { name: "Generate", exact: true }).click();
      const output = page.locator("pre").last();
      await output.waitFor({ state: "visible" });
      const text = await output.innerText();
      assert.ok(text.includes(testCase.includes), `${testCase.id}: output did not include ${JSON.stringify(testCase.includes)}`);
      for (const expected of testCase.includesAll ?? []) assert.ok(text.includes(expected), `${testCase.id}: output did not include ${JSON.stringify(expected)}`);
      if (testCase.excludes) assert.ok(!text.includes(testCase.excludes), `${testCase.id}: output unexpectedly included ${JSON.stringify(testCase.excludes)}`);
      if (testCase.id === "youtube-title-helper") {
        const titles = text.split("\n\n").map((line) => line.replace(/^\d+\.\s/u, ""));
        assert.ok(titles.every((title) => title.length <= 100), "YouTube titles must be <= 100 characters");
      }
      results.push({ tool: testCase.id, status: "passed", outputPreview: text.slice(0, 160) });
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
