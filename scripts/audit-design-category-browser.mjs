#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (error) {
  console.error("Design category browser audit requires Playwright.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const baseUrl = (
  process.argv.find((argument) => argument.startsWith("--base-url="))?.slice("--base-url=".length)
  ?? process.env.AUDIT_BASE_URL
  ?? "http://127.0.0.1:8080"
).replace(/\/+$/, "");
const browserOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
  browserOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
}
const browser = await chromium.launch(browserOptions);
const outputDir = resolve("artifacts/design-category");
await mkdir(outputDir, { recursive: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const response = await page.goto(baseUrl + "/tools/design", { waitUntil: "domcontentloaded", timeout: 60000 });
  assert.ok(response && response.ok(), "Design category route should respond successfully");
  await page.getByText("enV Design workspace", { exact: true }).waitFor({ state: "visible" });
  // Wait for the client-side explorer to hydrate before exercising controlled React inputs.
  await page.waitForLoadState("networkidle", { timeout: 30000 });

  const cards = page.locator('a[href^="/tools/design/"]');
  const cardCount = await cards.count();
  const badge = await page.getByText(/^\d+\s+tools?\s+in this workspace$/).first().textContent();
  const advertisedCount = Number(badge?.match(/\d+/)?.[0]);
  assert.ok(Number.isInteger(advertisedCount) && advertisedCount > 21, "Design hero should advertise the expanded catalogue");
  assert.equal(cardCount, advertisedCount, "Every advertised Design utility must render as a tool card");

  const hrefs = await cards.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")));
  assert.equal(new Set(hrefs).size, hrefs.length, "Every Design tool card should have a unique route");

  const routeChecks = [];
  for (let offset = 0; offset < hrefs.length; offset += 12) {
    const batch = await Promise.all(hrefs.slice(offset, offset + 12).map(async (href) => {
      const response = await page.request.get(baseUrl + href, { timeout: 30000 });
      return { href, status: response.status(), finalUrl: response.url() };
    }));
    routeChecks.push(...batch);
  }
  const failedRoutes = routeChecks.filter((result) => result.status !== 200);
  assert.deepEqual(failedRoutes, [], "Every Design tool route should respond with HTTP 200");
  console.log("PASS Design tool route smoke test: " + routeChecks.length + " routes returned HTTP 200.");

  const search = page.getByRole("textbox", { name: "Search design tools" });
  await search.click();
  await search.fill("Gradient Token Generator");
  await page.waitForFunction(() => {
    const status = [...document.querySelectorAll('[aria-live="polite"]')]
      .find((element) => /tools? found/.test(element.textContent ?? ""));
    return status && status.textContent?.trim() !== "122 tools found";
  }, { timeout: 10000 });
  const generatedGradientToken = page.locator('a[href="/tools/design/gradient-token-generator"]');
  await generatedGradientToken.waitFor({ state: "visible" });
  assert.equal(await cards.count(), 1, "Search should find the generated Gradient Token Generator alone");

  await search.fill("");
  await page.getByRole("button", { name: "Gradients & effects", exact: true }).click();
  await page.locator('a[href="/tools/design/shadow-builder"]').waitFor({ state: "visible" });
  assert.ok(await cards.count() > 7, "Effects filter should include the generated effect workflows");

  await page.getByRole("button", { name: "UI components", exact: true }).click();
  await page.locator('a[href="/tools/design/button-builder"]').waitFor({ state: "visible" });
  assert.ok(await cards.count() > 2, "Components filter should include generated component workflows");

  await page.getByRole("button", { name: "SVG & backgrounds", exact: true }).click();
  await page.locator('a[href="/tools/design/pattern-generator"]').waitFor({ state: "visible" });
  assert.ok(await cards.count() > 2, "SVG filter should include generated pattern and artwork workflows");

  await page.getByRole("button", { name: "Color & palettes", exact: true }).click();
  await page.locator('a[href="/tools/design/color-builder"]').waitFor({ state: "visible" });
  assert.ok(await cards.count() > 7, "Color filter should include generated color workflows");

  await page.getByRole("button", { name: "Accessibility", exact: true }).click();
  assert.equal(await cards.count(), 3, "Accessibility group should retain the three curated tools");

  await page.getByRole("button", { name: "All tools", exact: true }).click();
  const restoredCount = await cards.count();
  assert.equal(restoredCount, advertisedCount, "All tools filter should restore the full Design catalogue");
  await page.screenshot({ path: resolve(outputDir, "design-category-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await cards.count(), advertisedCount, "Mobile layout should retain every Design card");
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(mobileOverflow <= 1, "Design category should not horizontally overflow a 390px viewport");
  await page.screenshot({ path: resolve(outputDir, "design-category-mobile.png"), fullPage: true });

  assert.deepEqual(failures, [], "Design category route should not emit uncaught browser errors");
  console.log("PASS Design category browser audit: " + advertisedCount + " tool cards, search, five filters, desktop and mobile layouts.");
} finally {
  await browser.close();
}
