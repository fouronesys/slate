// Exercise the real browser with synthetic video, no YouTube/account required.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, webContents } = require("electron");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timeout: ${label}`);
}

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "brujula-media-"));
  app.setPath("userData", profile);
  require("../src/main.cjs");
  await app.whenReady();
  const win = await waitFor(() => BrowserWindow.getAllWindows()[0], "browser window");
  await waitFor(() => win.webContents.executeJavaScript("Boolean(window.brujula)").catch(() => false), "trusted bridge");
  const ui = (code) => win.webContents.executeJavaScript(code);
  await waitFor(async () => {
    const state = await ui("window.brujula.getState()");
    if (state.privacy.status === "error") throw new Error(state.privacy.lastError);
    return state.privacy.status === "ready";
  }, "filters", 90000);
  await ui("window.brujula.navigate('https://example.com')");
  const remote = await waitFor(() => webContents.getAllWebContents().find((wc) =>
    wc !== win.webContents && wc.getURL().startsWith("https://example.com")), "remote tab");
  await waitFor(() => !remote.isLoading(), "fixture origin");
  await remote.executeJavaScript(`(async () => {
    document.body.innerHTML = '<video id="fixture" controls playsinline style="width:90vw;height:75vh"></video>';
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 360;
    const context = canvas.getContext('2d');
    window.fixtureTimer = setInterval(() => {
      context.fillStyle = '#284563'; context.fillRect(0, 0, 640, 360);
      context.fillStyle = '#ffffff'; context.fillText('Vídeo de prueba ' + Date.now(), 40, 60);
    }, 50);
    const video = document.getElementById('fixture');
    video.srcObject = canvas.captureStream(20);
    video.muted = true;
    video.disablePictureInPicture = true;
    await video.play();
  })()`, true);
  await ui("window.brujula.setAppearance({density:'compacta',tabStyle:'vertical'})");
  await ui("window.brujula.setPanelOpen(true)");
  const normal = win.contentView.children[0].getBounds();
  assert.deepEqual(normal, (await ui("window.brujula.getState()")).layout.bounds);
  await remote.executeJavaScript("document.getElementById('fixture').requestFullscreen()", true);
  await waitFor(async () => Boolean(await remote.executeJavaScript("document.fullscreenElement")), "HTML fullscreen");
  await waitFor(() => {
    const bounds = win.contentView.children[0].getBounds();
    const [width, height] = win.getContentSize();
    return bounds.x === 0 && bounds.y === 0 && bounds.width === width && bounds.height === height;
  }, "video fills full window, ignoring toolbar and panel");
  const output = path.resolve(__dirname, "../../../generated-artifacts");
  await fs.mkdir(output, { recursive: true });
  // BrowserWindow.capturePage captures the trusted UI, not its native child
  // WebContentsView. Capture the video contents to inspect the fullscreen view.
  await fs.writeFile(path.join(output, "brujula-video-fullscreen.png"), (await remote.capturePage()).toPNG());
  await remote.executeJavaScript("document.exitFullscreen()");
  await waitFor(() => win.contentView.children[0].getBounds().y === normal.y, "toolbar restored");
  assert.deepEqual(win.contentView.children[0].getBounds(), (await ui("window.brujula.getState()")).layout.bounds);
  console.info("PASS: HTML fullscreen fills the window; leaving restores toolbar and open panel.");
  const shortcut = () => {
    for (const type of ["keyDown", "keyUp"]) {
      remote.sendInputEvent({ type, keyCode: "P", modifiers: ["control", "shift"] });
    }
  };
  shortcut();
  await waitFor(() => remote.executeJavaScript("Boolean(document.pictureInPictureElement)"), "native PiP via browser shortcut");
  shortcut();
  await waitFor(async () => !await remote.executeJavaScript("Boolean(document.pictureInPictureElement)"), "exit PiP via shortcut");
  await waitFor(() => remote.executeJavaScript("document.getElementById('fixture').disablePictureInPicture"), "site attribute restored");
  assert.equal(await remote.executeJavaScript("typeof window.brujula"), "undefined");
  assert.equal(await remote.executeJavaScript("navigator.permissions.query({name:'geolocation'}).then(p=>p.state)"), "denied");
  console.info("PASS: browser shortcut enters/exits native PiP; remote bridge absent; geolocation remains denied.");
  await fs.rm(profile, { recursive: true, force: true });
  app.exit(0);
})().catch((error) => {
  console.error(error);
  app.exit(1);
});
