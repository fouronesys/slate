// Disposable native fixture; no third-party site, account or favicon provider.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { app, BrowserWindow, session, nativeImage } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const { version } = require("../src/legal-documents.cjs");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await pause(100);
  }
  throw new Error(`Timeout: ${label}`);
}
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "slate-favicons-"));
  app.setPath("userData", profile);
  await fs.writeFile(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||ads.test^").serialize());
  await fs.writeFile(path.join(profile, "legal-acceptance.json"), JSON.stringify({
    version, terms: true, privacy: true, adult: true, acceptedAt: new Date().toISOString(),
  }));
  require("../src/main.cjs");
  await app.whenReady();
  const png = color => nativeImage.createFromBitmap(
    Buffer.from(Array(16 * 16).fill(color).flat()), { width: 16, height: 16 }).toPNG();
  const red = png([35, 55, 225, 255]);
  const blue = png([220, 115, 35, 255]);
  await session.defaultSession.protocol.handle("https", request => {
    const url = new URL(request.url);
    if (url.pathname.endsWith(".png")) return new Response(
      url.pathname.includes("blue") ? blue : red,
      { headers: { "content-type": "image/png" } });
    const missing = url.hostname === "no-icon.test";
    return new Response(`<!doctype html><meta charset="utf-8">
      <title>${missing ? "Sin favicon" : "Icono local"}</title>
      ${missing ? "" : '<link id="icon" rel="icon" type="image/png" href="/red.png">'}
      <body style="font:20px system-ui;padding:40px;background:#202124;color:white">
      Página local de comprobación de favicons</body>`,
    { headers: { "content-type": "text/html" } });
  });
  const win = await waitFor(() => BrowserWindow.getAllWindows()[0], "window");
  const ui = code => win.webContents.executeJavaScript(code);
  await waitFor(() => ui("Boolean(window.brujula)"), "bridge");
  await ui("window.brujula.navigate('https://icon.test')");
  await waitFor(() => ui("document.querySelector('.site-favicon img')?.complete"), "first site icon");
  const first = await ui("window.brujula.getState()");
  assert.equal(first.tabs[0].favicon, `data:image/png;base64,${red.toString("base64")}`);
  const page = win.contentView.children.find(view => view.webContents.getURL().startsWith("https://icon.test"));
  await page.webContents.executeJavaScript("document.getElementById('icon').href='/blue.png'");
  await waitFor(async () => (await ui("window.brujula.getState()")).tabs[0].favicon ===
    `data:image/png;base64,${blue.toString("base64")}`, "dynamic favicon");
  await ui("window.brujula.runCommand('new-tab');");
  await ui("window.brujula.navigate('https://second-icon.test')");
  await waitFor(() => ui("document.querySelectorAll('.site-favicon img').length===2 && [...document.querySelectorAll('.site-favicon img')].every(img=>img.complete && img.naturalWidth===16)"), "two independent site icons");
  await ui("window.brujula.runCommand('new-tab')");
  await waitFor(() => ui("document.querySelector('.tab.active .tab-favicon img')?.getAttribute('src') === './assets/slate.svg'"), "new tab logo");
  await ui("window.brujula.navigate('https://no-icon.test')");
  await waitFor(() => ui("document.querySelector('.tab.active .generic-favicon') !== null"), "missing icon fallback");
  await ui("document.documentElement.dataset.theme='oscuro'");
  assert.equal(await ui("getComputedStyle(document.querySelector('.site-favicon img')).filter"), "none");
  await pause(200);
  const output = path.resolve(__dirname, "../../../generated-artifacts/slate-favicons.jpg");
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, (await win.webContents.capturePage()).toJPEG(85));
  console.log("SLATE FAVICONS OK: session fetch, native favicon event, live icon changes, independent tabs, home logo, missing icon fallback and unaltered dark-theme colors.");
  app.quit();
})().catch(error => { console.error(error); app.exit(1); });
