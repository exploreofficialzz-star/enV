import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { unzipSync } from "fflate";
import { encodeSongSection } from "../src/lib/media/song-audio-export.ts";

const base = process.env.BROWSER_AUDIT_BASE_URL || "http://127.0.0.1:8080";
const require = createRequire(import.meta.url);
const output = await mkdtemp(join(tmpdir(), "env-song-browser-"));
const sr = 16000,
  seconds = 12;
const left = Float32Array.from(
  { length: sr * seconds },
  (_, i) =>
    0.15 * Math.sin((2 * Math.PI * 261.626 * i) / sr) +
    0.1 * Math.sin((2 * Math.PI * 392 * i) / sr),
);
const fixture = join(output, "generated-chord.wav");
await writeFile(fixture, encodeSongSection([left, left], sr, 0, seconds));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [],
  uploads = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (request.method() === "POST" && /\/v1\/jobs$/.test(new URL(request.url()).pathname))
    uploads.push(request.url());
});

try {
  await page.goto(`${base}/tools/audio/song-metadata-analyzer`, { waitUntil: "networkidle" });
  await page
    .locator('html[data-env-tool-hydrated="song-metadata-analyzer"]')
    .waitFor({ state: "attached" });
  await page.getByLabel("Audio files", { exact: true }).setInputFiles(fixture);
  if (process.env.SONG_AUDIT_BROWSER_MODELS !== "1") await page.getByLabel("Recognize speech, instruments and sounds").uncheck();
  await page.getByRole("button", { name: "Analyze songs", exact: true }).click();
  await page
    .getByRole("heading", { name: "Review tags", exact: true })
    .waitFor({ timeout: 60_000 });
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const accessibilityIssues = await page.evaluate(async () => {
    const report = await window.axe.run(
      { include: [[".env-tool-interface"]] },
      { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } },
    );
    return report.violations
      .filter((item) => ["serious", "critical"].includes(item.impact))
      .map((item) => item.id);
  });
  assert.deepEqual(
    accessibilityIssues,
    [],
    "Analyzer must have no serious or critical accessibility violations",
  );
  assert.equal(uploads.length, 0, "Browser analysis must not upload audio");
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const exported = JSON.parse(await readFile(await (await jsonDownload).path(), "utf8"));
  assert.equal(exported.tracks[0].embedded_metadata.parser, "music-metadata@12.3.2");
  assert.equal(exported.tracks[0].technical.sample_rate_hz, sr);
  assert.equal(exported.tracks[0].technical.channels, 2);
  assert.equal(exported.tracks[0].dataset_analysis.annotations.reviewed, false);
  await page.getByLabel("Genre", { exact: true }).fill("Test genre");
  await page.getByLabel("Genre", { exact: true }).pressSequentially(", Second genre");
  assert.equal(
    await page.getByLabel("Genre", { exact: true }).inputValue(),
    "Test genre, Second genre",
    "Comma-separated tags must remain typeable",
  );
  await page.getByLabel("Reviewer", { exact: true }).fill("Browser QA");
  await page.getByLabel("Tags reviewed", { exact: true }).check();

  if (process.env.SONG_AUDIT_TOKEN) {
    await page.getByText("Local AI & stems", { exact: false }).click();
    await page.getByLabel("API token", { exact: true }).fill(process.env.SONG_AUDIT_TOKEN);
    if (process.env.SONG_AUDIT_URL)
      await page.getByLabel("Local address", { exact: true }).fill(process.env.SONG_AUDIT_URL);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await page.getByRole("button", { name: "Connected", exact: true }).waitFor({ timeout: 20_000 });
    assert.equal(uploads.length, 0, "Connecting must not upload audio");
    await page.getByLabel("Section WAVs", { exact: true }).check();
    if (process.env.SONG_AUDIT_STEMS === "1")
      await page.getByLabel("4 stems", { exact: true }).check();
    if (process.env.SONG_AUDIT_LYRICS === "1")
      await page.getByLabel("Lyrics", { exact: true }).check();
    await page.getByRole("button", { name: "Analyze locally", exact: true }).click();
    await page
      .getByText("Suggestions ready for review.", { exact: true })
      .waitFor({ timeout: 240_000 });
    assert.equal(uploads.length, 1);
    const archiveDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Results & audio ZIP", exact: true }).click();
    const zip = unzipSync(new Uint8Array(await readFile(await (await archiveDownload).path())));
    const local = JSON.parse(new TextDecoder().decode(zip["analysis.json"]));
    assert.equal(local.processing.hosted_inference, false);
    assert.equal(local.signal.duration_seconds, seconds);
    assert.equal(local.windows.length, 2, "Tagging must include the tail of the track");
    assert.ok(local.llm?.model_revision, "Local LLM digest must be recorded");
    assert.ok(Object.keys(zip).some((name) => /^section-\d+\.wav$/.test(name)));
    if (process.env.SONG_AUDIT_STEMS === "1")
      assert.equal(local.artifacts.filter((artifact) => artifact.kind === "stem").length, 4);
    if (process.env.SONG_AUDIT_LYRICS === "1")
      assert.equal(local.lyrics.status, "candidate_transcript");
    const taggedDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export tagged audio", exact: true }).click();
    assert.match((await taggedDownload).suggestedFilename(), /-reviewed\.wav$/);
    if (process.env.SONG_AUDIT_LEARNING === "1") {
      await page.getByText("Learn from reviewed corrections", { exact: true }).click();
      await page
        .getByLabel("I have permission to use this track’s reviewed labels for local training.", {
          exact: true,
        })
        .check();
      await page.getByRole("button", { name: "Save corrections", exact: true }).click();
      await page.getByText("Reviewed corrections saved locally.", { exact: true }).waitFor();
    }
    await page.getByRole("button", { name: "Use suggestions as draft tags", exact: true }).click();
    assert.equal(
      await page.getByLabel("Tags reviewed", { exact: true }).isChecked(),
      false,
      "Model suggestions must clear reviewed state",
    );
  }

  // The app defaults to a narrow workspace even on a desktop viewport. Test that
  // actual container width, then a phone and the explicit desktop preference.
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    assert.ok(layout.content <= layout.viewport + 1, `Horizontal overflow at ${width}px`);
    await page.screenshot({ path: join(output, `song-${width}.png`), fullPage: true });
  }
  await page.evaluate(() => localStorage.setItem("env:view-mode", "desktop"));
  await page.reload({ waitUntil: "networkidle" });
  await page
    .locator('html[data-env-tool-hydrated="song-metadata-analyzer"]')
    .waitFor({ state: "attached" });
  await page.getByLabel("Audio files", { exact: true }).setInputFiles(fixture);
  if (process.env.SONG_AUDIT_BROWSER_MODELS !== "1") await page.getByLabel("Recognize speech, instruments and sounds").uncheck();
  await page.getByRole("button", { name: "Analyze songs", exact: true }).click();
  await page
    .getByRole("heading", { name: "Review tags", exact: true })
    .waitFor({ timeout: 60_000 });
  await page.screenshot({ path: join(output, "song-desktop-workspace.png"), fullPage: true });
  await page.getByRole("button", { name: "Quick Scan", exact: false }).click();
  await page.getByRole("button", { name: "Scan songs", exact: true }).click();
  await page.getByRole("button", { name: "Scan songs", exact: true }).waitFor();
  await page.getByLabel("Genre", { exact: true }).fill("Quick label");
  const quickDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const quick = JSON.parse(await readFile(await (await quickDownload).path(), "utf8"));
  assert.equal(quick.tracks[0].dataset_analysis, null);
  assert.deepEqual(
    quick.tracks[0].review_annotations.genre,
    ["Quick label"],
    "Tag review must work independently of detailed DSP",
  );
  assert.deepEqual(errors, []);

  const mobileContext = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, permissions: ["clipboard-read", "clipboard-write"] });
  await mobileContext.addInitScript(() => localStorage.setItem("env:view-mode", "mobile"));
  const mobile = await mobileContext.newPage();
  await mobile.goto(`${base}/tools/audio/song-metadata-analyzer`, { waitUntil: "networkidle" });
  await mobile.locator('html[data-env-tool-hydrated="song-metadata-analyzer"]').waitFor({ state: "attached" });
  const view = () => mobile.evaluate(() => ({ mode: document.documentElement.dataset.envViewMode, setting: localStorage.getItem("env:view-mode"), viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content"), width: innerWidth, scrollWidth: document.documentElement.scrollWidth, scale: visualViewport?.scale }));
  const before = await view();
  const payload = await readFile(fixture);
  await mobile.getByLabel("Audio files", { exact: true }).setInputFiles({ name: `${"long-name-".repeat(14)}song.wav`, mimeType: "audio/wav", buffer: payload });
  const imported = await view();
  assert.equal(imported.mode, "mobile");
  assert.equal(imported.setting, "mobile");
  assert.equal(imported.viewport, before.viewport);
  assert.equal(imported.width, before.width);
  await mobile.getByLabel("Recognize speech, instruments and sounds").uncheck();
  await mobile.getByRole("button", { name: "Analyze songs", exact: true }).click();
  await mobile.getByRole("heading", { name: "Review tags", exact: true }).waitFor({ timeout: 60_000 });
  await mobile.getByLabel("Genre", { exact: true }).fill("Afrobeats, Gospel");
  const fontSize = await mobile.getByLabel("Genre", { exact: true }).evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  assert.ok(fontSize >= 16, `Mobile input font size ${fontSize}px can trigger browser zoom`);
  await mobile.getByRole("button", { name: "Copy style", exact: true }).click();
  assert.equal(await mobile.evaluate(() => navigator.clipboard.readText()), "Afrobeats");
  await mobile.getByRole("button", { name: "Copy track analysis", exact: true }).click();
  assert.match(await mobile.evaluate(() => navigator.clipboard.readText()), /review_annotations/);
  await mobile.getByText("Signal details", { exact: true }).click();
  await mobile.getByText(/Time-aligned signal timeline/).click();
  await mobile.getByText("More tags", { exact: true }).click();
  const after = await view();
  assert.equal(after.mode, "mobile");
  assert.equal(after.setting, "mobile");
  assert.equal(after.viewport, before.viewport);
  assert.equal(after.width, before.width);
  assert.ok(after.scrollWidth <= after.width + 1, `Mobile overflow ${after.scrollWidth} > ${after.width}`);
  assert.ok((after.scale ?? 1) <= 1.05, `Unexpected mobile viewport scale ${after.scale}`);
  await mobile.screenshot({ path: join(output, "song-real-mobile.png"), fullPage: true });
  await mobileContext.close();
  console.log(`Song browser audit passed. Screenshots: ${output}`);
} finally {
  await browser.close();
}
