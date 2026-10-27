#!/usr/bin/env node
/** Link layouts previously authored/exported by live Studio, using its visible controls. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";

const output=resolve(process.env.ENV_MUSIC_DESIGN_DIR||"/tmp/env-ai-music-studio");
const base="https://envtools.store";
const references=Object.fromEntries(await Promise.all(["mobile","tablet","desktop"].map(async device=>[device,JSON.parse(await readFile(resolve(output,"ai-music-studio-"+device+"-project.json"),"utf8"))])));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||"/usr/bin/chromium"});
const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:"light",serviceWorkers:"block",acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(45000);
const actions=[],runtimeErrors=[];
page.on("pageerror",error=>runtimeErrors.push(error.message));
async function action(name){await page.locator(".uxui-context-toolbar").getByRole("button",{name,exact:true}).click();}
async function choose(name){
  if(!await page.locator(".uxui-context-toolbar").getByRole("button",{name:"Look closer",exact:true}).count())await page.locator("[data-layer-id]").first().click({force:true});
  await action("Look closer");
  const literal=new RegExp("^"+name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"$");
  await page.locator(".uxui-layer-finder button").filter({has:page.locator("strong").filter({hasText:literal})}).click();
}
async function download(label,name){
  await page.getByRole("button",{name:"Export",exact:true}).click();
  const waiting=page.waitForEvent("download",{timeout:180000});
  await page.getByRole("button",{name:label,exact:typeof label==="string"}).click();
  await(await waiting).saveAs(resolve(output,name));actions.push({action:"Studio Export",file:name});
}
try{
  await page.goto(base+"/tools/developer/ux-ui-studio",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.documentElement.dataset.envToolHydrated==="ux-ui-studio");
  await page.getByRole("button",{name:"Add project",exact:true}).click();
  assert.equal(await page.locator(".uxui-primary-text").count(),1,"The updated public Studio is deployed");
  assert.equal((await page.getByRole("button",{name:"Add elements",exact:true}).innerText()).trim(),"");
  await page.getByLabel("Import preset",{exact:true}).setInputFiles(resolve(output,"ai-music-studio-mobile-project.json"));
  await page.waitForFunction(()=>{const value=JSON.parse(localStorage.getItem("env-ux-ui-studio-project-v1")||"null");return value?.name==="AI Music Studio"&&value?.elements?.length===45&&value?.responsiveDesign;});
  actions.push({action:"Import actual live Studio export",file:"ai-music-studio-mobile-project.json"});
  await page.getByLabel("Apply layer edits to",{exact:true}).selectOption("device");
  for(const device of ["tablet","desktop"]){
    await page.getByRole("group",{name:"Preview device",exact:true}).getByRole("button",{name:device[0].toUpperCase()+device.slice(1),exact:true}).click();
    for(const layer of references[device].elements.filter(item=>!item.hidden)){
      await choose(layer.name);await action("More");
      for(const [label,value] of [["X",layer.x],["Y",layer.y],["width",layer.width],["height",layer.height]]) await page.getByLabel("Selected "+label,{exact:true}).fill(String(value));
      if(["text","button"].includes(layer.kind)){
        await page.getByLabel("Text font size",{exact:true}).fill(String(layer.fontSize));
        await page.getByRole("button",{name:"Align text "+layer.textAlign,exact:true}).click();
      }else{
        await page.getByRole("button",{name:"All corners",exact:true}).click();
        await page.getByLabel("All corners radius",{exact:true}).fill(String(layer.radius));
      }
      actions.push({action:"Author device override through Studio",device,layer:layer.name});
      console.log(device+": "+layer.name);
    }
  }
  await page.getByLabel("Apply layer edits to",{exact:true}).selectOption("shared");
  await page.getByRole("button",{name:"Done editing selected item",exact:true}).click();
  await page.setViewportSize({width:1600,height:1800});
  for(const device of ["mobile","tablet","desktop"]){
    await page.getByRole("group",{name:"Preview device",exact:true}).getByRole("button",{name:device[0].toUpperCase()+device.slice(1),exact:true}).click();
    await page.locator('svg[aria-label="AI Music Studio design artboard"]').screenshot({path:resolve(output,"ai-music-studio-"+device+"-linked.png"),animations:"disabled"});
    await page.screenshot({path:resolve(output,"ai-music-studio-"+device+"-linked-in-env.png"),animations:"disabled"});
  }
  await page.getByRole("group",{name:"Preview device",exact:true}).getByRole("button",{name:"Mobile",exact:true}).click();
  await download("All-device PDF handoff","ai-music-studio-handoff.pdf");
  await download(/^Project JSON/,"ai-music-studio-project.json");
  await download(/^HTML \+ CSS/,"ai-music-studio.html");
  const project=JSON.parse(await readFile(resolve(output,"ai-music-studio-project.json"),"utf8"));
  assert.equal(project.name,"AI Music Studio");assert.equal(project.elements.length,45);
  assert.ok(project.responsiveDesign.overrides.tablet&&project.responsiveDesign.overrides.desktop);
  assert.ok(project.aiPrompt.includes("I confirm this is my own voice")&&project.aiPrompt.includes("talking drums"));
  const bytes=await readFile(resolve(output,"ai-music-studio-handoff.pdf"));
  const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>=5);assert.equal(pdf.getCreator(),"enV UX/UI Studio");
  assert.deepEqual(runtimeErrors,[]);
  await writeFile(resolve(output,"ai-music-studio-builder-prompt.txt"),project.aiPrompt+"\n");
  const report={site:base,createdAt:new Date().toISOString(),workflow:"Imported the actual live-authored mobile export, authored tablet/desktop overrides using visible Studio controls and downloaded the real All-device PDF handoff. No state injection or external design generator.",visibleLayers:44,totalLayers:45,devices:["mobile","tablet","desktop"],pdfPages:pdf.getPageCount(),pdfSha256:createHash("sha256").update(bytes).digest("hex"),runtimeErrors,actions};
  await writeFile(resolve(output,"live-linked-studio-design-report.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({pdfPages:pdf.getPageCount(),errors:runtimeErrors,output}));
}catch(error){await page.screenshot({path:resolve(output,"linked-design-error.png"),animations:"disabled"}).catch(()=>{});throw error;}
finally{await context.close();await browser.close();}
