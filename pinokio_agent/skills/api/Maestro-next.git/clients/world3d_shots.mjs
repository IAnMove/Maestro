// Render saved shot documents using the real editor and its MP4 publication flow.
// Run with Node where Playwright is installed, or provide PLAYWRIGHT_MODULE.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const cdp=arg('--cdp'),appUrl=arg('--app-url'),planPath=arg('--plan'),outDir=arg('--output-dir'),workspace=arg('--workspace');
if(!cdp||!appUrl||!planPath||!outDir||!workspace) throw Error('Required: --cdp --app-url --plan --output-dir --workspace');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const plan=JSON.parse(await fs.readFile(planPath,'utf8'));
await fs.mkdir(outDir,{recursive:true});
const browser=await chromium.connectOverCDP(cdp);
const context=browser.contexts()[0];
let page=context.pages().find(p=>p.url().startsWith(appUrl));
if(!page) { page=await context.newPage(); await page.goto(appUrl); }
await page.waitForLoadState('domcontentloaded');
page.setDefaultTimeout(15000);
async function clickIfVisible(locator) { if(await locator.isVisible().catch(()=>false)) await locator.click(); }
await clickIfVisible(page.getByRole('button',{name:'Enter the studio',exact:true}));
await clickIfVisible(page.getByRole('button',{name:'Close Ask to the Wizard',exact:true}));
if(!await page.getByTestId('scene3d-workspace').isVisible()) {
 await page.getByRole('button',{name:'Studios',exact:true}).click();
 await page.getByRole('tab',{name:'Video 3D',exact:true}).click();
}
await clickIfVisible(page.getByRole('button',{name:'Expand editor',exact:true}));
await page.waitForFunction(()=>!!window.__world3dStage);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
for(const shot of plan.shots) {
 const stem=`clip-${String(shot.document.clipNumber).padStart(2,'0')}`;
 const filename=path.join(outDir,`${stem}.mp4`);
 if(await fs.stat(filename).then(s=>s.size>1024).catch(()=>false)) {console.log(JSON.stringify({clip:stem,status:'exists'}));continue;}
 const jsonPath=path.join(outDir,`${stem}.world3d.json`);
 await fs.writeFile(jsonPath,JSON.stringify(shot.document,null,2));
 await page.getByLabel('Open shot JSON',{exact:true}).setInputFiles(jsonPath);
 await page.waitForFunction(d=>window.__world3dStage?.ready(d.slots),shot.document,{timeout:90000});
 // Wait until React has applied the imported scene, including clip choices.
 await page.getByRole('spinbutton',{name:'Clip number',exact:true}).waitFor();
 await page.waitForFunction(n=>document.querySelector('input[aria-label="Clip number"]')?.value===String(n),shot.document.clipNumber);
 const still=await page.evaluate(d=>{
  const h=window.__world3dStage;h.beginExport(d);h.setExportSize(d.width,d.height);
  try{return h.paint(Math.min(d.duration/2,2),d).toDataURL('image/png');}finally{h.endExport();}
 },shot.document);
 await fs.writeFile(path.join(outDir,`${stem}.png`),Buffer.from(still.split(',')[1],'base64'));
 if(process.argv.includes('--preview-only')) {console.log(JSON.stringify({clip:stem,status:'preview'}));continue;}
 const started=Date.now();
 const result=await page.evaluate(async({doc,workspace})=>{
  const {exportWorld3DDocument}=await import('/src/features/scene3d/exportFlow.ts');
  const result=await exportWorld3DDocument(window.__world3dStage,doc,workspace,(frame,total)=>{window.__world3dBatchProgress={frame,total}});
  if(!result.saved) throw result.error??Error('Publication failed');
  return result.saved;
 },{doc:shot.document,workspace});
 const downloadUrl=new URL(result.url,appUrl);
 downloadUrl.searchParams.set('workspace',workspace);
 const response=await fetch(downloadUrl);
 if(!response.ok) throw Error(`Download ${response.status}: ${result.url}`);
 const bytes=Buffer.from(await response.arrayBuffer());
 await fs.writeFile(filename,bytes,{flag:'wx'});
 const record={clip:shot.document.clipNumber,title:shot.title,start:shot.start,end:shot.end,saved:result,bytes:bytes.length,elapsedSeconds:(Date.now()-started)/1000};
 await fs.writeFile(path.join(outDir,`${stem}.publication.json`),JSON.stringify(record,null,2));
 await fs.appendFile(path.join(outDir,'render-log.jsonl'),JSON.stringify(record)+'\n');
 console.log(JSON.stringify(record));
}
await fs.writeFile(path.join(outDir,'browser-errors.json'),JSON.stringify(errors,null,2));
await browser.close();
