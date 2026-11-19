// Isolated native check. Run once normally and once with SLATE_TEST_PHASE=restart
// using the same SLATE_TEST_PROFILE. No real sites or user data are used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { app, BrowserWindow, dialog, session } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const { performance } = require("node:perf_hooks");
const profile = process.env.SLATE_TEST_PROFILE;
if (!profile || !profile.startsWith("/tmp/slate-home-check-")) throw new Error("An isolated /tmp/slate-home-check-* profile is required.");
const restart = process.env.SLATE_TEST_PHASE === "restart";
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(check, label) {
  for (let i = 0; i < 220; i++) { const value = await check(); if (value) return value; await sleep(40); }
  throw new Error(`Timeout: ${label}`);
}
(async () => {
  const started = performance.now();
  fs.mkdirSync(profile, { recursive: true });
  if (!restart) {
    fs.writeFileSync(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||ads.test^").serialize());
    fs.writeFileSync(path.join(profile, "appearance.json"), JSON.stringify({ theme: "oscuro", chromeOpacity: 68 }));
  }
  app.setPath("userData", profile);
  require("../src/main.cjs");
  await app.whenReady();
  // Intercept all navigation into local offline documents.
  const fixture = () => new Response("<!doctype html><html><body>Local navigation fixture</body></html>", { headers: { "content-type": "text/html" } });
  session.defaultSession.protocol.handle("https", fixture);
  const win = await wait(() => BrowserWindow.getAllWindows()[0], "window");
  win.setContentSize(1320, 860);
  const ui = code => win.webContents.executeJavaScript(code);
  const state = () => ui("window.brujula.getState()");
  const act = action => ui(`window.brujula.featureAction(${JSON.stringify(action)})`);
  const errors = [];
  win.webContents.on("console-message", (_event, level, message) => { if (level >= 2 && !message.includes("net::")) errors.push(message); });
  await wait(() => ui("document.documentElement.dataset.uiReady === 'true' && Boolean(window.SlateFeatures)").catch(() => false), "saved design painted");
  await wait(() => win.isVisible(), "visible window");
  assert.equal(await ui("document.documentElement.dataset.theme"), "oscuro");
  assert.equal(await ui("document.getElementById('chrome-opacity').value"), "68");
  console.info(`First saved design ready: ${Math.round(performance.now() - started)} ms (${restart ? "restart" : "initial"}, local fixture).`);
  if (restart) {
    const saved = await state();
    assert.equal(saved.backgroundVideos.length, 2);
    assert.equal(saved.appearance.backdrop, "video");
    await wait(() => ui("document.getElementById('home-background-video').readyState >= 2"), "copied video after restart");
    assert.equal(await ui("document.getElementById('home-background-video').muted"), true);
    assert.ok(saved.features.home.hidden.includes("clock"));
    assert.equal(await ui("document.querySelector('.slate-widget-zone #slate-widget-clock') === null"), true);
    assert.equal(saved.features.home.anchors.search, "top-right");
    console.info("PASS: restart restored saved appearance, two copied videos, selected playback, hidden widget and anchors.");
    assert.deepEqual(errors, []);
    app.quit(); return;
  }
  await wait(async () => (await state()).privacy.status === "ready", "cached protection");
  // Repeated shield-counter updates must not rebuild controls or reapply styles.
  const metrics = await ui(`(() => {
    const observer = new MutationObserver(()=>{});
    observer.observe(document.documentElement,{attributes:true});
    const tab = document.querySelector('.tab'), bar = document.getElementById('bookmarks-bar');
    const started=performance.now();
    for(let i=0;i<200;i++) render({...state, privacy:{...state.privacy, blocked:i}});
    const elapsed=performance.now()-started, rootWrites=observer.takeRecords().length;
    observer.disconnect();
    return {elapsed,rootWrites,sameTab:tab===document.querySelector('.tab'),sameBar:bar===document.getElementById('bookmarks-bar')};
  })()`);
  assert.equal(metrics.rootWrites, 0);
  assert.equal(metrics.sameTab, true);
  console.info("200 counter updates:", JSON.stringify(metrics));
  // Real navigation remains protected and the new-tab control remains visible.
  await ui("window.brujula.navigate('https://local.test/one')");
  await wait(async () => !(await state()).tabs[0].loading, "local navigation");
  await ui("document.getElementById('new-tab').click()");
  await wait(async () => (await state()).tabs.length === 2, "new tab button");
  await act({ type: "workspace:switch", id: "trabajo" });
  assert.ok((await state()).features.home.hidden.includes("games"));
  session.fromPartition("persist:slate-space-trabajo").protocol.handle("https", fixture);
  await wait(() => ui("document.querySelector('.slate-home-header .eyebrow').textContent.includes('Trabajo')"), "visible space identity");
  await act({ type: "workspace:switch", id: "compras" });
  assert.equal((await state()).features.home.anchors.collections, "middle-center");
  await act({ type: "workspace:switch", id: "personal" });
  const active = (await state()).activeTabId;
  await ui("window.brujula.newTab()");
  const last = (await state()).activeTabId;
  await act({ type: "workspace:switch", id: "trabajo" });
  await act({ type: "workspace:switch", id: "personal" });
  assert.equal((await state()).activeTabId, last, "last active tab restored");
  await ui(`window.brujula.closeTab(${last})`);
  await ui(`window.brujula.activateTab(${active})`);
  win.setContentSize(900, 700);
  const extraTabs = [];
  for (let i = 0; i < 5; i++) extraTabs.push(await ui("window.brujula.newTab()"));
  await wait(() => ui("document.querySelectorAll('.tab').length >= 7"), "overflowing tab strip");
  assert.equal(await ui(`(() => {const r=document.getElementById('new-tab').getBoundingClientRect();return r.width>=30 && r.left>=0 && r.right<=innerWidth && r.bottom<=document.querySelector('.toolbar').getBoundingClientRect().top;})()`), true, "new tab stays visible beside overflowing tabs");
  for (const id of extraTabs) await ui(`window.brujula.closeTab(${id})`);
  await ui(`window.brujula.activateTab(${active})`);
  win.setContentSize(1320, 860);
  await wait(() => ui("!document.getElementById('home-screen').classList.contains('is-hidden')"), "home");
  await ui("document.getElementById('home-widget-edit-toggle').click()");
  await sleep(100);
  // Drop one widget across another using native pointer capture.
  const rects = await ui(`['search','clock'].map(id=>{const w=document.getElementById('slate-widget-'+id); const r=w.querySelector('.slate-widget-drag-handle').getBoundingClientRect(); const t=w.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),cx:Math.round(t.x+t.width/2),cy:Math.round(t.y+t.height/2),anchor:w.dataset.anchor};})`);
  win.webContents.sendInputEvent({ type: "mouseMove", x: rects[0].x, y: rects[0].y });
  win.webContents.sendInputEvent({ type: "mouseDown", button: "left", x: rects[0].x, y: rects[0].y, clickCount: 1 });
  for (let i=1;i<=15;i++) {
    win.webContents.sendInputEvent({ type: "mouseMove", x: Math.round(rects[0].x+(rects[1].cx-rects[0].x)*i/15), y: Math.round(rects[0].y+(rects[1].cy-rects[0].y)*i/15) });
    await sleep(8);
  }
  const dragging = await ui("Boolean(document.querySelector('.slate-widget.is-dragging'))");
  assert.equal(dragging, true, "drag stays active across another widget");
  win.webContents.sendInputEvent({ type: "mouseUp", button: "left", x: rects[1].cx, y: rects[1].cy, clickCount: 1 });
  await wait(async () => (await state()).features.home.anchors.search === rects[1].anchor, "drop onto occupied zone");
  assert.equal(await ui("Boolean(document.querySelector('.slate-widget.is-dragging'))"), false);
  // Widget controls are separate, visible, inside the widget, and non-overlapping.
  const geometry = await ui(`(() => {
    const widgets=[...document.querySelectorAll('.slate-widget-zone > .slate-widget:not([hidden])')];
    const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
    return widgets.map(w=>({id:w.dataset.widget,rect:rect(w),tools:rect(w.querySelector('.slate-widget-edit-tools'))}));
  })()`);
  for(const item of geometry) {
    assert.ok(item.tools.h >= 30);
    assert.ok(item.tools.y >= item.rect.y && item.tools.y+item.tools.h <= item.rect.y+item.rect.h+1);
    for(const other of geometry.filter(x=>x.id!==item.id)) {
      const a=item.rect,b=other.rect;
      assert.equal(a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y, false, `${item.id} / ${other.id}`);
    }
  }
  await ui("document.querySelector('#slate-widget-clock button[aria-label^=\"Ocultar\"]').click()");
  await wait(async () => (await state()).features.home.hidden.includes("clock"), "hide clock");
  await wait(() => ui("!document.querySelector('.slate-widget-zone #slate-widget-clock')"), "clock hidden in UI");
  await ui("document.querySelector('.slate-widget-available summary').click(); [...document.querySelectorAll('.slate-widget-available-list button')].find(b=>b.textContent.includes('Hora')).click()");
  await wait(async () => !(await state()).features.home.hidden.includes("clock"), "restore clock");
  await wait(() => ui("Boolean(document.querySelector('.slate-widget-zone #slate-widget-clock'))"), "clock restored in UI");
  await ui("document.querySelector('.slate-widget-available').open=false");
  await ui("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  assert.equal(await ui("getComputedStyle(document.querySelector('.slate-widget-available-list')).display"), "none");
  const output = path.resolve(__dirname, "../../../generated-artifacts");
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,"slate-widgets-zonas.png"),(await win.webContents.capturePage()).toPNG());
  await ui("document.querySelector('#slate-widget-clock button[aria-label^=\"Ocultar\"]').click()");
  await act({ type: "home:update", patch: { anchors: { ...(await state()).features.home.anchors, search: "top-right" } } });
  // Copy two real videos, remove sources, reuse the first from the visible library.
  for (let i=0;i<2;i++) {
    const source=path.join(profile,`source-${i}.webm`);
    execFileSync("ffmpeg",["-loglevel","error","-y","-f","lavfi","-i",`color=c=${i?"blue":"red"}:s=160x90:d=1`,"-c:v","libvpx","-an",source]);
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});
    await ui("window.brujula.chooseBackgroundVideo()");
    fs.unlinkSync(source);
  }
  let saved=await state();
  assert.equal(saved.backgroundVideos.length,2);
  for(const video of saved.backgroundVideos) assert.ok(fs.existsSync(path.join(profile,"backgrounds",video.fileName)));
  await ui(`(() => { const s=document.getElementById('background-video-library');s.value=${JSON.stringify(saved.backgroundVideos[0].fileName)};s.dispatchEvent(new Event('change'));})()`);
  await wait(async () => (await state()).backgroundVideoFile===saved.backgroundVideos[0].fileName,"reuse previous video");
  await ui("window.brujula.clearBackgroundVideo()");
  await ui("document.querySelector('[data-preference=\"backdrop\"][data-value=\"video\"]').click()");
  await wait(async () => (await state()).appearance.backdrop==="video","reuse video backdrop without file picker");
  await wait(() => ui("document.getElementById('home-background-video').readyState >= 2"),"local playback");
  assert.equal((await state()).backgroundVideos.length,2,"no duplicate import");
  // A UI reload must show the saved design and hidden state without losing data.
  await ui("location.reload()");
  await wait(() => ui("document.documentElement.dataset.uiReady==='true'").catch(()=>false),"restored UI");
  await sleep(100);
  assert.ok((await state()).features.home.hidden.includes("clock"));
  assert.deepEqual(errors,[]);
  console.info("PASS: native drag across occupied widget, anchored layout, hide/restore, isolated spaces, active tab restoration, protected navigation, retained video imports and reused library.");
  app.quit();
})().catch(error=>{console.error(error);app.exit(1);});
