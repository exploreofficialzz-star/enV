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

  async function assertFiltersShareOneRow(width, label) {
    await page.setViewportSize({ width, height: 844 });
    const category = page.locator('select[aria-label="Filter by category"]');
    const status = page.locator('select[aria-label="Filter by status"]');
    await category.waitFor({ state: "visible" });
    await status.waitFor({ state: "visible" });
    const [categoryBox, statusBox] = await Promise.all([category.boundingBox(), status.boundingBox()]);
    assert.ok(categoryBox && statusBox, `${label}: both filters must have a visible layout box.`);
    assert.ok(Math.abs(categoryBox.y - statusBox.y) < 2, `${label}: category and status filters must stay on the same row.`);
    const customArrows = await page.locator(
      'label:has(select[aria-label="Filter by category"]) svg, label:has(select[aria-label="Filter by status"]) svg',
    ).count();
    assert.equal(customArrows, 0, `${label}: use the native dropdown arrow without a duplicate custom chevron.`);
  }

  await assertFiltersShareOneRow(390, "Mobile");
  await assertFiltersShareOneRow(1280, "Desktop");
  await page.setViewportSize({ width: 390, height: 844 });

  const guideLink = page
    .locator('a[href^="/blog/tool-"]')
    .filter({ hasText: /Read the full guide/i })
    .first();
  await guideLink.waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(
    await page.getByText("math matrix determinant", { exact: true }).count(),
    0,
    "Tool cards must not show a raw keyword-fragment description.",
  );

  const href = await guideLink.getAttribute("href");
  assert.ok(href, "A visible guide entry must expose a destination URL.");
  assert.match(href, /^\/blog\/tool-[a-z0-9-]+$/i, "The guide link must target an individual tool reference.");
  const targetUrl = new URL(href, baseUrl);

  // Open the same guide in a clean tab too. This separates a bad route render
  // from any issue specific to tapping the link on the catalogue page.
  const directPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const directResponse = await directPage.goto(targetUrl.href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  const directProbe = {
    status: directResponse?.status() ?? null,
    url: directPage.url(),
    title: await directPage.title().catch(() => ""),
    headings: await directPage.locator("h1, h2, h3").allInnerTexts().catch(() => []),
    visibleBody: (await directPage.locator("body").innerText().catch(() => "")).slice(0, 1_000),
  };
  console.log("Direct URL guide probe:", JSON.stringify(directProbe));
  assert.equal(directResponse?.status(), 200, `The direct guide route must return HTTP 200: ${href}`);
  await directPage.getByRole("heading", { name: /documentation and usage guide/i }).waitFor({ timeout: 15_000 });
  assert.equal(
    await directPage.getByText("math matrix determinant", { exact: true }).count(),
    0,
    "Tool guide content must not display a raw keyword-fragment description.",
  );
  assert.equal(
    await directPage.getByText(
      "Use 2×2 Matrix Determinant Calculator to calculate results from the values you enter. Confirm the field labels, units, and assumptions, then check the output before relying on it.",
      { exact: true },
    ).count(),
    1,
    "The guide summary must be clear without being repeated verbatim in the body.",
  );
  await directPage.getByRole("heading", { name: "When to use this tool" }).waitFor({ timeout: 15_000 });
  await directPage.getByRole("heading", { name: "Troubleshooting" }).waitFor({ timeout: 15_000 });
  await directPage.close();

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
  // Surface the actual rendered destination when this regression test catches a
  // route that returns HTTP 200 but renders an error or the wrong page.
  const diagnostics = async () => ({
    requestedHref: href,
    finalUrl: page.url(),
    navigationResponseUrl: guideResponse.url(),
    navigationStatus: guideResponse.status(),
    title: await page.title().catch(() => ""),
    headings: await page.locator("h1, h2, h3").allInnerTexts().catch(() => []),
    visibleBody: (await page.locator("body").innerText().catch(() => "")).slice(0, 2_500),
    pageErrors,
  });
  try {
    await page.getByRole("heading", { name: /documentation and usage guide/i }).waitFor({ timeout: 15_000 });
    await page.getByRole("heading", { name: "When to use this tool" }).waitFor({ timeout: 15_000 });
    await page.getByRole("heading", { name: "Troubleshooting" }).waitFor({ timeout: 15_000 });
    assert.equal(await page.getByText("Tool not found.", { exact: true }).count(), 0, "A listed tool must not open the not-found state.");
    assert.deepEqual(pageErrors, [], "Opening a guide must not trigger a client-side page error.");
  } catch (error) {
    console.error("Guide navigation diagnostics:", JSON.stringify(await diagnostics(), null, 2));
    throw error;
  }

  console.log(`PASS: Read the full guide navigated to ${href} and rendered the complete tool guide.`);

  // The article listing must also be addressable directly and remain correct on refresh.
  const directArticleIndex = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const directArticleIndexResponse = await directArticleIndex.goto(new URL("/blog?view=articles", baseUrl).href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  assert.equal(directArticleIndexResponse?.status(), 200, "The direct article-listing URL must return HTTP 200.");
  await directArticleIndex.getByRole("heading", { name: "Articles & product guides", exact: true }).waitFor({ timeout: 15_000 });
  await directArticleIndex.close();

  // Verify article detail URLs both load directly and open through the visible action.
  // Return through the guide's in-app navigation so the next interaction follows
  // the same hydrated client-side journey a reader uses.
  await page.getByRole("link", { name: "All documentation", exact: true }).click();
  await page.waitForURL(
    (url) => url.origin === baseUrl.origin && (url.pathname === "/blog" || url.pathname === "/blog/"),
    { timeout: 15_000 },
  );
  const articleViewResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().isNavigationRequest()
      && url.origin === baseUrl.origin
      && url.pathname.replace(/\\/$/, "") === "/blog"
      && url.searchParams.get("view") === "articles";
  }, { timeout: 20_000 });
  await page.getByRole("link", { name: "Browse product articles", exact: true }).click();
  const articleViewResponse = await articleViewResponsePromise;
  assert.equal(articleViewResponse.status(), 200, "The articles listing URL must return HTTP 200.");
  await page.waitForURL(
    (url) => url.origin === baseUrl.origin && url.pathname.replace(/\\/$/, "") === "/blog" && url.searchParams.get("view") === "articles",
    { timeout: 15_000 },
  );
  await page.getByRole("heading", { name: "Articles & product guides", exact: true }).waitFor({ timeout: 15_000 });
  const articleLink = page.getByRole("link", { name: /Read article/i }).first();
  await articleLink.waitFor({ state: "visible", timeout: 15_000 });
  const articleHref = await articleLink.getAttribute("href");
  assert.ok(articleHref, "A published article must expose a destination URL.");
  assert.match(articleHref, /^\/blog\/[a-z0-9-]+$/i, "The article action must target an individual article URL.");
  assert.doesNotMatch(articleHref, /^\/blog\/tool-/, "Article actions must not point to a tool guide.");
  assert.equal(await page.getByText(/\b\d+\s*min(?:ute)?s?\s+read\b/i).count(), 0, "Article cards must not show estimated reading time.");

  const articleUrl = new URL(articleHref, baseUrl);
  const directArticlePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const directArticleResponse = await directArticlePage.goto(articleUrl.href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  assert.equal(directArticleResponse?.status(), 200, `The direct article route must return HTTP 200: ${articleHref}`);
  await directArticlePage.getByRole("heading", {
    name: "A privacy-first approach to everyday online tools",
    exact: true,
  }).waitFor({ timeout: 15_000 });
  assert.equal(await directArticlePage.getByText(/\b\d+\s*min(?:ute)?s?\s+read\b/i).count(), 0, "Article detail pages must not show estimated reading time.");
  await directArticlePage.close();

  const articleResponsePromise = page.waitForResponse(
    (response) => {
      const responseUrl = new URL(response.url());
      return response.request().isNavigationRequest()
        && responseUrl.origin === articleUrl.origin
        && responseUrl.pathname === articleUrl.pathname;
    },
    { timeout: 20_000 },
  );
  const articleUrlPromise = page.waitForURL(
    (url) => url.origin === articleUrl.origin && url.pathname === articleUrl.pathname,
    { timeout: 20_000 },
  );
  await articleLink.click();
  const [articleResponse] = await Promise.all([articleResponsePromise, articleUrlPromise]);
  assert.equal(articleResponse.status(), 200, `The article action must return HTTP 200: ${articleHref}`);
  await page.getByRole("heading", {
    name: "A privacy-first approach to everyday online tools",
    exact: true,
  }).waitFor({ timeout: 15_000 });
  assert.equal(await page.getByText(/\b\d+\s*min(?:ute)?s?\s+read\b/i).count(), 0, "The opened article must not display estimated reading time.");
  assert.deepEqual(pageErrors, [], "Guide and article navigation must not trigger client-side page errors.");
  console.log(`PASS: Read article navigated to ${articleHref} and rendered the article page.`);
} finally {
  await browser.close();
}
