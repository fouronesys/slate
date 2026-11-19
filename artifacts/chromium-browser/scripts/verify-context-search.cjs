// Offline native integration check. No real third-party pages or user profiles.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, webContents, session, clipboard } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    if (await check()) return;
    await delay(60);
  }
  throw new Error(`Timeout: ${label}`);
}
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slate-context-"));
  app.setPath("userData", profile);
  fs.writeFileSync(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||blocked.invalid^").serialize());
  const { FeatureStore } = require("../src/features.cjs");
  const store = new FeatureStore(profile);
  store.action({ type: "home:update", patch: { companion: { ...store.data.home.companion, enabled: true, floating: true, followCursor: false } } });
  require("../src/main.cjs");
  await app.whenReady();
  let win, pet;
  await waitFor(() => (win = BrowserWindow.getAllWindows()[0]), "window");
  const ui = code => win.webContents.executeJavaScript(code);
  const state = () => ui("window.brujula.getState()");
  await waitFor(() => ui("Boolean(window.brujula && document.getElementById('experiences-toggle'))").catch(() => false), "browser ready");
  await waitFor(() => (pet = webContents.getAllWebContents().find(wc => wc.getURL().endsWith("/companion.html"))), "portable Miso");
  const petUI = code => pet.executeJavaScript(code);
  const petState = () => petUI("window.slatePet.getState()");
  const errors = [];
  for (const wc of [win.webContents, pet]) wc.on("console-message", (_event, level, message) => {
    if (level === 3) errors.push(message);
  });
  // Keep all navigation in this test offline while retaining realistic addresses.
  session.defaultSession.protocol.handle("https", () => new Response(
    "<!doctype html><meta charset=utf-8><title>Página de prueba local</title><h1>Prueba local sin acceso a Internet</h1>",
    { headers: { "content-type": "text/html" } }));
  const navigate = async url => {
    await ui(`window.brujula.navigate(${JSON.stringify(url)})`);
    await waitFor(async () => {
      const s = await state();
      const tab = s.tabs.find(t => t.id === s.activeTabId);
      return tab?.url === url && !tab.loading;
    }, `navigation: ${url}`);
    await waitFor(async () => Boolean((await petState()).suggestion), "contextual suggestion");
  };
  const clickSuggestion = async type => {
    await waitFor(() => petUI(`Boolean(document.querySelector('[data-suggestion-action="${type}"]'))`), "visible action button");
    await petUI(`document.querySelector('[data-suggestion-action="${type}"]').click()`);
    await waitFor(async () => !(await petState()).suggestion, "action completed and cooldown");
  };
  assert.equal((await state()).features.settings.searchEngine, "google");
  await ui(`document.getElementById("experiences-toggle").click(); Array.from(document.querySelectorAll(".experience-tabs button")).find(b=>b.textContent==="Privacidad").click()`);
  const select = `Array.from(document.querySelectorAll("#experience-settings select")).find(s=>s.querySelector('option[value="google"]'))`;
  await waitFor(() => ui(`Boolean(${select})`), "search settings selector");
  for (const engine of ["bing", "brave", "duckduckgo", "google"]) {
    await ui(`(() => {const s=${select};s.value=${JSON.stringify(engine)};s.dispatchEvent(new Event("change",{bubbles:true}));})()`);
    await waitFor(async () => (await state()).features.settings.searchEngine === engine, "provider persisted");
    await ui(`window.brujula.navigate("gatos bonitos")`);
    await waitFor(async () => {
      const s = await state();
      return !s.tabs.find(t => t.id === s.activeTabId)?.loading;
    }, "search navigation");
    const s = await state(), url = new URL(s.tabs.find(t => t.id === s.activeTabId).url);
    const hosts = { google: "www.google.com", bing: "www.bing.com", brave: "search.brave.com", duckduckgo: "duckduckgo.com" };
    assert.equal(url.hostname, hosts[engine]);
    assert.equal(url.searchParams.get("q"), "gatos bonitos");
  }
  await ui("window.closePanel()");
  await navigate("https://www.youtube.com/watch?v=offline1");
  assert.equal((await petState()).suggestion.key, "youtube-video");
  const speech = await petUI(`(() => { const e=document.querySelector(".companion-speech"),b=e.querySelector('[data-suggestion-action="accept"]'); return {label:b.textContent, height:e.getBoundingClientRect().bottom,viewport:innerHeight}; })()`);
  assert.equal(speech.label, "Guardar marcador");
  assert.ok(speech.height <= speech.viewport, "speech and action stay inside the native view");
  const output = path.resolve(__dirname, "../../../generated-artifacts");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "slate-miso-sugerencia.png"), (await pet.capturePage()).toPNG());
  const stale = (await petState()).suggestion;
  await clickSuggestion("accept");
  assert.ok((await state()).bookmarks.some(b => b.url.endsWith("offline1")));
  await navigate("https://www.youtube.com/watch?v=offline2");
  const rejected = await petUI(`window.slatePet.action({type:"accept",id:${JSON.stringify(stale.id)}}).then(()=>false,()=>true)`);
  assert.equal(rejected, true, "stale actions cannot affect another page");
  await ui("window.brujula.addBookmark()");
  await waitFor(async () => (await petState()).suggestion?.key === "youtube-focus", "saved video suggests focus");
  await clickSuggestion("accept");
  assert.equal((await state()).features.settings.youtubeFocus, true);
  await navigate("https://open.spotify.com/track/offline");
  assert.equal((await petState()).suggestion.key, "spotify-track");
  await clickSuggestion("accept");
  assert.ok((await state()).features.items.some(item => item.url === "https://open.spotify.com/track/offline"));
  await navigate("https://example.com/guide#chapter");
  assert.equal((await petState()).suggestion.action, "copy-link");
  await clickSuggestion("accept");
  assert.equal(clipboard.readText(), "https://example.com/guide#chapter");
  await navigate("https://example.com/dismiss");
  const before = (await state()).bookmarks.length;
  await clickSuggestion("dismiss");
  assert.equal((await state()).bookmarks.length, before);
  await ui(`window.brujula.featureAction({type:"settings:update",patch:{companionSuggestions:false}})`);
  await ui(`window.brujula.navigate("https://www.youtube.com/watch?v=disabled")`);
  await delay(200);
  assert.equal((await petState()).suggestion, null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, "features.json"))).settings.searchEngine, "google");
  assert.deepEqual(errors, [], "no renderer errors");
  console.info("PASS: selector and all four search routes, real Miso buttons, bookmark, focus, collection, clipboard, dismiss, opt-out and stale-action rejection. All remote pages were offline fixtures.");
  app.quit();
})().catch(error => { console.error(error); app.exit(1); });
