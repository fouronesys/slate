const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { session, webContents, dialog } = require("electron");

module.exports = async function verifyFeatures({ win, ui, profile, output, waitFor }) {
  const execute = ui;
  ui = async (code) => {
    try { return await execute(code); }
    catch (error) { console.error("Failed feature UI command:", code); throw error; }
  };
  const action = (value) => ui(`window.brujula.featureAction(${JSON.stringify(value)})`);
  const state = () => ui("window.brujula.getState()");
  const clickText = (selector, text) => ui(`(() => {
    const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(n => n.textContent.trim() === ${JSON.stringify(text)});
    if (!node) throw new Error('Missing UI control: ' + ${JSON.stringify(text)});
    node.click();
  })()`);
  const fill = (key, value) => ui(`(() => {
    const node = [...document.querySelectorAll('[data-draft-key]')].find(n => n.dataset.draftKey === ${JSON.stringify(key)});
    if (!node) throw new Error('Missing field: ' + ${JSON.stringify(key)});
    node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', {bubbles:true}));
  })()`);
  await ui("window.brujula.home(); document.getElementById('experiences-toggle').click()");
  await waitFor(async () => ui("document.getElementById('experience-settings').hidden === false"), "feature panel");
  await fill("Crear colección", "Mi viaje");
  await clickText("#experience-settings button", "Crear colección");
  const collection = await waitFor(async () => (await state()).features.collections.find((c) => c.name === "Mi viaje"), "created collection");
  await action({ type: "item:add", collectionId: collection.id, kind: "text", title: "Reserva", text: "Consultar fechas", notes: "Nota local" });
  const note = (await state()).features.items[0];
  await action({ type: "item:update", id: note.id, notes: "Cambios guardados", collectionId: "inbox" });
  assert.equal(JSON.parse(await fs.readFile(path.join(profile, "features.json"), "utf8")).items[0].notes, "Cambios guardados");
  await clickText("#experience-settings button", "Renombrar");
  await fill("Nuevo nombre de colección", "Ideas");
  await clickText("#experience-settings button", "Guardar nombre");
  await waitFor(async () => (await state()).features.collections.some((c) => c.name === "Ideas"), "inline collection rename");
  await action({ type: "home:update", patch: {
    companion: { enabled: true, kind: "cat", name: "Miso", color: "#63795e" },
    order: ["search", "companion", "games", "bookmarks", "clock", "collections"],
  } });
  await waitFor(async () => ui("Boolean(document.querySelector('.slate-widget-zone .slate-pet-button'))"), "visible companion");
  await ui("document.querySelector('.slate-pet-button').click()");
  assert.equal(await ui("document.querySelector('.slate-pet-button').classList.contains('is-bopping')"), true);
  await clickText(".slate-game-launch strong", "Parejas");
  assert.equal(await ui("document.querySelectorAll('.slate-memory-card').length"), 12);
  await ui("document.querySelector('.slate-memory-card').click()");
  assert.equal(await ui("document.querySelectorAll('.slate-memory-card.revealed').length"), 1);
  await clickText(".slate-game-top button", "Salir");
  assert.equal(await ui("document.querySelectorAll('.slate-game-launch').length"), 2);
  await clickText(".slate-game-launch strong", "Dibujo libre");
  await ui(`(() => { const canvas = document.querySelector('.slate-draw-canvas');
    canvas.getContext('2d').fillRect(0,0,5,5); window.testCanvas = canvas; })()`);
  await action({ type: "home:update", patch: { corners: "round", size: "compact" } });
  assert.equal(await ui("document.querySelector('.slate-draw-canvas') === window.testCanvas"), true, "editor changes must preserve drawing");
  assert.equal(await ui("document.querySelector('.slate-draw-canvas').getContext('2d').getImageData(0,0,1,1).data[3]"), 255);
  await clickText(".slate-game-top button", "Salir");
  await action({ type: "home:update", patch: { hidden: ["search", "bookmarks"] } });
  assert.equal(await ui("Boolean(document.getElementById('home-query') && document.getElementById('home-bookmarks') && document.getElementById('home-protection-status'))"), true, "hidden widgets must remain addressable");
  await action({ type: "home:undo" });
  assert.equal((await state()).features.home.hidden.length, 0);
  await clickText("#experience-settings .experience-tabs button", "Inicio");
  await action({ type: "home:update", patch: { size: "large" } });
  await action({ type: "home:undo" });
  assert.equal(await ui("document.querySelector('[data-draft-key=\"Tamaño\"]').value"), "compact", "undo controls match persisted state");
  await ui("document.getElementById('panel-close').click()");
  win.setSize(1320, 1040);
  await ui("document.getElementById('home-screen').scrollTop = 290; new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await fs.writeFile(path.join(output, "slate-experiences-home.png"), (await win.capturePage()).toPNG());
  await ui("document.getElementById('experiences-toggle').click()");
  await clickText("#experience-settings .experience-tabs button", "Guardados");
  await ui("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await fs.writeFile(path.join(output, "slate-experiences-collections.png"), (await win.capturePage()).toPNG());
  await ui("document.getElementById('panel-close').click()");
  console.info("PASS: actual collection UI, inline rename, persistence, companion, memory game, drawing stability, editor undo and hidden legacy widgets.");

  assert.ok((await action({ type: "search", query: "example" })).some((entry) => entry.source === "Marcador"));
  await session.defaultSession.cookies.set({ url: "https://example.com", name: "space-test", value: "personal" });
  const originalTabs = (await state()).tabs.length;
  await action({ type: "workspace:switch", id: "trabajo" });
  await waitFor(async () => (await state()).privacy.status === "ready", "isolated workspace filters");
  const workSession = session.fromPartition("persist:slate-space-trabajo");
  assert.equal((await workSession.cookies.get({ name: "space-test" })).length, 0);
  assert.equal((await state()).bookmarks.length, 0);
  assert.equal((await state()).history.length, 0);
  await workSession.cookies.set({ url: "https://example.com", name: "space-test", value: "work" });
  await action({ type: "workspace:switch", id: "personal" });
  assert.equal((await state()).tabs.length, originalTabs);
  assert.equal((await state()).bookmarks.length, 1);
  assert.equal((await session.defaultSession.cookies.get({ name: "space-test" }))[0].value, "personal");
  assert.equal((await workSession.cookies.get({ name: "space-test" }))[0].value, "work");
  const oldHistory = (await state()).history;
  await ui("window.brujula.rememberHistory(true)");
  const ephemeralId = await action({ type: "tab:ephemeral" });
  await ui("window.brujula.navigate('https://example.com')");
  const temporary = await waitFor(() => webContents.getAllWebContents().find((c) =>
    c.id !== win.webContents.id && !c.session.isPersistent() && c.getURL().startsWith("https://example.com")), "ephemeral page");
  await waitFor(() => !temporary.isLoading(), "ephemeral load");
  assert.equal((await temporary.session.cookies.get({ name: "space-test" })).length, 0);
  const ephemeralSession = temporary.session;
  await ephemeralSession.cookies.set({ url: "https://example.com", name: "ephemeral", value: "erase" });
  assert.deepEqual((await state()).history, oldHistory, "ephemeral visits never enter normal history");
  assert.equal((await state()).tabs.find((t) => t.id === ephemeralId).ephemeral, true);
  await ui(`window.brujula.closeTab(${ephemeralId})`);
  await waitFor(async () => (await ephemeralSession.cookies.get({})).length === 0, "ephemeral cleanup");
  await ui("window.brujula.rememberHistory(false)");
  console.info("PASS: native cookie partitions, space-specific bookmarks/history, restored tabs, ephemeral isolation and cookie removal on close.");

  // Native permission request: no fabricated UI grant or privileged IPC.
  const normalTab = await state();
  await ui("window.brujula.navigate('https://example.com')");
  const normalContents = await waitFor(() => webContents.getAllWebContents().find((c) =>
    c.id !== win.webContents.id && c.session === session.defaultSession && c.getURL().startsWith("https://example.com")), "permission test page");
  await waitFor(() => !normalContents.isLoading(), "permission page ready");
  await normalContents.executeJavaScript("window.geoResult='pending'; navigator.geolocation.getCurrentPosition(() => window.geoResult='allowed', () => window.geoResult='denied'); undefined;");
  const request = await waitFor(async () => (await state()).features.pendingPermissions[0], "native geolocation request");
  assert.equal(request.permission, "geolocation");
  await action({ type: "permission:respond", id: request.id, decision: "deny" });
  await waitFor(async () => normalContents.executeJavaScript("window.geoResult === 'denied'"), "permission denied");
  assert.equal((await state()).features.pendingPermissions.length, 0);
  const originalDialog = dialog.showMessageBox;
  dialog.showMessageBox = async () => ({ response: 0 });
  assert.equal(await action({ type: "settings:update", patch: { clearOnExit: true } }), false);
  assert.equal((await state()).features.settings.clearOnExit, false);
  assert.equal(await action({ type: "safe-close" }), false);
  assert.equal(win.isDestroyed(), false);
  dialog.showMessageBox = originalDialog;
  await ui("document.getElementById('experiences-toggle').click()");
  await clickText("#experience-settings .experience-tabs button", "Privacidad");
  await ui("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await fs.writeFile(path.join(output, "slate-experiences-privacy.png"), (await win.capturePage()).toPNG());
  // Leave the legacy verification with the original normal tab active.
  await ui(`window.brujula.activateTab(${normalTab.activeTabId})`);
  console.info("PASS: real expiring permission prompt/denial; cleanup opt-in and safe-close cancellation preserve user data.");
};
