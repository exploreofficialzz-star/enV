import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

writeFileSync(
  "/workspace/.grok/favicon-preview.html",
  `<!doctype html>
<html><head><style>
  html,body{margin:0;background:#888;}
  .row{display:flex;gap:16px;align-items:center;padding:16px;background:#fff;}
  .row.dark{background:#1a1a1a;}
  img{display:block;}
</style></head><body>
  <div class="row">
    <img src="favicon.svg" width="16" height="16">
    <img src="favicon.svg" width="32" height="32">
    <img src="favicon.svg" width="64" height="64">
    <img src="favicon.svg" width="180" height="180">
  </div>
  <div class="row dark">
    <img src="favicon.svg" width="16" height="16">
    <img src="favicon.svg" width="32" height="32">
    <img src="favicon.svg" width="64" height="64">
  </div>
</body></html>
`,
);
writeFileSync(
  "/workspace/.grok/favicon-16.html",
  '<html><body style="margin:0;background:#fff"><img src="favicon.svg" width="16" height="16"></body></html>',
);
writeFileSync(
  "/workspace/.grok/favicon-32.html",
  '<html><body style="margin:0;background:#fff"><img src="favicon.svg" width="32" height="32"></body></html>',
);

const browser = await chromium.launch();
const preview = await browser.newPage({ viewport: { width: 520, height: 280 } });
await preview.goto("file:///workspace/.grok/favicon-preview.html");
await preview.screenshot({ path: "/workspace/.grok/favicon-preview.png" });

const p16 = await browser.newPage({ viewport: { width: 16, height: 16 }, deviceScaleFactor: 1 });
await p16.goto("file:///workspace/.grok/favicon-16.html");
await p16.screenshot({ path: "/workspace/.grok/favicon-16.png" });

const p32 = await browser.newPage({ viewport: { width: 32, height: 32 }, deviceScaleFactor: 1 });
await p32.goto("file:///workspace/.grok/favicon-32.html");
await p32.screenshot({ path: "/workspace/.grok/favicon-32.png" });

await browser.close();
console.log("ok");
