#!/usr/bin/env node
/** End-to-end regressions for typography, linked devices, vector merging and image repair. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from "pdf-lib";

const baseUrl = (process.env.EN_V_BROWSER_AUDIT_BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const output = resolve(process.env.ENV_UX_UI_TOOLKIT_AUDIT_DIR || "/tmp/env-ux-ui-studio-toolkit-audit");
const timeout = Number(process.env.EN_V_BROWSER_AUDIT_TIMEOUT_MS || 30000);
const selected = process.env.ENV_UX_UI_AUDIT_WIDTHS?.split(",").map(Number);
const cases = [{ width:390,height:844,theme:"light",full:true },{ width:390,height:844,theme:"dark",full:true },{ width:320,height:568,theme:"light" },{ width:1440,height:1000,theme:"light" }].filter(item => !selected || selected.includes(item.width));
const report = { runAt:new Date().toISOString(),baseUrl,cases:[],errors:[] };
await mkdir(output,{recursive:true});
const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {} )});

async function project(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("env-ux-ui-studio-project-v1") || "null"));
}
async function stored(page, predicate, message) {
  const deadline = Date.now()+timeout;
  while (Date.now()<deadline) {
    const value=await project(page);
    if(value && predicate(value)) return value;
    await page.waitForTimeout(50);
  }
  throw new Error("Project did not persist "+message);
}
const currentLayer = (value,id) => value.elements.find(item=>item.id===id);
const actions = page => page.locator(".uxui-context-controls");
async function action(page,name) { await actions(page).getByRole("button",{name,exact:true}).click(); }
async function start(page) {
  await page.goto(baseUrl+"/tools/developer/ux-ui-studio",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.documentElement.dataset.envToolHydrated==="ux-ui-studio");
  await page.getByRole("button",{name:"Add project",exact:true}).click();
}
async function bounds(locator, viewport, message) {
  const box=await locator.boundingBox();
  assert.ok(box && box.width>0 && box.height>0,message+" has visible space");
  assert.ok(box.x>=-1 && box.y>=-1 && box.x+box.width<=viewport.width+1 && box.y+box.height<=viewport.height+1,message+" fits viewport: "+JSON.stringify(box));
  return box;
}
async function shape(page,name) {
  await page.getByRole("button",{name:"Add elements",exact:true}).click();
  const drawer=page.getByRole("dialog",{name:"Studio toolkit",exact:true});
  await drawer.getByRole("tab",{name:"Shapes",exact:true}).click();
  const count=await drawer.locator(".uxui-shapes-grid button").count();
  assert.ok(count>=40,"Shapes contains a broad UI and geometry library");
  await drawer.getByRole("button",{name:"Add "+name,exact:true}).click();
  return (await stored(page,p=>p.elements.some(item=>item.name===name || (name==="Search bar" && item.kind==="search")),name)).elements.at(-1);
}
async function exportJson(page) {
  await page.getByRole("button",{name:"Export",exact:true}).click();
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:/^Project JSON/}).click();
  const file=await download;
  return JSON.parse(await readFile(await file.path(),"utf8"));
}
async function allDevicePdf(page,entry) {
  const before=await project(page);
  await page.getByRole("button",{name:"Export",exact:true}).click();
  const waiting=page.waitForEvent("download",{timeout:180000});
  await page.getByRole("button",{name:"All-device PDF handoff",exact:true}).click();
  const download=await waiting;
  await download.saveAs(resolve(output,"all-device-handoff.pdf"));
  const pdf=await PDFDocument.load(await readFile(await download.path()));
  assert.ok(pdf.getPageCount()>=4,"PDF includes three previews and the handoff specification");
  const dimensions=[];
  for(const page of pdf.getPages().slice(0,3)) {
    const resources=page.node.Resources();
    const images=resources.lookup(PDFName.of("XObject"),PDFDict).values().map(value=>pdf.context.lookup(value)).filter(value=>value instanceof PDFRawStream && value.dict.get(PDFName.of("Subtype"))===PDFName.of("Image"));
    assert.ok(images.length>0,"Every device preview embeds the actual rendered artboard");
    dimensions.push(images.map(image=>[image.dict.get(PDFName.of("Width")).asNumber(),image.dict.get(PDFName.of("Height")).asNumber()]));
  }
  assert.equal(new Set(dimensions.map(value=>JSON.stringify(value))).size,3,"Mobile, tablet and desktop have distinct raster dimensions");
  const after=await project(page);
  assert.equal(after.target,before.target,"PDF restores the active preview");
  assert.deepEqual(after.responsiveDesign,before.responsiveDesign,"PDF rendering does not change device designs");
  entry.checks.push("All-device PDF exports three real artboard images and a handoff, preserving the active view and responsive model");
}
async function target(page,name) {
  await page.getByRole("group",{name:"Preview device",exact:true}).getByRole("button",{name,exact:true}).click();
  await stored(page,p=>p.target===name.toLowerCase(),name+" preview");
}
async function typography(page,entry) {
  const primary=page.locator(".uxui-responsive-scope").getByRole("button",{name:"Add text",exact:true});
  await bounds(primary,entry.viewport,"Primary Add text");
  const insertion=page.locator(".uxui-bottom-toolbar").getByRole("button",{name:"Add elements",exact:true});
  const circle=await bounds(insertion,entry.viewport,"Rounded insertion control");
  assert.equal((await insertion.innerText()).trim(), "", "Insertion control shows only a plus icon");
  assert.ok(Math.abs(circle.width-circle.height)<1 && circle.width>=44,"Insertion control is circular and touch sized");
  assert.equal(await page.locator(".uxui-bottom-toolbar").getByRole("button",{name:"Add text",exact:true}).count(),0,"Text stays separate from bottom insertion control");
  assert.equal(await page.getByRole("dialog",{name:"Studio toolkit"}).count(),0);
  await primary.click();
  const text=(await stored(page,p=>p.elements.some(item=>item.kind==="text"),"primary text insertion")).elements.at(-1);
  const id=text.id;
  await page.getByLabel("Selected text content",{exact:true}).fill("Studio heading\nSecond line");
  await page.getByLabel("Text font weight",{exact:true}).selectOption("400");
  await page.getByLabel("Text font size",{exact:true}).fill("36");
  await page.getByRole("button",{name:"Bold text",exact:true}).click();
  await page.getByLabel("Text letter spacing",{exact:true}).fill("-0.8");
  await page.getByLabel("Text line height",{exact:true}).fill("1.6");
  await stored(page,p=>{const item=currentLayer(p,id);return item.fontSize===36 && item.fontWeight===700 && item.letterSpacing===-0.8 && item.lineHeight===1.6;},"all typography values");
  const painted=page.locator('[data-layer-id="'+id+'"] text').first();
  const rendered=await painted.evaluate(node=>({size:Number(getComputedStyle(node).fontSize.replace("px","")),weight:Number(getComputedStyle(node).fontWeight),spacing:Number(getComputedStyle(node).letterSpacing.replace("px","")),lines:[...node.querySelectorAll("tspan")].map(span=>({text:span.textContent,dy:Number(span.getAttribute("dy"))}))}));
  assert.equal(rendered.size,36);assert.equal(rendered.weight,700);assert.equal(rendered.spacing,-0.8);
  assert.ok(rendered.lines.length>=2,"Multiline text is painted");
  assert.ok(rendered.lines.slice(1).every(line=>Math.abs(line.dy-57.6)<0.01),"Line-height changes rendered baselines");
  await page.getByRole("button",{name:"Undo",exact:true}).last().click();
  await stored(page,p=>currentLayer(p,id).lineHeight!==1.6,"one-step typography Undo");
  await page.getByRole("button",{name:"Redo",exact:true}).last().click();
  await stored(page,p=>currentLayer(p,id).lineHeight===1.6,"typography Redo");
  const handoff=await exportJson(page);
  assert.equal(currentLayer(handoff,id).fontWeight,700);
  assert.equal(currentLayer(handoff,id).letterSpacing,-0.8);
  assert.match(handoff.aiPrompt,/weight=700/);
  assert.match(handoff.aiPrompt,/letterSpacing=-0.8/);
  entry.checks.push("Primary Add text inserts directly; size, bold, tighter spacing and line-height change painted SVG, persist, Undo/Redo and handoff");
  return id;
}
async function linkedDevices(page,id,entry) {
  await target(page,"Tablet");
  let value=await project(page);
  assert.equal(currentLayer(value,id).fontSize,36);
  assert.equal(currentLayer(value,id).text,"Studio heading\nSecond line");
  await page.getByLabel("Apply layer edits to",{exact:true}).selectOption("device");
  await action(page,"Text");
  await page.getByLabel("Selected text content",{exact:true}).fill("Tablet caption");
  await page.getByLabel("Text letter spacing",{exact:true}).fill("-0.4");
  await stored(page,p=>currentLayer(p,id).text==="Tablet caption" && currentLayer(p,id).letterSpacing===-0.4,"Tablet overrides");
  await target(page,"Mobile");
  value=await project(page);
  assert.equal(currentLayer(value,id).text,"Studio heading\nSecond line");
  await page.getByLabel("Apply layer edits to",{exact:true}).selectOption("shared");
  await action(page,"Text");
  await page.getByLabel("Text font size",{exact:true}).fill("40");
  await target(page,"Desktop");
  value=await project(page);assert.equal(currentLayer(value,id).fontSize,40);assert.equal(currentLayer(value,id).text,"Studio heading\nSecond line");
  await target(page,"Tablet");
  value=await project(page);assert.equal(currentLayer(value,id).fontSize,40);assert.equal(currentLayer(value,id).text,"Tablet caption");assert.equal(currentLayer(value,id).letterSpacing,-0.4);
  const geometry={x:currentLayer(value,id).x,y:currentLayer(value,id).y,width:currentLayer(value,id).width,height:currentLayer(value,id).height};
  for(const device of ["Mobile","Desktop","Mobile","Tablet"]) await target(page,device);
  const restored=currentLayer(await project(page),id);
  assert.deepEqual({x:restored.x,y:restored.y,width:restored.width,height:restored.height},geometry,"Repeated preview switches do not drift geometry");
  const exported=await exportJson(page);
  assert.ok(exported.responsiveDesign?.overrides?.tablet,"JSON retains device overrides");
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.documentElement.dataset.envToolHydrated==="ux-ui-studio");
  await page.locator(".uxui-draft-card").first().getByRole("button").first().click();
  await target(page,"Tablet");
  await stored(page,p=>currentLayer(p,id)?.text==="Tablet caption","device override after reload");
  await page.getByRole("button",{name:"Reset device fixes",exact:true}).click();
  await stored(page,p=>currentLayer(p,id)?.text==="Studio heading\nSecond line","reset to shared design");
  await page.getByRole("button",{name:"Undo",exact:true}).last().click();
  await stored(page,p=>currentLayer(p,id)?.text==="Tablet caption","Undo of device reset");
  await page.getByLabel("Import preset",{exact:true}).setInputFiles({name:"linked-project.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(exported))});
  await stored(page,p=>p.responsiveDesign?.overrides?.tablet && p.elements.some(item=>item.text==="Tablet caption"),"imported responsive project");
  await target(page,"Mobile");
  assert.ok((await project(page)).elements.some(item=>item.text==="Studio heading\nSecond line"),"Imported shared words remain distinct from Tablet override");
  entry.checks.push("Shared edits propagate across all devices; local words/spacing survive switching, reload and JSON round-trip; reset supports Undo");
}
async function shapesAndEdges(page,entry) {
  const search=await shape(page,"Search bar");
  assert.equal(search.kind,"search");
  await action(page,"Shape");
  const edges=page.getByRole("group",{name:"Shape edges and border",exact:true});
  await edges.getByRole("button",{name:"Individual corners",exact:true}).click();
  await edges.getByLabel("Top left corner",{exact:true}).fill("3");
  await edges.getByLabel("Top right corner",{exact:true}).fill("20");
  await edges.getByLabel("Bottom right corner",{exact:true}).fill("12");
  await edges.getByLabel("Bottom left corner",{exact:true}).fill("0");
  await edges.getByLabel("Shape border width",{exact:true}).fill("3");
  await edges.getByLabel("Shape border style",{exact:true}).selectOption("dashed");
  await stored(page,p=>{const item=currentLayer(p,search.id);return item?.cornerRadii?.topLeft===3 && item.cornerRadii.topRight===20 && item.cornerRadii.bottomLeft===0 && item.borderStyle==="dashed" && item.borderWidth===3;},"individual corners and dashed outline");
  const painted=page.locator('[data-layer-id="'+search.id+'"] path[stroke-dasharray]').first();
  assert.ok(await painted.getAttribute("d"),"Per-corner geometry renders as a path");
  assert.ok(await painted.getAttribute("stroke-dasharray"),"Dashed border is painted");
  entry.checks.push("Shapes offers at least 40 geometry/UI presets including search bars; independent corners and dashed borders persist and render");
  await page.getByRole("button",{name:"Done editing selected item",exact:true}).click();
}
async function mergeVectors(page,entry) {
  const arrow=await shape(page,"Arrow right");
  const heart=await shape(page,"Heart");
  await action(page,"Select multiple layers");
  await page.getByRole("button",{name:"Add elements",exact:true}).click();
  const drawer=page.getByRole("dialog",{name:"Studio toolkit",exact:true});
  await drawer.getByRole("tab",{name:"Elements",exact:true}).click();
  await drawer.getByRole("button",{name:arrow.name,exact:true}).click();
  await drawer.getByRole("button",{name:"Cancel studio toolkit",exact:true}).click();
  const before=await project(page);
  const count=before.elements.length;
  await page.getByRole("button",{name:"Merge icons",exact:true}).click();
  const merged=await stored(page,p=>p.elements.length===count-1 && p.elements.some(item=>item.componentKey==="merged-vector"),"merged vector");
  const compound=merged.elements.find(item=>item.componentKey==="merged-vector");
  assert.equal(compound.kind,"icon");assert.ok(compound.iconSvg.includes("<svg"),"Merged SVG retains source viewports");
  assert.equal(merged.elements.some(item=>item.id===arrow.id||item.id===heart.id),false,"Both source layers become one icon");
  const handoff=await exportJson(page);
  assert.equal(currentLayer(handoff,compound.id).iconSvg,compound.iconSvg,"Merged vector survives handoff");
  await page.getByRole("button",{name:"Undo",exact:true}).last().click();
  await stored(page,p=>p.elements.length===count && p.elements.some(item=>item.id===arrow.id) && p.elements.some(item=>item.id===heart.id),"one-step merge Undo");
  entry.checks.push("Touch-visible multi-selection merges two icons into one SVG, preserving source paths in JSON; one Undo restores both");
}
async function alpha(page,source,points) {
  return page.evaluate(async ({source,points})=>{
    const image=new Image();image.src=source;await image.decode();
    const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext("2d");context.drawImage(image,0,0);
    return points.map(([x,y])=>[...context.getImageData(x,y,1,1).data]);
  },{source,points});
}
async function imageTools(page,entry) {
  const source=await page.evaluate(()=>{
    const canvas=document.createElement("canvas");canvas.width=200;canvas.height=160;const context=canvas.getContext("2d");
    context.fillStyle="#00ff00";context.fillRect(0,0,200,160);context.fillStyle="#d00000";context.fillRect(40,30,120,100);context.fillStyle="#00ff00";context.fillRect(80,60,40,40);
    return canvas.toDataURL("image/png");
  });
  await page.getByLabel("Choose an image",{exact:true}).setInputFiles({name:"chroma-fixture.png",mimeType:"image/png",buffer:Buffer.from(source.split(",")[1],"base64")});
  const image=(await stored(page,p=>p.elements.some(item=>item.kind==="image"),"image import")).elements.at(-1);
  await action(page,"Chroma key");
  await page.getByLabel("Chroma key color",{exact:true}).fill("#00ff00");
  await page.getByLabel("Background matching mode",{exact:true}).selectOption("global");
  await page.getByRole("button",{name:"Apply chroma key",exact:true}).click();
  const first=await stored(page,p=>currentLayer(p,image.id)?.imageOriginalDataUrl && currentLayer(p,image.id).imageDataUrl!==source,"chroma output");
  const cut=currentLayer(first,image.id);assert.equal(cut.imageOriginalDataUrl,source);
  let pixels=await alpha(page,cut.imageDataUrl,[[5,5],[50,50],[100,80]]);
  assert.equal(pixels[0][3],0);assert.equal(pixels[1][3],255);assert.equal(pixels[2][3],0,"Global chroma removes enclosed key color");
  await page.getByLabel("Chroma key color",{exact:true}).fill("#0000ff");
  await page.getByRole("button",{name:"Apply chroma key",exact:true}).click();
  await page.waitForTimeout(250);
  assert.equal(currentLayer(await project(page),image.id).imageDataUrl,cut.imageDataUrl,"No-match operation leaves the image unchanged");
  await page.getByLabel("Chroma key color",{exact:true}).fill("#d00000");
  await page.getByRole("button",{name:"Apply chroma key",exact:true}).click();
  const redRemoved=await stored(page,p=>currentLayer(p,image.id)?.imageDataUrl!==cut.imageDataUrl,"changing key color from original");
  pixels=await alpha(page,currentLayer(redRemoved,image.id).imageDataUrl,[[5,5],[50,50]]);
  assert.equal(pixels[0][3],255,"Reprocessing recovers the original green pixels");assert.equal(pixels[1][3],0);
  await page.getByLabel("Chroma key color",{exact:true}).fill("#00ff00");
  await page.getByRole("button",{name:"Apply chroma key",exact:true}).click();
  await stored(page,p=>currentLayer(p,image.id).imageDataUrl===cut.imageDataUrl,"repeatable original-based keying");
  await page.getByRole("button",{name:"Erase / Restore",exact:true}).click();
  let dialog=page.getByRole("dialog",{name:"Repair background removal",exact:true});
  const preview=dialog.getByRole("img",{name:/Image repair preview/});
  await page.waitForFunction(()=>{const canvas=document.querySelector(".uxui-image-repair canvas");return canvas && canvas.width===200;});
  let box=await preview.boundingBox();
  await dialog.getByLabel("Repair brush size",{exact:true}).fill("12");
  const x=box.x+box.width*50/200,y=box.y+box.height*50/160;
  await page.mouse.click(x,y);
  assert.equal(await preview.evaluate(canvas=>canvas.getContext("2d").getImageData(50,50,1,1).data[3]),0,"Erase preview removes foreground alpha");
  await dialog.getByRole("button",{name:"Restore",exact:true}).click();await page.mouse.click(x,y);
  assert.equal(await preview.evaluate(canvas=>canvas.getContext("2d").getImageData(50,50,1,1).data[3]),255,"Restore paints original foreground alpha");
  await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
  assert.equal(currentLayer(await project(page),image.id).imageDataUrl,cut.imageDataUrl,"Repair Cancel preserves the saved layer");
  await page.getByRole("button",{name:"Erase / Restore",exact:true}).click();
  dialog=page.getByRole("dialog",{name:"Repair background removal",exact:true});
  await dialog.getByRole("button",{name:"Erase",exact:true}).waitFor();
  await page.waitForFunction(()=>{const canvas=document.querySelector(".uxui-image-repair canvas");return canvas && canvas.width===200;});
  box=await dialog.getByRole("img",{name:/Image repair preview/}).boundingBox();
  await dialog.getByLabel("Repair brush size",{exact:true}).fill("12");await page.mouse.click(box.x+box.width*50/200,box.y+box.height*50/160);
  await dialog.getByRole("button",{name:"Apply repair",exact:true}).click();
  const repaired=await stored(page,p=>currentLayer(p,image.id).imageDataUrl!==cut.imageDataUrl,"applied manual repair");
  assert.equal((await alpha(page,currentLayer(repaired,image.id).imageDataUrl,[[50,50]]))[0][3],0);
  await page.getByRole("button",{name:"Undo",exact:true}).last().click();
  await stored(page,p=>currentLayer(p,image.id).imageDataUrl===cut.imageDataUrl,"one-step repair Undo");
  entry.checks.push("Chroma produces transparent PNG including enclosed key colors; original-based reprocessing/no-match protection and Erase/Restore Apply/Cancel/Undo work");
}

try {
  for (const configuration of cases) {
    const {theme,full,...viewport}=configuration;
    const entry={viewport,theme,checks:[],runtimeErrors:[]};report.cases.push(entry);
    console.log("Toolkit audit "+viewport.width+"×"+viewport.height+" "+theme);
    const context=await browser.newContext({viewport,colorScheme:theme,acceptDownloads:true,serviceWorkers:"block",hasTouch:true});
    const page=await context.newPage();page.setDefaultTimeout(timeout);page.on("pageerror",error=>entry.runtimeErrors.push(error.message));
    try {
      await start(page);
      const textId=await typography(page,entry);
      await page.screenshot({path:resolve(output,`typography-${viewport.width}-${theme}.png`),animations:"disabled"});
      if(full) await linkedDevices(page,textId,entry);
      await shapesAndEdges(page,entry);
      await page.screenshot({path:resolve(output,`shapes-${viewport.width}-${theme}.png`),animations:"disabled"});
      if(full) { await mergeVectors(page,entry);await imageTools(page,entry); }
      if(full && theme==="light") await allDevicePdf(page,entry);
      assert.deepEqual(entry.runtimeErrors,[],"No browser runtime exceptions");
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),"No horizontal document overflow");
      await page.screenshot({path:resolve(output,`complete-${viewport.width}-${theme}.png`),animations:"disabled"});
    } catch(error) {
      entry.failure=error.stack || error.message;report.errors.push({viewport,theme,error:error.message});
      console.error(entry.failure);
      await page.screenshot({path:resolve(output,`failure-${viewport.width}-${theme}.png`),animations:"disabled"}).catch(()=>{});
    } finally { await context.close(); }
  }
} finally { await browser.close();await writeFile(resolve(output,"report.json"),JSON.stringify(report,null,2)+"\n"); }
console.log(JSON.stringify({cases:report.cases.length,checks:report.cases.reduce((sum,item)=>sum+item.checks.length,0),errors:report.errors},null,2));
if(report.errors.length) process.exitCode=1;
