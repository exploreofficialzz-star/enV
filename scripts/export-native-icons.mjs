import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import * as Lucide from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { PNG } from "pngjs";

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
  "ChevronDown",
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
const sourceLogo = path.join(root, "public/logo-header-transparent.png");
const lightLogo = path.join(outputRoot, "logo-header-transparent.png");
const darkLogo = path.join(outputRoot, "logo-header-dark.png");
const companyLogo = path.join(root, "public/chas-technologies-logo.jpg");
const sharedCompanyLogo = path.join(outputRoot, "chas-technologies-logo.jpg");
copyFileSync(sourceLogo, lightLogo);
copyFileSync(companyLogo, sharedCompanyLogo);
const logoPng = PNG.sync.read(readFileSync(sourceLogo));
for (let offset = 0; offset < logoPng.data.length; offset += 4) {
  const red = logoPng.data[offset];
  const green = logoPng.data[offset + 1];
  const blue = logoPng.data[offset + 2];
  if (Math.max(red, green, blue) < 112 && Math.max(red, green, blue) - Math.min(red, green, blue) < 40) {
    logoPng.data[offset] = 255;
    logoPng.data[offset + 1] = 255;
    logoPng.data[offset + 2] = 255;
  }
}
writeFileSync(darkLogo, PNG.sync.write(logoPng));

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
