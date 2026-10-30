// Browser integration audit. Run with the enV dev server already listening.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const origin = process.env.ENV_WORLD_LAB_AUDIT_ORIGIN || "http://127.0.0.1:8080";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox", "--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/tools/developer/the-world-lab", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.getByRole("main", { name: "The World Lab" }).waitFor({ timeout: 90000 });
  await page.locator(".world-lab-stage canvas[data-renderer-ready=true]").waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("button", { name: "Block", exact: true }).click();
  await page.getByRole("button", { name: "Ball", exact: true }).click();
  assert.equal(await page.locator(".world-lab-object-list button").count(), 2);
  await page.getByLabel("Name your material").fill("Invented ceramic A");
  await page.getByLabel("Material density · kg/m³").fill("2500");
  await page.getByLabel("Applied upward force · newtons").fill("4500");
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await page.getByText("0.02 s").waitFor();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText(/Project saved on this device/).waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloaded = await downloadPromise;
  assert.match(downloaded.suggestedFilename(), /^world-lab-.+\.json$/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("main", { name: "The World Lab" }).waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.locator(".world-lab-object-list button").first().waitFor({ timeout: 10000 });
  assert.equal(await page.locator(".world-lab-object-list button").count(), 2, "saved objects are restored");
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page.getByLabel("Transparency").fill("70");
  assert.equal(await page.getByLabel("Transparency").inputValue(), "70");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator(".world-lab-stage").isVisible());
  assert.ok((await page.locator(".world-lab-stage").boundingBox()).width > 300);
  assert.deepEqual(errors, [], "no uncaught browser exceptions");
  console.log("World Lab browser audit: PASS (3D viewport, build, edit, test, save, restore, download, transparency, mobile)");
} finally {
  await browser.close();
}
