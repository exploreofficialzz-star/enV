#!/usr/bin/env node
/**
 * Browser-level regression test for the public "Read the full guide" links.
 * It follows a real catalogue link and confirms the matching guide route renders.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const baseUrl = new URL(process.env.BLOG_GUIDE_BASE_URL || "http://127.0.0.1:8080");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const indexResponse = await page.goto(new URL("/blog", baseUrl).href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  assert.equal(indexResponse?.status(), 200, "The Blogs & Guides index must load successfully.");

  const guideLink = page
    .locator('a[href^="/blog/tool-"]')
    .filter({ hasText: /Read the full guide/i })
    .first();
  await guideLink.waitFor({ state: "visible", timeout: 15_000 });

  const href = await guideLink.getAttribute("href");
  assert.ok(href, "A visible guide entry must expose a destination URL.");
  assert.match(href, /^\/blog\/tool-[a-z0-9-]+$/i, "The guide link must target an individual tool reference.");
  const targetUrl = new URL(href, baseUrl);

  const guideResponsePromise = page.waitForResponse(
    (response) => {
      const responseUrl = new URL(response.url());
      return response.request().isNavigationRequest()
        && responseUrl.origin === targetUrl.origin
        && responseUrl.pathname === targetUrl.pathname;
    },
    { timeout: 20_000 },
  );
  const guideUrlPromise = page.waitForURL(
    (url) => url.origin === targetUrl.origin && url.pathname === targetUrl.pathname,
    { timeout: 20_000 },
  );
  await guideLink.click();
  const [guideResponse] = await Promise.all([guideResponsePromise, guideUrlPromise]);

  assert.equal(guideResponse.status(), 200, `The individual guide must return HTTP 200: ${href}`);
  await page.getByRole("heading", { name: /documentation and usage guide/i }).waitFor({ timeout: 15_000 });
  await page.getByRole("heading", { name: "When to use this tool" }).waitFor({ timeout: 15_000 });
  await page.getByRole("heading", { name: "Troubleshooting" }).waitFor({ timeout: 15_000 });
  assert.equal(await page.getByText("Tool not found.", { exact: true }).count(), 0, "A listed tool must not open the not-found state.");
  assert.deepEqual(pageErrors, [], "Opening a guide must not trigger a client-side page error.");

  console.log(`PASS: Read the full guide navigated to ${href} and rendered the complete tool guide.`);
} finally {
  await browser.close();
}
