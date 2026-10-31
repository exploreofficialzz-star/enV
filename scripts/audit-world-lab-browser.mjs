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

  // End-to-end authored digital device: connect a new hypothetical gate to an
  // indicator, modify its truth table, and verify the live calculated output.
  await page.getByRole("button",{name:"Start an invented logic circuit"}).click();
  await page.getByText("Create another invented gate").click();
  await page.getByRole("textbox",{name:"Device name"}).fill("Invented child gate");
  await page.getByRole("combobox",{name:"Input 2"}).selectOption("invented_gate");
  await page.getByRole("button",{name:"Connect invented gate"}).click();
  await page.locator("summary").filter({hasText:"Invented child gate"}).click();
  await page.getByRole("combobox",{
    name:"Output for Invented child gate input row 1",
  }).selectOption("1");
  const indicator=page.getByRole("combobox",{name:"Wire Indicator Q to digital node"});
  await indicator.selectOption({label:"Invented child gate"});
  // Wait for the computed Boolean value after React commits the new wiring.
  await indicator.locator("..").locator("strong").getByText("1",{exact:true})
    .waitFor({state:"visible",timeout:10000});
  await page.getByRole("button",{name:"Test every switch combination"}).click();
  await page.getByText(/Verified 4 mathematical input combinations/).waitFor();

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
  await page.getByText(/Surface \/ atmosphere .* not measured/).waitFor();
  const currentWorkspacePath = new URL(page.url()).pathname;
  await page.getByRole("button",{name:"Zoom in"}).click();
  await page.getByRole("button",{name:"Zoom out"}).click();
  assert.equal(new URL(page.url()).pathname, currentWorkspacePath,
    "Camera movement must stay inside the same World Lab workspace");
  // A real camera displacement must reveal lower strata without switching views.
  await page.locator('canvas[aria-label^="Interactive 3D illustrative environment"]').focus();
  for (let n = 0; n < 4; n++) await page.keyboard.press("PageDown");
  await page.getByText(/Illustrative subsurface sediment.*not measured/).waitFor({ timeout: 10000 });
  for (let n = 0; n < 4; n++) await page.keyboard.press("PageUp");
  await page.getByText(/Surface \/ atmosphere .*not measured/).waitFor({ timeout: 10000 });
  await page.getByRole("textbox",{name:"Material name"}).fill("Invented foam");
  await page.getByRole("spinbutton",{name:/Assumed density/}).fill("2");
  await page.getByRole("spinbutton",{name:/Assumed Young's modulus/}).fill("50");
  await page.getByRole("button",{name:"Record hypothetical material"}).click();
  await page.getByRole("combobox",{name:"Material assumption"}).selectOption({label:"Invented foam"});

  // A separately invented high-modulus material must give a real,
  // geometry-dependent elastic response, with a portable assumption trail.
  await page.getByRole("textbox",{name:"Material name"}).fill("Invented stiff matter");
  await page.getByRole("spinbutton",{name:/Assumed density/}).fill("2");
  await page.getByRole("spinbutton",{name:/Assumed Young's modulus/}).fill("200000000000");
  await page.getByRole("button",{name:"Record hypothetical material"}).click();
  await page.getByRole("combobox",{name:"Material assumption"})
    .selectOption({label:"Invented stiff matter"});
  await page.getByRole("spinbutton",{name:"Size Y (m)"}).fill("0.1");
  await page.getByRole("spinbutton",{name:"Size Z (m)"}).fill("0.05");
  await page.getByRole("spinbutton",{name:"Cantilever end load"}).fill("1000");
  await page.getByRole("button",{name:"Calculate elastic bending"}).click();
  await page.getByText(/Free-end deflection:/).waitFor();
  const structuralDownload=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export assumed bending evidence"}).click();
  const structuralStream=await (await structuralDownload).createReadStream();
  let structuralJson="";
  for await(const chunk of structuralStream)structuralJson+=chunk.toString();
  const structural=JSON.parse(structuralJson);
  assert.equal(structural.format,"env-world-lab-structural-bending");
  assert.equal(structural.materialEvidence,"hypothetical-user-assumed");
  assert.ok(Math.abs(structural.maximumTipDeflectionM-0.0032)<1e-12);
  assert.ok(Math.abs(structural.maximumBendingStressPa-24e6)<1e-4);
  await page.getByRole("spinbutton",{name:"Cantilever end load"}).fill("2000");
  await page.getByRole("button",{name:"Export assumed bending evidence"})
    .waitFor({state:"hidden"});

  await page.getByRole("button",{name:"Revise assumptions for Invented stiff matter"}).click();
  await page.getByRole("spinbutton",{name:/Assumed Young's modulus/}).fill("100000000000");
  await page.getByRole("button",{name:"Save revised assumptions"}).click();
  await page.getByRole("spinbutton",{name:"Cantilever end load"}).fill("1000");
  await page.getByRole("button",{name:"Calculate elastic bending"}).click();
  const revisionExport=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export assumed bending evidence"}).click();
  let revisedJson="";
  for await(const part of await (await revisionExport).createReadStream())
    revisedJson+=part.toString();
  const revisedBeam=JSON.parse(revisedJson);
  assert.equal(revisedBeam.materialId,structural.materialId);
  // Unsaved Web edits retain their saved baseline revision. The evidence
  // records the exact physical assumptions and must not reuse stale outputs.
  assert.equal(structural.assumedYoungModulusPa,2e11);
  assert.equal(revisedBeam.assumedYoungModulusPa,1e11);
  assert.ok(Math.abs(revisedBeam.maximumTipDeflectionM-0.0064)<1e-12);

  // Restore the main reference project before the existing motion scenarios.
  await page.getByRole("spinbutton",{name:"Size Y (m)"}).fill("1");
  await page.getByRole("spinbutton",{name:"Size Z (m)"}).fill("1");
  await page.getByRole("combobox",{name:"Material assumption"}).selectOption({label:"Invented foam"});


  // A user-invented Boolean indicator must drive the same measured-by-model
  // electromechanical solver, with portable source-revision evidence.
  await page.getByRole("button",{name:"Drive with invented logic: Indicator Q"}).click();
  await page.getByRole("button",{name:"Pause motor"}).click();
  await page.getByText("Invented logic output: 1 (assumed Boolean)").waitFor();
  const linkedEvent=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export linked digital-to-motion evidence"}).click();
  const linkedStream=await (await linkedEvent).createReadStream();
  let linkedJson="";
  for await(const chunk of linkedStream)linkedJson+=chunk.toString();
  const linked=JSON.parse(linkedJson);
  assert.equal(linked.format,"env-world-lab-digital-motor-run");
  assert.equal(linked.logicBit,1);
  assert.equal(linked.motor.input.supplyVoltageV,24);
  assert.equal(linked.projectRevision,linked.motor.source.projectRevision);
  assert.ok(linked.motor.samples.some(s=>s.heightM>0&&s.coilCurrentA>0));

  await page.getByRole("button",{name:"Drop this solid"}).click();
  await page.getByRole("button",{name:"Pause drop"}).click();
  await page.getByText(/Model result.*hypothetical user assumed/).waitFor();
  const beforeDropHeight = await page.getByText("Height above surface").locator("..").innerText();
  await page.getByLabel("Explore drop time").fill("1");
  const afterDropHeight = await page.getByText("Height above surface").locator("..").innerText();
  assert.notEqual(afterDropHeight, beforeDropHeight, "Time scrubbing must change calculated physical position");
  const dropExportPromise = page.waitForEvent("download");
  await page.getByRole("button",{name:"Export drop evidence"}).click();
  const dropStream = await (await dropExportPromise).createReadStream();
  let dropJson = "";
  for await (const chunk of dropStream) dropJson += chunk.toString();
  const dropEvidence = JSON.parse(dropJson);
  assert.equal(dropEvidence.format, "env-world-lab-drop-run");
  assert.equal(dropEvidence.inputEvidence, "hypothetical-user-assumed");
  assert.equal(dropEvidence.source.materialName, "Invented foam");
  assert.ok(dropEvidence.samples.length > 100);
  await page.getByRole("button",{name:"Reset drop"}).click();
  await page.getByText(/Height above surface/).waitFor();
  await page.getByRole("button",{name:"Play drop"}).click();
  await page.getByRole("button",{name:"Pause drop"}).click();
  // Changing invented geometry must invalidate old computed results, even when
  // the user returns the dimensions to their original numerical values.
  await page.getByRole("spinbutton",{name:"Size X (m)"}).fill("2.1");
  await page.getByRole("button",{name:"Play drop"}).waitFor({state:"hidden"});
  await page.getByRole("spinbutton",{name:"Size X (m)"}).fill("2");
  await page.getByRole("button",{name:"Power this solid"}).click();
  await page.getByRole("button",{name:"Pause motor"}).click();
  await page.getByText(/Computed hypothetical electromechanical system/).waitFor();
  const numericalStatus=page.getByText(/Numerical self-check: (within internal tolerance|outside internal tolerance|not available)/);
  await numericalStatus.waitFor();
  assert.match(await numericalStatus.innerText(),/internal tolerance|not available/,
    "The user must see the actual result of the bounded numerical self-check");
  const motorBefore=await page.getByText("Height above ground").locator("..").innerText();
  await page.getByLabel("Explore motor time").fill("2");
  const motorAfter=await page.getByText("Height above ground").locator("..").innerText();
  assert.notEqual(motorAfter,motorBefore,"Electrical power must change modeled vertical motion");
  const motorExportEvent=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export motor evidence"}).click();
  const motorStream=await (await motorExportEvent).createReadStream();
  let motorJson="";
  for await(const part of motorStream)motorJson+=part.toString();
  const motor=JSON.parse(motorJson);
  assert.equal(motor.format,"env-world-lab-actuator-run");
  assert.equal(motor.source.materialName,"Invented foam");
  assert.equal(motor.source.inputEvidence,"hypothetical-user-assumed");
  assert.ok(motor.samples.length>500);
  assert.ok(motor.samples.some(s=>s.motorForceN>0 && s.resistiveHeatW>0));
  await page.getByRole("spinbutton",{name:"Size X (m)"}).fill("2.2");
  await page.getByRole("button",{name:"Play motor"}).waitFor({state:"hidden"});
  await numericalStatus.waitFor({state:"hidden"});
  await page.getByRole("spinbutton",{name:"Size X (m)"}).fill("2");
  // A result belongs to its exact test settings, not just its material geometry.
  await page.getByRole("button",{name:"Power this solid"}).click();
  await page.getByRole("button",{name:"Pause motor"}).click();
  await page.getByText("Adjust electrical power and force").click();
  await page.getByRole("spinbutton",{name:"Actuator supply voltage"}).fill("22");
  await page.getByRole("button",{name:"Play motor"}).waitFor({state:"hidden"});
  await page.getByRole("button",{name:"Power this solid"}).click();
  await page.getByRole("button",{name:"Pause motor"}).click();
  await page.getByRole("spinbutton",{name:"Actuator force constant"}).fill("6");
  await page.getByRole("button",{name:"Play motor"}).waitFor({state:"hidden"});
  await page.getByRole("button",{name:"Drop this solid"}).click();
  await page.getByRole("button",{name:"Pause drop"}).click();
  await page.getByText("Change test conditions").click();
  await page.getByRole("spinbutton",{name:"Drop release height in metres"}).fill("6");
  await page.getByRole("button",{name:"Play drop"}).waitFor({state:"hidden"});
  await page.getByRole("button",{name:"Drop this solid"}).click();
  await page.getByRole("button",{name:"Pause drop"}).click();
  await page.getByRole("spinbutton",{name:"Drop restitution"}).fill("0.5");
  await page.getByRole("button",{name:"Play drop"}).waitFor({state:"hidden"});
  assert.equal(new URL(page.url()).pathname,currentWorkspacePath,
    "Physical simulation must occur in the same digital world workspace");
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
  await page.getByRole("combobox",{name:"Playback speed",exact:true}).selectOption("0.1");
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
  await page.getByRole("combobox",{name:"Open recorded run (local device)"}).waitFor({state:"visible"});
  assert.ok(await page.getByRole("combobox",{name:"Open recorded run (local device)"}).locator("option").count()>=3,
    "Saved project must restore its scientific run history after reload");
  page.once("dialog",dialog=>dialog.accept());
  await page.getByRole("button",{name:"Delete selected run"}).click();
  await page.getByText(/Deleted the selected local experiment/).waitFor();
  assert.ok(await page.getByRole("combobox",{name:"Open recorded run (local device)"}).locator("option").count()>=3,
    "Removing one run must preserve remaining local scientific history");
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
