// Exercise opted-in cleanup via the real application quit lifecycle.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, session, dialog } = require("electron");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slate-exit-"));
for (const suffix of ["", "-trabajo", "-compras"]) {
  fs.writeFileSync(path.join(profile, `history${suffix}.json`), JSON.stringify([{ title: "Private visit", url: "https://example.com/" }]));
}
fs.writeFileSync(path.join(profile, "bookmarks.json"), JSON.stringify([{ title: "Keep", url: "https://example.com/" }]));
app.setPath("userData", profile);
require("../src/main.cjs");
async function run() {
  await app.whenReady();
  const until = Date.now() + 10000;
  let win;
  while (Date.now() < until) {
    win = BrowserWindow.getAllWindows()[0];
    if (win && await win.webContents.executeJavaScript("Boolean(window.brujula)").catch(() => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(win, "native window ready");
  const sessions = [session.defaultSession,
    session.fromPartition("persist:slate-space-trabajo"), session.fromPartition("persist:slate-space-compras")];
  const cleared = new Set();
  for (const browserSession of sessions) {
    await browserSession.cookies.set({ url: "https://example.com", name: "exit-secret", value: "erase", expirationDate: Date.now() / 1000 + 3600 });
    const clear = browserSession.clearStorageData.bind(browserSession);
    browserSession.clearStorageData = async (...args) => {
      await clear(...args);
      assert.equal((await browserSession.cookies.get({})).length, 0);
      cleared.add(browserSession);
    };
  }
  dialog.showMessageBox = async () => ({ response: 1 });
  await win.webContents.executeJavaScript("window.brujula.featureAction({type:'settings:update',patch:{clearOnExit:true}})");
  app.once("will-quit", () => {
    try {
      assert.equal(cleared.size, 3, "cleanup completed before actual exit");
      for (const suffix of ["", "-trabajo", "-compras"]) {
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile, `history${suffix}.json`), "utf8")), []);
      }
      assert.equal(JSON.parse(fs.readFileSync(path.join(profile, "bookmarks.json"), "utf8")).length, 1);
      const features = JSON.parse(fs.readFileSync(path.join(profile, "features.json"), "utf8"));
      assert.equal(features.collections.length, 1);
      console.info("PASS: actual application quit clears cookies/history in all spaces (including unopened ones), preserves bookmarks and collections.");
    } catch (error) { console.error(error); app.exit(1); }
  });
  app.quit();
}
run().catch((error) => { console.error(error); app.exit(1); });
