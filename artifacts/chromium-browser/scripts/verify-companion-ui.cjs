// Focused follow-up for native companion rendering and keyboard drag handles.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, nativeTheme } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(70);
  }
  throw new Error(`Timeout: ${label}`);
}
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slate-companion-ui-"));
  fs.writeFileSync(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||blocked.invalid^").serialize());
  app.setPath("userData", profile);
  nativeTheme.themeSource = "dark";
  require("../src/main.cjs");
  await app.whenReady();
  const win = await waitFor(() => BrowserWindow.getAllWindows()[0], "window");
  win.setContentSize(1320, 860);
  const ui = code => win.webContents.executeJavaScript(code);
  const state = () => ui("window.brujula.getState()");
  await waitFor(() => ui("Boolean(document.querySelector('.companion-art'))").catch(() => false), "home character");
  const output = path.resolve(__dirname, "../../../generated-artifacts");
  fs.mkdirSync(output, { recursive: true });
  await ui("document.getElementById('home-widget-edit-toggle').click()");
  await delay(200);
  const before = await ui("document.getElementById('slate-widget-clock').offsetLeft");
  await ui("document.querySelector('#slate-widget-clock .slate-widget-drag-handle').focus()");
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Left" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Left" });
  await waitFor(async () => (await state()).features.home.positions.clock, "handle keyboard save");
  assert.notEqual(await ui("document.getElementById('slate-widget-clock').offsetLeft"), before);
  await delay(200);
  fs.writeFileSync(path.join(output, "slate-widgets-edit-mode.png"), (await win.capturePage()).toPNG());
  await ui("document.getElementById('home-widget-edit-toggle').click()");
  await ui("document.getElementById('home-widget-background-toggle').click()");
  await delay(200);
  assert.equal(await ui("getComputedStyle(document.getElementById('slate-widget-companion')).backgroundColor"), "rgba(0, 0, 0, 0)",
    "Miso stays transparent when other widget backgrounds are enabled");
  assert.equal(await ui("getComputedStyle(document.querySelector('.companion-card')).backgroundColor"), "rgba(0, 0, 0, 0)");
  await ui("document.getElementById('home-widget-background-toggle').click()");
  await delay(200);
  fs.writeFileSync(path.join(output, "slate-miso-anime-home.png"), (await win.capturePage()).toPNG());
  await ui("document.querySelector('[data-companion-action=\"float\"]').click()");
  const view = await waitFor(() => win.contentView.children.find(child => child.webContents?.getURL().endsWith("/companion.html")), "native companion view");
  const petUi = code => view.webContents.executeJavaScript(code);
  await waitFor(() => petUi("Boolean(document.querySelector('.companion-name'))").catch(() => false), "native pet");
  const saved = (await state()).features.home.companion;
  await ui(`window.brujula.featureAction(${JSON.stringify({ type: "home:update", patch: { companion: { ...saved, name: "Miso viajero" } } })})`);
  await waitFor(() => petUi("document.querySelector('.companion-name').textContent === 'Miso viajero'"), "async state bridge updates character");
  await ui(`window.brujula.featureAction(${JSON.stringify({ type: "home:update", patch: { companion: saved } })})`);
  await waitFor(() => petUi("document.querySelector('.companion-name').textContent === 'Miso'"), "restore name before screenshots");
  win.focus();
  win.webContents.sendInputEvent({ type: "mouseMove", x: 90, y: 300 });
  const startPosition = view.getBounds();
  await waitFor(() => {
    const next = view.getBounds();
    return next.x !== startPosition.x || next.y !== startPosition.y;
  }, "autonomous roaming without moving the cursor");
  await waitFor(() => petUi("document.getElementById('companion-root').dataset.moving === 'true'"), "walking animation signal");
  const figureSize = await petUi("document.querySelector('.cat-figure').getBoundingClientRect().height");
  assert.ok(figureSize <= 100, `Miso stays petite: ${figureSize}`);
  await petUi("document.querySelector('[data-companion-action=\"pause\"]').click()");
  await waitFor(() => petUi("document.getElementById('companion-root').dataset.moving === 'false'"), "pause stops gait");
  const paused = view.getBounds();
  await delay(350);
  assert.deepEqual(view.getBounds(), paused, "pause stops native movement");
  await petUi("document.querySelector('[data-companion-action=\"pause\"]').click()");
  await waitFor(() => petUi("document.getElementById('companion-root').dataset.moving === 'true'"), "resume autonomous walks");
  await petUi("window.slatePet.setReducedMotion(true)");
  await waitFor(() => petUi("document.getElementById('companion-root').dataset.moving === 'false'"), "reduced motion stops native walking");
  const reduced = view.getBounds();
  await delay(250);
  assert.deepEqual(view.getBounds(), reduced);
  await petUi("window.slatePet.setReducedMotion(false)");
  await petUi("document.querySelector('[data-companion-action=\"pause\"]').click()");
  await waitFor(() => petUi("document.getElementById('companion-root').dataset.moving === 'false'"), "pause for screenshots");
  for (const theme of ["claro", "oscuro"]) {
    await ui(`window.brujula.setAppearance({theme:${JSON.stringify(theme)}})`);
    await waitFor(() => petUi(`document.body.dataset.theme === ${JSON.stringify(theme)}`), "floating pet theme");
    await delay(200);
    const visual = await petUi(`(() => {
      const card=document.querySelector('.companion-card'), speech=document.querySelector('.companion-speech');
      const c=getComputedStyle(card), s=speech.getBoundingClientRect();
      const controls=document.querySelector('.companion-controls').getBoundingClientRect();
      const art=document.querySelector('.companion-art').getBoundingClientRect();
      return {background:c.backgroundColor,image:c.backgroundImage,shadow:c.boxShadow,blur:c.backdropFilter,
        body:getComputedStyle(document.body).backgroundColor,
        speech:{x:s.x,y:s.y,right:s.right,bottom:s.bottom},
        art:{x:art.x,y:art.y,right:art.right,bottom:art.bottom},
        controls:{x:controls.x,y:controls.y,right:controls.right,bottom:controls.bottom}};
    })()`);
    assert.equal(visual.background, "rgba(0, 0, 0, 0)");
    assert.equal(visual.body, "rgba(0, 0, 0, 0)");
    assert.equal(visual.image, "none");
    assert.equal(visual.shadow, "none");
    assert.equal(visual.blur, "none");
    const kitten = await petUi(`({
      fur: getComputedStyle(document.querySelector(".cat-figure .companion-body > path")).fill,
      eye: getComputedStyle(document.querySelector(".cat-figure .eye ellipse")).fill,
      width: document.querySelector(".cat-figure").getBoundingClientRect().width
    })`);
    assert.equal(kitten.fur, "rgb(21, 21, 25)", "black kitten keeps its coat in both themes");
    assert.equal(kitten.eye, "rgb(255, 253, 248)", "large eyes stay white");
    assert.ok(kitten.width <= 84, "narrow native view does not enlarge Miso");
    for (const rect of [visual.speech, visual.art, visual.controls]) {
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.right <= 250 && rect.bottom <= 240, `native UI stays inside view: ${JSON.stringify(rect)}`);
    }
    assert.ok(visual.speech.bottom <= visual.controls.y || visual.speech.x >= visual.controls.right ||
      visual.speech.right <= visual.controls.x, "floating bubble does not cover controls");
    const image = await view.webContents.capturePage();
    assert.equal(image.toBitmap()[3], 0, "native screenshot preserves a transparent corner");
    fs.writeFileSync(path.join(output, `slate-miso-anime-${theme}.png`), image.toPNG());
  }
  const original = await ui("getComputedStyle(document.body).fontFamily");
  assert.ok(original.includes("DM Sans"), "shared pet stylesheet does not replace the browser font");
  await petUi("document.querySelector('[data-companion-action=\"hide\"]').click()");
  await waitFor(() => !win.contentView.children.includes(view), "close pet");
  assert.equal((await state()).features.home.companion.enabled, false);
  console.info("PASS: petite character, autonomous walks without mouse movement, pause/resume, reduced motion, transparent themes, bounds, state and close.");
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
