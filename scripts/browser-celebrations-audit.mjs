import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

const argument = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const baseUrl = argument("base-url", "http://127.0.0.1:8080").replace(/\/$/, "");
const reportPath = argument("report", "");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const catalogSource = await fs.readFile(path.resolve(scriptDir, "../src/data/catalog.ts"), "utf8");
const catalog = parseGeneratedCatalog(catalogSource);
const tools = catalog.filter((tool) => tool.category === "celebrations").sort((a, b) => a.id.localeCompare(b.id));
assert.equal(tools.length, 93, `Expected 93 exact Celebration tools; found ${tools.length}`);
assert.equal(new Set(tools.map((tool) => tool.id)).size, 93, "Celebration tool IDs must be unique");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.setDefaultNavigationTimeout(25000);
const results = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ5kAAAAASUVORK5CYII=", "base64");

async function fillField(toolSurface, label, value) {
  const control = toolSurface.getByLabel(label, { exact: true });
  assert.equal(await control.count(), 1, `Expected one accessible control for ${label}; found ${await control.count()}`);
  await control.fill(value);
  assert.equal(await control.inputValue(), value, `The ${label} field did not retain the value entered for the active tool.`);
}
function preview() {
  return page.frameLocator('iframe[title*="exported page preview"]');
}

try {
  for (const tool of tools) {
    const errors = [];
    const onPageError = (error) => errors.push(String(error));
    page.on("pageerror", onPageError);
    try {
      await page.goto(`${baseUrl}/tools/celebrations/${tool.slug}`, { waitUntil: "domcontentloaded" });
      await page.locator(`[data-env-tool-id="${tool.id}"]`).waitFor({ state: "attached", timeout: 20000 });
      const title = `QA ${tool.id} & <celebration>`;
      const toolSurface = page.locator(`[data-env-tool-id="${tool.id}"]`);
      await fillField(toolSurface, "Title", title);
      await fillField(toolSurface, "Main message", "A safe local message & <friends>");
      if (!["interactive-card", "reveal-page", "surprise-page", "quiz-generator", "memory-page"].some((suffix) => tool.id.endsWith(suffix))) {
        await fillField(toolSurface, "Date and time", "2030-01-01T12:00");
        await fillField(toolSurface, "Time zone", "Africa/Lagos");
      }
      const experience = ["page-generator", "interactive-card", "invitation-generator", "countdown", "memory-page", "reveal-page", "quiz-generator", "surprise-page"].find((suffix) => tool.id.endsWith("-" + suffix));
      assert.ok(experience, `${tool.id}: unknown Celebration experience`);
      if (tool.id.endsWith("invitation-generator")) {
        await fillField(toolSurface, "RSVP link", "https://example.org/rsvp");
        await fillField(toolSurface, "Reply by", "20 December 2029");
      }
      if (tool.id.endsWith("interactive-card")) await fillField(toolSurface, "Inside of the card", "A hidden card message.");
      if (tool.id.endsWith("reveal-page") || tool.id.endsWith("surprise-page")) await fillField(toolSurface, "Message to reveal", "A hidden surprise message.");
      if (tool.id.endsWith("quiz-generator")) {
        await fillField(toolSurface, "Question", "Which year is the celebration?");
        await fillField(toolSurface, "Answer choices (one per line)", "2028\n2030");
        await fillField(toolSurface, "Correct answer", "2030");
      }
      if (tool.id.endsWith("memory-page")) {
        await fillField(toolSurface, "Memory notes", "A favourite shared moment.");
        await page.locator('input[type="file"]').setInputFiles({ name: "memory.png", mimeType: "image/png", buffer: png });
      }
      if (tool.id.endsWith("page-generator")) {
        await fillField(toolSurface, "Person or group being celebrated", "Alex");
        await fillField(toolSurface, "Host / organiser", "Sam");
        await fillField(toolSurface, "Location / venue", "Hall & Garden");
        await fillField(toolSurface, "Schedule / programme (one item per line)", "Welcome\nCelebration\nPhotos");
      }
      if (tool.id.endsWith("countdown")) await fillField(toolSurface, "Location / venue", "Main hall");
      const frame = preview();
      await frame.locator("h1").filter({ hasText: title }).waitFor({ state: "visible", timeout: 15000 });
      assert.equal(await frame.locator("h1").innerText(), title, `${tool.id}: exported preview title mismatch`);
      assert.ok((await frame.locator("body").innerText()).includes("A safe local message & <friends>"), `${tool.id}: preview message missing or escaped incorrectly`);
      assert.equal(await frame.locator("html").evaluate((node) => node.scrollWidth <= node.clientWidth), true, `${tool.id}: exported page has horizontal overflow`);
      if (tool.id.endsWith("invitation-generator")) {
        assert.equal(await frame.locator('a[href="https://example.org/rsvp"]').count(), 1, "Invitation RSVP link missing");
        assert.ok((await frame.locator("body").innerText()).includes("Guest responses are not collected"), "Invitation privacy boundary missing");
      }
      if (tool.id.endsWith("interactive-card") || tool.id.endsWith("reveal-page") || tool.id.endsWith("surprise-page")) {
        await frame.locator("button[data-reveal]").click();
        await frame.locator("[data-reveal-content]").waitFor({ state: "visible" });
      }
      if (tool.id.endsWith("quiz-generator")) {
        await frame.locator('button[data-choice]').filter({ hasText: "2030" }).click();
        await frame.locator("[data-feedback]").filter({ hasText: "That is right!" }).waitFor({ state: "visible" });
      }
      if (tool.id.endsWith("memory-page")) {
        await frame.locator(".gallery figure").first().waitFor({ state: "visible" });
        assert.equal(await frame.locator(".gallery figure").count(), 1, "Memory image did not reach the preview");
      }
      if (tool.id.endsWith("countdown")) await frame.locator("[data-countdown]").waitFor({ state: "visible" });
      if (tool.id.endsWith("page-generator")) {
        assert.equal(await frame.locator("ol li").count(), 3, "Programme items were not included in the exported page");
        assert.ok((await frame.locator("body").innerText()).includes("Hosted by: Sam"), "Host was not included in the exported page");
        assert.ok((await frame.locator("body").innerText()).includes("Hall & Garden"), "Venue was not included in the exported page");
        assert.equal(await frame.locator("ol li").nth(0).innerText(), "Welcome");
        assert.equal(await frame.locator("ol li").nth(1).innerText(), "Celebration");
        assert.equal(await frame.locator("ol li").nth(2).innerText(), "Photos");
      }
      if (tool.id.endsWith("page-generator")) {
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Download page", exact: true }).click();
        const download = await downloadPromise;
        assert.equal(download.suggestedFilename(), `env-${tool.id}.html`);
      }
      assert.deepEqual(errors, [], `${tool.id}: browser runtime errors`);
      results.push({ tool: tool.id, status: "passed", experience, viewport: "390x844" });
      console.log(`PASS ${tool.id}`);
    } catch (error) {
      results.push({ tool: tool.id, status: "failed", error: String(error?.stack ?? error) });
      console.log(`FAIL ${tool.id}: ${String(error?.message ?? error)}`);
    } finally {
      page.off("pageerror", onPageError);
    }
  }
} finally {
  await context.close();
  await browser.close();
}
const report = {
  baseUrl, viewport: { width: 390, height: 844 }, total: results.length,
  passed: results.filter((result) => result.status === "passed").length,
  failed: results.filter((result) => result.status === "failed").length, results,
};
if (reportPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (report.failed > 0) process.exitCode = 1;
