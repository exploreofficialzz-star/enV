import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const argument = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const baseUrl = argument("base-url", "http://127.0.0.1:8080").replace(/\/$/, "");
const reportPath = argument("report", "");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(await fs.readFile(path.resolve(scriptDir, "../apps/shared/catalog.json"), "utf8"));
const routes = catalog.tools.filter((tool) => tool.category === "events" && (
  /-agenda-generator$/.test(tool.id) || /-schedule-builder$/.test(tool.id) || /-rsvp-page$/.test(tool.id) || /-check-in-page$/.test(tool.id)
));
assert.equal(routes.length, 51, `Expected 51 exact Events routes from catalog; found ${routes.length}`);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const results = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.setDefaultTimeout(8000);
page.setDefaultNavigationTimeout(25000);

try {
  for (const tool of routes) {
    console.log(`Testing ${tool.id}`);
    let pageErrors = [];
    const onPageError = (error) => pageErrors.push(String(error));
    page.on("pageerror", onPageError);
    try {
      pageErrors = [];
      await page.goto(`${baseUrl}/tools/events/${tool.slug}`, { waitUntil: "domcontentloaded" });
      await page.locator(`html[data-env-tool-hydrated="${tool.id}"]`).waitFor({ state: "attached", timeout: 20000 });
      const isAgenda = /-agenda-generator$/.test(tool.id);
      const isSchedule = /-schedule-builder$/.test(tool.id);
      const isRsvp = /-rsvp-page$/.test(tool.id);
      const isCheckIn = /-check-in-page$/.test(tool.id);
      if (isRsvp || isCheckIn) {
        await page.getByLabel("Page title", { exact: true }).fill(`QA & <${tool.id}>`);
        await page.getByLabel("Event details", { exact: true }).fill("Bring your curiosity & friends <welcome>");
        await page.getByLabel("Date / time (optional)", { exact: true }).fill("Saturday, 4 PM local");
        await page.getByLabel("Location (optional)", { exact: true }).fill("Hall <A>");
        if (isRsvp) await page.getByLabel("Organizer / RSVP contact", { exact: true }).fill("Host & Co.");
        if (isCheckIn) await page.getByLabel("Guest name", { exact: true }).fill("Alex <Guest>");
      } else {
        await page.getByLabel("Title", { exact: true }).fill(`QA ${isAgenda ? "agenda" : "schedule"}`);
        await page.getByLabel("Date / time (optional)", { exact: true }).fill("Saturday, 4 PM local");
        await page.getByLabel("Location (optional)", { exact: true }).fill("Hall A");
        await page.getByLabel("Agenda items (one per line)", { exact: true }).fill("Welcome\nTalk\nBreak");
      }
      await page.getByRole("button", { name: "Generate", exact: true }).click();
      const output = page.locator("pre").last();
      await output.waitFor({ state: "visible" });
      const text = await output.innerText();
      if (isAgenda || isSchedule) {
        assert.ok(text.includes(`${tool.name.replace(/ (Agenda Generator|Schedule Builder)$/i, "").replace(/Agenda Generator|Schedule Builder/i, "")} ${isAgenda ? "agenda" : "schedule"}`), `${tool.id}: missing workflow heading`);
        assert.ok(text.includes("Date / time: Saturday, 4 PM local"), `${tool.id}: missing plain-text date`);
        assert.ok(text.includes("1. Welcome\n2. Talk\n3. Break"), `${tool.id}: list items not numbered`);
      } else {
        assert.ok(text.startsWith("<!doctype html>"), `${tool.id}: static page is not full HTML`);
        assert.ok(text.includes("QA &amp; &lt;"), `${tool.id}: title was not escaped`);
        assert.ok(text.includes("Bring your curiosity &amp; friends &lt;welcome&gt;"), `${tool.id}: detail HTML was not escaped`);
        assert.ok(text.includes("Saturday, 4 PM local") && text.includes("Hall &lt;A&gt;"), `${tool.id}: date/location missing or unsafe`);
        if (isRsvp) assert.ok(text.includes("does not collect or store RSVPs"), `${tool.id}: missing static RSVP disclosure`);
        if (isCheckIn) assert.ok(text.includes("does not verify or record arrivals"), `${tool.id}: missing static check-in disclosure`);
      }
      const extension = isRsvp || isCheckIn ? "html" : "txt";
      const downloadPromise = page.waitForEvent("download", { timeout: 6000 });
      await page.getByRole("button", { name: `Download ${extension === "html" ? "HTML" : "text"}`, exact: true }).click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), `env-${tool.id}.${extension}`);
      assert.deepEqual(pageErrors, [], `${tool.id}: browser runtime errors`);
      await page.getByRole("button", { name: "Reset", exact: true }).click();
      await output.waitFor({ state: "detached" });
      results.push({ tool: tool.id, status: "passed", extension, outputPreview: text.slice(0, 120) });
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
