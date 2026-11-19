// Native offline regression check, always using a disposable profile.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, session } = require("electron");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  const end = Date.now() + 10000;
  while (Date.now() < end) { if (await check()) return; await delay(50); }
  throw new Error(`Timeout: ${label}`);
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slate-address-"));
  app.setPath("userData", profile);
  const { ElectronBlocker } = require("@ghostery/adblocker-electron");
  fs.writeFileSync(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||blocked.invalid^").serialize());
  fs.writeFileSync(path.join(profile, "history.json"), JSON.stringify([
    { url: "https://example.test/guide", title: "Página frecuente", visitCount: 9, visitedAt: "2026-11-18" },
    { url: "https://example.test/help", title: "Ayuda", visitCount: 2, visitedAt: "2026-11-18" },
  ]));
  fs.writeFileSync(path.join(profile, "bookmarks.json"), JSON.stringify([
    { url: "https://saved.test/", title: "Marcador local" },
  ]));
  const legal = require("../src/legal-documents.cjs");
  require("../src/main.cjs");
  await app.whenReady();
  let win;
  await waitFor(() => (win = BrowserWindow.getAllWindows()[0]), "window");
  const ui = code => win.webContents.executeJavaScript(code);
  const errors = [];
  win.webContents.on("console-message", (_event, level, message) => { if (level === 3) errors.push(message); });
  await waitFor(() => ui("Boolean(window.SlateAddressUI && document.documentElement.dataset.uiReady)").catch(() => false), "UI");
  assert.equal((await ui("window.brujula.getState()")).legal.accepted, false);
  await ui("window.brujula.cancelSearchSuggestions()");
  await ui(`window.brujula.acceptLegal(${JSON.stringify({ version: legal.version, terms: true, privacy: true, adult: true })})`);
  await waitFor(() => ui('document.getElementById("legal-gate").hidden && !document.getElementById("address").closest("[inert]")'),
    "legal gate closed before typing");
  const requests = [];
  const suggestionRequests = [];
  const suggestionContext = session.fromPartition("slate-search-suggestions", { cache: false });
  suggestionContext.protocol.handle("https", async request => {
    suggestionRequests.push({ url: request.url, cookie: request.headers.get("cookie"), referer: request.headers.get("referer") });
    const url = new URL(request.url);
    const text = url.searchParams.get("q") || url.searchParams.get("qry");
    if (text === "slow") await delay(600);
    if (text === "error") return new Response(null, { status: 429 });
    return new Response(JSON.stringify([text, [`${text} music`, `${text} videos`]]),
      { headers: { "content-type": "application/json" } });
  });
  session.defaultSession.protocol.handle("https", request => {
    requests.push(request.url);
    return new Response('<!doctype html><link rel="icon" href="data:,"><title>Página local</title><h1>Contenido de prueba sin red</h1>',
      { headers: { "content-type": "text/html" } });
  });
  const type = async (text, inputType = "insertText") => {
    win.webContents.focus();
    await ui(`(() => { const a = document.getElementById("address"); a.focus(); a.value = ${JSON.stringify(text)};
      a.setSelectionRange(a.value.length, a.value.length);
      a.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: ${JSON.stringify(inputType)} })); })()`);
  };
  const key = key => ui(`document.getElementById("address").dispatchEvent(new KeyboardEvent("keydown", {key:${JSON.stringify(key)},bubbles:true,cancelable:true}))`);
  const value = () => ui(`(() => { const a=document.getElementById("address"); return {value:a.value,start:a.selectionStart,end:a.selectionEnd,expanded:a.getAttribute("aria-expanded")}; })()`);

  await type("exa");
  assert.deepEqual(await value(), { value: "example.test/guide", start: 3, end: 18, expanded: "true" });
  assert.equal(await ui('document.querySelectorAll("#address-suggestions [role=option]").length'), 2);
  assert.equal(requests.length, 0, "typing never makes a network request");
  await key("Escape");
  assert.equal((await value()).value, "exa");
  assert.equal((await value()).expanded, "false");
  await type("ex", "deleteContentBackward");
  assert.equal((await value()).value, "ex", "deletion does not restore an unwanted suffix");
  await key("ArrowDown");
  await key("ArrowDown");
  assert.equal((await value()).value, "https://example.test/help");
  await key("Enter");
  await waitFor(async () => (await ui("window.brujula.getState()")).tabs.some(tab => tab.url === "https://example.test/help" && !tab.loading), "selection navigation");
  const view = win.contentView.children.find(child => child.webContents?.getURL().startsWith("https://example.test"));
  assert.ok(view);
  const initialY = view.getBounds().y;
  const beforeTyping = requests.length;
  await type("exa");
  await waitFor(() => view.getBounds().y > initialY, "native content below popup");
  const rect = await ui("document.getElementById('address-suggestions').getBoundingClientRect().toJSON()");
  assert.ok(rect.bottom <= view.getBounds().y, "native page does not cover suggestion list");
  assert.equal(requests.length, beforeTyping);
  await delay(250);
  assert.equal((await value()).expanded, "true");
  fs.mkdirSync(path.resolve(__dirname, "../../../generated-artifacts"), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, "../../../generated-artifacts/slate-address-suggestions.png"),
    (await win.webContents.capturePage()).toPNG());
  await key("Escape");
  await waitFor(() => view.getBounds().y === initialY, "native content restored");
  await type("saved");
  await ui('document.querySelector("#address-suggestions [role=option]").click()');
  await waitFor(async () => (await ui("window.brujula.getState()")).tabs.some(tab => tab.url === "https://saved.test/" && !tab.loading), "mouse bookmark navigation");
  await type("exa");
  await ui("window.brujula.clearHistory()");
  await waitFor(() => ui('document.getElementById("address-suggestions").hidden'), "deleted history disappears");
  await type("you");
  assert.deepEqual(await value(), { value: "youtube.com/", start: 3, end: 12, expanded: "true" });
  assert.match(await ui('document.getElementById("address-suggestions").textContent'), /Sitio conocido/);
  await delay(400);
  assert.equal(suggestionRequests.length, 0, "online suggestions are opt-in");

  await ui("window.brujula.setBrowserPreferences({onlineSuggestions:true})");
  await type("you");
  await waitFor(() => ui('document.getElementById("address-suggestions").textContent.includes("you music")'), "online search rows");
  assert.equal(suggestionRequests.length, 1, "one debounced request");
  assert.equal(new URL(suggestionRequests[0].url).hostname, "suggestqueries.google.com");
  assert.equal(suggestionRequests[0].cookie, null);
  assert.equal(suggestionRequests[0].referer, null);
  await delay(250);
  fs.writeFileSync(path.resolve(__dirname, "../../../generated-artifacts/slate-search-suggestions.png"),
    (await win.webContents.capturePage()).toPNG());

  await ui(`document.querySelectorAll("#address-suggestions [role=option]")[1].click()`);
  await waitFor(async () => (await ui("window.brujula.getState()")).tabs.some(tab =>
    tab.url.startsWith("https://www.google.com/search?q=you%20music") && !tab.loading), "explicit search navigation");

  const beforeRapid = suggestionRequests.length;
  await type("yan");
  await delay(30);
  await type("yand");
  await delay(30);
  await type("yandex");
  await waitFor(() => suggestionRequests.length > beforeRapid, "debounced new input");
  assert.equal(suggestionRequests.length, beforeRapid + 1);
  await type("https://private.test/?token=secret");
  await delay(400);
  assert.equal(suggestionRequests.length, beforeRapid + 1, "do not send complete/private addresses");

  await type("slow");
  await waitFor(() => suggestionRequests.length > beforeRapid + 1, "slow request");
  await type("music");
  await waitFor(() => ui('document.getElementById("address-suggestions").textContent.includes("music videos")'), "latest response");
  await delay(650);
  assert.doesNotMatch(await ui('document.getElementById("address-suggestions").textContent'), /slow music/);
  await type("error");
  await waitFor(() => ui('document.getElementById("address-suggestions").textContent.includes("no disponibles")'), "visible failure");

  await type("escape");
  await key("Escape");
  const beforeEscape = suggestionRequests.length;
  await delay(400);
  assert.equal(suggestionRequests.length, beforeEscape, "Escape cancels debounce");

  await ui("window.brujula.featureAction({type:'settings:update',patch:{searchEngine:'duckduckgo'}})");
  await type("moon");
  await waitFor(() => suggestionRequests.some(request => new URL(request.url).hostname === "duckduckgo.com"), "chosen provider");
  await key("Escape");
  await ui(`document.getElementById("online-suggestions").click()`);
  assert.equal((await ui("window.brujula.getState()")).browserPreferences.onlineSuggestions, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, "browser-preferences.json"))).onlineSuggestions, false);
  const beforeDisabled = suggestionRequests.length;
  await type("space");
  await delay(400);
  assert.equal(suggestionRequests.length, beforeDisabled);

  await ui("window.brujula.setBrowserPreferences({onlineSuggestions:true})");
  await key("Escape");
  await ui("window.brujula.featureAction({type:'tab:ephemeral'})");
  await type("you");
  const beforePrivate = suggestionRequests.length;
  await delay(450);
  assert.equal(suggestionRequests.length, beforePrivate, "never request in ephemeral tabs");
  const privateState = await ui("window.brujula.getState()");
  assert.equal(privateState.tabs.find(tab => tab.id === privateState.activeTabId).ephemeral, true);
  assert.equal((await ui(`window.brujula.searchSuggestions({query:'youtube',tabId:${privateState.activeTabId}})`)).status, "disabled");
  await key("Escape");
  assert.deepEqual(errors, []);
  console.info("PASS: local/known sites, URL completion, keyboard/mouse, popup geometry, opt-in/debounce, online search, selected provider, no cookie/referrer, URL filtering, stale/cancelled responses, visible errors, persisted switch, ephemeral isolation, no renderer errors.");
  app.quit();
})().catch(error => { console.error(error); app.exit(1); });
