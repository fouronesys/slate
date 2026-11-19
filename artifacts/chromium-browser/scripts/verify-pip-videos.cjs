// Native PiP regression with local, generated video: no external sites/accounts.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {app, BrowserWindow, session, webContents} = require("electron");
const {ElectronBlocker} = require("@ghostery/adblocker-electron");
const {togglePictureInPicture} = require("../src/media-controls.cjs");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(check, label) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = await check();
    if (result) return result;
    await sleep(50);
  }
  throw new Error(`Timeout: ${label}`);
}
function fixtureVideo(inShadow = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 360;
  const ctx = canvas.getContext("2d");
  const video = document.createElement("video");
  video.id = inShadow ? "shadow-video" : "ordinary";
  video.muted = true;
  video.style.cssText = `width:${inShadow ? 240 : 440}px`;
  const root = inShadow ? document.getElementById("shadow").attachShadow({mode:"open"}) : document.body;
  root.append(video);
  setInterval(() => {
    ctx.fillStyle = "#26334d"; ctx.fillRect(0,0,640,360);
    ctx.fillStyle = "#ffffff"; ctx.font = "28px sans-serif";
    ctx.fillText("Slate Privacy · vídeo local", 70,140);
    ctx.fillText(new Date().toLocaleTimeString(),220,200);
  },50);
  video.srcObject = canvas.captureStream(20);
  video.addEventListener("enterpictureinpicture", event => {
    window.testPip = event.pictureInPictureWindow;
    window.testPipResizes = 0;
    window.testPip.addEventListener("resize", () => window.testPipResizes++);
  });
  return video.play();
}
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),"slate-pip-"));
  fs.writeFileSync(path.join(profile,"adblock-engine.bin"), ElectronBlocker.parse("||ads.invalid^").serialize());
  app.setPath("userData",profile);
  require("../src/main.cjs");
  await app.whenReady();
  session.defaultSession.protocol.handle("https", request => new Response(
    request.url.startsWith("https://top.test") ? `<!doctype html><title>PiP local</title><div id="shadow"></div>
    <iframe src="https://embedded.test/" allow="picture-in-picture"></iframe>
    <iframe src="https://blocked.test/" allow="picture-in-picture 'none'"></iframe>` :
    "<!doctype html><title>Reproductor incrustado</title>", {headers:{"Content-Type":"text/html"}}));
  const win = await wait(() => BrowserWindow.getAllWindows()[0],"window");
  const ui = code => win.webContents.executeJavaScript(code);
  await wait(() => ui("Boolean(window.brujula)").catch(() => false),"bridge");
  await wait(async () => (await ui("window.brujula.getState()")).privacy.status === "ready","filters");
  await ui("window.brujula.navigate('https://top.test/')");
  const contents = await wait(() => webContents.getAllWebContents().find(w => w.getURL() === "https://top.test/"),"tab");
  await wait(() => !contents.isLoading(),"frames loaded");
  const top = contents.mainFrame;
  const embedded = top.framesInSubtree.find(frame => frame.url.startsWith("https://embedded.test"));
  const blocked = top.framesInSubtree.find(frame => frame.url.startsWith("https://blocked.test"));
  assert.ok(embedded); assert.ok(blocked);
  const run = (frame,code) => frame.executeJavaScript(code,true);
  await run(top,`(${fixtureVideo.toString()})(false)`);
  await run(top,`(${fixtureVideo.toString()})(true)`);
  await run(embedded,`(${fixtureVideo.toString()})(false)`);
  await run(blocked,`(${fixtureVideo.toString()})(false)`);
  await run(top,"document.getElementById('shadow').shadowRoot.querySelector('video').pause()");
  await run(embedded,"document.querySelector('video').pause()");
  await run(blocked,"document.querySelector('video').pause()");
  const shortcut = () => {
    for (const type of ["keyDown","keyUp"]) contents.sendInputEvent({
      type,keyCode:"P",modifiers:[process.platform === "darwin" ? "meta" : "control","shift"],
    });
  };
  const windows = () => execFileSync("xdotool",["search","--pid",String(process.pid)],{encoding:"utf8"}).trim().split(/\s+/);
  const before = process.platform === "linux" ? windows() : [];
  shortcut();
  await wait(() => run(top,"document.pictureInPictureElement === document.getElementById('ordinary')"),"ordinary video via real shortcut");
  if (process.platform === "linux") {
    const pipId = await wait(() => windows().find(id => !before.includes(id)),"native PiP X11 window");
    const initial = await run(top,"[testPip.width,testPip.height]");
    execFileSync("xdotool",["windowsize",pipId,"460","260"]);
    await wait(() => run(top,`testPipResizes > 0 && (testPip.width !== ${initial[0]} || testPip.height !== ${initial[1]})`),"native PiP actual resize");
    console.info("PASS: native PiP resized through the window system; PictureInPictureWindow emitted resize.");
    try {
      const output = path.resolve(__dirname,"../../../generated-artifacts/slate-pip.png");
      execFileSync("import",["-window",pipId,output],{timeout:5000,stdio:"pipe"});
    } catch { console.info("Optional native window capture unavailable."); }
  }
  shortcut();
  await wait(() => run(top,"!document.pictureInPictureElement"),"exit ordinary");
  await run(top,`document.getElementById('ordinary').pause();
    document.getElementById('shadow').shadowRoot.querySelector('video').disablePictureInPicture=true;
    document.getElementById('shadow').shadowRoot.querySelector('video').play()`);
  shortcut();
  await wait(() => run(top,"Boolean(document.pictureInPictureElement)"),"open shadow-root video");
  shortcut();
  await wait(() => run(top,"!document.pictureInPictureElement"),"exit shadow video");
  await wait(() => run(top,"document.getElementById('shadow').shadowRoot.querySelector('video').disablePictureInPicture"),"restore site attribute");
  await run(top,"document.getElementById('shadow').shadowRoot.querySelector('video').pause()");
  await run(embedded,"document.querySelector('video').play()");
  shortcut();
  await wait(() => run(embedded,"Boolean(document.pictureInPictureElement)"),"cross-origin iframe via shortcut");
  shortcut();
  await wait(() => run(embedded,"!document.pictureInPictureElement"),"exit embedded");
  await togglePictureInPicture(contents,{frame:embedded,strict:true});
  assert.ok(await run(embedded,"Boolean(document.pictureInPictureElement)"));
  await togglePictureInPicture(contents);
  assert.equal(await run(blocked,"document.pictureInPictureEnabled"),false);
  await assert.rejects(togglePictureInPicture(contents,{frame:blocked,strict:true}),/no permite/);
  for (const frame of [top,embedded,blocked]) {
    assert.equal(await run(frame,"typeof window.brujula"),"undefined");
    assert.equal(await run(frame,"document.querySelectorAll('button').length"),0);
  }
  console.info("PASS: ordinary, open-shadow and cross-origin videos; context-frame targeting; attribute restored; blocked policy respected; no added buttons or remote bridge.");
  app.quit();
})().catch(error => {console.error(error); app.exit(1);});
