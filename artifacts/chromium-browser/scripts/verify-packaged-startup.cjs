"use strict";
// Real Electron startup with the package metadata removed by electron-builder.
// Disposable profile only; never load a personal profile or an external page.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { app, BrowserWindow } = require("electron");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slate-packaged-startup-"));
app.setPath("userData", profile);
const pkg = require("../package.json");
const installed = structuredClone(pkg);
for (const key of ["build", "devDependencies", "scripts"]) delete installed[key];
require.cache[require.resolve("../package.json")].exports = installed;
let finished = false;
const deadline = setTimeout(() => {
  console.error("FAIL: el navegador no inició con los metadatos de producción.");
  app.exit(1);
}, 25000);
app.on("before-quit", () => {
  if (!finished) { console.error("FAIL: cierre inesperado durante el arranque."); app.exit(1); }
});
(async () => {
  require("../src/main.cjs");
  await app.whenReady();
  while (!finished) {
    const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
    if (win && !win.webContents.isLoading()) {
      const ready = await win.webContents.executeJavaScript("Boolean(window.brujula)");
      if (ready) {
        const state = await win.webContents.executeJavaScript("window.brujula.getState()");
        assert.ok(state, "El navegador debe responder tras cargar la interfaz.");
        finished = true;
      }
    }
    if (!finished) await new Promise(resolve => setTimeout(resolve, 100));
  }
  clearTimeout(deadline);
  console.info("PASS: proceso principal, ventana, interfaz y puente IPC iniciaron sin package.json.build.");
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
app.on("quit", () => fs.rmSync(profile, { recursive: true, force: true }));
