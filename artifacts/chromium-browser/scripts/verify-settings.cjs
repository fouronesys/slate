// Real Electron checks with a disposable profile and an offline HTTPS fixture.
// No production account, site login, signature request or user data is used.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { app, BrowserWindow, session, webContents } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await pause(80);
  }
  throw new Error(`Timeout: ${label}`);
}
const output = path.resolve(__dirname, "../../../generated-artifacts");
const failures = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (_event, details) => {
    if (details.level === "error" && !/ERR_|favicon|Content Security Policy|Widevine/i.test(details.message)) {
      failures.push(details.message);
    }
  });
});
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "slate-settings-"));
  app.setPath("userData", profile);
  await fs.writeFile(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||ads.test^").serialize());
  require("../src/main.cjs");
  await app.whenReady();
  const win = await waitFor(() => BrowserWindow.getAllWindows()[0], "main window");
  const ui = code => win.webContents.executeJavaScript(code);
  await waitFor(() => ui("Boolean(window.brujula && window.SlateSettings && document.documentElement.dataset.uiReady)"), "UI ready");
  await fs.mkdir(output, { recursive: true });
  const capture = async name => {
    await pause(180); // Let the native compositor paint the selected section.
    await fs.writeFile(path.join(output, name), (await win.webContents.capturePage()).toJPEG(88));
  };
  assert.equal((await ui("window.brujula.getState()")).legal.accepted, false);
  assert.equal(await ui("document.getElementById('legal-accept').disabled"), true);
  await assert.rejects(ui("window.brujula.navigate('https://slate-video.test')"), /primer inicio/);
  await assert.rejects(ui("window.brujula.acceptLegal({version:window.SlateLegalDocuments.version,terms:true,privacy:true,adult:false})"), /declarar/);
  await capture("slate-primer-inicio.jpg");
  await ui(`for (const id of ['legal-terms-check','legal-privacy-check','legal-adult-check']) {
    const checkbox=document.getElementById(id); checkbox.click();
  } document.getElementById('legal-accept').click();`);
  await waitFor(() => ui("document.getElementById('legal-gate').hidden"), "acceptance saved");
  const record = JSON.parse(await fs.readFile(path.join(profile, "legal-acceptance.json"), "utf8"));
  assert.equal(record.adult, true);
  assert.ok(!Object.hasOwn(record, "name"));
  await waitFor(async () => (await ui("window.brujula.getState()")).privacy.status === "ready", "offline fixture engine");
  assert.equal(await ui("getComputedStyle(document.getElementById('customize-toggle')).display"), "none");
  for (const id of ["privacy-toggle", "downloads-toggle", "settings-toggle"]) {
    assert.equal(await ui(`document.getElementById('${id}').getBoundingClientRect().width > 0`), true);
  }
  await ui("document.getElementById('privacy-toggle').click()");
  assert.equal(await ui("document.getElementById('privacy-settings').hidden"), false);
  assert.equal(await ui("document.getElementById('privacy-toggle').getAttribute('aria-expanded')"), "true");
  await ui("document.getElementById('downloads-toggle').click()");
  assert.equal(await ui("document.querySelector('[data-settings-section][aria-current]').dataset.settingsSection"), "downloads");
  assert.equal(await ui("document.getElementById('privacy-toggle').getAttribute('aria-expanded')"), "false");
  assert.equal(await ui("document.getElementById('downloads-toggle').getAttribute('aria-expanded')"), "true");
  assert.equal(await ui("Boolean(document.querySelector('#panel-items .downloads-center'))"), true);
  await capture("slate-barra-proteccion-descargas.jpg");
  // A pointerdown on a quick access must not close/reopen the same panel.
  await ui("document.getElementById('downloads-toggle').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));document.getElementById('downloads-toggle').click()");
  assert.equal(await ui("document.getElementById('side-panel').hidden"), true);
  assert.equal(await ui("document.getElementById('downloads-toggle').getAttribute('aria-expanded')"), "false");
  const downloadBadge = await ui(`(async()=>{
    window.SlateDownloads.render({...await window.brujula.getState(),downloads:{active:2,items:[]}});
    return {
      text:document.getElementById('downloads-count').textContent,
      hidden:document.getElementById('downloads-count').hidden,
      active:document.getElementById('downloads-toggle').dataset.activeDownloads
    };
  })()`);
  assert.deepEqual(downloadBadge, {text:"2", hidden:false, active:"2"});
  await ui("document.getElementById('privacy-toggle').click();document.getElementById('home-screen').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  assert.equal(await ui("document.getElementById('side-panel').hidden"), true);
  assert.equal(await ui("document.querySelector('.home-content h1') === null"), true);
  assert.equal((await ui("window.brujula.getState()")).appearance.headingFont, "system");
  await ui("document.getElementById('settings-toggle').click()");
  for (const section of ["general", "videos", "appearance", "privacy", "bookmarks", "history", "downloads", "collections", "workspaces", "feature-privacy", "home", "commands", "legal"]) {
    await ui(`document.querySelector('[data-settings-section="${section}"]').click()`);
    assert.equal(await ui("document.getElementById('side-panel').hidden"), false);
    assert.equal(await ui("document.querySelector('[data-settings-section][aria-current]').dataset.settingsSection"), section);
  }
  await ui("document.querySelector('[data-legal-document=\"privacy\"]').click()");
  assert.match(await ui("document.getElementById('legal-document').textContent"), /Widevine/);
  await ui("window.SlateSettings.select('history');window.SlateSettings.select('downloads');window.SlateSettings.select('history')");
  assert.equal(await ui("document.getElementById('panel-items').querySelector('.downloads-center')===null"), true);
  await ui("document.querySelector('[data-settings-section=\"commands\"]').click()");
  assert.equal(await ui("document.querySelectorAll('.browser-command').length"), 11);
  await pause(200);
  assert.equal(await ui("document.getElementById('panel-title').textContent"), "Comandos");
  assert.match(await ui("getComputedStyle(document.getElementById('panel-title')).fontFamily"), /Segoe UI|sans-serif/);
  await capture("slate-configuracion-comandos.jpg");
  await ui("window.brujula.setBrowserPreferences({defaultZoom:125,pipButton:false,backgroundTabs:true})");
  const prefs = JSON.parse(await fs.readFile(path.join(profile, "browser-preferences.json"), "utf8"));
  assert.deepEqual(prefs, { defaultZoom: 125, pipButton: false, backgroundTabs: true });
  await new Promise(resolve => { win.webContents.once("did-finish-load", resolve); win.webContents.reload(); });
  await waitFor(() => ui("document.documentElement.dataset.uiReady && document.getElementById('legal-gate').hidden"), "legal acceptance after reload");
  assert.equal((await ui("window.brujula.getState()")).browserPreferences.defaultZoom, 125);
  await ui("window.brujula.setBrowserPreferences({defaultZoom:100,pipButton:true})");
  if (process.argv.includes("--ui-only")) {
    assert.deepEqual(failures, []);
    console.log("SLATE UI OK: first run, declarations, persistence, system font, sections, legal documents and history/download transitions.");
    app.quit();
    return;
  }
  // Render only local fixtures under secure test origins.
  const videoHtml = `<meta charset="utf-8"><body style="margin:0;background:#172333;color:white;font:16px sans-serif">
    <video id="fixture" muted autoplay playsinline style="display:block;width:640px;height:360px;margin:20px"></video>
    <script>
    const canvas=document.createElement('canvas'); canvas.width=640;canvas.height=360;
    const ctx=canvas.getContext('2d');let t=0;setInterval(()=>{
      ctx.fillStyle='#233b60';ctx.fillRect(0,0,640,360);
      ctx.fillStyle='#fff';ctx.font='26px sans-serif';ctx.fillText('Slate • Video local '+(++t),40,90);
    },50);
    document.getElementById('fixture').srcObject=canvas.captureStream(20);
    </script></body>`;
  session.defaultSession.protocol.handle("https", request =>
    new Response(videoHtml, { headers: { "content-type": "text/html" } }));
  await ui("window.brujula.navigate('https://slate-video.test')");
  const videoContents = await waitFor(() => webContents.getAllWebContents().find(wc => wc.getURL().startsWith("https://slate-video.test")), "fixture tab");
  await waitFor(() => videoContents.executeJavaScript("document.querySelector('video')?.readyState >= 2 && document.querySelectorAll('[data-slate-pip]').length===1"), "visible PiP control");
  assert.equal(await videoContents.executeJavaScript("typeof window.brujula"), "undefined");
  const control = await videoContents.executeJavaScript(`(() => {
    const r=document.querySelector('[data-slate-pip]').getBoundingClientRect();
    const v=document.querySelector('video').getBoundingClientRect();
    if(r.width!==34 || r.height!==24 || Math.abs(r.x+r.width/2-(v.x+v.width/2))>1)
      throw new Error('PiP must be compact and top-centered');
    return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
  })()`);
  videoContents.sendInputEvent({ type: "mouseMove", x: 10, y: 10 });
  await waitFor(() => videoContents.executeJavaScript("document.querySelector('[data-slate-pip]').style.opacity==='0'"), "PiP initially hidden outside video");
  videoContents.sendInputEvent({ type: "mouseMove", x: 100, y: 100 });
  await waitFor(() => videoContents.executeJavaScript("getComputedStyle(document.querySelector('[data-slate-pip]')).opacity==='1'"), "PiP fades in on video hover");
  await fs.writeFile(path.join(output, "slate-pip-discreto-visible.jpg"), (await videoContents.capturePage()).toJPEG(90));
  await waitFor(() => videoContents.executeJavaScript("getComputedStyle(document.querySelector('[data-slate-pip]')).opacity==='0'"), "PiP auto-hides while pointer is idle");
  assert.equal(await videoContents.executeJavaScript(`(() => {
    const h=document.querySelector('[data-slate-pip]'),r=h.getBoundingClientRect();
    return h.style.pointerEvents==='none' && document.elementFromPoint(r.x+17,r.y+12)!==h;
  })()`), true);
  await fs.writeFile(path.join(output, "slate-pip-discreto-oculto.jpg"), (await videoContents.capturePage()).toJPEG(90));
  videoContents.sendInputEvent({ type: "mouseMove", x: 120, y: 110 });
  await waitFor(() => videoContents.executeJavaScript("document.querySelector('[data-slate-pip]').style.opacity==='1'"), "PiP reappears on movement");
  videoContents.sendInputEvent({ type: "mouseMove", x: 10, y: 10 });
  await waitFor(() => videoContents.executeJavaScript("document.querySelector('[data-slate-pip]').style.opacity==='0'"), "PiP hides on leaving video");
  videoContents.focus();
  videoContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
  videoContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
  await waitFor(() => videoContents.executeJavaScript("document.querySelector('[data-slate-pip]').matches(':focus-within') && document.querySelector('[data-slate-pip]').style.opacity==='1'"), "keyboard focus reveals PiP");
  await pause(1800);
  assert.equal(await videoContents.executeJavaScript("document.querySelector('[data-slate-pip]').style.opacity"), "1");
  await videoContents.executeJavaScript("document.body.tabIndex=-1;document.body.focus();document.querySelector('video').disablePictureInPicture=true");
  videoContents.sendInputEvent({ type: "mouseMove", ...control });
  await waitFor(() => videoContents.executeJavaScript("getComputedStyle(document.querySelector('[data-slate-pip]')).opacity==='1'"), "icon hit target ready");
  videoContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...control });
  videoContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...control });
  await waitFor(() => videoContents.executeJavaScript("Boolean(document.pictureInPictureElement)"), "PiP from actual mouse click");
  await fs.writeFile(path.join(output, "slate-boton-pip.jpg"), (await videoContents.capturePage()).toJPEG(88));
  await videoContents.executeJavaScript("document.exitPictureInPicture()");
  await waitFor(() => videoContents.executeJavaScript("document.querySelector('video').disablePictureInPicture===true"), "restore original video PiP attribute");
  await ui("window.brujula.setBrowserPreferences({pipButton:false})");
  await waitFor(() => videoContents.executeJavaScript("document.querySelectorAll('[data-slate-pip]').length===0"), "disable control cleans up");
  await ui("window.brujula.setBrowserPreferences({pipButton:true})");
  await waitFor(() => videoContents.executeJavaScript("document.querySelectorAll('[data-slate-pip]').length===1"), "reenable control");
  // Same installer covers open shadow roots, dynamically inserted video and frames.
  await videoContents.executeJavaScript(`(() => {
    const root=document.createElement('div');document.body.append(root);
    const shadow=root.attachShadow({mode:'open'});
    const video=document.createElement('video');shadow.append(video);
    video.muted=true;video.srcObject=document.getElementById('fixture').srcObject;video.play();
    const frame=document.createElement('iframe');frame.src='https://embedded-video.test';
    frame.allow='picture-in-picture';document.body.append(frame);
  })()`);
  await waitFor(() => videoContents.executeJavaScript("document.querySelectorAll('[data-slate-pip]').length===2"), "dynamic shadow video");
  await waitFor(async () => {
    const frame = videoContents.mainFrame.framesInSubtree.find(f => f.url.startsWith("https://embedded-video.test"));
    return frame && frame.executeJavaScript("document.querySelectorAll('[data-slate-pip]').length===1");
  }, "cross-origin iframe control");
  assert.deepEqual(failures, []);
  console.log("SLATE SETTINGS OK: compact top-center PiP, hover, idle/exit auto-hide, no invisible hit target, keyboard focus, real PiP click, attribute restoration, settings, dynamic shadow video and cross-origin frame.");
  app.quit();
})().catch(error => {
  console.error("SLATE SETTINGS FAILED", error.stack || error);
  app.exit(1);
});
