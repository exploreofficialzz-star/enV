#!/usr/bin/env node
/** Author the sample on the deployed legacy Studio while Vercel blocks the new release. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";

const base = "https://envtools.store";
const output = resolve(process.env.ENV_MUSIC_DESIGN_DIR || "/tmp/env-ai-music-studio");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--disable-lcd-text"], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium" });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", acceptDownloads: true, serviceWorkers: "block" });
const page = await context.newPage(); page.setDefaultTimeout(45000);
const resumePath=process.env.ENV_MUSIC_RESUME_JSON;
const errors = [], actions = resumePath ? JSON.parse(await readFile(resolve(output,"live-studio-design-actions.json"),"utf8")) : [], layers = [];
page.on("pageerror", error => errors.push(error.message));
const palette = { background: "#F4F9F7", card: "#FFFFFF", ink: "#173B33", green: "#13795B", muted: "#647A72", border: "#DCECE5", mint: "#E4F3EC" };
const brief = `AI Music Studio is a friendly music creation app for mobile, tablet and desktop. Keep the exact name AI Music Studio.
Five main workflows:
1. Nigerian music generation: Afrobeat, live-stage music, traditional and cultural music, rap and drill.
2. Voice cloning: ask the user to read a short text, then generate sung vocals in their own voice. Require an explicit unchecked confirmation, "I confirm this is my own voice", before recording or processing. This feature is for the user's own voice only.
3. Genre-aware lyrics generation with Nigerian Pidgin, Yoruba, Igbo and Hausa, preserving each genre's writing style and allowing review/editing before generation.
4. Bring your own beat: upload a beat and record vocals; offer noise removal, pitch correction, reverb, compression, EQ and mastering, with optional extra instruments such as talking drums. Retain the original and offer before/after playback.
5. Verse completion: a user brings a chorus and AI writes and sings the missing verse to match its style, tempo and key.
Planned extras, not fully specified: stem separation (vocals, drums and other parts), automatic mixing/mastering, remix or genre swap such as Afrobeat to Amapiano, vocal harmonies/ad-libs, chord/melody suggestions and humming-to-beat. Optional add-on: tempo and key detection running in the browser for uploaded beats.
Use the supplied mint and deep-green visual system, clear friendly wording, accessible contrast and generous touch targets. Content and styling are shared; mobile, tablet and desktop have authored layout overrides. The visuals are a product design and handoff; the eventual builder must implement the audio/AI services, consent, file validation, progress/error handling, saving and export. Do not label planned extras as already enabled.`;

function record(action, detail) { actions.push({ at: new Date().toISOString(), action, detail }); console.log(action + ": " + detail); }
async function tool(name) { await page.locator(".uxui-context-toolbar").getByRole("button", { name, exact: true }).click(); }
async function inspector() {
  if (!await page.locator(".uxui-inspector").isVisible()) await page.getByRole("button", { name:"App screens and layers",exact:true }).click();
  const panel=page.locator(".uxui-inspector");
  const details=panel.locator("details.uxui-advanced-controls");
  if(await details.getAttribute("open")===null) await details.locator(":scope > summary").click();
  return panel;
}
async function closeInspector() { await page.getByRole("button",{name:"Close app screens and layers",exact:true}).click(); }
async function geometry(name, values) {
  const panel=await inspector();
  await panel.getByLabel("Layer name", { exact: true }).fill(name);
  for (const [label, value] of [["X position (px)", values[0]], ["Y position (px)", values[1]], ["Width (px)", values[2]], ["Height (px)", values[3]]]) await panel.getByLabel(label, { exact: true }).fill(String(value));
  await panel.getByLabel("Padding (px)",{exact:true}).fill(name.endsWith("icon") || name.endsWith("mark") ? "2" : "0");
  await closeInspector();
}
async function colors(fill, ink) {
  await tool("Color");
  if (fill) await page.getByLabel("Selected fill color", { exact: true }).fill(fill);
  if (ink) await page.getByLabel("Selected content color", { exact: true }).fill(ink);
}
async function typography(size, weight = 400, spacing = 0, lineHeight = 1.25, align = "left") {
  const panel=await inspector();
  await panel.locator('[data-field="Font family"] select').selectOption("Arial");
  await panel.getByLabel("Font size (px)", { exact: true }).fill(String(size));
  await panel.locator('[data-field="Font weight"] select').selectOption(String(weight));
  await panel.getByLabel("Letter spacing (px)", { exact: true }).fill(String(spacing));
  await panel.getByLabel("Line height", { exact: true }).fill(String(lineHeight));
  await panel.locator('[data-field="Text alignment"] select').selectOption(align);
  await closeInspector();
}
async function addShape(label) {
  await page.getByRole("button", { name: "Add elements", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Studio toolkit", exact: true });
  await dialog.getByRole("tab", { name: "Elements", exact: true }).click();
  await dialog.getByRole("button", { name: new RegExp("^"+label+":") }).click();
  await dialog.waitFor({ state: "hidden" });
}
async function edge(radius, border = 0) {
  const panel=await inspector();
  await panel.getByLabel("Corner radius (px)", { exact: true }).fill(String(radius));
  await panel.getByLabel("Border width (px)", { exact: true }).fill(String(border));
  await panel.getByLabel("Border color", { exact: true }).fill(palette.border);
  await closeInspector();
}
function keep(name, kind, mobile, tablet, desktop, size, tabletSize, desktopSize) { layers.push({ name, kind, mobile, tablet, desktop, size, tabletSize, desktopSize }); }
async function text(name, copy, mobile, tablet, desktop, size = 14, weight = 400, ink = palette.ink, tabletSize = size, desktopSize = size, spacing = 0, align = "left") {
  if(resumePath) { keep(name,"text",mobile,tablet,desktop,size,tabletSize,desktopSize); return; }
  record("Add text through Studio", name);
  await addShape("Text"); await tool("Text");
  await page.getByLabel("Selected text content", { exact: true }).fill(copy);
  await typography(size, weight, spacing, name === "Hero headline" ? 1.05 : 1.25, align);
  await geometry(name, mobile); await colors(null, ink);
  keep(name, "text", mobile, tablet, desktop, size, tabletSize, desktopSize);
}
async function shape(name, preset, mobile, tablet, desktop, fill = palette.card, radius = 18, border = 0) {
  if(resumePath) { keep(name,"shape",mobile,tablet,desktop); return; }
  record("Add shape through Studio", name);
  await addShape(preset);
  if (["Card", "Button"].includes(preset)) { await tool("Text"); await page.getByLabel("Selected text content", { exact: true }).fill(""); }
  await geometry(name, mobile); await colors(fill); await edge(radius, border);
  if (preset === "Card") { await tool("More"); await page.getByLabel("Selected drop shadow", { exact: true }).uncheck(); }
  keep(name, "shape", mobile, tablet, desktop);
}
async function icon(name, query, mobile, tablet, desktop, ink = palette.green) {
  if(resumePath) { keep(name,"icon",mobile,tablet,desktop); return; }
  record("Add bundled icon through Studio", name);
  await page.getByRole("button", { name: "Add elements", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Studio toolkit", exact: true });
  await dialog.getByRole("button", { name: /^Icons\s/ }).click();
  const library = page.getByRole("region", { name: "Studio toolkit", exact: true });
  await library.getByLabel("Search icons", { exact: true }).fill(query);
  const exact = library.locator('button[title="Add icon lucide:' + query + '"]');
  await exact.waitFor({ state: "visible" }); await exact.click();
  await library.waitFor({ state: "hidden" }); await geometry(name, mobile); await colors(null, ink);
  await edge(0);
  keep(name, "icon", mobile, tablet, desktop);
}
async function select(name) {
  if(!await page.locator(".uxui-context-toolbar").getByRole("button",{name:"Look closer",exact:true}).count()) await page.locator("[data-layer-id]").first().click({force:true});
  await tool("Look closer");
  const literal = new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$");
  await page.locator(".uxui-layer-finder button").filter({ has: page.locator("strong").filter({ hasText: literal }) }).click();
}
async function download(button, filename) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const waiting = page.waitForEvent("download", { timeout: 180000 });
  await page.getByRole("button", { name: button, exact: typeof button === "string" }).click();
  const file = await waiting; await file.saveAs(resolve(output, filename));
  record("Download from Studio", filename);
}

try {
  await page.goto(base + "/tools/developer/ux-ui-studio", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => document.documentElement.dataset.envToolHydrated === "ux-ui-studio");
  assert.equal(new URL(page.url()).origin, base);
  assert.equal(await page.locator(".uxui-primary-text").count(),0,"Use the linked-device authoring script when the new release is live");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  if(resumePath) {
    await page.getByLabel("Import preset",{exact:true}).setInputFiles(resolve(resumePath));
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem("env-ux-ui-studio-project-v1")||"null")?.elements?.length===45);
    record("Import actual Studio download",resumePath);
  }
  await page.getByRole("button", { name: "App screens and layers", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("AI Music Studio");
  await page.getByRole("button", { name: "Close app screens and layers", exact: true }).click();
  await page.getByRole("button", { name: "Select canvas background", exact: true }).press("Enter");
  await page.getByLabel("Canvas background color", { exact: true }).fill(palette.background);

  // The surface is inserted first so the later navigation and brand stay above it.
  await shape("Navigation surface", "Rectangle", [0,790,390,54], [0,960,768,64], [0,0,224,900], palette.card, 0, 1);
  await shape("Brand disc", "Circle", [24,24,28,28], [32,28,32,32], [24,32,28,28], palette.green, 14);
  await icon("Brand music mark", "music-2", [30,30,16,16], [39,35,18,18], [30,38,16,16], "#FFFFFF");
  await text("Brand name", "AI Music Studio", [62,25,252,29], [76,30,520,32], [64,33,148,30], 18, 700, palette.ink, 22, 18);
  await shape("Profile disc", "Circle", [336,24,30,30], [704,28,32,32], [1352,28,36,36], palette.mint, 18);
  await icon("Profile icon", "user-round", [343,31,16,16], [712,36,16,16], [1361,37,18,18]);
  await text("Hero eyebrow", "MADE FOR YOUR MUSIC", [24,80,342,18], [32,94,704,20], [264,78,1104,20], 10, 600, palette.green, 11, 11, 1.2);
  await text("Hero headline", "Your sound.\nYour next song.", [24,104,342,72], [32,122,704,86], [264,108,740,108], 30, 700, palette.ink, 38, 48, -.8);
  await text("Hero introduction", "From first idea to finished track.", [24,184,342,22], [32,218,704,25], [264,232,740,28], 13, 400, palette.muted, 16, 17);
  if(!resumePath) {
    await addShape("Button"); await tool("Text"); await page.getByLabel("Selected text content", { exact: true }).fill("Create your first song");
    await typography(14,600,0,1.2,"center"); await geometry("Create song action",[24,218,342,44]); await colors(palette.green,"#FFFFFF"); await edge(15);
  }
  keep("Create song action","text",[24,218,342,44],[32,266,280,48],[1090,150,278,50],14,15,15);
  await text("Tools heading", "Five ways to create", [24,284,342,22], [32,342,704,28], [264,294,1104,30], 17, 700, palette.ink, 20, 22);

  const features = [
    { title:"Nigerian sounds", description:"Afrobeat, live, traditional & cultural.\nRap and drill, in your own style.", icon:"drum" },
    { title:"Your own voice", description:"Read a short text, then sing in your voice.\nI confirm this is my own voice.", icon:"mic" },
    { title:"Lyrics in your language", description:"Genre-aware words in Pidgin, Yoruba,\nIgbo and Hausa.", icon:"notebook-pen" },
    { title:"Bring your own beat", description:"Upload a beat. Record, polish & master.\nAdd talking drums if you like.", icon:"audio-lines" },
    { title:"Finish that verse", description:"Have a chorus? Complete the verse.\nMatch its style, tempo and key.", icon:"wand-sparkles" },
  ];
  for (const [index, feature] of features.entries()) {
    const mobile=[24,314+index*82,342,74];
    const tablet=index===4?[32,704,704,140]:[32+(index%2)*362,384+Math.floor(index/2)*160,342,140];
    const desktop=[264+(index%3)*376,348+Math.floor(index/3)*192,352,168];
    await shape(feature.title+" surface","Card",mobile,tablet,desktop,palette.card,18,1);
    await shape(feature.title+" icon disc","Circle",[mobile[0]+12,mobile[1]+19,36,36],[tablet[0]+16,tablet[1]+20,40,40],[desktop[0]+18,desktop[1]+22,40,40],palette.mint,20);
    await icon(feature.title+" icon",feature.icon,[mobile[0]+20,mobile[1]+27,20,20],[tablet[0]+25,tablet[1]+29,22,22],[desktop[0]+27,desktop[1]+31,22,22]);
    await text(feature.title+" title",feature.title,[mobile[0]+62,mobile[1]+11,268,21],[tablet[0]+70,tablet[1]+22,tablet[2]-86,25],[desktop[0]+76,desktop[1]+24,desktop[2]-92,26],14,600,palette.ink,16,17);
    await text(feature.title+" description",feature.description,[mobile[0]+62,mobile[1]+34,268,32],[tablet[0]+70,tablet[1]+61,tablet[2]-86,58],[desktop[0]+76,desktop[1]+65,desktop[2]-92,66],11,400,palette.muted,12,13);
  }
  await text("Planned tools heading","Coming next",[24,734,342,16],[32,864,704,20],[1016,558,352,26],11,600,palette.ink,13,17);
  await text("Planned tools details","Stems · Mix/master · Remix · Harmonies · Chords\nHum-to-beat · Browser tempo/key (optional)",[24,754,342,29],[32,890,704,36],[1016,598,352,95],10,400,palette.muted,12,13);
  for (const [index,item] of [{title:"Create",icon:"sparkles"},{title:"Projects",icon:"folder"},{title:"Library",icon:"headphones"}].entries()) {
    await icon(item.title+" navigation icon",item.icon,[56+index*130,798,18,18],[118+index*256,974,20,20],[28,142+index*54,20,20],index===0?palette.green:palette.muted);
    await text(item.title+" navigation label",item.title,[34+index*130,822,62,16],[96+index*256,1000,64,18],[66,141+index*54,138,24],9,600,index===0?palette.green:palette.muted,10,13,0,index===0?"center":"center");
  }
  assert.equal(layers.length,44);
  await text("Implementation brief", "NON-VISUAL HANDOFF NOTES. Do not render this hidden layer as interface copy.\n"+brief,[0,0,100,100],[0,0,100,100],[0,0,100,100],10);
  if(!resumePath) {
    await tool("More");
    await page.locator(".uxui-inline-actions").getByRole("button",{name:"Hide",exact:true}).click();
    await page.getByRole("button",{name:"Done editing selected item",exact:true}).click();
  }
  const screenshots=[], pdfPages={};
  async function capture(device) {
    await page.setViewportSize({width:1440,height:1600});
    await page.evaluate(()=>document.fonts.ready);
    const path=resolve(output,"ai-music-studio-"+device+".png");
    await page.locator('svg[aria-label="AI Music Studio design artboard"]').screenshot({path,animations:"disabled"});
    await page.screenshot({path:resolve(output,"ai-music-studio-"+device+"-in-env.png"),animations:"disabled"});
    screenshots.push(path);
    await download(/^PDF handoff/,"ai-music-studio-"+device+"-handoff.pdf");
    await download(/^Project JSON/,"ai-music-studio-"+device+"-project.json");
    await download(/^HTML \+ CSS/,"ai-music-studio-"+device+".html");
    const project=JSON.parse(await readFile(resolve(output,"ai-music-studio-"+device+"-project.json"),"utf8"));
    assert.equal(project.name,"AI Music Studio"); assert.equal(project.elements.length,45);
    assert.equal(project.target,device);
    assert.ok(project.aiPrompt.includes("I confirm this is my own voice") && project.aiPrompt.includes("talking drums"));
    pdfPages[device]=(await PDFDocument.load(await readFile(resolve(output,"ai-music-studio-"+device+"-handoff.pdf")))).getPageCount();
    await page.setViewportSize({width:1440,height:1000});
  }
  if(!resumePath) await capture("mobile");
  else {
    screenshots.push(resolve(output,"ai-music-studio-mobile.png"));
    pdfPages.mobile=(await PDFDocument.load(await readFile(resolve(output,"ai-music-studio-mobile-handoff.pdf")))).getPageCount();
  }
  // The deployed version has one mutable device view. Export each authored layout
  // before switching, so all three real Studio designs remain available separately.
  for (const device of ["tablet","desktop"]) {
    await page.getByRole("group",{name:"Preview device",exact:true}).getByRole("button",{name:device[0].toUpperCase()+device.slice(1),exact:true}).click();
    for (const layer of layers) {
      if(layer.name==="Implementation brief") continue;
      await select(layer.name); await geometry(layer.name,layer[device]);
      if (layer.kind==="text") {
        const panel=await inspector();
        await panel.getByLabel("Font size (px)",{exact:true}).fill(String(layer[device+"Size"]??layer.size));
        if (device === "desktop" && layer.name.endsWith("navigation label")) await panel.locator('[data-field="Text alignment"] select').selectOption("left");
        await closeInspector();
      }
      record("Device layout through Studio",device+": "+layer.name);
    }
    await page.getByRole("button",{name:"Done editing selected item",exact:true}).click();
    await capture(device);
  }
  assert.deepEqual(errors,[]);
  const report={createdAt:new Date().toISOString(),site:base,workflow:"Every layer was created and edited with the live Studio UI. No project or localStorage injection and no external design generator.",releaseBoundary:"Vercel deployment rate limit blocked the updated Studio. The deployed editor uses one mutable view, so each device layout was authored and exported separately before switching. Arial is a system font; the implementation brief is a real hidden text layer.",visibleLayers:44,layers:45,devices:["mobile","tablet","desktop"],pdfPages,screenshots,actions,runtimeErrors:errors};
  await writeFile(resolve(output,"live-studio-design-report.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({layers:45,pdfPages,output,runtimeErrors:errors}));
} catch(error) {
  await page.screenshot({path:resolve(output,"design-error.png"),animations:"disabled"}).catch(()=>{});
  await writeFile(resolve(output,"live-studio-design-actions.json"),JSON.stringify(actions,null,2)+"\n");
  try {
    await page.keyboard.press("Escape");
    if(await page.getByRole("button",{name:"Close app screens and layers",exact:true}).isVisible()) await closeInspector();
    await download(/^Project JSON/,"ai-music-studio-in-progress.json");
  } catch { /* The screenshot and action log retain a failed-control trace. */ }
  throw error;
} finally { await context.close(); await browser.close(); }
