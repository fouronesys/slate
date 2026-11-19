// Focused native Electron pass, always using disposable user data.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");
async function waitFor(check, label, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out: ${label}`);
}
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slate-feature-ui-"));
  // Reuse only a valid public filter cache from previous disposable test runs.
  const caches = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("brujula-privacy-"))
    .map((name) => path.join(os.tmpdir(), name, "adblock-engine.bin")).filter((file) => fs.existsSync(file));
  if (caches.length) fs.copyFileSync(caches[caches.length - 1], path.join(profile, "adblock-engine.bin"));
  fs.writeFileSync(path.join(profile, "bookmarks.json"), JSON.stringify([{ title: "Example", url: "https://example.com/" }]));
  app.setPath("userData", profile);
  require("../src/main.cjs");
  await app.whenReady();
  const win = await waitFor(() => BrowserWindow.getAllWindows()[0], "window");
  const rendererErrors = [];
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) { console.error("Renderer:", message); rendererErrors.push(message); }
  });
  await waitFor(() => win.webContents.executeJavaScript("Boolean(window.brujula && window.SlateFeatures)").catch(() => false), "UI bridge");
  const ui = (code) => win.webContents.executeJavaScript(code);
  await waitFor(async () => (await ui("window.brujula.getState()")).privacy.status === "ready", "filters", 90000);
  const output = path.resolve(__dirname, "../../../generated-artifacts");
  fs.mkdirSync(output, { recursive: true });
  await require("./verify-features.cjs")({ win, ui, profile, output, waitFor });
  if (rendererErrors.length) throw new Error(`Renderer errors: ${rendererErrors.join("; ")}`);
  console.info("PASS: no renderer exceptions across changed flows.");
  fs.rmSync(profile, { recursive: true, force: true });
  app.exit(0);
})().catch((error) => { console.error(error); app.exit(1); });
