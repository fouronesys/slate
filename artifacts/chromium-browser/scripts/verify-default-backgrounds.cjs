"use strict";
// Disposable profile, actual local media decoding, no external uploads.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, nativeTheme, dialog } = require("electron");
const { prepareBackgrounds } = require("./prepare-backgrounds.cjs");
const media = prepareBackgrounds();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slate-wallpaper-ui-"));
app.setPath("userData", profile);
const docs = require("../src/legal-documents.cjs");
fs.writeFileSync(path.join(profile, "legal-acceptance.json"), JSON.stringify({
  version: docs.version, terms: true, privacy: true, adult: true, acceptedAt: new Date().toISOString(),
}));
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
fs.writeFileSync(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||blocked.invalid^").serialize());
const { FeatureStore, DEFAULT_HOME } = require("../src/features.cjs");
new FeatureStore(profile).action({ type: "home:update", patch: { companion: { ...DEFAULT_HOME.companion, enabled: false } } });
require("../src/main.cjs");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await check()) return; await delay(80); }
  throw new Error(`Tiempo agotado: ${label}`);
}
(async () => {
  await app.whenReady();
  await waitFor(() => BrowserWindow.getAllWindows().length, "ventana");
  const win = BrowserWindow.getAllWindows()[0];
  win.setContentSize(1320, 860);
  const errors = [];
  win.webContents.on("console-message", (_e, level, message) => { if (level >= 2) errors.push(message); });
  const ui = code => win.webContents.executeJavaScript(code);
  await waitFor(() => ui("Boolean(document.documentElement.dataset.uiReady)").catch(() => false), "interfaz");
  const appearance = patch => ui(`window.brujula.setAppearance(${JSON.stringify(patch)})`);
  const state = () => ui("window.brujula.getState()");
  const playing = expected => waitFor(() => ui(`(() => { const v=document.getElementById('home-background-video'); return !v.hidden && !v.paused && v.readyState>=2 && v.currentSrc.includes(${JSON.stringify(expected)}) && v.videoWidth===1920 && v.videoHeight===1080 && v.muted && v.volume===0; })()`), expected);
  const out = path.resolve(__dirname, "../../../generated-artifacts/slate-backgrounds");
  assert.equal((await state()).appearance.backdrop, "slate");
  await appearance({ theme: "claro" });
  await playing("slate-light-1080.mp4");
  assert.equal(await ui("getComputedStyle(document.getElementById('home-screen')).backgroundColor"), "rgba(0, 0, 0, 0)");
  await delay(200);
  fs.writeFileSync(path.join(out, "slate-light-in-app.png"), (await win.webContents.capturePage()).toPNG());
  await appearance({ theme: "oscuro" });
  await playing("slate-dark-1080.mp4");
  await delay(200);
  fs.writeFileSync(path.join(out, "slate-dark-in-app.png"), (await win.webContents.capturePage()).toPNG());
  await appearance({ theme: "sistema" });
  // Simulate the OS signal, not themeSource: Slate correctly owns themeSource.
  const themeDescriptor = Object.getOwnPropertyDescriptor(nativeTheme, "shouldUseDarkColors");
  try {
    Object.defineProperty(nativeTheme, "shouldUseDarkColors", { configurable: true, value: false });
    nativeTheme.emit("updated");
    await playing("slate-light-1080.mp4");
    Object.defineProperty(nativeTheme, "shouldUseDarkColors", { configurable: true, value: true });
    nativeTheme.emit("updated");
    await playing("slate-dark-1080.mp4");
  } finally {
    if (themeDescriptor) Object.defineProperty(nativeTheme, "shouldUseDarkColors", themeDescriptor);
    else delete nativeTheme.shouldUseDarkColors;
  }
  await appearance({ theme: "oscuro" });
  const time = await ui("document.getElementById('home-background-video').currentTime");
  await delay(300);
  assert.notEqual(await ui("document.getElementById('home-background-video').currentTime"), time);
  win.webContents.debugger.attach("1.3");
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await waitFor(() => ui("(() => { const v=document.getElementById('home-background-video'); return v.paused && !v.hasAttribute('src') && v.poster.endsWith('slate-dark-1080.jpg') && !v.hidden; })()"), "imagen fija sin decodificación");
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  win.webContents.debugger.detach();
  await playing("slate-dark-1080.mp4");
  await appearance({ contrast: "alto" });
  await waitFor(() => ui("document.getElementById('home-background-video').hidden && document.getElementById('home-background-video').paused"), "alto contraste");
  await appearance({ contrast: "normal" });
  const originalDialog = dialog.showOpenDialog;
  try {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(media, "slate-light-1080.mp4")] });
    await ui("window.brujula.chooseBackgroundVideo()");
  } finally { dialog.showOpenDialog = originalDialog; }
  const imported = (await state()).backgroundVideoFile;
  assert.ok(imported);
  await appearance({ theme: "claro" });
  assert.equal((await state()).appearance.backdrop, "video");
  await playing(imported);
  await appearance({ theme: "oscuro" });
  await playing(imported);
  await appearance({ backdrop: "slate" });
  await playing("slate-dark-1080.mp4");
  assert.equal((await state()).backgroundVideos.length, 1);
  assert.equal((await state()).backgroundVideoFile, imported);
  await appearance({ backdrop: "papel" });
  await waitFor(() => ui("document.getElementById('home-background-video').hidden && document.getElementById('home-background-video').paused"), "fondo desactivado");
  assert.ok(await ui("getComputedStyle(document.getElementById('home-background-scrim')).display==='none'"));
  assert.deepEqual(errors, []);
  console.info("PASS: 1080p decoding, muted playback, theme switching, simulated system signal, static reduced-motion poster, high contrast, saved personal video preserved, disable and no scrim.");
  console.info("NOT TESTED: signed macOS package and real Mac GPU/energy use.");
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
