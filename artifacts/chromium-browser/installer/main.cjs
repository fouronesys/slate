"use strict";
const { app, BrowserWindow, ipcMain, dialog, session } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Installer, exists } = require("./engine.cjs");
const { createNativeOps } = require("./native.cjs");

// Separate identity and data directory: never start browser code or touch its profile.
app.setName("Slate Privacy Installer");
app.setPath("userData", path.join(app.getPath("appData"), "Slate Privacy Installer"));
let window, engine, operation;
let quitting = false;
const localPage = path.join(__dirname, "guide.html");
const pageURL = pathToFileURL(localPage).href;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { window?.show(); window?.focus(); });
  app.whenReady().then(async () => {
    // The installer does not play protected media or need CDM downloads.
    if (require("electron").components) {
      const components = require("electron").components;
      components.updatesEnabled = false;
      components.whenReady([components.WIDEVINE_CDM_ID]).catch(() => {});
    }
    const ops = createNativeOps();
    engine = new Installer({
      source: path.join(process.resourcesPath, "payload", "Slate Privacy.app"),
      ops,
      onState: (state) => { if (window && !window.isDestroyed()) window.webContents.send("installer:state", state); },
    });
    const isolated = session.fromPartition("slate-installer-local");
    isolated.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith("file:") && !details.url.startsWith("data:") }));
    window = new BrowserWindow({
      width: 920, height: 760, minWidth: 640, minHeight: 650,
      title: "Instalar Slate Privacy", backgroundColor: "#f6f5ef",
      webPreferences: { preload: path.join(__dirname, "preload.cjs"), session: isolated, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
    });
    window.setMenu(null);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    const trusted = (event) => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === pageURL;
    const handle = (name, callback) => ipcMain.handle(`installer:${name}`, (event, ...args) => {
      if (!trusted(event) || args.length) throw new Error("Solicitud no permitida.");
      return callback();
    });
    handle("getState", () => engine.state);
    handle("install", async () => {
      if (operation || engine.busy || engine.state.phase === "done") return;
      // Lock before the asynchronous native confirmation, not after it.
      operation = (async () => {
        let replace = false;
        if (await exists(engine.target)) {
          const result = await dialog.showMessageBox(window, {
            type: "warning", title: "Reemplazar Slate Privacy",
            message: "Ya existe Slate Privacy en Aplicaciones.",
            detail: "¿Quieres reemplazar solo la aplicación? No se modificarán tu perfil ni tus datos de navegación. Cierra Slate antes de continuar.",
            buttons: ["Cancelar", "Reemplazar aplicación"], defaultId: 0, cancelId: 0,
          });
          if (result.response !== 1 || quitting || window.isDestroyed()) return;
          replace = true;
        }
        await engine.run({ replace });
      })();
      try { await operation; } finally { operation = null; }
    });
    handle("cancel", () => engine.cancel());
    handle("open", async () => {
      if (engine.state.phase !== "done" || engine.busy) throw new Error("La copia todavía no está verificada.");
      await engine.validateBundle(engine.target);
      await ops.open(engine.target);
    });
    handle("close", () => window.close());
    window.on("close", (event) => {
      if (!engine.busy || quitting) { quitting = true; return; }
      event.preventDefault();
      if (engine.state.phase === "committing") return;
      engine.cancel();
      Promise.resolve(operation).finally(() => { quitting = true; app.quit(); });
    });
    app.on("before-quit", (event) => {
      if (engine.busy && !quitting) { event.preventDefault(); window.close(); }
    });
    await window.loadFile(localPage);
  }).catch((error) => { dialog.showErrorBox("No se pudo abrir el instalador", error.message); app.quit(); });
  app.on("window-all-closed", () => app.quit());
}
