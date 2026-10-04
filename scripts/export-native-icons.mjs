import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import * as Lucide from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "apps/shared/catalog.json");
const outputRoot = path.join(root, "apps/shared/native-icons");
const iconRoot = path.join(outputRoot, "icons");
const rasterSize = 96;
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const iconNames = new Set([
  ...catalog.tools.map((tool) => tool.icon),
  ...catalog.categories.map((category) => category.icon),
  "Home",
  "LayoutGrid",
  "Search",
  "Heart",
  "User",
  "Moon",
  "Sun",
  "ArrowLeft",
  "ArrowRight",
  "Wrench",
  "Settings",
  "Bell",
  "Info",
  "ShieldCheck",
  "CircleCheck",
  "Clock3",
  "Copy",
  "RotateCcw",
  "Play",
  "Globe",
  "FilePlus2",
  "Hammer",
]);

function assetName(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

mkdirSync(iconRoot, { recursive: true });
copyFileSync(
  path.join(root, "public/logo-header-transparent.png"),
  path.join(outputRoot, "logo-header-transparent.png"),
);

const executablePath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({
    viewport: { width: rasterSize, height: rasterSize },
    deviceScaleFactor: 1,
  });
  for (const name of [...iconNames].sort()) {
    const Icon = Lucide[name];
    if (!Icon) throw new Error(`Lucide does not export the web icon ${name}`);
    const svg = renderToStaticMarkup(
      React.createElement(Icon, {
        width: rasterSize,
        height: rasterSize,
        stroke: "#000000",
        strokeWidth: 2,
        fill: "none",
        absoluteStrokeWidth: false,
      }),
    );
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;padding:0;width:${rasterSize}px;height:${rasterSize}px;background:transparent}svg{display:block;width:${rasterSize}px;height:${rasterSize}px}</style></head><body>${svg}</body></html>`,
    );
    await page.locator("svg").screenshot({
      path: path.join(iconRoot, `${assetName(name)}.png`),
      omitBackground: true,
    });
  }
} finally {
  await browser.close();
}

console.log(`Exported ${iconNames.size} shared Lucide icons to ${path.relative(root, iconRoot)}`);
