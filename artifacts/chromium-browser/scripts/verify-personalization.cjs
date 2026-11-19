// Native Electron regression checks; never uses the user's actual browser profile.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, nativeTheme, dialog } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const { contrast } = require("../src/theme-tokens.cjs");
let profile;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, label, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await check();
    if (value) return value;
    await delay(70);
  }
  throw new Error(`Timeout: ${label}`);
}
(async () => {
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "slate-personalization-"));
  fs.writeFileSync(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||blocked.invalid^").serialize());
  fs.writeFileSync(path.join(profile, "bookmarks.json"), JSON.stringify([
    { title: "Documentación", url: "https://example.com/" },
    { title: "Lecturas", url: "https://example.org/" },
  ]));
  app.setPath("userData", profile);
  nativeTheme.themeSource = "dark"; // Simulates the system source, not macOS validation.
  require("../src/main.cjs");
  await app.whenReady();
  const win = await waitFor(() => BrowserWindow.getAllWindows()[0], "window");
  win.setContentSize(1320, 860);
  const errors = [];
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2 && !message.includes("net::")) errors.push(message);
  });
  const ui = (code) => win.webContents.executeJavaScript(code);
  const state = () => ui("window.brujula.getState()");
  const action = (value) => ui(`window.brujula.featureAction(${JSON.stringify(value)})`);
  const appearance = (value) => ui(`window.brujula.setAppearance(${JSON.stringify(value)})`);
  await waitFor(() => ui("Boolean(window.SlateFeatures && document.querySelector('.slate-widget-zone .companion-art'))").catch(() => false), "home and visible default companion");
  assert.equal((await state()).appearance.theme, "sistema");
  await waitFor(() => ui("document.documentElement.dataset.theme === 'oscuro'"), "native dark theme");
  nativeTheme.themeSource = "light";
  await waitFor(() => ui("document.documentElement.dataset.theme === 'claro'"), "live system theme change");
  await appearance({ theme: "oscuro" });
  nativeTheme.themeSource = "light";
  assert.equal((await state()).appearance.theme, "oscuro");
  await waitFor(() => ui("document.documentElement.dataset.theme === 'oscuro'"), "explicit theme preserved");
  console.info("PASS: default native system theme, live changes and explicit override.");

  await ui("document.getElementById('customize-toggle').click()");
  await waitFor(() => ui("!document.getElementById('appearance-settings').hidden"), "appearance panel");
  await ui("document.querySelector('[data-color-mode=\"propio\"]').click()");
  await waitFor(async () => (await state()).appearance.colorMode === "propio", "color mode");
  const colors = { chromeColor: "#183148", toolbarColor: "#edd2b6", surfaceColor: "#273c32", canvasColor: "#f5f0e5", tabColor: "#8d4d62" };
  for (const [key, value] of Object.entries(colors)) {
    await ui(`(() => { const input = document.querySelector('[data-appearance-color="${key}"]'); input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    await waitFor(async () => (await state()).appearance[key] === value, key);
  }
  const samples = await ui(`(() => {
    const selectors = ['.titlebar','.toolbar','.side-panel','.home-screen','.tab.active'];
    const hex = value => { const n=value.match(/[\\d.]+/g).slice(0,3).map(Number); const scale=value.startsWith('color(srgb')?255:1; return '#'+n.map(x=>Math.round(x*scale).toString(16).padStart(2,'0')).join(''); };
    return selectors.map(selector => { const c=getComputedStyle(document.querySelector(selector)); return {selector,background:hex(c.backgroundColor),ink:hex(c.color)}; });
  })()`);
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    assert.equal(sample.background, Object.values(colors)[i], sample.selector);
    assert.ok(contrast(sample.background, sample.ink) >= 4.5, `readability: ${sample.selector}`);
  }
  await appearance({ contrast: "alto" });
  await waitFor(() => ui("['.titlebar','.toolbar','.side-panel','.home-screen','.tab.active'].every(s=>getComputedStyle(document.querySelector(s)).backgroundColor==='rgb(0, 0, 0)')"), "high contrast overrides all custom zone colors");
  await appearance({ contrast: "normal", colorMode: "tema" });
  await ui("document.getElementById('panel-close').click()");
  console.info("PASS: five real color controls, legibility, high contrast override.");

  // Real pointer reveal and keyboard access of the auto-hiding logo row.
  win.webContents.sendInputEvent({ type: "mouseMove", x: 90, y: 300 });
  await ui("document.getElementById('customize-toggle').click()");
  await ui("document.querySelector('[data-preference=\"autoHideTitlebar\"][data-value=\"true\"]').click()");
  await waitFor(async () => (await state()).layout.titlebarHeight === 6, "auto titlebar collapsed");
  assert.equal(await ui("document.querySelector('.tabs-row').getBoundingClientRect().top"), 6);
  assert.equal(await ui("document.querySelector('.titlebar').inert"), true);
  const titlebarOutput = path.resolve(__dirname, "../../../generated-artifacts");
  fs.mkdirSync(titlebarOutput, { recursive: true });
  await ui("document.getElementById('panel-close').click()");
  fs.writeFileSync(path.join(titlebarOutput, "slate-titlebar-hidden.png"), (await win.capturePage()).toPNG());
  win.webContents.sendInputEvent({ type: "mouseMove", x: 90, y: 2 });
  await waitFor(async () => (await state()).layout.titlebarHeight === 43, "pointer reveals titlebar");
  assert.equal(await ui("document.querySelector('.titlebar').inert"), false);
  fs.writeFileSync(path.join(titlebarOutput, "slate-titlebar-visible.png"), (await win.capturePage()).toPNG());
  win.webContents.sendInputEvent({ type: "mouseMove", x: 90, y: 300 });
  await delay(1100);
  assert.equal((await state()).layout.titlebarHeight, 43, "titlebar stays open longer than a second");
  await waitFor(async () => (await state()).layout.titlebarHeight === 6, "pointer leave hides titlebar");
  await ui("document.getElementById('titlebar-sensor').focus()");
  await waitFor(async () => (await state()).layout.titlebarHeight === 43, "keyboard reveals titlebar");
  assert.equal(await ui("document.activeElement.id"), "brand-secret");
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await waitFor(async () => (await state()).layout.titlebarHeight === 6, "Escape hides titlebar");
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, "appearance.json"), "utf8")).autoHideTitlebar, true);
  await ui("location.reload()");
  await waitFor(() => ui("Boolean(window.SlateFeatures && document.querySelector('#slate-widget-clock'))").catch(() => false), "titlebar restored after reload");
  assert.equal((await state()).layout.titlebarHeight, 6);
  await appearance({ autoHideTitlebar: false });
  await waitFor(async () => (await state()).layout.titlebarHeight === 43, "always-visible mode restored");
  assert.equal(await ui("document.querySelector('.tabs-row').getBoundingClientRect().top"), 43);
  console.info("PASS: automatic titlebar preference, actual pointer hover/leave, keyboard focus/Escape, persistence and restored geometry.");

  // Check the rendered positions, not only persisted numbers.
  async function verifyGeometry(label) {
    await delay(350);
    const geometry = await ui(`(() => {
      const zone=document.querySelector('.slate-widget-zone'), z=zone.getBoundingClientRect();
      return {width:zone.clientWidth,height:zone.clientHeight,items:[...zone.querySelectorAll('.slate-widget:not([hidden])')].map(n=>{
        const r=n.getBoundingClientRect(); return {id:n.dataset.widget,x:r.left-z.left,y:r.top-z.top,width:r.width,height:r.height};
      })};
    })()`);
    assert.equal(geometry.items.length, 6, label);
    for (const rect of geometry.items) {
      assert.ok(rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= geometry.width + 1 &&
        rect.y + rect.height <= geometry.height + 1, `${label}: bounded ${JSON.stringify(rect)} in ${geometry.width}x${geometry.height}`);
    }
    for (let i = 0; i < geometry.items.length; i++) for (let j = i + 1; j < geometry.items.length; j++) {
      const a = geometry.items[i], b = geometry.items[j];
      assert.ok(!(a.x < b.x+b.width-1 && a.x+a.width-1 > b.x && a.y < b.y+b.height-1 && a.y+a.height-1 > b.y),
        `${label}: overlap ${a.id}/${b.id}`);
    }
    return geometry;
  }
  assert.equal(await ui("getComputedStyle(document.querySelector('#slate-widget-clock')).backgroundColor"), "rgba(0, 0, 0, 0)");
  await verifyGeometry("wide home");
  await ui("document.getElementById('home-widget-edit-toggle').click()");
  assert.equal(await ui("document.getElementById('home-widget-edit-toggle').getAttribute('aria-pressed')"), "true");
  assert.equal(await ui("getComputedStyle(document.querySelector('#slate-widget-clock .slate-widget-drag-handle')).display"), "grid");
  const before = await ui("document.querySelector('#slate-widget-clock').offsetLeft");
  await ui("document.querySelector('#slate-widget-clock').focus()");
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Left" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Left" });
  await waitFor(async () => (await state()).features.home.positions.clock, "keyboard persisted position");
  assert.notEqual(await ui("document.querySelector('#slate-widget-clock').offsetLeft"), before);
  const persisted = JSON.parse(fs.readFileSync(path.join(profile, "features.json"), "utf8")).home.positions;
  assert.ok(persisted.clock.x >= 0 && persisted.clock.x <= 1);
  const start = await ui(`(() => {const r=document.querySelector('#slate-widget-clock .slate-widget-drag-handle').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  win.webContents.sendInputEvent({ type: "mouseMove", ...start });
  win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...start });
  win.webContents.sendInputEvent({ type: "mouseMove", x: start.x - 70, y: start.y + 60, movementX: -70, movementY: 60 });
  win.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, x: start.x - 70, y: start.y + 60 });
  await waitFor(async () => JSON.stringify((await state()).features.home.positions) !== JSON.stringify(persisted), "direct pointer drag saved");
  await verifyGeometry("after direct drag");
  assert.equal(await ui("document.getElementById('home-widget-edit-toggle').getAttribute('aria-pressed')"), "true", "editing survives the save response");
  await ui("document.getElementById('home-widget-edit-toggle').click()");
  const savedPositions = (await state()).features.home.positions;
  await ui("location.reload()");
  await waitFor(() => ui("Boolean(window.SlateFeatures && document.querySelector('#slate-widget-clock'))").catch(() => false), "renderer reload");
  assert.deepEqual((await state()).features.home.positions, savedPositions);
  await verifyGeometry("reload retained positions");
  await ui("document.getElementById('home-companion-toggle').click()");
  await waitFor(() => ui("!document.querySelector('.slate-widget-zone .companion-art')"), "companion disabled");
  await ui("document.getElementById('home-companion-toggle').click()");
  await waitFor(() => ui("Boolean(document.querySelector('.slate-widget-zone .companion-art'))"), "companion restored");
  await ui("document.getElementById('home-widget-background-toggle').click()");
  await waitFor(async () => (await state()).features.home.widgetBackground === true, "widget background saved");
  await ui("document.getElementById('home-widget-background-toggle').click()");
  console.info("PASS: backgroundless widgets, real keyboard + pointer move, persistence/reload, companion and background toggles.");

  const output = path.resolve(__dirname, "../../../generated-artifacts");
  fs.mkdirSync(output, { recursive: true });
  await action({ type: "home:reset" });
  await verifyGeometry("default composition");
  fs.writeFileSync(path.join(output, "slate-home-free.png"), (await win.capturePage()).toPNG());
  // Native file selection is stubbed only to provide a non-personal test fixture.
  const openDialog = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.resolve(__dirname, "../test/fixtures/test-background.webm")] });
  try { await ui("window.brujula.chooseBackgroundVideo()"); } finally { dialog.showOpenDialog = openDialog; }
  await waitFor(() => ui("document.getElementById('home-background-video').readyState >= 2"), "background video");
  async function verifyVideo(label) {
    const view = await ui(`(() => {
      const home=document.getElementById('home-screen'), v=document.getElementById('home-background-video');
      home.scrollTop=home.scrollHeight; const r=home.getBoundingClientRect(), b=v.getBoundingClientRect();
      return {home:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},video:{left:b.left,top:b.top,right:b.right,bottom:b.bottom},muted:v.muted,volume:v.volume};
    })()`);
    assert.equal(view.muted, true); assert.equal(view.volume, 0);
    assert.ok(view.video.left <= view.home.left+1 && view.video.top <= view.home.top+1 &&
      view.video.right >= view.home.right-1 && view.video.bottom >= view.home.bottom-1, `${label}: full video coverage ${JSON.stringify(view)}`);
  }
  await verifyVideo("wide scrolled home");
  win.setContentSize(760, 620);
  await ui("document.getElementById('customize-toggle').click()");
  await waitFor(() => ui("!document.getElementById('side-panel').hidden"), "narrow panel");
  await verifyGeometry("narrow with panel");
  await verifyVideo("narrow panel scrolled home");
  await ui("[...document.querySelectorAll('.slate-game-launch strong')].find(n=>n.textContent==='Parejas').click()");
  await waitFor(() => ui("document.querySelectorAll('.slate-memory-card').length===12"), "expanded memory game");
  await verifyGeometry("expanded memory in narrow panel");
  await ui("document.querySelector('.slate-memory-card').click()");
  await appearance({ density: "compacta" });
  await verifyGeometry("resized active memory game");
  assert.equal(await ui("document.querySelectorAll('.slate-memory-card.revealed').length"), 1, "game state retained on reflow");
  await ui("document.querySelector('.slate-game-top button').click()");
  await appearance({ density: "cómoda" });
  await ui("document.getElementById('panel-close').click()");
  await appearance({ tabStyle: "vertical" });
  await verifyGeometry("vertical tabs");
  await verifyVideo("vertical tabs scrolled home");
  await appearance({ tabStyle: "superior" });
  win.setContentSize(1320, 860);
  await ui("document.getElementById('home-screen').scrollTop=0");
  await verifyGeometry("restored wide");
  fs.writeFileSync(path.join(output, "slate-home-video-free.png"), (await win.capturePage()).toPNG());
  for (const [theme, expected] of [["claro", "rgb(244, 244, 246)"], ["oscuro", "rgb(32, 33, 36)"]]) {
    await appearance({ theme, backdrop: "papel" });
    await waitFor(() => ui(`getComputedStyle(document.getElementById('home-screen')).backgroundColor === ${JSON.stringify(expected)}`), `neutral ${theme}`);
    const material = await ui(`['.titlebar','.tabs-row','.toolbar'].map(s=>{const c=getComputedStyle(document.querySelector(s));return {background:c.backgroundColor,blur:c.backdropFilter,opacity:c.opacity};})`);
    for (const bar of material) {
      assert.ok(bar.background.includes("/") || bar.background.startsWith("rgba("), `translucent ${bar.background}`);
      assert.ok(bar.blur.includes("blur(24px)"));
      assert.equal(bar.opacity, "1", "text must remain fully opaque");
    }
    await delay(100);
    fs.writeFileSync(path.join(output, `slate-neutral-${theme}.png`), (await win.capturePage()).toPNG());
  }
  // The secret unlocks on exactly the third click, with a persistent, reversible effect.
  for (let i = 1; i <= 3; i++) {
    await ui("document.getElementById('brand-secret').click()");
    if (i < 3) assert.equal((await state()).features.home.companion.secretUnlocked, false);
  }
  await waitFor(async () => (await state()).features.home.companion.cosmic, "third-click secret unlocked");
  await waitFor(() => ui("document.querySelector('.slate-companion-mount').dataset.cosmic === 'true'"), "secret visible on character");
  await ui("document.querySelector('[data-companion-action=\"cosmic\"]').click()");
  await waitFor(async () => !(await state()).features.home.companion.cosmic, "secret effect can be disabled");
  await ui("document.querySelector('[data-companion-action=\"cosmic\"]').click()");
  await ui("document.querySelector('.companion-art').click()");
  assert.equal(await ui("document.querySelector('.companion-card').classList.contains('is-bopping')"), true);
  await delay(400);
  fs.writeFileSync(path.join(output, "slate-editable-companion.png"), (await win.capturePage()).toPNG());
  await ui("document.querySelector('[data-companion-action=\"float\"]').click()");
  const petView = await waitFor(() => win.contentView.children.find(v =>
    v.webContents?.getURL().endsWith("/companion.html")), "native floating companion");
  const petUi = code => petView.webContents.executeJavaScript(code);
  petView.webContents.on("console-message", (_event, level, message) => { if (level >= 2) errors.push(message); });
  await waitFor(() => petUi("Boolean(document.querySelector('.companion-art'))").catch(() => false), "floating character loaded");
  assert.deepEqual(Object.keys(await petUi("window.slatePet.getState()")).sort(), ["companion", "highContrast", "theme"]);
  assert.equal(await petUi("typeof window.brujula"), "undefined", "floating UI has no browser-data bridge");
  const initialRemark = await petUi("document.querySelector('.companion-remark').textContent");
  await petUi("document.querySelector('[data-companion-action=\"pause\"]').click()");
  await waitFor(async () => !(await state()).features.home.companion.followCursor, "pause native follow");
  const originId = (await state()).activeTabId;
  const newId = await ui("window.brujula.newTab()");
  // Use the normal UI navigation path; a failed network load still creates a real native tab.
  await ui("window.brujula.navigate('https://example.com/')");
  assert.equal(win.contentView.children.at(-1), petView, "companion remains above native web content");
  await ui(`window.brujula.activateTab(${JSON.stringify(originId)})`);
  assert.equal(win.contentView.children.at(-1), petView, "same character follows tab switching");
  await petUi("document.querySelector('[data-companion-action=\"pause\"]').click()");
  await waitFor(async () => (await state()).features.home.companion.followCursor, "resume follow");
  win.focus();
  const previousBounds = petView.getBounds();
  win.webContents.sendInputEvent({ type: "mouseMove", x: 80, y: 300 });
  await waitFor(() => {
    const b = petView.getBounds();
    return b.x !== previousBounds.x || b.y !== previousBounds.y;
  }, "native companion playfully follows cursor");
  const b = petView.getBounds();
  assert.ok(b.x >= 0 && b.y >= (await state()).layout.chromeHeight);
  assert.ok(b.x + b.width <= 1320 && b.y + b.height <= 860);
  assert.ok((await petUi("document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]').content")).includes("connect-src 'none'"));
  // A natural timer produces a spontaneous local remark within 33 seconds.
  await waitFor(async () => (await petUi("document.querySelector('.companion-remark').textContent")) !== initialRemark,
    "spontaneous local remark", 36000);
  fs.writeFileSync(path.join(output, "slate-portable-companion.png"), (await win.capturePage()).toPNG());
  await petUi("document.querySelector('[data-companion-action=\"home\"]').click()");
  await waitFor(() => !win.contentView.children.includes(petView), "return companion to home");
  assert.equal((await state()).features.home.companion.floating, false);
  const storedPet = JSON.parse(fs.readFileSync(path.join(profile, "features.json"), "utf8")).home.companion;
  assert.equal(storedPet.secretUnlocked, true);
  assert.equal(storedPet.cosmic, true);
  console.info("PASS: third-click secret, reversible Orbit effect, expressive pet, native overlay across tabs, pause/resume, cursor following, local remarks and restricted bridge.");
  assert.deepEqual(errors, [], "renderer errors");
  console.info("PASS: video always covers scrolled home, silent playback, narrow panel and sidebar layouts; no renderer errors.");
  console.info("PASS: neutral light/dark canvas, translucent chrome and blur without fading text; native macOS vibrancy still requires a Mac.");
  console.info("NOTE: native OS theme was simulated in Linux; real macOS follow-up remains necessary.");
  app.exit(0);
})().catch((error) => {
  console.error(error);
  app.exit(1);
});
