#!/usr/bin/env node
/** Build an editable demo using the Studio's visible tools, then download its real handoffs. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
const base=(process.env.EN_V_BROWSER_AUDIT_BASE_URL||'https://envtools.store').replace(/\/$/,'');
const output=resolve(process.env.ENV_STUDIO_DEMO_DIR||'/tmp/env-studio-demo');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--disable-lcd-text'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light',acceptDownloads:true,serviceWorkers:'block'});
const page=await context.newPage();page.setDefaultTimeout(60000);const runtimeErrors=[];page.on('pageerror',error=>runtimeErrors.push(error.message));
async function action(name){await page.locator('.uxui-context-toolbar').getByRole('button',{name,exact:true}).click()}
async function geometry(x,y,width,height){await action('More');for(const [name,value] of [['X',x],['Y',y],['width',width],['height',height]])await page.getByLabel('Selected '+name,{exact:true}).fill(String(value))}
async function add(kind){const done=page.getByRole('button',{name:'Done editing selected item',exact:true});if(await done.isVisible())await done.click();await page.getByRole('button',{name:'Add elements',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Studio toolkit',exact:true});assert.equal(await dialog.getByRole('tab',{name:'All 26',exact:true}).getAttribute('aria-selected'),'true');await dialog.getByRole('tab',{name:'Elements',exact:true}).click();await dialog.getByRole('button',{name:new RegExp('^'+kind+':')}).click();await dialog.waitFor({state:'hidden'})}
async function words(text){await action('Text');await page.getByLabel('Selected text content',{exact:true}).fill(text)}
async function colors(fill,ink){await action('Color');if(fill)await page.getByLabel('Selected fill color',{exact:true}).fill(fill);if(ink)await page.getByLabel('Selected content color',{exact:true}).fill(ink)}
async function fontSize(size){await action('Adjust');const slider=page.getByLabel('Selected font size',{exact:true});await slider.focus();await slider.press('Home');for(let i=8;i<size;i++)await slider.press('ArrowRight')}
async function text(copy,x,y,w,h,size=16,ink='#111111'){console.log('Designing: '+copy.split('\n')[0]);await add('Text');await words(copy);await geometry(x,y,w,h);await fontSize(size);await colors(null,ink)}
try{
 await page.goto(base+'/tools/developer/ux-ui-studio',{waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(()=>document.documentElement.dataset.envToolHydrated==='ux-ui-studio',null,{timeout:60000});
 await page.getByRole('button',{name:'Add project',exact:true}).click();
 await page.getByRole('button',{name:'App screens and layers',exact:true}).click();await page.getByLabel('Project name',{exact:true}).fill('Focus — Daily Planner');await page.getByRole('button',{name:'Close app screens and layers',exact:true}).click();
 await text('focus',24,30,250,42,24);
 // Load and retain a real bundled face through the visual font picker.
 await action('Fonts');const fonts=page.getByRole('region',{name:'Studio toolkit',exact:true});await fonts.getByLabel('Search fonts',{exact:true}).fill('Inter');await fonts.getByRole('button',{name:/^Inter\s/}).first().click();await fonts.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Add elements',exact:true}).click();await page.getByRole('dialog',{name:'Studio toolkit',exact:true}).getByRole('button',{name:/^Icons\s/}).click();const icons=page.getByRole('region',{name:'Studio toolkit',exact:true});await icons.getByLabel('Search icons',{exact:true}).fill('calendar');await icons.locator('button[title^="Add icon "]').first().click();await icons.waitFor({state:'hidden'});await geometry(322,34,28,28);await colors(null,'#111111');
 await text('Make room for\nwhat matters.',24,118,342,104,34);
 await text('Your day, one clear step at a time.',24,234,342,48,16,'#555555');
 await add('Card');await words('');await geometry(24,320,342,182);await colors('#f0f0f0');await action('Shape');await page.getByRole('button',{name:'Soft',exact:true}).click();
 await text('TODAY’S FOCUS',44,340,286,28,12,'#666666');
 await text('Finish the portfolio\nhomepage',44,382,286,64,22);
 await text('2 of 3 tasks done',44,461,286,25,13,'#555555');
 await text('A little progress is still progress.',24,562,342,50,16,'#555555');
 await add('Button');await words('Plan tomorrow');await geometry(24,666,342,56);await colors('#111111','#ffffff');await action('Shape');await page.getByRole('button',{name:'Round',exact:true}).click();
 await text('MY DAY',32,785,90,24,11,'#555555');
 await text('PROJECTS',152,785,108,24,11,'#555555');
 await text('SETTINGS',276,785,90,24,11,'#555555');
 await action('Look closer');await page.locator('.uxui-layer-finder button').filter({has:page.locator('svg')}).first().click();
 await page.screenshot({path:resolve(output,'focus-studio-mobile.png'),animations:'disabled'});
 await page.getByRole('button',{name:'Export',exact:true}).click();let waiting=page.waitForEvent('download',{timeout:120000});await page.getByRole('button',{name:/^PDF handoff/}).click();const pdfDownload=await waiting;const pdfPath=resolve(output,'focus-daily-planner-handoff.pdf');await pdfDownload.saveAs(pdfPath);
 const pdf=await PDFDocument.load(await readFile(pdfPath));assert.ok(pdf.getPageCount()>=3&&pdf.getPageCount()<40);
 await page.getByRole('button',{name:'Export',exact:true}).click();waiting=page.waitForEvent('download');await page.getByRole('button',{name:/^Project JSON/}).click();const jsonDownload=await waiting;const jsonPath=resolve(output,'focus-daily-planner-project.json');await jsonDownload.saveAs(jsonPath);const project=JSON.parse(await readFile(jsonPath,'utf8'));
 assert.equal(project.elements.length,13);assert.ok(project.elements.some(layer=>layer.fontDataUrl?.startsWith('data:font/ttf;base64,')));assert.ok(project.aiPrompt.includes('Plan tomorrow'));
 assert.equal(project.generatedCode,undefined,'Editable JSON avoids duplicating assets in generated source');
 assert.ok((await readFile(jsonPath)).length<=8*1024*1024,'Export fits the project importer');
 // Import the real download in a clean browser through the Studio file control.
 const importContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 try{
  const importedPage=await importContext.newPage();importedPage.on('pageerror',error=>runtimeErrors.push(error.message));
  await importedPage.goto(base+'/tools/developer/ux-ui-studio',{waitUntil:'domcontentloaded',timeout:120000});
  await importedPage.waitForFunction(()=>document.documentElement.dataset.envToolHydrated==='ux-ui-studio',null,{timeout:60000});
  await importedPage.getByRole('button',{name:'Add project',exact:true}).click();
  await importedPage.getByLabel('Import preset',{exact:true}).setInputFiles(jsonPath);
  await importedPage.waitForFunction(()=>{const raw=localStorage.getItem('env-ux-ui-studio-project-v1');if(!raw)return false;const saved=JSON.parse(raw);return saved.name==='Focus — Daily Planner'&&saved.elements?.length===13});
  const restored=await importedPage.evaluate(()=>JSON.parse(localStorage.getItem('env-ux-ui-studio-project-v1')));
  assert.equal(restored.elements.find(layer=>layer.fontDataUrl)?.fontDataUrl,project.elements.find(layer=>layer.fontDataUrl)?.fontDataUrl);
  assert.ok(restored.elements.some(layer=>layer.kind==='icon'&&layer.iconSvg));
 }finally{await importContext.close()}
 await writeFile(resolve(output,'focus-ai-handoff-prompt.txt'),project.aiPrompt+'\n');assert.deepEqual(runtimeErrors,[]);
 const report={baseUrl:base,createdAt:new Date().toISOString(),workflow:'Created with visible Studio tools; no project-state injection',layers:project.elements.length,pdfPages:pdf.getPageCount(),jsonImportRoundTrip:'passed',runtimeErrors,pdf:pdfPath,json:jsonPath};await writeFile(resolve(output,'demo-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){
 await page.screenshot({path:resolve(output,'demo-error.png'),animations:'disabled'}).catch(()=>{});
 const draft=await page.evaluate(()=>localStorage.getItem('env-ux-ui-studio-project-v1')).catch(()=>null);
 if(draft)await writeFile(resolve(output,'focus-in-progress.json'),draft);
 throw error;
}finally{await context.close();await browser.close()}
