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
    await page.locator("article > header h1").waitFor({ state: "visible", timeout: 90000 });
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
    assert.equal(await splash.getByText("Rumuo").count(), 0, "Welcome must not show the old credit");
    checkedWelcome = true;
  }
  await splash.getByRole("button", { name: "Enter sandbox" }).click();
  await splash.waitFor({ state: "hidden" });
  await scope.locator(".ms-page-heading").waitFor({ timeout: 90000 });
};
let checkedDialog = false;
const importZip = async (file) => {
  await scope.getByRole("button", { name: "Add music", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  if (!checkedDialog) {
    const radii = await page.getByRole("dialog").evaluate((dialog) => ({
      dialog: parseFloat(getComputedStyle(dialog).borderTopLeftRadius),
      field: parseFloat(getComputedStyle(dialog.querySelector("select")).borderTopLeftRadius),
    }));
    assert.ok(radii.dialog >= 16 && radii.field >= 12, `Dialog and input have rounded corners: ${JSON.stringify(radii)}`);
    checkedDialog = true;
  }
  await page.getByLabel("Import music files", { exact: true }).setInputFiles(file);
  await scope.getByText(/\d+ songs? added\./).waitFor({ timeout: 30000 });
};
const assertMobileNavigation = async (target) => {
  const geometry = await target.locator(".ms-sidebar nav").evaluate((nav) => {
    const button = nav.querySelector("button:last-child");
    const label = button?.querySelector("span");
    if (!button || !label) return null;
    const range = document.createRange();
    range.selectNodeContents(label);
    const text = label.getBoundingClientRect(), box = button.getBoundingClientRect();
    return {
      label: label.textContent,
      lines: range.getClientRects().length,
      textLeft: text.left, textRight: text.right, buttonLeft: box.left, buttonRight: box.right,
      visibleWidth: nav.clientWidth, contentWidth: nav.scrollWidth,
    };
  });
  assert.ok(geometry, "Mobile navigation must be present");
  assert.equal(geometry.label, "Ready to export");
  assert.equal(geometry.lines, 1, "Ready to export stays on one line");
  assert.ok(geometry.textLeft >= geometry.buttonLeft - 1 && geometry.textRight <= geometry.buttonRight + 1, `The full label must fit its button: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.contentWidth <= geometry.visibleWidth + 1, `The four navigation buttons fit on a phone: ${JSON.stringify(geometry)}`);
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
  assert.equal(await scope.getByRole("button", { name: "Blank record" }).count(), 0);
  assert.equal(await scope.getByRole("button", { name: "Export", exact: true }).count(), 0);
  const icons = [["Overview", "layout-dashboard"], ["Folders", "folder"], ["Drafts", "file-pen-line"], ["Ready to export", "file-check"]];
  for (const [label, icon] of icons) {
    const button = scope.locator(".ms-sidebar").getByRole("button", { name: new RegExp(`^${label}`) });
    assert.ok((await button.locator("svg").getAttribute("class")).includes(`lucide-${icon}`), `${label} has the right icon`);
  }
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
  const audioPreview = scope.locator("audio");
  await audioPreview.waitFor({ state: "visible", timeout: 5000 });
  assert.equal(await audioPreview.count(), 1, "Audio remains on screen while tagging");
  await scope.locator("audio").evaluate((audio) => audio.play());
  await page.waitForFunction(() => document.querySelector(".music-sandbox audio")?.currentTime > 0.1);
  await scope.locator(".ms-data-tabs").getByRole("button", { name: "tags.json" }).click();
  assert.equal(await scope.locator("audio").evaluate((audio) => audio.paused), false, "Playback continues when changing sections");
  await scope.locator("audio").evaluate((audio) => audio.pause());
  await scope.getByLabel("Instruments", { exact: true }).fill("guitar, shaker,");
  await scope.getByLabel("Instruments", { exact: true }).pressSequentially(" piano");
  assert.equal(await scope.getByLabel("Instruments", { exact: true }).inputValue(), "guitar, shaker, piano");
  await page.getByRole("button", { name: "View AI Music Data Sandbox in full screen" }).click();
  await page.locator(".env-tool-fullscreen__exit").waitFor({ state: "visible" });
  assert.equal(await scope.locator(".ms-splash").count(), 0, "Full screen opens the workspace directly");
  assert.ok((await scope.boundingBox()).width <= 430, "Full screen uses the mobile workspace regardless of view preference");
  assert.equal(await scope.getByLabel("Instruments", { exact: true }).inputValue(), "guitar, shaker, piano", "Full screen preserves the open draft");
  await page.locator(".env-tool-fullscreen__exit").click();
  assert.equal(await scope.getByLabel("Instruments", { exact: true }).inputValue(), "guitar, shaker, piano");
  await scope.getByRole("button", { name: "Mark ready", exact: true }).click();
  await scope.getByText("A few things need review").waitFor();
  await scope.locator(".ms-data-tabs").getByRole("button", { name: "Music" }).click();
  await scope.getByLabel("Display title", { exact: true }).fill("Evening groove");
  await scope.locator(".ms-data-tabs").getByRole("button", { name: "tags.json" }).click();
  await scope.getByLabel("Record ID · required", { exact: true }).fill("reviewed_0001");
  await scope.getByText("Advanced JSON", { exact: true }).click();
  let edited = JSON.parse(await scope.getByLabel("Tags JSON", { exact: true }).inputValue());
  edited.custom_session = "round one";
  await scope.getByLabel("Tags JSON", { exact: true }).fill(JSON.stringify(edited, null, 2));
  await scope.locator(".ms-data-tabs").getByRole("button", { name: "Music" }).click();
  await scope.getByText("Apply or discard the JSON changes before switching sections.").waitFor();
  await scope.locator(".ms-sidebar").getByRole("button", { name: /Drafts/ }).click();
  await scope.getByText("Apply or discard the JSON changes before leaving this record.").waitFor();
  assert.equal(await scope.locator(".ms-editor").isVisible(), true, "A pending JSON draft cannot be lost through navigation");
  await scope.getByRole("button", { name: "Apply JSON", exact: true }).click();
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
  assert.equal(await scope.getByRole("button", { name: "Export", exact: true }).count(), 0);
  await scope.locator(".ms-sidebar").getByRole("button", { name: /Ready to export/ }).click();
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
    const radii = await scope.evaluate((root) => {
      const selectors = [".ms-dropzone", ".ms-search", ".ms-folder-card", ".ms-record-row", ".ms-button"];
      return Object.fromEntries(selectors.map((selector) => {
        const element = root.querySelector(selector);
        return [selector, element ? parseFloat(getComputedStyle(element).borderTopLeftRadius) : null];
      }));
    });
    for (const [selector, radius] of Object.entries(radii)) assert.ok(radius >= 12, `${selector} should have rounded corners: ${radius}`);
    await scope.screenshot({ path: join(output, `sandbox-${width}-light.png`) });
    assert.equal(await scope.getByRole("button", { name: "Workspace settings" }).count(), 0);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await scope.screenshot({ path: join(output, `sandbox-${width}-dark.png`) });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
  }
  await scope.locator(".ms-record-row button").first().click();
  await scope.locator(".ms-data-tabs").getByRole("button", { name: "tags.json" }).click();
  await scope.getByLabel("Genre · required", { exact: true }).fill("Jazz");
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
  await mobile.locator(".ms-page-heading").waitFor();
  assert.equal(await mobile.locator(".ms-splash").count(), 0);
  const navPosition = await mobile.locator(".ms-sidebar").evaluate((element) => {
    const nav = element.getBoundingClientRect(), main = element.parentElement.querySelector(".ms-main").getBoundingClientRect();
    return { navTop: nav.top, mainBottom: main.bottom };
  });
  assert.ok(navPosition.navTop >= navPosition.mainBottom - 1, "Navigation is at the bottom on mobile");
  await assertMobileNavigation(mobile);
  for (const label of ["Overview", "Folders", "Drafts", "Ready to export"]) assert.equal(await mobile.locator(".ms-sidebar").getByRole("button", { name: label }).count(), 1);
  assert.equal(await mobile.getByRole("button", { name: "Blank record" }).count(), 0);
  assert.equal(await mobile.getByRole("button", { name: "Export", exact: true }).count(), 0);
  await mobile.getByRole("button", { name: "Add music", exact: true }).click();
  await mobile.getByLabel("Import music files", { exact: true }).setInputFiles(single);
  await mobile.getByText(/\d+ songs? added\./).waitFor({ timeout: 30000 });
  await mobile.locator(".ms-record-row button").first().click();
  await mobile.locator(".ms-editor").waitFor();
  for (const section of ["Music", "lyrics.txt", "tags.json"]) {
    await mobile.locator(".ms-data-tabs").getByRole("button", { name: section }).click();
    assert.equal(await mobile.locator(".ms-data-tabs").getByRole("button", { name: section }).getAttribute("aria-pressed"), "true");
  }
  assert.equal(await mobile.getByLabel("Genre · required").isVisible(), true);
  await mobile.getByLabel("Genre · required").fill("Phone draft");
  await mobile.locator(".ms-sidebar").getByRole("button", { name: /Drafts/ }).click();
  await mobile.locator(".ms-record-row button").first().click();
  await mobile.locator(".ms-data-tabs").getByRole("button", { name: "tags.json" }).click();
  assert.equal(await mobile.getByLabel("Genre · required").inputValue(), "Phone draft", "Bottom navigation saves the open record");
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
  await small.locator(".ms-page-heading").waitFor();
  await assertMobileNavigation(small);
  const regularFont = await small.locator(".ms-sidebar nav button:last-child span").evaluate((label) => parseFloat(getComputedStyle(label).fontSize));
  await small.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await small.locator(".ms-sidebar nav button:last-child").evaluate((button) => button.scrollIntoView({ block: "nearest", inline: "nearest" }));
  const enlarged = await small.locator(".ms-sidebar nav button:last-child span").evaluate((label) => {
    const range = document.createRange(); range.selectNodeContents(label);
    const text = label.getBoundingClientRect(), button = label.parentElement.getBoundingClientRect();
    return { font: parseFloat(getComputedStyle(label).fontSize), lines: range.getClientRects().length, textLeft: text.left, textRight: text.right, buttonLeft: button.left, buttonRight: button.right };
  });
  assert.ok(enlarged.font > regularFont, "Navigation text grows with the user's text size");
  assert.equal(enlarged.lines, 1, "The larger label stays on one line");
  assert.ok(enlarged.textLeft >= enlarged.buttonLeft - 1 && enlarged.textRight <= enlarged.buttonRight + 1, "The larger label remains visible within its button");
  await small.evaluate(() => { document.documentElement.style.fontSize = ""; document.querySelector(".ms-sidebar nav").scrollLeft = 0; });
  await assertMobileNavigation(small);
  await small.locator(".music-sandbox").screenshot({ path: join(output, "library-320.png") });
  await small.getByRole("button", { name: "Add music", exact: true }).click();
  await small.getByLabel("Import music files", { exact: true }).setInputFiles(musicalFile);
  await small.getByText(/\d+ songs? added\./).waitFor({ timeout: 30000 });
  await small.locator(".ms-record-row button").first().click();
  for (const section of ["Music", "lyrics.txt", "tags.json"]) {
    await small.locator(".ms-data-tabs").getByRole("button", { name: section }).click();
    assert.equal(await small.locator("audio").isVisible(), true, "Audio stays visible while editing");
  }
  await assertMobileNavigation(small);
  await small.locator(".ms-editor-page").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const playerPlacement = await small.locator("audio").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: innerHeight };
  });
  assert.ok(playerPlacement.top >= 0 && playerPlacement.bottom <= playerPlacement.height, "Player remains on screen while the tags form scrolls");
  await small.locator(".music-sandbox").screenshot({ path: join(output, "editor-320.png") });
  assert.equal(await small.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
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
          "rounded sandbox surfaces and single-line mobile navigation",
          "concise library, matching navigation icons and ready-view exports",
          "scrollable phone editor, safe bottom navigation and full-screen viewport override",
          "320px audio editor with persistent playback",
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
