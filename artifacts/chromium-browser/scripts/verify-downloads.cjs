const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const https = require("node:https");
const { execFileSync } = require("node:child_process");
const { app, BrowserWindow, session, shell } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(check, label) {
  for (let i=0;i<250;i++) { const result=await check();if(result)return result;await sleep(30); }
  throw new Error(`Timeout: ${label}`);
}
let server;
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),"slate-download-check-"));
  const destination = path.join(profile,"Downloads");
  fs.mkdirSync(destination);
  fs.writeFileSync(path.join(destination,"reporte.txt"),"existing");
  fs.writeFileSync(path.join(profile,"adblock-engine.bin"),ElectronBlocker.parse("||ads.invalid^").serialize());
  fs.writeFileSync(path.join(profile,"appearance.json"),JSON.stringify({theme:"oscuro"}));
  app.setPath("userData",profile);app.setPath("downloads",destination);
  let revealed = "";
  shell.showItemInFolder = file => revealed = file;
  const folderCalls = [];
  shell.openPath = async file => { folderCalls.push(file); return ""; };
  const chunk = Buffer.alloc(8192,"a");
  const key=path.join(profile,"test.key"),cert=path.join(profile,"test.crt");
  execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-keyout",key,"-out",cert,"-days","1","-subj","/CN=127.0.0.1","-addext","subjectAltName=IP:127.0.0.1"],{stdio:"ignore"});
  server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
    if(req.url==="/page"){res.end("<!doctype html><title>Fixture de descargas</title><body>Página local</body>");return;}
    res.writeHead(200,{"Content-Type":"application/octet-stream","Content-Disposition":'attachment; filename="reporte.txt"',"Content-Length":chunk.length*120});
    let sent=0;
    const timer=setInterval(()=>{res.write(chunk);if(++sent===120){clearInterval(timer);res.end();}},25);
    res.on("close",()=>clearInterval(timer));
  });
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  const origin=`https://127.0.0.1:${server.address().port}`;
  require("../src/main.cjs");
  await app.whenReady();
  session.defaultSession.setCertificateVerifyProc(({hostname},callback)=>callback(hostname==="127.0.0.1"?0:-3));
  const win=await wait(()=>BrowserWindow.getAllWindows()[0],"window");
  win.setContentSize(1320,860);
  const ui=code=>win.webContents.executeJavaScript(code);
  const state=()=>ui("window.brujula.getState()");
  await wait(()=>ui("document.documentElement.dataset.uiReady==='true'").catch(()=>false),"UI");
  // Fresh disposable profiles must accept the same legal gate as a real user.
  // Never bypass it in the product just to make a native test reach the filters.
  await ui(`window.brujula.acceptLegal({
    version:window.SlateLegalDocuments.version,terms:true,privacy:true,adult:true
  })`);
  await wait(()=>ui("document.getElementById('legal-gate').hidden"),"legal acceptance");
  await wait(async()=>(await state()).privacy.status==="ready","protection");
  await ui(`window.brujula.navigate(${JSON.stringify(origin+"/page")})`);
  await wait(async()=>(await state()).tabs[0].url===origin+"/page" && !(await state()).tabs[0].loading,"local page");
  // Slow just the test animation to capture the courier; production stays 720 ms.
  await ui(`window.downloadEvents=0;window.brujula.onDownloadStarted(()=>window.downloadEvents++);`);
  session.defaultSession.downloadURL(origin+"/download");
  await wait(()=>ui("Boolean(document.querySelector('.miso-download-courier'))"),"Miso carrying file");
  assert.equal(await ui("document.querySelector('.miso-download-courier').getAnimations()[0].effect.getTiming().duration"),720);
  await ui("document.querySelector('.miso-download-courier').getAnimations()[0].playbackRate=.15");
  await ui("document.getElementById('downloads-toggle').click()");
  await wait(()=>ui("document.getElementById('panel-title').textContent==='Descargas' && Boolean(document.querySelector('.download-row'))"),"downloads center");
  const first=(await state()).downloads.entries[0];
  assert.equal(first.name,"reporte (1).txt");
  assert.equal(first.path,path.join(destination,first.name));
  await wait(()=>ui("Boolean([...document.querySelectorAll('.download-action')].find(b=>b.textContent==='Pausar'))"),"pause control");
  await ui("[...document.querySelectorAll('.download-action')].find(b=>b.textContent==='Pausar').click()");
  await wait(async()=>(await state()).downloads.entries[0].paused,"paused");
  await wait(()=>ui("Boolean([...document.querySelectorAll('.download-action')].find(b=>b.textContent==='Continuar'))"),"resume control");
  await ui("[...document.querySelectorAll('.download-action')].find(b=>b.textContent==='Continuar').click()");
  const output=path.resolve(__dirname,"../../../generated-artifacts");
  fs.mkdirSync(output,{recursive:true});
  // Native web contents are separate: check panel bounds do not overlap the page.
  await sleep(70);
  const panel=await ui("document.getElementById('side-panel').getBoundingClientRect().left");
  const page=win.contentView.children.find(v=>v.webContents.getURL().startsWith(origin));
  assert.ok(page.getBounds().x+page.getBounds().width<=panel+1);
  const courier=await ui(`(()=>{const r=document.querySelector('.miso-download-courier').getBoundingClientRect(),t=document.querySelector('.toolbar').getBoundingClientRect();return {inside:r.top>=t.top&&r.bottom<=t.bottom,pointer:getComputedStyle(document.querySelector('.miso-download-courier')).pointerEvents};})()`);
  assert.equal(courier.inside,true);
  assert.equal(courier.pointer,"none");
  fs.writeFileSync(path.join(output,"slate-descargas-miso.png"),(await win.webContents.capturePage()).toPNG());
  session.defaultSession.downloadURL(origin+"/second");
  await wait(async()=>(await state()).downloads.entries.length===2,"second download");
  const second=(await state()).downloads.entries[0];
  assert.equal(second.name,"reporte (2).txt");
  await ui(`window.brujula.downloadAction(${JSON.stringify(second.id)},'cancel')`);
  await wait(async()=>(await state()).downloads.entries.find(e=>e.id===second.id).state==="cancelled","cancelled");
  await wait(async()=>(await state()).downloads.entries.find(e=>e.id===first.id).state==="completed","completed");
  assert.equal(fs.statSync(first.path).size,chunk.length*120);
  assert.equal(fs.readFileSync(path.join(destination,"reporte.txt"),"utf8"),"existing");
  await ui(`window.brujula.downloadAction(${JSON.stringify(first.id)},'show')`);
  assert.equal(revealed,first.path);
  await ui("window.brujula.downloadAction('', 'folder')");
  assert.deepEqual(folderCalls,[destination]);
  await ui("window.brujula.featureAction({type:'workspace:switch',id:'trabajo'})");
  assert.equal((await state()).downloads.entries.length,0);
  await ui("window.brujula.featureAction({type:'workspace:switch',id:'personal'})");
  assert.equal((await state()).downloads.entries.length,2);
  await ui("location.reload()");
  await wait(()=>ui("document.documentElement.dataset.uiReady==='true'").catch(()=>false),"UI reload");
  await ui("document.getElementById('downloads-toggle').click()");
  await wait(()=>ui("document.querySelectorAll('.download-row').length===2"),"downloads after UI reload");
  await wait(()=>ui("!document.querySelector('.miso-download-courier')"),"animation cleaned up");
  assert.ok(fs.existsSync(first.path));
  await ui(`window.reducedEvents=0;const originalMatchMedia=window.matchMedia.bind(window);window.matchMedia=query=>query.includes('prefers-reduced-motion')?{matches:true}:originalMatchMedia(query);window.brujula.onDownloadStarted(()=>window.reducedEvents++);`);
  session.defaultSession.downloadURL(origin+"/reduced");
  await wait(()=>ui("window.reducedEvents===1"),"reduced-motion download");
  assert.equal(await ui("Boolean(document.querySelector('.miso-download-courier'))"),false);
  const reduced=(await state()).downloads.entries[0];
  await ui(`window.brujula.downloadAction(${JSON.stringify(reduced.id)},'cancel')`);
  console.info("PASS: native file download, Miso courier, chrome-only nonblocking animation, visible center on web pages, progress, pause/resume/cancel, unique names, completed file reveal, folder, workspace isolation and UI reload.");
  server.close();app.quit();
})().catch(error=>{console.error(error);server?.close();app.exit(1);});
