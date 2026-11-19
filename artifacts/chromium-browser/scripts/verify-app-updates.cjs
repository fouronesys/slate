// Disposable native UI check. Never downloads an update or invokes an installer.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slate-update-ui-"));
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
(async () => {
  await app.whenReady();
  let win;
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    win = BrowserWindow.getAllWindows()[0];
    if (win && await win.webContents.executeJavaScript("Boolean(window.SlateUpdates && document.documentElement.dataset.uiReady)").catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  assert.ok(win);
  const ui = code => win.webContents.executeJavaScript(code);
  const errors = [];
  win.webContents.on("console-message", (_event, level, message) => { if (level === 3) errors.push(message); });
  await ui("document.getElementById('settings-toggle').click(); window.SlateSettings.open('general')");
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(await ui("document.getElementById('side-panel').hidden"), false);
  assert.equal(await ui("document.getElementById('general-settings').hidden"), false);
  assert.equal(await ui("document.getElementById('check-app-update').disabled"), true);
  assert.equal(await ui("document.getElementById('automatic-updates').checked"), false);
  // Keep the real context-isolated bridge; stub only the native update backend.
  ipcMain.removeHandler("browser:app-update");
  ipcMain.handle("browser:app-update", (_event, action) => ({
    supported: true, version: "0.1.1", nextVersion: "0.2.0",
    status: action === "check" ? "available" : "downloaded", percent: 100,
  }));
  for (const status of ["idle", "checking", "available", "downloading", "downloaded", "error"]) {
    await ui(`window.SlateUpdates.render({appUpdates:{supported:true,version:'0.1.1',status:${JSON.stringify(status)},percent:65,nextVersion:'0.2.0'},browserPreferences:{automaticUpdates:true}})`);
    assert.equal(await ui("document.getElementById('download-app-update').hidden"), status !== "available");
    assert.equal(await ui("document.getElementById('install-app-update').hidden"), status !== "downloaded");
    assert.equal(await ui("document.getElementById('update-progress').hidden"), status !== "downloading");
  }
  await ui("window.SlateUpdates.render({appUpdates:{supported:true,version:'0.1.1',status:'idle'}});document.getElementById('check-app-update').click()");
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(await ui("document.getElementById('download-app-update').hidden"), false);
  await ui("document.getElementById('download-app-update').click()");
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(await ui("document.getElementById('install-app-update').hidden"), false);
  assert.deepEqual(errors, []);
  await ui("document.getElementById('slate-version').scrollIntoView({block:'start'})");
  const out = path.resolve(__dirname, "../../../generated-artifacts");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "slate-updates.png"), (await win.webContents.capturePage()).toPNG());
  console.info("PASS: update controls, status, progress, manual download, opt-in default and development guard. Native signed update: NOT TESTED.");
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
