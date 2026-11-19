const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const {app,BrowserWindow,session,webContents}=require("electron");
const {ElectronBlocker}=require("@ghostery/adblocker-electron");
const {contrast}=require("../src/theme-tokens.cjs");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label){for(let i=0;i<240;i++){const value=await fn();if(value)return value;await sleep(30);}throw new Error(`Timeout: ${label}`);}
(async()=>{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),"slate-miso-prefs-"));
  fs.writeFileSync(path.join(profile,"adblock-engine.bin"),ElectronBlocker.parse("||ads.invalid^").serialize());
  app.setPath("userData",profile);
  require("../src/main.cjs");
  await app.whenReady();
  session.defaultSession.protocol.handle("https",()=>new Response('<!doctype html><title>Local</title><button style="margin:20px;width:160px;height:60px" onclick="window.clicks=(window.clicks||0)+1">Click local</button>',{headers:{"Content-Type":"text/html"}}));
  const win=await wait(()=>BrowserWindow.getAllWindows()[0],"window");
  win.setContentSize(1320,860);
  const ui=code=>win.webContents.executeJavaScript(code);
  const state=()=>ui("window.brujula.getState()");
  const appearance=patch=>ui(`window.brujula.setAppearance(${JSON.stringify(patch)})`);
  await wait(()=>ui("document.documentElement.dataset.uiReady==='true'").catch(()=>false),"ready");
  await wait(async()=>(await state()).privacy.status==="ready","cached protection");
  if(process.argv.includes("--quit-native")||process.argv.includes("--quit-html")){
    const html=process.argv.includes("--quit-html");
    let page;
    if(html){
      await ui("window.brujula.navigate('https://fixture.test/')");
      page=await wait(()=>webContents.getAllWebContents().find(w=>w.getURL()==="https://fixture.test/"),"page");
      await wait(()=>page.executeJavaScript("document.readyState==='complete'"),"page ready");
      await page.executeJavaScript("document.body.requestFullscreen().then(()=>true)",true);
      await wait(()=>page.executeJavaScript("Boolean(document.fullscreenElement)"),"real HTML fullscreen");
    } else {
      win.setFullScreen(true);
      await wait(()=>win.isFullScreen(),"native fullscreen flag");
    }
    app.once("will-quit",()=>console.info(`QUIT_REQUEST_COMPLETED ${html?"html":"native"} (external process exit still required)`));
    if(html) {
      page.sendInputEvent({type:"keyDown",keyCode:"w",modifiers:[process.platform==="darwin"?"meta":"control"]});
      page.sendInputEvent({type:"keyUp",keyCode:"w",modifiers:[process.platform==="darwin"?"meta":"control"]});
    } else await ui("(async()=>window.brujula.closeTab((await window.brujula.getState()).activeTabId))()").catch(()=>{});
    return;
  }
  const controlColors=contents=>contents.executeJavaScript(`(()=>{const c=getComputedStyle(document.querySelector('.companion-action'));return [c.backgroundColor,c.color,c.fontFamily];})()`);
  await appearance({theme:"claro"});
  await wait(()=>ui("document.documentElement.dataset.theme==='claro'"),"light");
  await wait(()=>ui("getComputedStyle(document.querySelector('.companion-action')).backgroundColor==='rgb(244, 244, 246)'"),"light controls transition");
  const light=await controlColors(win.webContents);
  await appearance({theme:"oscuro"});
  await wait(()=>ui("document.documentElement.dataset.theme==='oscuro'"),"dark");
  await wait(()=>ui("getComputedStyle(document.querySelector('.companion-action')).backgroundColor==='rgb(32, 33, 36)'"),"dark controls transition");
  const dark=await controlColors(win.webContents);
  assert.notEqual(light[0],dark[0]);
  const companion=(await state()).features.home.companion;
  await ui(`window.brujula.featureAction({type:'home:update',patch:{companion:${JSON.stringify({...companion,floating:true,enabled:true})}}})`);
  const pet=await wait(()=>webContents.getAllWebContents().find(w=>w.getURL().endsWith("/companion.html")),"native Miso");
  await wait(()=>pet.executeJavaScript("Boolean(document.querySelector('.companion-action'))").catch(()=>false),"pet controls");
  for(const theme of ["claro","oscuro"]) {
    await appearance({theme});
    await wait(()=>pet.executeJavaScript(`document.body.dataset.theme===${JSON.stringify(theme)}`),"native theme");
    const native=await controlColors(pet);
    assert.equal(native[0],theme==="claro"?light[0]:dark[0]);
  }
  await appearance({colorMode:"propio",canvasColor:"#f7e5de"});
  await wait(()=>pet.executeJavaScript("getComputedStyle(document.querySelector('.companion-action')).backgroundColor==='rgb(247, 229, 222)'"),"native custom palette");
  const ink=(await controlColors(pet))[1];
  assert.equal(ink,"rgb(0, 0, 0)");
  assert.ok(contrast("#f7e5de","#000000")>=4.5);
  await appearance({contrast:"alto",theme:"oscuro"});
  await wait(()=>pet.executeJavaScript("getComputedStyle(document.querySelector('.companion-action')).backgroundColor==='rgb(0, 0, 0)'"),"high contrast");
  await appearance({contrast:"normal",colorMode:"tema"});
  await ui("document.getElementById('customize-toggle').click()");
  await ui("(()=>{const s=document.querySelector('[data-font-preference=\"fontFamily\"]');s.value='mono';s.dispatchEvent(new Event('change'));})()");
  await wait(async()=>(await state()).appearance.fontFamily==="mono","saved font");
  await wait(()=>pet.executeJavaScript("getComputedStyle(document.querySelector('.companion-action')).fontFamily.includes('IBM Plex Mono')"),"native font");
  await ui("(()=>{const s=document.querySelector('[data-font-preference=\"headingFont\"]');s.value='georgia';s.dispatchEvent(new Event('change'));})()");
  await wait(()=>ui("getComputedStyle(document.querySelector('.home-content h1')).fontFamily.includes('Georgia')"),"heading font");
  // A click inside stays open; outside closes without stealing page focus.
  const inside=await ui("(()=>{const r=document.getElementById('panel-title').getBoundingClientRect();return{x:Math.round(r.x+10),y:Math.round(r.y+10)};})()");
  win.webContents.sendInputEvent({type:"mouseDown",button:"left",...inside,clickCount:1});
  win.webContents.sendInputEvent({type:"mouseUp",button:"left",...inside,clickCount:1});
  assert.equal(await ui("document.getElementById('side-panel').hidden"),false);
  win.webContents.sendInputEvent({type:"mouseDown",button:"left",x:90,y:190,clickCount:1});
  win.webContents.sendInputEvent({type:"mouseUp",button:"left",x:90,y:190,clickCount:1});
  await wait(()=>ui("document.getElementById('side-panel').hidden"),"outside home click");
  await ui("window.brujula.navigate('https://fixture.test/')");
  const page=await wait(()=>webContents.getAllWebContents().find(w=>w.getURL()==="https://fixture.test/"),"page");
  await wait(()=>page.executeJavaScript("document.readyState==='complete'"),"page ready");
  await ui("document.getElementById('customize-toggle').click()");
  await wait(()=>ui("!document.getElementById('side-panel').hidden"),"panel over web page");
  page.focus();
  page.sendInputEvent({type:"mouseDown",button:"left",x:50,y:45,clickCount:1});
  page.sendInputEvent({type:"mouseUp",button:"left",x:50,y:45,clickCount:1});
  await wait(()=>ui("document.getElementById('side-panel').hidden"),"outside native page click");
  await wait(()=>page.executeJavaScript("window.clicks===1"),"original page click preserved");
  assert.equal(page.isFocused(),true);
  await ui("window.brujula.home()");
  await ui("location.reload()");
  await wait(()=>ui("document.documentElement.dataset.uiReady==='true'").catch(()=>false),"reload");
  assert.equal((await state()).appearance.fontFamily,"mono");
  assert.equal((await state()).appearance.headingFont,"georgia");
  await pet.executeJavaScript("document.querySelector('.companion-art').click()");
  assert.equal(await pet.executeJavaScript("document.getElementById('companion-root').dataset.gesture"),"happy");
  assert.equal(await pet.executeJavaScript("getComputedStyle(document.querySelector('.cat-head')).animationName"),"companion-nuzzle");
  const output=path.resolve(__dirname,"../../../generated-artifacts");fs.mkdirSync(output,{recursive:true});
  await sleep(200);
  fs.writeFileSync(path.join(output,"slate-miso-gestos.png"),(await pet.capturePage()).toPNG());
  await ui("document.getElementById('customize-toggle').click();document.querySelector('[data-font-preference]').scrollIntoView({block:'center'})");
  fs.writeFileSync(path.join(output,"slate-tipografias.png"),(await win.webContents.capturePage()).toPNG());
  console.info("PASS: home/native Miso colors, custom palette and high contrast, saved interface/headings fonts, greeting gesture, outside home/page clicks with original click and focus preserved.");
  app.quit();
})().catch(error=>{console.error(error);app.exit(1);});
