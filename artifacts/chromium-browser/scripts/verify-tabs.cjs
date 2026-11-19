// Native regression with a disposable profile; no user tabs, no real network.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, session, Menu } = require("electron");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  const end = Date.now() + 12000;
  while (Date.now() < end) { if (await check()) return; await delay(40); }
  throw new Error(`Timeout: ${label}`);
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slate-tabs-"));
  app.setPath("userData", profile);
  const { ElectronBlocker } = require("@ghostery/adblocker-electron");
  fs.writeFileSync(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||blocked.invalid^").serialize());
  fs.writeFileSync(path.join(profile, "history.json"), "[]");
  const docs = require("../src/legal-documents.cjs");
  fs.writeFileSync(path.join(profile, "legal-acceptance.json"), JSON.stringify({
    version: docs.version, terms: true, privacy: true, adult: true, acceptedAt: new Date().toISOString(),
  }));
  const { FeatureStore, DEFAULT_HOME } = require("../src/features.cjs");
  const features = new FeatureStore(profile);
  features.action({ type: "home:update", patch: { companion: { ...DEFAULT_HOME.companion, enabled: false } } });
  let menuEntries;
  let menuDone;
  const build = Menu.buildFromTemplate;
  // Inspect the native-menu contract without driving OS-specific menu events.
  Menu.buildFromTemplate = function (entries) {
    if (entries.length && entries.every(entry => entry.type === "radio")) {
      menuEntries = entries;
      return { popup: options => { menuDone = options.callback; } };
    }
    return build.call(this, entries);
  };
  require("../src/main.cjs");
  await app.whenReady();
  let win;
  await waitFor(() => (win = BrowserWindow.getAllWindows()[0]), "window");
  const ui = code => win.webContents.executeJavaScript(code);
  const errors = [];
  win.webContents.on("console-message", (_event, level, message) => { if (level === 3) errors.push(message); });
  await waitFor(() => ui("Boolean(window.SlateTabsUI && document.documentElement.dataset.uiReady)").catch(() => false), "UI");
  session.defaultSession.protocol.handle("https", () => new Response(
    '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Página de referencia</title><h1>Prueba local de pestañas</h1>',
    { headers: { "content-type": "text/html; charset=utf-8" } }));
  const snapshot = () => ui("window.brujula.getState()");
  const metrics = () => ui(`(() => {
    const list = document.getElementById("tabs-list");
    const bounds = list.getBoundingClientRect();
    return {
      width: list.clientWidth, scrollWidth: list.scrollWidth,
      visible: [...list.children].filter(item => !item.hidden).map(item => ({
        id: Number(item.dataset.tabId), left: item.getBoundingClientRect().left,
        right: item.getBoundingClientRect().right, width: item.getBoundingClientRect().width
      })),
      left: bounds.left, right: bounds.right,
      activeHidden: document.querySelector(".tab.active")?.hidden,
      count: document.getElementById("all-tabs-count").textContent,
      newButton: document.getElementById("new-tab").getBoundingClientRect().toJSON(),
      selector: document.getElementById("all-tabs").getBoundingClientRect().toJSON(),
      viewport: innerWidth
    };
  })()`);
  const checkFit = async () => {
    await delay(100);
    const m = await metrics();
    assert.ok(m.scrollWidth <= m.width + 1, "no horizontally overflowing tab strip");
    assert.equal(m.activeHidden, false);
    for (const item of m.visible) {
      assert.ok(item.left >= m.left - 1 && item.right <= m.right + 1, "each visible tab fits");
      assert.ok(item.width > 0);
    }
    assert.ok(m.newButton.left >= 0 && m.newButton.right <= m.viewport);
    assert.ok(m.selector.right <= m.viewport);
    return m;
  };
  const first = (await snapshot()).activeTabId;
  // Replit's small desktop may constrain a new window automatically; a Mac
  // can keep the full initial width, where all 14 tabs legitimately fit.
  // Establish the narrow-viewport precondition before asserting overflow.
  win.setContentSize(850, 650);
  await waitFor(() => ui("innerWidth <= 900"), "narrow test viewport");
  await ui("window.brujula.navigate('https://tabs.test/')");
  await waitFor(async () => (await snapshot()).tabs.every(tab => !tab.loading), "fixture page");
  for (let i = 0; i < 13; i++) await ui("window.brujula.newTab()");
  await waitFor(async () => (await snapshot()).tabs.length === 14, "many tabs");
  let m = await checkFit();
  assert.equal(m.count, "14");
  assert.ok(m.visible.length < 14);
  for (const width of [760, 1000, 1320]) {
    win.setContentSize(width, 720);
    await checkFit();
  }
  win.setContentSize(850, 650);
  await checkFit();
  fs.mkdirSync(path.resolve(__dirname, "../../../generated-artifacts"), { recursive: true });
  await delay(200);
  fs.writeFileSync(path.resolve(__dirname, "../../../generated-artifacts/slate-tabs-narrow.png"),
    (await win.webContents.capturePage()).toPNG());

  await ui("document.getElementById('all-tabs').click()");
  await waitFor(() => Boolean(menuEntries && menuDone), "native selector");
  assert.equal(menuEntries.length, 14);
  assert.equal(menuEntries.filter(entry => entry.checked).length, 1);
  menuEntries[0].click();
  menuDone();
  await waitFor(async () => (await snapshot()).activeTabId === first, "select hidden first tab");
  await checkFit();
  await ui("document.querySelector('.tab.active').focus(); document.querySelector('.tab.active').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}))");
  const last = (await snapshot()).tabs.at(-1).id;
  await waitFor(async () => (await snapshot()).activeTabId === last, "keyboard wraps to hidden last tab");
  await checkFit();
  await ui("document.querySelector('.tab.active .tab-close').click()");
  await waitFor(async () => (await snapshot()).tabs.length === 13, "close active tab only");
  await checkFit();

  await ui("window.brujula.setAppearance({tabStyle:'vertical'})");
  await delay(150);
  assert.equal((await metrics()).visible.length, 13, "vertical tabs remain available");
  await ui("window.brujula.setAppearance({tabStyle:'superior',density:'compacta',newTabPosition:'inicio'})");
  m = await checkFit();
  assert.ok(m.newButton.left < m.left);
  const personalIds = (await snapshot()).tabs.map(tab => tab.id);
  await ui("window.brujula.featureAction({type:'workspace:switch',id:'trabajo'})");
  await ui("window.brujula.newTab()");
  menuEntries = null;
  menuDone = null;
  await ui("document.getElementById('all-tabs').click()");
  await waitFor(() => Boolean(menuEntries && menuDone), "workspace selector");
  assert.equal(menuEntries.length, 2);
  menuDone();
  assert.ok((await snapshot()).tabs.every(tab => !personalIds.includes(tab.id)));
  await ui("window.brujula.featureAction({type:'workspace:switch',id:'personal'})");
  assert.deepEqual((await snapshot()).tabs.map(tab => tab.id), personalIds);
  await checkFit();
  assert.deepEqual(errors, []);
  console.info("PASS: narrow horizontal tabs without scrolling, active visibility, resize, native selector contract, keyboard, single close, vertical/compact modes, new-tab position and workspace isolation.");
  app.quit();
})().catch(error => { console.error(error); app.exit(1); });
