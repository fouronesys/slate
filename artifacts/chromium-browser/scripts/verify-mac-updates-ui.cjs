"use strict";
// Disposable Linux Electron smoke test. Does not simulate a native Mac install.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { app, BrowserWindow, dialog } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await delay(75);
  }
  throw new Error("La interfaz de actualización no respondió.");
}
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "slate-update-ui-"));
  app.setPath("userData", profile);
  await fs.writeFile(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||ads.test^").serialize());
  const messages = [], errors = [];
  dialog.showMessageBox = async (...args) => { messages.push(args.at(-1)); return { response: 0 }; };
  app.on("web-contents-created", (_event, contents) => {
    contents.on("console-message", (_event, details) => {
      if (details.level === "error" && !/ERR_|favicon|Content Security Policy|Widevine/i.test(details.message)) errors.push(details.message);
    });
  });
  require("../src/main.cjs");
  await app.whenReady();
  const win = await waitFor(() => BrowserWindow.getAllWindows()[0]);
  const ui = code => win.webContents.executeJavaScript(code);
  await waitFor(() => ui("Boolean(window.brujula && window.SlateSettings && document.documentElement.dataset.uiReady)"));
  // The new privileged command is covered by the existing first-run IPC gate.
  await assert.rejects(ui("window.brujula.macUpdates()"), /primer inicio/);
  await ui("window.brujula.acceptLegal({version:window.SlateLegalDocuments.version,terms:true,privacy:true,adult:true})");
  await ui("document.getElementById('settings-toggle').click();window.SlateSettings.select('general')");
  await waitFor(() => ui("!document.getElementById('side-panel').hidden"));
  assert.equal(await ui("document.getElementById('mac-updates-section').hidden"), true);
  assert.equal((await ui("window.brujula.getState()")).macUpdatesAvailable, false);
  // Only render the otherwise hidden Mac-only controls for a visual screenshot.
  // This does not bypass the main-process platform/MAS/packaged gates.
  // Native startup notifications can re-render the real Linux availability at
  // any time. Show this visual fixture with a local style, not a fake app state.
  await ui("document.getElementById('mac-updates-section').style.setProperty('display','block','important')");
  assert.equal(await ui("getComputedStyle(document.getElementById('mac-updates-section')).display"), "block");
  await ui("document.getElementById('mac-updates').scrollIntoView({block:'center'})");
  const output = path.resolve(__dirname, "../../../generated-artifacts");
  await fs.mkdir(output, { recursive: true });
  await delay(200);
  await fs.writeFile(path.join(output, "slate-mac-updates-controls.jpg"), (await win.webContents.capturePage()).toJPEG(88));
  await ui("document.getElementById('mac-updates').click()");
  await waitFor(() => messages.length);
  assert.match(messages[0].message, /exclusivo/);
  await waitFor(() => ui("!document.getElementById('mac-updates').disabled"));
  assert.equal(await ui("document.getElementById('mac-updates').textContent"), "Buscar actualización o recuperar versión");
  assert.deepEqual(errors, []);
  console.info("Interfaz real Electron: IPC protegido por primer inicio, controles exclusivos de Mac, clic conectado, bloqueo de instalación en Linux y ausencia de errores comprobados. Captura visual únicamente; no valida Mac.");
  app.on("will-quit", () => { require("node:fs").rmSync(profile, { recursive: true, force: true }); });
  app.quit();
})().catch(error => { console.error(error); app.exit(1); });
