// Native integration check: disposable profile, local HTTPS fixture.
// Enabling the UI checkbox explicitly permits the official CDM download.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { app, BrowserWindow, session, components } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(check, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await sleep(70);
  }
  throw new Error(`Timeout: ${label}`);
}
(async () => {
  const resume = process.argv.find(arg => arg.startsWith("--resume="))?.slice(9);
  const profile = resume || fs.mkdtempSync(path.join(os.tmpdir(), "slate-ecs-native-"));
  if (resume) {
    assert.equal(path.dirname(profile), os.tmpdir());
    assert.ok(path.basename(profile).startsWith("slate-ecs-native-"));
    assert.equal(fs.readFileSync(path.join(profile, "test-profile"), "utf8"), "disposable");
  } else {
    fs.writeFileSync(path.join(profile,"test-profile"),"disposable");
    fs.writeFileSync(path.join(profile,"adblock-engine.bin"), ElectronBlocker.parse("||ads.invalid^").serialize());
    fs.writeFileSync(path.join(profile,"bookmarks.json"),JSON.stringify([{title:"Marcador conservado",url:"https://saved.test/"}]));
    fs.writeFileSync(path.join(profile,"appearance.json"),JSON.stringify({theme:"oscuro",fontFamily:"georgia"}));
    fs.writeFileSync(path.join(profile,"unrelated-local-data.txt"),"keep-me");
  }
  app.setPath("userData",profile);
  require("../src/main.cjs");
  await app.whenReady();
  session.defaultSession.protocol.handle("https",()=>new Response("<!doctype html><title>Local capability fixture</title>", {
    headers:{"Content-Type":"text/html"},
  }));
  const win = await wait(()=>BrowserWindow.getAllWindows()[0],"window");
  const ui = code => win.webContents.executeJavaScript(code);
  await wait(()=>ui("document.documentElement.dataset.uiReady==='true'").catch(()=>false),"saved interface ready");
  const state = ()=>ui("window.brujula.getState()");
  await wait(async()=>(await state()).privacy.status==="ready","cached protection");
  assert.equal((await state()).appearance.theme,"oscuro");
  assert.equal((await state()).appearance.fontFamily,"georgia");
  assert.equal((await state()).bookmarks[0].title,"Marcador conservado");
  assert.equal(fs.readFileSync(path.join(profile,"unrelated-local-data.txt"),"utf8"),"keep-me");
  assert.equal(components !== undefined,true);
  await ui("document.getElementById('privacy-toggle').click()");
  if (!resume) {
    assert.equal((await state()).protectedVideo.enabled,false);
    assert.equal(components.updatesEnabled,false);
    await ui("document.getElementById('protected-video-enabled').click()");
  }
  const final = await wait(async()=>{
    const video=(await state()).protectedVideo;
    return ["installed","error","restart"].includes(video.status) ? video : false;
  },"component operation",40000);
  assert.equal(final.enabled,true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile,"protected-video.json"))).enabled,true);
  console.info("COMPONENT_RESULT",JSON.stringify(final));
  console.info("COMPONENT_STATUS",JSON.stringify(components.status()));
  await ui("window.brujula.navigate('https://capability.test/')");
  const contents = win.contentView.children[0].webContents;
  await wait(()=>contents.getURL()==="https://capability.test/"&&!contents.isLoading(),"fixture ready");
  const result = await wait(()=>ui("window.brujula.checkProtectedVideo()").catch(()=>false),"actual EME probe");
  console.info("EME_RESULT",JSON.stringify(result));
  if (process.argv.includes("--demo")) {
    assert.equal(final.status,"installed");
    assert.equal(result.available,true);
    // Official public UAT test content; never a user's streaming account.
    session.defaultSession.protocol.unhandle("https");
    await ui("window.brujula.navigate('https://castlabs.github.io/wv-vmp-lab/')");
    await wait(()=>contents.executeJavaScript("Boolean(document.getElementById('loadContentBtn')?.onclick)").catch(()=>false),"public DRM test player",25000);
    await contents.executeJavaScript("document.getElementById('video').muted=true;document.getElementById('loadContentBtn').click();",true);
    await wait(()=>contents.executeJavaScript("document.getElementById('video')?.readyState>=2"),"decrypted media",30000);
    await contents.executeJavaScript("document.getElementById('video').play();undefined;",true);
    const sample = ()=>contents.executeJavaScript(`(()=>{const v=document.getElementById('video');return {
      time:v.currentTime, frames:v.getVideoPlaybackQuality().totalVideoFrames, encrypted:Boolean(v.mediaKeys),
      paused:v.paused, error:v.error?.code||null
    };})()`);
    const before=await sample();await sleep(3500);const after=await sample();
    assert.equal(after.encrypted,true);assert.equal(after.error,null);assert.equal(after.paused,false);
    assert.ok(after.time-before.time>2);assert.ok(after.frames-before.frames>15);
    const shortcut=()=>{for(const type of ["keyDown","keyUp"])contents.sendInputEvent({
      type,keyCode:"P",modifiers:[process.platform==="darwin"?"meta":"control","shift"],
    });};
    shortcut();
    await wait(()=>contents.executeJavaScript("Boolean(document.pictureInPictureElement)"),"encrypted PiP");
    shortcut();
    await wait(()=>contents.executeJavaScript("!document.pictureInPictureElement"),"leave encrypted PiP");
    console.info("DRM_PLAYBACK_RESULT",JSON.stringify({publicTest:true,platform:process.platform,encrypted:true,
      timeProgress:after.time-before.time,decodedFrames:after.frames-before.frames,pip:true,
      retailServicesVerified:false}));
  }
  // The new permission does not grant unrelated capture or storage permissions.
  for (const name of ["microphone","geolocation"]) assert.equal(await contents.executeJavaScript(
    `navigator.permissions.query({name:${JSON.stringify(name)}}).then(p=>p.state)`),"denied");
  assert.equal(await contents.executeJavaScript("typeof window.brujula"),"undefined");
  const output = path.resolve(__dirname,"../../../generated-artifacts");
  fs.mkdirSync(output,{recursive:true});
  await ui("document.getElementById('privacy-toggle').click();document.getElementById('protected-video-status').scrollIntoView({block:'start'})");
  fs.writeFileSync(path.join(output,"slate-video-protegido.png"),(await win.webContents.capturePage()).toPNG());
  console.info("PROFILE_FOR_RESTART",profile);
  console.info("PASS: new engine, consent UI and persisted preference, existing appearance/bookmark/data retained, no remote bridge or unrelated permissions.");
  app.quit();
})().catch(error=>{console.error(error);app.exit(1);});
