// Runs the actual desktop app against an isolated, disposable profile. No
// debugging port is exposed and no real user data is read or deleted.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { app, BrowserWindow, session, dialog, webContents } = require("electron");
const { ElectronBlocker, Request } = require("@ghostery/adblocker-electron");

async function waitFor(check, description, timeout = 90000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timeout: ${description}`);
}

(async () => {
  // Set startup flags from main before app.ready can fire.
  const profile = fsSync.mkdtempSync(path.join(os.tmpdir(), "brujula-privacy-"));
  const storedAppearance = {
    ...require("../src/appearance.cjs").DEFAULT_APPEARANCE,
    theme: "oscuro", accent: "personalizado", customAccent: "#a66e5b",
    backdrop: "niebla", density: "compacta", tabStyle: "vertical",
    contrast: "alto", logoPosition: "centro", newTabPosition: "inicio", bookmarksBar: true,
  };
  fsSync.writeFileSync(path.join(profile, "appearance.json"), JSON.stringify(storedAppearance));
  app.setPath("userData", profile);
  require("../src/main.cjs");
  await app.whenReady();
  const win = await waitFor(() => BrowserWindow.getAllWindows()[0], "browser window");
  await waitFor(
    async () => win.webContents.executeJavaScript("Boolean(window.brujula)").catch(() => false),
    "trusted browser bridge",
  );
  const ui = (code) => win.webContents.executeJavaScript(code);
  await waitFor(async () => ui("document.documentElement.dataset.theme === 'oscuro'"), "restored appearance");
  assert.equal(app.getPath("userData"), profile, "rebranding must not move the existing profile");
  assert.equal(win.getTitle(), "Slate Privacy");
  assert.deepEqual((await ui("window.brujula.getState()")).appearance, storedAppearance);
  await ui("window.brujula.resetAppearance()");
  await waitFor(async () => ui("document.documentElement.dataset.theme === 'claro'"), "appearance reset");
  let state = await waitFor(async () => {
    const snapshot = await ui("window.brujula.getState()");
    if (snapshot.privacy.status === "error") throw new Error(snapshot.privacy.lastError);
    return snapshot.privacy.status === "ready" && !snapshot.privacy.updating && snapshot;
  }, "filter engine and cache");
  assert.equal(state.privacy.rememberHistory, false);
  assert.equal(state.history.length, 0);
  const output = path.resolve(__dirname, "../../../generated-artifacts");
  await fs.mkdir(output, { recursive: true });
  const testVideo = path.join(output, "test-background.webm");
  await fs.copyFile(path.join(__dirname, "../test/fixtures/test-background.webm"), testVideo);

  const engine = ElectronBlocker.deserialize(await fs.readFile(path.join(profile, "adblock-engine.bin")));
  const matched = (url, type = "script", sourceUrl = "https://example.com") =>
    engine.match(Request.fromRawDetails({ url, type, sourceUrl })).match;
  assert.equal(matched("https://googleads.g.doubleclick.net/pagead/ads?test=1"), true);
  assert.equal(matched("https://www.google-analytics.com/analytics.js"), true);
  assert.equal(matched("https://www.youtube.com/watch?v=M7lc1UVf-VE", "main_frame"), false);
  const cosmetics = engine.getCosmeticsFilters({
    url: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
    domain: "youtube.com", hostname: "www.youtube.com",
    getBaseRules: true, getInjectionRules: true, getRulesFromHostname: true,
    getExtendedRules: false, getRulesFromDOM: false,
  });
  assert.ok(cosmetics.scripts.length > 0, "YouTube requires active scriptlets, not just network filters");
  console.info(`PASS: actual lists, ad/tracker matches, ${cosmetics.scripts.length} YouTube scriptlet bundles.`);

  const failed = await session.defaultSession.fetch("https://googleads.g.doubleclick.net/pagead/ads?test=1")
    .then(() => false, (error) => String(error).includes("ERR_BLOCKED_BY_CLIENT"));
  assert.equal(failed, true, "actual Electron session must cancel matching requests");

  await ui("window.brujula.navigate('https://example.com')");
  const remote = await waitFor(
    () => webContents.getAllWebContents().find((contents) => contents.id !== win.webContents.id &&
      contents.getURL().startsWith("https://example.com")),
    "remote web view",
  );
  await waitFor(() => !remote.isLoading(), "example page load");
  assert.equal(await remote.executeJavaScript("typeof window.brujula"), "undefined");
  assert.equal(remote.getWebRTCIPHandlingPolicy(), "disable_non_proxied_udp");
  assert.equal(remote.getLastWebPreferences().nodeIntegration, false);
  assert.equal(remote.getLastWebPreferences().sandbox, true);
  const result = await remote.executeJavaScript(
    "fetch('https://googleads.g.doubleclick.net/pagead/ads?test=2', { mode: 'no-cors' }).then(() => 'allowed', () => 'blocked')",
  );
  assert.equal(result, "blocked");
  state = await ui("window.brujula.getState()");
  assert.ok(state.privacy.blocked > 0);
  assert.equal(state.history.length, 0);
  await ui("window.brujula.addBookmark()");
  // Exercise actual UI controls, persistence and native page bounds together.
  await ui("document.getElementById('customize-toggle').click()");
  await waitFor(async () => ui("document.getElementById('appearance-settings').hidden === false"), "customization panel");
  for (const [key, value] of Object.entries(storedAppearance)) {
    if (key === "customAccent") continue;
    const buttonValue = typeof value === "boolean" ? String(value) : value;
    await ui(`document.querySelector('[data-preference="${key}"][data-value="${buttonValue}"]').click()`);
    await waitFor(async () => (await ui("window.brujula.getState()")).appearance[key] === value, `saved ${key}`);
  }
  await ui(`(() => { const input = document.getElementById('custom-accent'); input.value = '${storedAppearance.customAccent}'; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(async () => (await ui("window.brujula.getState()")).appearance.customAccent === storedAppearance.customAccent, "saved custom accent");
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(profile, "appearance.json"), "utf8")), storedAppearance);
  state = await ui("window.brujula.getState()");
  assert.deepEqual(win.contentView.children[0].getBounds(), state.layout.bounds);
  const toolbarBottom = await ui("Math.round(document.querySelector('.toolbar').getBoundingClientRect().bottom)");
  const bookmarksBarBottom = await ui("Math.round(document.querySelector('.bookmarks-bar').getBoundingClientRect().bottom)");
  const railRight = await ui("Math.round(document.querySelector('.tabs-row').getBoundingClientRect().right)");
  assert.equal(toolbarBottom + state.layout.bookmarksBarHeight, state.layout.bounds.y);
  assert.equal(bookmarksBarBottom, state.layout.bounds.y);
  assert.equal(railRight, state.layout.bounds.x);
  assert.equal(await ui("document.documentElement.dataset.contrast"), "alto");
  assert.equal(await ui("document.documentElement.dataset.logoPosition"), "centro");
  assert.equal(await ui("document.getElementById('bookmarks-bar').hidden"), false);
  await assert.rejects(() => ui("window.brujula.setAppearance({theme:'unsafe'})"));
  assert.equal((await ui("window.brujula.getState()")).privacy.siteEnabled, true);
  assert.equal(await remote.executeJavaScript("typeof window.brujula"), "undefined");
  // Exercise native resizing with page, vertical tabs and an open panel.
  win.setContentSize(800, 600);
  await waitFor(async () => (await ui("window.brujula.getState()")).layout.bounds.width === 260, "narrow native bounds");
  assert.deepEqual(win.contentView.children[0].getBounds(), (await ui("window.brujula.getState()")).layout.bounds);
  await ui("window.brujula.home()");
  const homeTabId = (await ui("window.brujula.getState()")).activeTabId;
  const extraTabId = await ui("window.brujula.newTab()");
  await ui(`window.brujula.activateTab(${homeTabId})`);
  assert.equal(win.contentView.children.length, 0, "returning to home must not cover it with the old remote view");
  await ui(`window.brujula.closeTab(${extraTabId})`);
  await ui("document.fonts.ready.then(() => true)");
  await fs.writeFile(path.join(output, "slate-privacy-compact.png"), (await win.capturePage()).toPNG());
  win.setContentSize(1320, 860);
  await ui("document.getElementById('reset-appearance').click()");
  await waitFor(async () => (await ui("window.brujula.getState()")).appearance.theme === "claro", "reset button");
  assert.equal((await ui("window.brujula.getState()")).bookmarks.length, 1, "appearance reset must keep bookmarks");
  await ui("document.getElementById('panel-close').click()");
  await waitFor(async () => (await ui("window.brujula.getState()")).layout.panelWidth === 0, "closed panel bounds");
  await new Promise((resolve) => setTimeout(resolve, 2800));
  await fs.writeFile(path.join(output, "slate-privacy-home.png"), (await win.capturePage()).toPNG());
  await ui("document.getElementById('customize-toggle').click()");
  await new Promise((resolve) => setTimeout(resolve, 250));
  await fs.writeFile(path.join(output, "slate-privacy-customize.png"), (await win.capturePage()).toPNG());
  await ui("document.getElementById('side-panel').scrollTop = document.getElementById('side-panel').scrollHeight");
  await new Promise((resolve) => setTimeout(resolve, 200));
  await fs.writeFile(path.join(output, "slate-privacy-customize-more.png"), (await win.capturePage()).toPNG());
  await ui("document.getElementById('side-panel').scrollTop = 0");
  const nativeOpenDialog = dialog.showOpenDialog;
  dialog.showOpenDialog = async (_window, options) => {
    assert.deepEqual(options.filters[0].extensions, ["mp4", "webm", "mov"]);
    return { canceled: false, filePaths: [testVideo] };
  };
  await ui("document.getElementById('choose-background-video').click()");
  state = await waitFor(async () => {
    const current = await ui("window.brujula.getState()");
    return current.appearance.backdrop === "video" && current.backgroundVideoUrl ? current : false;
  }, "copied background video");
  const copiedVideo = fileURLToPath(state.backgroundVideoUrl);
  assert.ok(copiedVideo.startsWith(path.join(profile, "backgrounds") + path.sep));
  assert.equal((await fs.stat(copiedVideo)).size, (await fs.stat(testVideo)).size);
  dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  assert.equal(await ui("window.brujula.chooseBackgroundVideo()"), false);
  assert.equal((await ui("window.brujula.getState()")).backgroundVideoUrl, state.backgroundVideoUrl, "canceling the picker must preserve the chosen video");
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [testVideo] });
  await waitFor(async () => ui("document.getElementById('home-background-video').readyState >= 2 && document.getElementById('home-background-video').currentTime > 0.2"), "muted video background playback");
  assert.equal(await ui("document.getElementById('home-background-video').muted"), true);
  assert.equal(await ui("document.getElementById('home-background-video').volume"), 0);
  await ui("window.brujula.resetAppearance()");
  await waitFor(async () => (await ui("window.brujula.getState()")).appearance.backdrop === "papel", "video removed from home by reset");
  assert.ok((await fs.stat(copiedVideo)).isFile(), "resetting appearance must not silently delete the selected file");
  await ui("document.getElementById('clear-background-video').click()");
  await waitFor(async () => !(await ui("window.brujula.getState()")).backgroundVideoUrl, "remove local video");
  assert.equal(fsSync.existsSync(copiedVideo), false);
  dialog.showOpenDialog = nativeOpenDialog;
  console.info("PASS: local video copied into the isolated profile, muted, persisted, and removed on request.");
  await ui("document.getElementById('panel-close').click()");
  await ui("window.brujula.navigate('https://example.com')");
  await waitFor(() => !remote.isLoading(), "restored remote page");
  console.info("PASS: saved startup appearance, real UI preferences, invalid input rejection, reset preserving bookmarks, native bounds at 800px and screenshots.");
  await ui("document.getElementById('privacy-toggle').click()");
  assert.equal(await ui("document.getElementById('privacy-settings').hidden"), false);
  assert.ok(win.contentView.children[0].getBounds().width < win.getContentSize()[0] - 380);
  await ui("window.brujula.toggleSiteProtection()");
  assert.equal((await ui("window.brujula.getState()")).privacy.siteEnabled, false);
  assert.ok(JSON.parse(await fs.readFile(path.join(profile, "privacy.json"), "utf8")).exceptions.includes("example.com"));
  await ui("window.brujula.toggleSiteProtection()");
  assert.equal((await ui("window.brujula.getState()")).privacy.siteEnabled, true);
  console.info("PASS: real network blocking, counters, isolated content, WebRTC, visible shield panel and saved exceptions.");
  await require("./verify-features.cjs")({ win, ui, profile, output, waitFor });

  const nativeDialog = dialog.showMessageBox;
  dialog.showMessageBox = async (_window, options) => {
    assert.equal(options.cancelId, 0);
    assert.match(options.message, /cerrarán/);
    return { response: 0 };
  };
  assert.equal(await ui("window.brujula.clearSiteData()"), false);
  assert.equal((await ui("window.brujula.getState()")).bookmarks.length, 1);
  await session.defaultSession.cookies.set({ url: "https://example.com", name: "test-session", value: "delete-me" });
  dialog.showMessageBox = async () => ({ response: 1 });
  assert.equal(await ui("window.brujula.clearSiteData()"), true);
  assert.equal((await session.defaultSession.cookies.get({})).length, 0);
  state = await ui("window.brujula.getState()");
  assert.equal(state.history.length, 0);
  assert.equal(state.bookmarks.length, 1);
  dialog.showMessageBox = nativeDialog;
  console.info("PASS: cancellation preserves data; confirmed deletion removes cookies/history but keeps bookmarks.");

  await ui("document.getElementById('privacy-toggle').click()");
  await new Promise((resolve) => setTimeout(resolve, 300));
  await fs.writeFile(path.join(output, "brujula-privacy.png"), (await win.capturePage()).toPNG());
  console.info("PASS: desktop screenshot saved. Live YouTube ad-free playback was NOT established by these tests.");
  let automaticQuitRequested = false;
  app.once("before-quit", (event) => {
    event.preventDefault();
    automaticQuitRequested = true;
  });
  win.close();
  await waitFor(() => automaticQuitRequested, "quit after closing the last window");
  console.info("PASS: closing the final window requests application quit.");
  await fs.rm(profile, { recursive: true, force: true });
  app.exit(0);
})().catch((error) => {
  console.error(error);
  app.exit(1);
});
