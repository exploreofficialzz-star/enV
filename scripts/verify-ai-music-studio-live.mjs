#!/usr/bin/env node
/** Verify original Studio downloads by reopening each through the public site's file input. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream } from "pdf-lib";

const output=resolve(process.env.ENV_MUSIC_DESIGN_DIR||"/tmp/env-ai-music-studio");
const base="https://envtools.store";
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||"/usr/bin/chromium"});
const report={site:base,verifiedAt:new Date().toISOString(),workflow:"Authored with live Studio controls, downloaded with Studio Export, then reopened with the live Import preset file input. No project state injection or external design generator.",releaseBoundary:"The updated Studio is committed to main. Vercel blocked its deployment for 24 hours, so the live version required separate device exports.",devices:[],runtimeErrors:[],actions:JSON.parse(await readFile(resolve(output,"live-studio-design-actions.json"),"utf8"))};
try {
  for(const [device,width,height] of [["mobile",390,844],["tablet",768,1024],["desktop",1440,900]]) {
    const path=resolve(output,"ai-music-studio-"+device+"-project.json");
    const project=JSON.parse(await readFile(path,"utf8"));
    assert.equal(project.name,"AI Music Studio"); assert.equal(project.target,device); assert.deepEqual(project.viewport,{width,height});
    assert.equal(project.elements.length,45); assert.equal(project.elements.filter(item=>!item.hidden).length,44);
    const brief=project.elements.find(item=>item.name==="Implementation brief");
    assert.ok(brief.hidden); assert.ok(brief.text.includes("I confirm this is my own voice"));
    for(const word of ["Afrobeat","Yoruba","Igbo","Hausa","talking drums","pitch correction","reverb","compression","mastering","Verse completion","stem separation","humming-to-beat","tempo and key"]) assert.ok(brief.text.includes(word),word+" is retained in the actual project");
    assert.ok(project.aiPrompt.includes(brief.text.split("\n")[0]));
    const context=await browser.newContext({viewport:{width:1600,height:1800},colorScheme:"light",serviceWorkers:"block"});
    const page=await context.newPage(); page.setDefaultTimeout(60000);page.on("pageerror",error=>report.runtimeErrors.push(error.message));
    await page.goto(base+"/tools/developer/ux-ui-studio",{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>document.documentElement.dataset.envToolHydrated==="ux-ui-studio");
    await page.getByRole("button",{name:"Add project",exact:true}).click();
    await page.getByLabel("Import preset",{exact:true}).setInputFiles(path);
    await page.waitForFunction(target=>{const project=JSON.parse(localStorage.getItem("env-ux-ui-studio-project-v1")||"null");return project?.target===target && project?.name==="AI Music Studio" && project?.elements?.length===45;},device);
    const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem("env-ux-ui-studio-project-v1")));
    assert.equal(restored.elements.length,45);
    assert.equal(restored.elements.find(item=>item.name==="Implementation brief").text,brief.text);
    await page.getByRole("button",{name:"Done editing selected item",exact:true}).click();
    const artboard=page.locator('svg[aria-label="AI Music Studio design artboard"]');
    assert.equal(await artboard.locator("[data-layer-id]").count(),44);
    const paintedWords=await artboard.locator("text").evaluateAll(nodes=>nodes.map(node=>Array.from(node.querySelectorAll("tspan"),span=>span.textContent).join(" ")||node.textContent));
    for(const text of ["AI Music Studio","Nigerian sounds","Your own voice","Lyrics in your language","Bring your own beat","Finish that verse","Coming next"]) assert.ok(paintedWords.some(value=>value.includes(text)),device+" paints "+text+": "+JSON.stringify(paintedWords));
    await artboard.screenshot({path:resolve(output,"ai-music-studio-"+device+".png"),animations:"disabled"});
    await page.screenshot({path:resolve(output,"ai-music-studio-"+device+"-reopened-in-env.png"),animations:"disabled"});
    const pdfBytes=await readFile(resolve(output,"ai-music-studio-"+device+"-handoff.pdf"));
    const pdf=await PDFDocument.load(pdfBytes);assert.equal(pdf.getCreator(),"enV UX/UI Studio");
    assert.equal(pdf.getTitle(),"AI Music Studio - enV UX/UI Studio");
    const files=pdf.catalog.lookup(PDFName.of("Names"),PDFDict).lookup(PDFName.of("EmbeddedFiles"),PDFDict).lookup(PDFName.of("Names"),PDFArray);
    const attached=files.lookup(1,PDFDict).lookup(PDFName.of("EF"),PDFDict).lookup(PDFName.of("F"),PDFRawStream);
    const attachedProject=JSON.parse(new TextDecoder().decode(decodePDFRawStream(attached).decode()));
    assert.equal(attachedProject.target,device);assert.equal(attachedProject.elements.length,45);
    assert.equal(attachedProject.elements.find(item=>item.name==="Implementation brief").text,brief.text);
    await writeFile(resolve(output,"ai-music-studio-"+device+"-builder-prompt.txt"),project.aiPrompt+"\n");
    report.devices.push({device,viewport:{width,height},visibleLayers:44,totalLayers:45,pdfPages:pdf.getPageCount(),pdfSha256:createHash("sha256").update(pdfBytes).digest("hex"),jsonImportRoundTrip:"passed",pdfAttachment:"45 editable layers and complete implementation brief verified"});
    await context.close();
    console.log(device+": live reimport, artboard and original PDF attachment passed");
  }
  assert.deepEqual(report.runtimeErrors,[]);
  await writeFile(resolve(output,"live-studio-design-report.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({devices:report.devices,errors:report.runtimeErrors}));
} finally { await browser.close(); }
