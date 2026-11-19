"use strict";
// Exercises the actual sandboxed preload/main boundary. Linux only, so Install
// can prove its platform guard without ever writing to /Applications.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");
const { buildGuide } = require("./build-install-guide.cjs");
if (process.platform !== "linux") throw new Error("Esta comprobación de seguridad solo se ejecuta en Linux; usa la matriz manual en Mac.");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "slate-installer-shell-"));
const stage = path.join(scratch, "installer");
fs.mkdirSync(stage);
app.setPath("appData", scratch);
for (const name of ["main.cjs", "preload.cjs", "engine.cjs", "native.cjs"]) fs.copyFileSync(path.resolve(__dirname, "../installer", name), path.join(stage, name));
fs.copyFileSync(buildGuide().output, path.join(stage, "guide.html"));
const errors = [];
require(path.join(stage, "main.cjs"));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(callback) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const result = await callback().catch(() => false);
    if (result) return result;
    await delay(50);
  }
  throw new Error("Se agotó la espera de la interfaz aislada.");
}
app.whenReady().then(async () => {
  const win = await waitFor(async () => BrowserWindow.getAllWindows()[0]);
  win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  const ui = code => win.webContents.executeJavaScript(code);
  await waitFor(() => ui("Boolean(window.slateInstaller && document.getElementById('modeLabel')?.textContent === 'Instalador')"));
  assert.equal(await ui("typeof require"), "undefined");
  assert.equal(await ui("typeof process"), "undefined");
  assert.equal((await ui("window.slateInstaller.getState()")).phase, "idle");
  await ui("document.getElementById('installButton').click()");
  await waitFor(async () => (await ui("window.slateInstaller.getState()")).phase === "error");
  assert.match(await ui("document.getElementById('statusMessage').textContent"), /solo.*macOS/);
  assert.equal(await ui("document.getElementById('openButton').hidden"), true);
  assert.equal(await ui("window.slateInstaller.open().then(()=>false,()=>true)"), true);
  assert.equal(await ui("window.open('https://example.invalid') === null"), true);
  assert.deepEqual(errors, []);
  console.info("Interfaz real aislada: puente local, ausencia de Node en renderizador, bloqueo de apertura prematura y rechazo de instalación en Linux comprobados. No se instaló ninguna aplicación.");
  win.close();
}).catch(error => { console.error(error); app.exit(1); });
app.on("will-quit", () => { fs.rmSync(scratch, { recursive: true, force: true }); });
