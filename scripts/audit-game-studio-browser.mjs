// Run with an enV dev server already listening: node scripts/audit-game-studio-browser.mjs
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { unzipSync } from "fflate";

const origin = process.env.ENV_GAME_AUDIT_ORIGIN || "http://127.0.0.1:8080";
const temporary = await mkdtemp(join(tmpdir(), "env-game-audit-"));
const fixture = {
  asset: { version: "2.0" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
  materials: [
    {
      pbrMetallicRoughness: {
        baseColorFactor: [0.8, 0.25, 0.2, 1],
        metallicFactor: 0,
        roughnessFactor: 0.8,
      },
    },
  ],
  buffers: [{ byteLength: 44 }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
    { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
    { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
  ],
};
let json = Buffer.from(JSON.stringify(fixture));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const binary = Buffer.alloc(44);
new Float32Array(binary.buffer, binary.byteOffset, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
binary.writeUInt16LE(1, 38);
binary.writeUInt16LE(2, 40);
const header = Buffer.alloc(12);
header.write("glTF");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + json.length + binary.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(json.length, 0);
jsonHeader.write("JSON", 4);
const binaryHeader = Buffer.alloc(8);
binaryHeader.writeUInt32LE(binary.length, 0);
binaryHeader.write("BIN\0", 4);
const modelFile = join(temporary, "triangle.glb");
await writeFile(modelFile, Buffer.concat([header, jsonHeader, json, binaryHeader, binary]));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: [
    "--no-sandbox",
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
let server;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/3d-game-studio`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator("[data-renderer-ready=true]").waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: "Project options", exact: true }).click();
  await page.getByRole("button", { name: "New from starter template" }).click();
  await page.getByRole("button", { name: /^Starter world/ }).click();
  await page.getByRole("button", { name: /Player PLAYER/ }).click();
  await page.getByLabel("Position X").fill("1.4");
  await page.getByRole("button", { name: "Rotation", exact: true }).click();
  await page.getByLabel("Rotation (degrees) Y").fill("30");
  await page.getByRole("button", { name: "Scale", exact: true }).click();
  await page.getByLabel("Scale X").fill("1.2");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Project saved in this browser.").waitFor();
  await page.reload();
  await page.getByText("Opened your last saved project.").waitFor({ timeout: 90000 });
  await page.locator("[data-renderer-ready=true]").waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: /Player PLAYER/ }).click();
  await page.getByRole("button", { name: "Position", exact: true }).click();
  assert.equal(await page.getByLabel("Position X").inputValue(), "1.4");
  await page.getByRole("button", { name: "Rotation", exact: true }).click();
  assert.equal(await page.getByLabel("Rotation (degrees) Y").inputValue(), "30");
  await page.getByRole("button", { name: "Scale", exact: true }).click();
  assert.equal(await page.getByLabel("Scale X").inputValue(), "1.2");
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  await page.locator("input[type=file]").first().setInputFiles(modelFile);
  await page.getByText("triangle.glb added to the scene.").waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Project saved in this browser.").waitFor();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const game = page.frameLocator('iframe[title="Playable game preview"]');
  await game.getByText("Game running · WASD or arrow keys to move").waitFor({ timeout: 90000 });
  const frame = page.frames().find((item) => item !== page.mainFrame());
  assert.ok(frame);
  const start = await frame.evaluate(() => {
    const player = window.BABYLON.EngineStore.LastCreatedScene.getMeshByName("Player");
    player.position.set(-2, 0.5, 0);
    return player.position.x;
  });
  await game.locator("canvas").click({ position: { x: 200, y: 200 } });
  await page.keyboard.down("d");
  await page.waitForTimeout(700);
  await page.keyboard.up("d");
  const moved = await frame.evaluate(
    () => window.BABYLON.EngineStore.LastCreatedScene.getMeshByName("Player").position.x,
  );
  assert.ok(moved > start + 0.2, "Player movement must change its runtime position");
  await frame.evaluate(() =>
    window.BABYLON.EngineStore.LastCreatedScene.getMeshByName("Player").position.set(0, 0.5, 2),
  );
  await page.keyboard.down("d");
  await page.waitForTimeout(1600);
  await page.keyboard.up("d");
  const blocked = await frame.evaluate(
    () => window.BABYLON.EngineStore.LastCreatedScene.getMeshByName("Player").position.x,
  );
  assert.ok(blocked < 1.3, "A solid obstacle must block the player");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await game.getByText("Paused", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await game.getByText("Running", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByText("Game stopped. Your editor state is unchanged.").waitFor();
  const download = page.waitForEvent("download", { timeout: 90000 });
  await page.getByRole("button", { name: "Build browser" }).click();
  const packageDownload = await download;
  const zipPath = join(temporary, "build.zip");
  await packageDownload.saveAs(zipPath);
  const entries = unzipSync(await readFile(zipPath));
  assert.ok(entries["licenses/BabylonJS-LICENSE.txt"] && entries["licenses/BabylonJS-NOTICE.txt"], "Browser build must include engine license notices");
  const output = join(temporary, "export");
  await mkdir(output);
  for (const [name, data] of Object.entries(entries)) {
    await mkdir(dirname(join(output, name)), { recursive: true });
    await writeFile(join(output, name), data);
  }
  server = createServer(async (request, response) => {
    try {
      const filename = (request.url || "/").split("?")[0].slice(1) || "index.html";
      if (!/^[\w.-]+$/.test(filename)) throw new Error("invalid path");
      response.setHeader(
        "Content-Type",
        filename.endsWith(".js") ? "text/javascript" : "text/html",
      );
      response.end(await readFile(join(output, filename)));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const exported = await browser.newPage();
  await exported.goto(`http://127.0.0.1:${server.address().port}/index.html`, {
    waitUntil: "load",
    timeout: 90000,
  });
  await exported.getByText("Game running · WASD or arrow keys to move").waitFor({ timeout: 90000 });
  const builtStart = await exported.evaluate(
    () => window.BABYLON.EngineStore.LastCreatedScene.getMeshByName("Player").position.x,
  );
  await exported.locator("canvas").click();
  await exported.keyboard.down("d");
  await exported.waitForTimeout(700);
  await exported.keyboard.up("d");
  const builtEnd = await exported.evaluate(
    () => window.BABYLON.EngineStore.LastCreatedScene.getMeshByName("Player").position.x,
  );
  assert.ok(builtEnd > builtStart + 0.2, "Exported game must respond to input");
  await exported.close();
  const godotDownload = page.waitForEvent("download", { timeout: 90000 });
  await page.getByRole("button", { name: "Project options", exact: true }).click();
  await page.getByRole("button", { name: "Export Godot project" }).click();
  const godotZipPath = join(temporary, "godot.zip");
  await (await godotDownload).saveAs(godotZipPath);
  const godotOutput = join(temporary, "godot-project");
  await mkdir(godotOutput);
  for (const [name, data] of Object.entries(unzipSync(await readFile(godotZipPath))))
    await writeFile(join(godotOutput, name), data);
  if (process.env.GODOT_BIN) {
    await copyFile(
      new URL("./test-game-studio-godot.gd", import.meta.url),
      join(godotOutput, "test_runner.gd"),
    );
    const result = spawnSync(
      process.env.GODOT_BIN,
      ["--headless", "--path", godotOutput, "--script", "res://test_runner.gd"],
      {
        encoding: "utf8",
        timeout: 30000,
        env: { ...process.env, ENV_GAME_FIXTURE: join(godotOutput, "project.json") },
      },
    );
    assert.equal(
      result.status,
      0,
      `Exported Godot project failed: ${result.stderr || result.error}`,
    );
    assert.match(result.stdout, /GODOT_RUNTIME_PASS/);
    console.log("PASS: exported Godot project loads its scene, GLB, movement and collision");
  }
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  const modelDownload = page.waitForEvent("download", { timeout: 90000 });
  await page.getByRole("button", { name: "Export scene as GLB" }).click();
  const modelPath = join(temporary, "roundtrip.glb");
  await (await modelDownload).saveAs(modelPath);
  const modelBytes = await readFile(modelPath);
  assert.equal(modelBytes.toString("ascii", 0, 4), "glTF", "Scene export must be a real GLB");
  const modelJson = JSON.parse(modelBytes.toString("utf8", 20, 20 + modelBytes.readUInt32LE(12)));
  assert.ok(modelJson.meshes?.length >= 3, "Scene export must contain the scene geometry");
  assert.ok(!(modelJson.nodes || []).some((node) => node.name === "editor grid"), "Editor grid must stay out of the model");
  await page.locator("input[type=file]").first().setInputFiles(modelPath);
  await page.getByText("roundtrip.glb added to the scene.").waitFor({ timeout: 60000 });
  console.log(
    "PASS: viewport, transforms, save/reload, GLB import/export, movement, collision, pause/stop, extracted browser build",
  );
  // A slow storage restore must never overwrite edits made while it is pending.
  const delayed = await page.context().newPage();
  await delayed.addInitScript(() => {
    const originalOpen = IDBFactory.prototype.open;
    const pending = [];
    window.__envPendingRestores = pending;
    window.__envReleaseRestores = () => {
      for (const resume of pending.splice(0)) resume();
    };
    IDBFactory.prototype.open = function (name, version) {
      const request = version === undefined
        ? originalOpen.call(this, name)
        : originalOpen.call(this, name, version);
      if (name !== "env-3d-studio-v1") return request;
      let handler = null;
      Object.defineProperty(request, "onsuccess", {
        configurable: true,
        get: () => handler,
        set: (value) => { handler = value; },
      });
      request.addEventListener("success", (event) => {
        pending.push(() => handler?.call(request, event));
      });
      return request;
    };
  });
  await delayed.goto(`${origin}/3d-game-studio`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await delayed.locator("[data-renderer-ready=true]").waitFor({ timeout: 90000 });
  await delayed.waitForFunction(() => window.__envPendingRestores?.length >= 2, null, { timeout: 30000 });
  await delayed.getByLabel("Project name").fill("My work in progress");
  await delayed.evaluate(() => window.__envReleaseRestores());
  await delayed.getByRole("button", { name: "Project options", exact: true }).click();
  await delayed.locator(".game-menu").getByRole("button", { name: "Starter world", exact: true }).waitFor({ timeout: 30000 });
  assert.equal(await delayed.getByLabel("Project name").inputValue(), "My work in progress",
    "A delayed restore must not overwrite work started in the editor");
  await delayed.close();

  await page.goto(`${origin}/tools/developer/ux-ui-studio`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.envToolHydrated === "ux-ui-studio",
    null,
    { timeout: 90000 },
  );
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  await page.locator('svg[aria-label$=" design artboard"]').waitFor();
  await page.getByRole("button", { name: "Add text", exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Send to 3D" }).click();
  await page.waitForURL("**/3d-game-studio", { timeout: 90000 });
  await page.locator("[data-renderer-ready=true]").waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  const artboard = page.locator(".game-asset").first();
  await artboard.waitFor();
  await artboard.getByRole("button").click();
  await page.getByText(/added to the scene\./).waitFor();
  const upload = page.locator("input[type=file]").first();
  await upload.setInputFiles({ name: "bad.obj", mimeType: "text/plain", buffer: Buffer.from("x") });
  await page
    .getByText("Choose a .glb model. Separate .gltf files and other formats are not supported.")
    .waitFor();
  await upload.setInputFiles({
    name: "bad.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from("bad"),
  });
  await page.getByText("This file is not a valid GLB model.").waitFor();
  await upload.setInputFiles({
    name: "large.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.alloc(15 * 1024 * 1024 + 1),
  });
  await page.getByText("Models must be 15 MB or smaller.").waitFor();
  await page.getByRole("button", { name: "Scene", exact: true }).click();
  for (let index = 0; index < 8; index++)
    await page
      .locator(".game-add-objects")
      .getByRole("button", { name: "Cube", exact: true })
      .click();
  await page.getByRole("button", { name: "Previous scene objects" }).click();
  await page.getByRole("button", { name: "Next scene objects" }).click();
  assert.ok(
    (await page.locator(".game-scene-items button").count()) > 0,
    "Scene pagination must expose additional objects",
  );
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 768, height: 1024 },
    { width: 844, height: 390 },
    { width: 1024, height: 600 },
    { width: 1440, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(200);
    if (viewport.width <= 1000)
      await page.getByRole("button", { name: "Inspect", exact: true }).click();
    for (const tab of ["Transform", "Appearance", "Gameplay"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      const fit = await page
        .locator(".game-inspector-content")
        .evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight }));
      assert.ok(
        fit.scroll <= fit.client + 1,
        `${tab} must fit without scrolling at ${viewport.width}x${viewport.height}: ${JSON.stringify(fit)}`,
      );
    }
    const bounds = await page.locator(".game-studio").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        scroll: element.scrollHeight,
        client: element.clientHeight,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    assert.ok(
      bounds.scroll <= bounds.client + 1 &&
        bounds.documentWidth <= viewport.width + 1 &&
        bounds.height <= viewport.height + 1,
      `Workspace must fit ${viewport.width}x${viewport.height}`,
    );
    await page.getByRole("button", { name: "Project options", exact: true }).click();
    const menuBounds = await page.locator(".game-menu").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, right: rect.right };
    });
    assert.ok(
      menuBounds.bottom <= viewport.height + 1 && menuBounds.right <= viewport.width + 1,
      `Project menu must fit ${viewport.width}x${viewport.height}`,
    );
    await page.getByRole("button", { name: "New from starter template" }).click();
    const templateBounds = await page.locator(".game-template-dialog").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    assert.ok(
      templateBounds.top >= -1 && templateBounds.bottom <= viewport.height + 1,
      `Templates must fit ${viewport.width}x${viewport.height}`,
    );
    await page.keyboard.press("Escape");
    if (viewport.width <= 1000) {
      await page.getByRole("button", { name: "Assets", exact: true }).click();
      await page.getByRole("button", { name: /In project/ }).click();
      const assetsFit = await page
        .locator(".game-asset-items")
        .evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight }));
      assert.ok(
        assetsFit.scroll <= assetsFit.client + 1,
        `Asset list must fit at ${viewport.width}x${viewport.height}: ${JSON.stringify(assetsFit)}`,
      );
      await page.getByRole("button", { name: "Objects", exact: true }).click();
      await page.waitForFunction(
        () => {
          const list = document.querySelector(".game-scene-items");
          return list && list.scrollHeight <= list.clientHeight + 1;
        },
        null,
        { timeout: 5000 },
      );
      const sceneFit = await page
        .locator(".game-scene-items")
        .evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight }));
      assert.ok(
        sceneFit.scroll <= sceneFit.client + 1,
        `Scene list must fit at ${viewport.width}x${viewport.height}: ${JSON.stringify(sceneFit)}`,
      );
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: actual UX/UI Artboard handoff, malformed/unsupported/oversized files, paged lists and screen-fitting layouts",
  );
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
