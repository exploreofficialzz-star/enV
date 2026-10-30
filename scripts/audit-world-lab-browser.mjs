import assert from "node:assert/strict";
import { chromium } from "playwright";
const origin=process.env.ENV_WORLD_LAB_AUDIT_ORIGIN||"http://127.0.0.1:8080";
const browser=await chromium.launch({
  headless:true,
  args:["--no-sandbox","--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"],
});
const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true,reducedMotion:"reduce"});
const page=await context.newPage();
const pageErrors=[];
page.on("pageerror",err=>pageErrors.push(err.message));
try{
  await page.goto(origin+"/tools/developer/the-world-lab",{waitUntil:"domcontentloaded",timeout:90000});
  await page.getByRole("heading",{name:"The World Lab"}).waitFor({timeout:90000});
  await page.getByRole("button",{name:"Save on device"}).waitFor({state:"visible"});
  await page.getByRole("button",{name:"Add cube"}).click();
  await page.getByRole("button",{name:"Add sphere"}).click();
  await page.getByRole("combobox",{name:"Select a shape"}).selectOption({label:"Cube"});
  await page.getByRole("spinbutton",{name:"Size X (m)"}).fill("2");
  await page.getByRole("spinbutton",{name:"Size Y (m)"}).fill("1");
  await page.getByRole("spinbutton",{name:"Size Z (m)"}).fill("1");
  await page.getByRole("spinbutton",{name:"Position X (m)"}).fill("3");
  assert.equal(await page.getByRole("spinbutton",{name:"Position X (m)"}).inputValue(),"3");
  await page.getByRole("button",{name:"Focus selected object"}).click();
  await page.getByText("Volume:").waitFor();
  assert.match(await page.getByText("Volume:").locator("..").innerText(),/2\.0000 m³/);
  await page.getByRole("button",{name:"See Inside"}).click();
  await page.getByRole("button",{name:"Zoom in"}).click();
  await page.getByRole("button",{name:"Zoom out"}).click();
  await page.getByRole("textbox",{name:"Material name"}).fill("Invented foam");
  await page.getByRole("spinbutton",{name:/Assumed density/}).fill("2");
  await page.getByRole("spinbutton",{name:/Assumed Young's modulus/}).fill("50");
  await page.getByRole("button",{name:"Record hypothetical material"}).click();
  await page.getByRole("combobox",{name:"Material assumption"}).selectOption({label:"Invented foam"});
  await page.getByRole("button",{name:"Test this solid as spring mass"}).click();
  await page.getByText("Derived from an invented solid").waitFor();
  const evidenceDownload=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export recorded run JSON"}).click();
  const evidenceStream=await (await evidenceDownload).createReadStream();
  let evidenceJson="";
  for await(const chunk of evidenceStream)evidenceJson+=chunk.toString();
  const evidence=JSON.parse(evidenceJson);
  assert.equal(evidence.inputs.massKg,4);
  assert.equal(evidence.assumedMassSource.materialName,"Invented foam");
  assert.equal(evidence.inputEvidence,"hypothetical-user-assumed");
  assert.equal(evidence.assumedMassSource.assumedDensityKgM3,2);
  await page.getByRole("button",{name:"Pause"}).click();
  await page.getByLabel(/Object opacity:/).fill("35");
  assert.equal(await page.getByLabel(/Object opacity:/).inputValue(),"35");
  await page.getByRole("button",{name:"Start / Recalculate"}).click();
  await page.getByText("Mechanical energy",{exact:true}).waitFor();
  await page.getByText("Position over simulated time").waitFor();
  await page.getByRole("combobox",{name:"Compare to run"}).selectOption({index:1});
  await page.getByText("Difference at selected time").waitFor();
  await page.getByRole("button",{name:"Pause"}).click();
  await page.getByRole("combobox",{name:"Playback speed"}).selectOption("0.1");
  await page.getByRole("button",{name:"Step",exact:true}).click();
  await page.getByRole("combobox",{name:"Experiment"}).selectOption("heat-rod");
  await page.getByRole("button",{name:"Start / Recalculate"}).click();
  await page.getByText("Mean temperature",{exact:true}).waitFor();
  await page.getByText(/The 3D rod colors encode calculated temperatures/).waitFor();
  await page.getByRole("button",{name:"Pause"}).click();
  const downloadEvent=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export project"}).click();
  const exported=await downloadEvent;
  const stream=await exported.createReadStream();
  let json="";
  for await(const chunk of stream)json+=chunk.toString();
  const data=JSON.parse(json);
  assert.equal(data.format,"env-world-lab");
  assert.equal(data.entities.length,2);
  assert.equal(data.world.representation,"representative-not-measured");
  assert.equal(data.entities[0].scientificRole,"visual-only");
  assert.deepEqual(data.entities[0].dimensionsMeters,[2,1,1]);
  assert.equal(data.entities[0].positionMeters[0],3);
  await page.getByRole("button",{name:"Save on device"}).click();
  await page.getByText(/scientific runs saved on this device/).waitFor();
  await page.reload({waitUntil:"domcontentloaded"});
  await page.getByText(/Opened the most recently saved local World Lab project/).waitFor({timeout:90000});
  await page.getByRole("combobox",{name:"Open recorded run (this session)"}).waitFor({state:"visible"});
  assert.ok(await page.getByRole("combobox",{name:"Open recorded run (this session)"}).locator("option").count()>=3,
    "Saved project must restore its scientific run history after reload");
  await page.getByRole("combobox",{name:"Select a shape"}).selectOption({label:"Sphere"});
  await page.getByRole("combobox",{name:"Experiment"}).selectOption("rc-circuit");
  await context.setOffline(true);
  await page.getByRole("button",{name:"Start / Recalculate"}).click();
  await page.getByText("Capacitor voltage",{exact:true}).waitFor();
  await context.setOffline(false);
  const legacy={format:"env-3d-game",version:1,id:"old",name:"Old",assets:[],objects:[{
    id:"old-cube",name:"Old cube",kind:"box",position:{x:0,y:0.5,z:0},rotation:{x:0,y:0,z:0},
    scale:{x:2,y:2,z:2},color:"#778899",visible:true,locked:false,collider:true,player:false,speed:3,
  }]};
  await page.getByLabel("Import World Lab or legacy 3D project").setInputFiles({
    name:"legacy.env3d.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(legacy)),
  });
  await page.getByText(/Legacy import notices/).waitFor();
  await page.getByRole("combobox",{name:"Select a shape"}).selectOption({label:"Old cube"});
  assert.match(await page.getByText("Volume:").locator("..").innerText(),/8\.0000 m³/);
  assert.deepEqual(pageErrors,[],"No unhandled browser page errors");
  await page.setViewportSize({width:390,height:780});
  await page.getByRole("button",{name:"Save on device"}).waitFor({state:"visible"});
  const viewport=await page.evaluate(()=>({
    documentWidth:document.documentElement.scrollWidth,viewportWidth:window.innerWidth,
  }));
  assert.ok(viewport.documentWidth<=viewport.viewportWidth+3,
    "Mobile layout horizontally overflows: "+JSON.stringify(viewport));
  console.log("WORLD_LAB_BROWSER_PASS: creation, inspect, experiments, see-inside, export/reload, offline, legacy import, mobile");
}finally{
  await context.close();
  await browser.close();
}
