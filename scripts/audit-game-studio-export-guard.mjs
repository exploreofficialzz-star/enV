// Run against an enV server to verify a failed model cannot be silently omitted.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.ENV_GAME_AUDIT_ORIGIN || "http://127.0.0.1:8080";
const project = JSON.parse(
  await readFile(new URL("../tests/fixtures/game-studio-project-v1.json", import.meta.url), "utf8"),
);
// The container and metadata are valid, but the referenced mesh accessor does not exist.
const gltf = {
  asset: { version: "2.0" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 999 } }] }],
  accessors: [],
};
let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(20);
header.write("glTF");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + json.length, 8);
header.writeUInt32LE(json.length, 12);
header.write("JSON", 16);
project.assets.find((entry) => entry.kind === "glb").dataUrl =
  `data:model/gltf-binary;base64,${Buffer.concat([header, json]).toString("base64")}`;

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox", "--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await page.goto(`${origin}/3d-game-studio`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator("[data-renderer-ready=true]").waitFor({ timeout: 90000 });
  await page.locator("input[type=file]").last().setInputFiles({
    name: "invalid-model.env3d.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("alert").waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  let downloaded = false;
  page.on("download", () => { downloaded = true; });
  await page.getByRole("button", { name: "Export scene as GLB" }).click();
  await page.getByText("A visible object could not be loaded. Fix the scene before exporting.").waitFor({ timeout: 10000 });
  assert.equal(downloaded, false, "A partial model must not be downloaded");
  console.log("PASS: a failed visible model prevents an incomplete GLB export");
} finally {
  await browser.close();
}
