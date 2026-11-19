// Actual native right-click events and menu actions against local-only fixtures.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { app, BrowserWindow, Menu, session, nativeImage, clipboard } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const { version } = require("../src/legal-documents.cjs");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await pause(80);
  }
  throw new Error(`Timeout: ${label}`);
}

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "slate-context-menu-"));
  const directory = path.join(profile, "downloads");
  await fs.mkdir(directory);
  app.setPath("userData", profile);
  app.setPath("downloads", directory);
  await fs.writeFile(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||ads.test^").serialize());
  await fs.writeFile(path.join(profile, "legal-acceptance.json"), JSON.stringify({
    version, terms: true, privacy: true, adult: true, acceptedAt: new Date().toISOString(),
  }));
  // Build real Electron menus, but do not block automation in an OS popup.
  let menu;
  const build = Menu.buildFromTemplate.bind(Menu);
  Menu.buildFromTemplate = template => {
    const result = build(template);
    result.popup = () => { menu = result; };
    return result;
  };
  require("../src/main.cjs");
  await app.whenReady();
  const image = nativeImage.createFromBitmap(Buffer.from(Array(64 * 64).fill([215, 120, 50, 255]).flat()),
    { width: 64, height: 64 }).toPNG();
  await session.defaultSession.protocol.handle("https", request => {
    if (new URL(request.url).pathname.endsWith(".png")) {
      return new Response(image, { headers: { "content-type": "image/png" } });
    }
    return new Response(`<!doctype html><meta charset="utf-8"><title>Prueba de menú contextual</title>
      <style>body{background:#202124;color:#eee;font:18px system-ui}
      img{position:absolute;top:30px;left:30px;width:80px;height:80px}
      a{position:absolute;top:150px;left:30px;color:#90baff}
      input{position:absolute;top:210px;left:30px;width:240px;height:32px}
      p{position:absolute;top:270px;left:30px;margin:0}</style>
      <img id="picture" src="/picture.png" alt="Imagen de prueba">
      <a href="https://destination.test/">Enlace de prueba</a>
      <input id="edit" value="Cambiar texto"><p id="selection">Texto para buscar</p>`,
    { headers: { "content-type": "text/html" } });
  });
  const win = await waitFor(() => BrowserWindow.getAllWindows()[0], "window");
  const ui = code => win.webContents.executeJavaScript(code);
  await waitFor(() => ui("Boolean(document.documentElement.dataset.uiReady)"), "UI");
  await ui("window.brujula.navigate('https://context.test/')");
  const view = await waitFor(() => win.contentView.children.find(child =>
    child.webContents.getURL().startsWith("https://context.test")), "page view");
  const contents = view.webContents;
  await waitFor(() => contents.executeJavaScript("document.getElementById('picture')?.naturalWidth === 64"), "image load");
  async function rightClick(x, y) {
    menu = null;
    contents.focus();
    contents.sendInputEvent({ type: "mouseDown", button: "right", x, y, clickCount: 1 });
    contents.sendInputEvent({ type: "mouseUp", button: "right", x, y, clickCount: 1 });
    return waitFor(() => menu, "native context menu");
  }
  const click = (current, id) => {
    const item = current.getMenuItemById(id);
    assert.ok(item && item.enabled, `${id} available`);
    item.click();
  };
  let current = await rightClick(45, 45);
  assert.ok(current.getMenuItemById("image-new-tab"));
  click(current, "image-copy-url");
  assert.equal(clipboard.readText(), "https://context.test/picture.png");
  click(current, "image-copy");
  await waitFor(() => !clipboard.readImage().isEmpty(), "native image copy");
  click(current, "image-download");
  const completed = await waitFor(async () => (await ui("window.brujula.getState()"))
    .downloads.entries.find(entry => entry.state === "completed"), "image saved through Downloads");
  assert.equal(path.dirname(completed.path), directory);
  assert.deepEqual(await fs.readFile(completed.path), image);

  // Data and blob images are common in editors and modern image galleries.
  await contents.executeJavaScript(`document.getElementById('picture').src='data:image/png;base64,${image.toString("base64")}'`);
  await waitFor(() => contents.executeJavaScript("document.getElementById('picture').complete"), "data image");
  current = await rightClick(45, 45);
  click(current, "image-download");
  await waitFor(async () => (await ui("window.brujula.getState()")).downloads.entries.filter(e => e.state === "completed").length === 2, "data image download");
  await contents.executeJavaScript(`(async()=>{
    const bytes=await (await fetch('/picture.png')).blob();
    document.getElementById('picture').src=URL.createObjectURL(bytes);
  })()`);
  await waitFor(() => contents.executeJavaScript("document.getElementById('picture').complete"), "blob image");
  current = await rightClick(45, 45);
  click(current, "image-download");
  await waitFor(async () => (await ui("window.brujula.getState()")).downloads.entries.filter(e => e.state === "completed").length === 3, "blob image download");

  await contents.executeJavaScript("document.getElementById('edit').focus();document.getElementById('edit').select()");
  current = await rightClick(55, 225);
  assert.ok(current.getMenuItemById("edit-select-all"));
  clipboard.writeText("Texto pegado");
  click(current, "edit-paste");
  await waitFor(() => contents.executeJavaScript("document.getElementById('edit').value === 'Texto pegado'"), "native paste");
  await contents.executeJavaScript("document.activeElement.blur();window.getSelection().selectAllChildren(document.getElementById('selection'))");
  current = await rightClick(55, 280);
  assert.ok(current.getMenuItemById("selection-search"));
  click(current, "selection-copy");
  await waitFor(() => clipboard.readText() === "Texto para buscar", "native selection copy");

  current = await rightClick(430, 350);
  assert.ok(current.getMenuItemById("page-reload"));
  assert.ok(current.getMenuItemById("page-print"));
  click(current, "zoom-in");
  assert.ok(contents.getZoomFactor() > 1);
  click(current, "zoom-reset");
  assert.equal(contents.getZoomFactor(), 1);
  click(current, "inspect-element");
  await waitFor(() => contents.isDevToolsOpened(), "element inspector");
  contents.closeDevTools();

  // Use a fresh hit-test after closing DevTools; the original tab stays selected.
  current = await rightClick(55, 160);
  assert.ok(current.getMenuItemById("link-download"));
  click(current, "link-new-tab");
  await waitFor(async () => (await ui("window.brujula.getState()")).tabs.some(tab => tab.url === "https://destination.test/"), "link opens in a new tab");
  const output = path.resolve(__dirname, "../../../generated-artifacts/slate-menu-contextual.jpg");
  await pause(200);
  await fs.writeFile(output, (await win.webContents.capturePage()).toJPEG(85));
  console.log("SLATE CONTEXT MENU OK: actual right clicks, HTTPS/data/blob image downloads, download-center tracking, image/text copy, paste, zoom, DevTools and link opening.");
  app.quit();
})().catch(error => { console.error("SLATE CONTEXT MENU FAILED", error.stack || error); app.exit(1); });
