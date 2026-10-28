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
const musicalSeconds = 12, musicalFrames = sampleRate * musicalSeconds;
const musical = Buffer.alloc(44 + musicalFrames * 2);
wav.copy(musical, 0, 0, 44);
musical.writeUInt32LE(musical.length - 8, 4);
musical.writeUInt32LE(musicalFrames * 2, 40);
for (let i = 0; i < musicalFrames; i++) {
  const t = i / sampleRate, pulse = (t % 0.5) < 0.025 ? Math.exp(-(t % 0.5) * 80) * 0.65 : 0;
  const chord = [261.626, 329.628, 391.995].reduce((sum, hz) => sum + Math.sin(2 * Math.PI * hz * t), 0) * 0.09;
  musical.writeInt16LE(Math.round(Math.max(-1, Math.min(1, chord + pulse)) * 24000), 44 + i * 2);
}
const musicalFile = join(output, "musical.wav");
await writeFile(musicalFile, musical);
const taggedFile = join(output, "tagged.zip");
await writeFile(taggedFile, zipSync({ "tagged.wav": musical, "tagged.tags.json": strToU8(JSON.stringify({ id: "tagged", tempo_bpm: 97, key: "G minor" })) }));
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
    const placement = await page.evaluate(() => {
      const navigation = document.querySelector(".env-app-shell > header");
      const welcome = document.querySelector(".ms-splash");
      if (!navigation || !welcome) return null;
      return {
        navigationBottom: navigation.getBoundingClientRect().bottom,
        welcomeTop: welcome.getBoundingClientRect().top,
        position: getComputedStyle(welcome).position,
      };
    });
    assert.ok(
      placement && placement.welcomeTop >= placement.navigationBottom,
      "Welcome must be below enV navigation",
    );
    assert.notEqual(placement.position, "fixed", "Welcome must remain in the page layout");
    assert.equal(await page.locator("article > header h1").isVisible(), true, "The enV tool title remains visible above the home");
    assert.equal(
      await scope.locator(".ms-page-heading").isVisible(),
      false,
      "The workspace opens only after entry",
    );
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
  await scope.getByRole("button", { name: "Listen to recording" }).click();
  assert.equal(await page.getByRole("dialog", { name: "Listen" }).locator("audio").count(), 1);
  await page.getByRole("button", { name: "Close audio preview" }).click();
  await scope.getByLabel("Edit", { exact: true }).selectOption("sound");
  await scope.getByRole("button", { name: "Next", exact: true }).click();
  await scope.getByRole("button", { name: "Next", exact: true }).click();
  await scope.getByLabel("Instruments", { exact: true }).fill("guitar, shaker,");
  await scope.getByLabel("Instruments", { exact: true }).pressSequentially(" piano");
  assert.equal(
    await scope.getByLabel("Instruments", { exact: true }).inputValue(),
    "guitar, shaker, piano",
  );
  await page.getByRole("button", { name: "View AI Music Data Sandbox in full screen" }).click();
  await scope.locator(".ms-splash").waitFor({ state: "visible" });
  assert.ok((await scope.boundingBox()).width <= 430, "Full screen uses the mobile workspace regardless of view preference");
  await scope.getByRole("button", { name: "Enter sandbox" }).click();
  assert.equal(
    await scope.getByLabel("Instruments", { exact: true }).inputValue(),
    "guitar, shaker, piano",
    "Entering full screen must preserve an open draft",
  );
  await page.locator(".env-tool-fullscreen__exit").click();
  assert.equal(
    await scope.getByLabel("Instruments", { exact: true }).inputValue(),
    "guitar, shaker, piano",
    "Exiting full screen must preserve the draft",
  );
  await scope.getByRole("button", { name: "Mark ready", exact: true }).click();
  await scope.getByText("A few things need review").waitFor();
  await scope.getByLabel("Edit", { exact: true }).selectOption("details");
  await scope.getByLabel("Display title", { exact: true }).fill("Evening groove");
  await scope.getByLabel("Record ID", { exact: true }).fill("reviewed_0001");
  await scope.getByLabel("Edit", { exact: true }).selectOption("more");
  let edited = JSON.parse(await scope.getByLabel("Tags JSON", { exact: true }).inputValue());
  edited.custom_session = "round one";
  await scope.getByLabel("Tags JSON", { exact: true }).fill(JSON.stringify(edited, null, 2));
  await scope.getByRole("button", { name: "Apply JSON changes", exact: true }).click();
  await scope.getByLabel("Edit", { exact: true }).selectOption("rights");
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
  await scope.getByLabel("Edit", { exact: true }).selectOption("sound");
  await scope.getByLabel("Genre", { exact: true }).fill("Jazz");
  await page.locator('a[href="/"]').first().click();
  await page.waitForURL(base + "/");
  await page.goto(base + "/tools/audio/ai-music-data-sandbox");
  await waitUI();
  assert.ok(
    (await readTracks()).some((t) => t.tags.genre === "Jazz"),
    "Navigation must save a pending draft before leaving",
  );
  await scope.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByLabel("Folder name", { exact: true }).fill("Analysis test");
  await page.getByRole("button", { name: "Save folder", exact: true }).click();
  await importZip(musicalFile);
  let analyzed = (await readTracks()).find((t) => t.tags.id === "musical");
  assert.equal(analyzed.analysis?.status, "complete", "A real local worker must analyze playable audio");
  assert.ok(analyzed.tags.tempo_bpm > 0 && analyzed.tags.key, "The worker supplies tempo and key estimates");
  assert.equal(analyzed.provenance.tempo_bpm, "estimated");
  assert.equal(typeof analyzed.analysis.rmsDbfs, "number");
  await importZip(taggedFile);
  analyzed = (await readTracks()).find((t) => t.tags.id === "tagged");
  assert.equal(analyzed.tags.tempo_bpm, 97, "Analysis must preserve imported BPM");
  assert.equal(analyzed.tags.key, "G minor", "Analysis must preserve an imported key");
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.addInitScript(() => localStorage.setItem("env:view-mode", "desktop"));
  const mobile = await phone.newPage();
  await mobile.goto(base + "/tools/audio/ai-music-data-sandbox");
  await mobile.locator(".ms-splash").waitFor({ timeout: 90000 });
  await mobile.waitForFunction(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content")?.includes("width=1024"));
  await mobile.getByRole("button", { name: "View AI Music Data Sandbox in full screen" }).click();
  await mobile.locator(".env-tool-fullscreen__exit").waitFor({ state: "visible" });
  await mobile.waitForFunction(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content")?.includes("width=device-width"));
  assert.equal(await mobile.evaluate(() => localStorage.getItem("env:view-mode")), "desktop", "Full screen must not change the saved view preference");
  assert.equal(await mobile.evaluate(() => window.innerWidth), 390, "Full screen must use the device viewport even when desktop view is selected");
  await mobile.getByRole("button", { name: "Enter sandbox" }).click();
  await mobile.locator(".ms-page-heading").waitFor();
  const noPanelScroll = async (label) => {
    const dimensions = await mobile.locator(".ms-main").evaluate((element) => ({ visible: element.clientHeight, content: element.scrollHeight }));
    assert.ok(dimensions.content <= dimensions.visible + 1, `${label} should fit in the phone screen: ${JSON.stringify(dimensions)}`);
  };
  await noPanelScroll("Library");
  await mobile.getByRole("button", { name: "Blank record" }).click();
  await mobile.locator(".ms-editor").waitFor();
  for (const [section, pages] of [["details", 4], ["sound", 5], ["lyrics", 1], ["rights", 1], ["more", 1]]) {
    await mobile.getByLabel("Edit", { exact: true }).selectOption(section);
    for (let i = 0; i < pages; i++) {
      await noPanelScroll(`${section} ${i + 1}`);
      if (i + 1 < pages) await mobile.getByRole("button", { name: "Next", exact: true }).click();
    }
  }
  await mobile.locator(".env-tool-fullscreen__exit").click();
  await mobile.waitForFunction(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content")?.includes("width=1024"));
  assert.equal(await mobile.evaluate(() => localStorage.getItem("env:view-mode")), "desktop");
  await phone.close();
  const regularPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const normal = await regularPhone.newPage();
  await normal.goto(base + "/tools/audio/ai-music-data-sandbox");
  await normal.getByRole("button", { name: "Enter sandbox" }).click();
  await normal.locator(".ms-page-heading").waitFor();
  await normal.waitForFunction(() => {
    const box = document.querySelector(".music-sandbox")?.getBoundingClientRect();
    return box && box.top >= 55 && box.bottom <= innerHeight + 1;
  });
  await regularPhone.close();
  const smallPhone = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  const small = await smallPhone.newPage();
  await small.goto(base + "/tools/audio/ai-music-data-sandbox");
  await small.getByRole("button", { name: "View AI Music Data Sandbox in full screen" }).click();
  await small.locator(".env-tool-fullscreen__exit").waitFor();
  await small.getByRole("button", { name: "Enter sandbox" }).click();
  await small.getByRole("button", { name: "Add music", exact: true }).click();
  await small.getByLabel("Import music files", { exact: true }).setInputFiles(musicalFile);
  await small.getByText(/records? imported as drafts/).waitFor({ timeout: 30000 });
  await small.locator(".ms-record-row button").first().click();
  for (const [section, pages] of [["details", 4], ["sound", 5], ["lyrics", 1], ["rights", 1], ["more", 1]]) {
    await small.getByLabel("Edit", { exact: true }).selectOption(section);
    for (let i = 0; i < pages; i++) {
      const box = await small.locator(".ms-main").evaluate((element) => ({ visible: element.clientHeight, content: element.scrollHeight }));
      assert.ok(box.content <= box.visible + 1, `320px audio editor ${section} ${i + 1} should fit: ${JSON.stringify(box)}`);
      if (i + 1 < pages) await small.getByRole("button", { name: "Next", exact: true }).click();
    }
  }
  await smallPhone.close();
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
          "local tempo, key and signal measurements",
          "imported musical values preserved",
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
          "screen-sized phone editor and full-screen viewport override",
          "320px audio editor and listening preview",
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
