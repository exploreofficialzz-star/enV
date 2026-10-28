/** Full import → persistence → review → export regression for the music sandbox. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";

const base = process.env.BROWSER_AUDIT_BASE_URL || "http://127.0.0.1:8080";
const output = await mkdtemp(join(tmpdir(), "env-music-sandbox-"));
const require = createRequire(import.meta.url);
const sampleRate = 16000,
  seconds = 2,
  frames = sampleRate * seconds;
const wav = Buffer.alloc(44 + frames * 2);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(frames * 2, 40);
for (let i = 0; i < frames; i++)
  wav.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 440) / sampleRate) * 4000), 44 + i * 2);
const tags = {
  id: "trial_0001",
  genre: "Afrobeats",
  sub_style: "afro-fusion",
  language: ["English", "Yoruba"],
  mood: ["relaxed"],
  theme: ["love"],
  setting: ["chill-out"],
  vocals: ["soft male lead"],
  flow: [],
  instruments: ["guitar", "shaker"],
  standout: ["call-and-response chorus"],
  descriptions: [
    "A relaxed guitar groove with a soft voice, sung in English and Yoruba.",
    "Warm bilingual vocals over gentle shakers and a sparse guitar melody.",
  ],
  tempo_bpm: null,
  tempo_band: "mid",
  key: "",
  time_signature: "",
  energy: "low",
  license: "owned",
  source: "Private permission record — not for captions",
  custom_note: "Keep this custom field",
};
const lyrics = "[verse 1 | English]\nHello there\n\n[chorus | Yoruba]\nẸ káàrọ̀";
const fixture = join(output, "songs.zip");
await writeFile(
  fixture,
  zipSync(
    {
      "afro-fusion/trial_0001.wav": wav,
      "afro-fusion/trial_0001.tags.json": strToU8(JSON.stringify(tags)),
      "afro-fusion/trial_0001.lyrics.txt": strToU8(lyrics),
    },
    { level: 1 },
  ),
);
const single = join(output, "trial_0001.wav");
await writeFile(single, wav);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  acceptDownloads: true,
});
await context.addInitScript(() => localStorage.setItem("env:view-mode", "desktop"));
const page = await context.newPage();
const errors = [],
  unexpected = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (
    /huggingface|onnx|transformers|whisper|demucs|\/api\/ai\/run|\/v1\/jobs/.test(r.url()) ||
    (r.method() === "POST" && /music-analysis/.test(r.url()))
  )
    unexpected.push(r.url());
});
const scope = page.locator(".music-sandbox");
let checkedWelcome = false;
const waitUI = async () => {
  const splash = scope.locator(".ms-splash");
  await splash.waitFor({ state: "visible", timeout: 90000 });
  if (!checkedWelcome) {
    await page.waitForTimeout(2000);
    assert.equal(
      await splash.isVisible(),
      true,
      "The welcome screen must stay open until the user enters",
    );
    checkedWelcome = true;
  }
  await splash.getByRole("button", { name: "Enter sandbox" }).click();
  await splash.waitFor({ state: "hidden" });
  await scope.locator(".ms-page-heading").waitFor({ timeout: 90000 });
};
const importZip = async (file) => {
  await scope.getByRole("button", { name: "Add music", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Import music files", { exact: true }).setInputFiles(file);
  await scope.getByText(/records? imported as drafts/).waitFor({ timeout: 30000 });
};
const readTracks = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("env:ai-music-data-sandbox:v1");
        r.onsuccess = () => {
          const d = r.result,
            q = d.transaction("tracks").objectStore("tracks").getAll();
          q.onsuccess = () => {
            d.close();
            resolve(q.result);
          };
          q.onerror = () => reject(q.error);
        };
      }),
  );
try {
  await page.goto(base + "/tools/audio/song-metadata-analyzer");
  await waitUI();
  await scope.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByLabel("Folder name", { exact: true }).fill("Afrobeats");
  await page.getByLabel("Default genre", { exact: true }).fill("Afrobeats");
  await page.getByRole("button", { name: "Save folder", exact: true }).click();
  await importZip(fixture);
  assert.equal(await scope.locator(".ms-record-row").count(), 1);
  let tracks = await readTracks();
  assert.equal(tracks[0].tags.duration_seconds, seconds);
  assert.equal(tracks[0].audio.sampleRate, sampleRate);
  assert.equal(tracks[0].audio.channels, 1);
  assert.equal(tracks[0].tags.tempo_bpm, null);
  assert.equal(tracks[0].reviewed, false);
  assert.equal(tracks[0].lyrics, lyrics);
  assert.equal(tracks[0].custom.custom_note, tags.custom_note);
  await scope.locator(".ms-record-row button").first().click();
  await scope.getByLabel("Instruments", { exact: true }).fill("guitar, shaker,");
  await scope.getByLabel("Instruments", { exact: true }).pressSequentially(" piano");
  assert.equal(
    await scope.getByLabel("Instruments", { exact: true }).inputValue(),
    "guitar, shaker, piano",
  );
  await scope.getByRole("button", { name: "Mark ready", exact: true }).click();
  await scope.getByText("A few things need review").waitFor();
  await scope.getByRole("tab", { name: "File & music", exact: true }).click();
  await scope.getByLabel("Display title", { exact: true }).fill("Evening groove");
  await scope.getByLabel("Record ID", { exact: true }).fill("reviewed_0001");
  await scope.getByRole("tab", { name: "JSON", exact: true }).click();
  let edited = JSON.parse(await scope.getByLabel("Tags JSON", { exact: true }).inputValue());
  edited.custom_session = "round one";
  await scope.getByLabel("Tags JSON", { exact: true }).fill(JSON.stringify(edited, null, 2));
  await scope.getByRole("button", { name: "Apply JSON changes", exact: true }).click();
  await scope.getByRole("tab", { name: "Rights", exact: true }).click();
  await scope.getByLabel("Clearance status", { exact: true }).selectOption("cleared");
  await scope.getByRole("button", { name: "Mark ready", exact: true }).click();
  await scope.locator(".ms-save-line").filter({ hasText: "Reviewed & saved" }).waitFor();
  await scope.getByRole("button", { name: "Back to collection", exact: true }).click();
  await page.reload();
  await waitUI();
  tracks = await readTracks();
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].tags.id, "reviewed_0001");
  assert.equal(tracks[0].title, "Evening groove");
  assert.equal(tracks[0].reviewed, true);
  assert.equal(tracks[0].custom.custom_session, "round one");
  await scope.getByRole("button", { name: /Ready to export/ }).click();
  await scope.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("radio", { name: /Music training preparation/ }).check();
  let downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download ZIP", exact: true }).click();
  let archive = unzipSync(new Uint8Array(await readFile(await (await downloaded).path())));
  const trainingBase = "afrobeats/afro-fusion/reviewed_0001";
  assert.ok(archive[trainingBase + ".wav"]);
  assert.equal(Buffer.compare(Buffer.from(archive[trainingBase + ".wav"]), wav), 0);
  assert.match(strFromU8(archive[trainingBase + ".lyrics.txt"]), /\[Chorus\]\nẸ káàrọ̀/);
  const caption = strFromU8(archive[trainingBase + ".caption.txt"]);
  assert.ok(!caption.includes(tags.source));
  assert.ok(!caption.includes("reviewed_0001"));
  assert.ok(!caption.includes("Evening groove"));
  assert.ok(!caption.includes("owned"));
  assert.equal(JSON.parse(strFromU8(archive[trainingBase + ".json"])).bpm, null);
  await scope.getByRole("button", { name: "Folders", exact: false }).first().click();
  await scope
    .getByRole("button", { name: /^Afrobeats Custom collection|^Afrobeats Afrobeats/ })
    .first()
    .click()
    .catch(async () => {
      await scope.locator(".ms-folder-card").filter({ hasText: "Afrobeats" }).click();
    });
  await importZip(single);
  await importZip(single);
  tracks = await readTracks();
  assert.equal(tracks.length, 3);
  assert.equal(new Set(tracks.map((t) => t.tags.id)).size, 3);
  assert.equal(tracks.filter((t) => t.reviewed).length, 1);
  await scope.getByRole("button", { name: "Folder settings", exact: true }).click();
  await page.getByLabel("Maximum songs", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Save folder", exact: true }).click();
  await importZip(single);
  assert.equal((await readTracks()).length, 3);
  await scope.getByText(/3-song limit/).waitFor();
  await scope.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("radio", { name: /Master backup/ }).check();
  downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download ZIP", exact: true }).click();
  archive = unzipSync(new Uint8Array(await readFile(await (await downloaded).path())));
  assert.ok(archive[trainingBase + ".tags.json"]);
  assert.equal(JSON.parse(strFromU8(archive[trainingBase + ".tags.json"])).source, tags.source);
  assert.equal(strFromU8(archive[trainingBase + ".lyrics.txt"]), lyrics);
  assert.ok(archive["manifest.csv"]);
  assert.equal(JSON.parse(strFromU8(archive["workspace.json"])).tracks.length, 3);
  await scope.getByRole("button", { name: "Overview", exact: false }).click();
  assert.equal(await scope.locator(".ms-record-row").count(), 2);
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  let violations = await page.evaluate(async () => {
    const r = await window.axe.run(".music-sandbox", {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    return r.violations
      .filter((v) => ["serious", "critical"].includes(v.impact))
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
  });
  assert.deepEqual(violations, []);
  for (const [width, mode] of [
    [1440, "desktop"],
    [768, "tablet"],
    [390, "mobile"],
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate((m) => {
      localStorage.setItem("env:view-mode", m);
    }, mode);
    await page.reload();
    await waitUI();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `${width}px should not overflow`,
    );
    assert.equal(
      await scope.evaluate((e) => e.scrollWidth > e.clientWidth),
      false,
      `${width}px sandbox should not overflow`,
    );
    await scope.screenshot({ path: join(output, `sandbox-${width}-light.png`) });
    await scope.getByRole("button", { name: "Workspace settings", exact: true }).click();
    await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await scope.screenshot({ path: join(output, `sandbox-${width}-dark.png`) });
    await scope.getByRole("button", { name: "Workspace settings", exact: true }).click();
    await page.getByLabel("Appearance", { exact: true }).selectOption("light");
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
  }
  await scope.locator(".ms-record-row button").first().click();
  await scope.getByLabel("Genre", { exact: true }).fill("Jazz");
  await page.locator('a[href="/"]').first().click();
  await page.waitForURL(base + "/");
  await page.goto(base + "/tools/audio/ai-music-data-sandbox");
  await waitUI();
  assert.ok(
    (await readTracks()).some((t) => t.tags.genre === "Jazz"),
    "Navigation must save a pending draft before leaving",
  );
  assert.deepEqual(unexpected, [], "Sandbox must never load inference models or upload audio");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        ok: true,
        records: (await readTracks()).length,
        checks: [
          "ZIP sidecars",
          "measured facts",
          "human review",
          "editable IDs and custom JSON",
          "refresh persistence",
          "save before navigation",
          "incremental uploads",
          "duplicate IDs",
          "folder capacity",
          "master and training exports",
          "Unicode lyrics",
          "caption privacy",
          "light and dark layouts at 390/768/1440",
          "accessibility",
          "no model requests or audio uploads",
        ],
        artifacts: output,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(JSON.stringify({ visible: await scope.innerText().catch(() => ""), output }));
  await page.screenshot({ path: join(output, "failure.png"), fullPage: true }).catch(() => {});
  throw e;
} finally {
  await browser.close();
}
