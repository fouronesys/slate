"use strict";
// Local Electron smoke checks, not a macOS installation or browser E2E test.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, session, nativeTheme } = require("electron");
const { buildGuide } = require("./build-install-guide.cjs");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = path.resolve(__dirname, "../../../generated-artifacts");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slate-installer-ui-"));
app.setPath("userData", profile);
const { output: guidePath, html } = buildGuide();
let win;
const errors = [], requests = [];
const ui = code => win.webContents.executeJavaScript(code);
async function capture(name) {
  await delay(180);
  fs.writeFileSync(path.join(output, `slate-installer-${name}.png`), (await win.capturePage()).toPNG());
}
async function run() {
  await app.whenReady();
  fs.mkdirSync(output, { recursive: true });
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    if (/^https?:|^wss?:/.test(details.url)) requests.push(details.url);
    cb({ cancel: /^https?:|^wss?:/.test(details.url) });
  });
  win = new BrowserWindow({ width: 920, height: 800, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.webContents.on("console-message", (_event, level, message) => {
    // Electron supports the structured event form as well as the old arguments.
    if (_event.level === "error") errors.push(_event.message);
    else if (level >= 3) errors.push(message);
  });
  await win.loadFile(guidePath);
  assert.equal(await ui("document.getElementById('modeLabel').textContent"), "Demostración");
  assert.equal(await ui("document.querySelector('.cat-figure').getBoundingClientRect().height > 0"), true);
  assert.equal(await ui("getComputedStyle(document.querySelector('.cat-figure path')).fill"), "rgb(21, 21, 25)");
  await capture("welcome");
  // Real keyboard input, rather than only programmatic .click().
  win.focus();
  await ui("document.getElementById('nextButton').focus(); document.addEventListener('keydown',e=>window.__lastKey=e.key);document.addEventListener('click',e=>window.__lastClick=e.target.id)");
  await delay(100);
  assert.equal(await ui("document.activeElement.id"), "nextButton");
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
  win.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
  await delay(100);
  assert.equal(await ui("document.getElementById('scene').dataset.step"), "move", JSON.stringify({
    input: await ui("({key:window.__lastKey,click:window.__lastClick})"), errors,
  }));
  await ui("document.getElementById('pauseButton').click()");
  assert.equal(await ui("document.getElementById('pauseButton').getAttribute('aria-pressed')"), "true");
  assert.equal(await ui("document.getAnimations().filter(a=>a.effect?.target?.closest?.('.miso-wrap, .slate-wrap, .arrival-mark, .scene-wash, .destination')).every(animation => animation.playState === 'paused' || animation.playState === 'finished')"), true);
  await capture("paused");
  await ui("document.getElementById('pauseButton').click()");
  await delay(1100);
  const geometry = await ui(`(() => {
    const app = document.querySelector('.slate-wrap').getBoundingClientRect();
    const folder = document.querySelector('.destination').getBoundingClientRect();
    return {distance:Math.abs(app.x + app.width/2 - folder.x - folder.width/2)};
  })()`);
  assert.ok(geometry.distance < 30, `Icon must arrive at Applications: ${geometry.distance}`);
  await capture("journey");
  await ui("document.getElementById('nextButton').click()");
  assert.equal(await ui("document.getElementById('confirmation').getAttribute('aria-hidden')"), "false");
  await capture("illustrative-completion");
  await ui("document.getElementById('repeatButton').click()");
  assert.equal(await ui("document.getElementById('scene').dataset.step"), "welcome");
  nativeTheme.themeSource = "light";
  // System motion preference via Chromium emulation isn't available here;
  // exercise the equivalent manual control and inspect its actual CSS result.
  await ui("document.getElementById('reducedMotionToggle').click()");
  assert.equal(await ui("document.body.classList.contains('reduce-motion')"), true);
  assert.equal(await ui("parseFloat(getComputedStyle(document.getElementById('misoWrap')).animationDuration) < .001"), true);
  await capture("reduced-motion");
  win.setSize(402, 850);
  await delay(180);
  assert.equal(await ui("document.documentElement.scrollWidth <= innerWidth"), true);
  await capture("narrow");

  // Isolated mock bridge for presentation only: no filesystem installation.
  // It lets the same UI prove that events, not animation timers, drive states.
  const mock = `window.slateInstaller = {
    getState: async () => ({phase: window.__phase || 'idle', message:'Estado de prueba local; no instala.'}),
    onState: cb => {window.__state = cb; return () => {};},
    install: async () => {window.__installs = (window.__installs || 0) + 1;},
    cancel: async () => {window.__cancels = (window.__cancels || 0) + 1;},
    open: async () => {window.__opens = (window.__opens || 0) + 1;},
    close: async () => {}
  };`;
  const realPreview = path.join(output, "installer-ui-fixture.html");
  // Update the CSP hash rather than weakening the production CSP.
  const crypto = require("node:crypto");
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const replacement = `${mock}\n${script}`;
  const oldHash = crypto.createHash("sha256").update(script).digest("base64");
  const newHash = crypto.createHash("sha256").update(replacement).digest("base64");
  fs.writeFileSync(realPreview, html.replace(oldHash, newHash).replace(script, () => replacement));
  win.setSize(920, 900);
  await win.loadFile(realPreview);
  await delay(100);
  for (const phase of ["preparing", "copying", "verifying", "committing", "done", "cancelled", "error"]) {
    await ui(`window.__phase=${JSON.stringify(phase)};window.__state({phase:${JSON.stringify(phase)},message:'Prueba de estado ${phase}: no se ha instalado ninguna aplicación.'})`);
    assert.equal(await ui("document.getElementById('scene').dataset.phase"), phase);
    assert.equal(await ui("!document.getElementById('openButton').hidden"), phase === "done");
    assert.equal(await ui("!document.getElementById('installButton').hidden"), ["cancelled", "error"].includes(phase));
    if (phase === "copying") {
      await ui("document.getElementById('pauseButton').click();document.getElementById('cancelButton').click()");
      await delay(30);
      assert.equal(await ui("window.__cancels"), 1, "Animation pause must not block native actions");
    }
    if (["copying", "done", "error"].includes(phase)) await capture(`mock-${phase}`);
  }
  assert.deepEqual(requests, [], "No network requests allowed");
  assert.deepEqual(errors, [], "No UI/CSP errors");
  console.info("UI local: bienvenida, recorrido, pausa, repetición, teclado, movimiento reducido, ancho estrecho y estados nativos simulados comprobados. Cero solicitudes de red.");
  console.info("Solo validación de interfaz en Linux. NO demuestra instalación, firma, montaje, permisos ni salida nativa en macOS.");
}
run().then(() => { win?.destroy(); app.quit(); }).catch(error => { console.error(error); process.exitCode = 1; app.exit(1); });
app.on("will-quit", () => { fs.rmSync(profile, { recursive: true, force: true }); });
