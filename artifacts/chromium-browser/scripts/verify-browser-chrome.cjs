// The calling process must observe natural exit; no app.exit(0) in this check.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { app, BrowserWindow, dialog } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(60);
  }
  throw new Error(`Timeout: ${label}`);
}
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slate-chrome-"));
  app.setPath("userData", profile);
  fs.writeFileSync(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||blocked.invalid^").serialize());
  require("../src/main.cjs");
  await app.whenReady();
  let win;
  await waitFor(() => (win = BrowserWindow.getAllWindows()[0]), "window");
  win.setContentSize(1320, 860);
  const ui = code => win.webContents.executeJavaScript(code);
  const state = () => ui("window.brujula.getState()");
  await waitFor(() => ui("Boolean(document.querySelector('.companion-art'))").catch(() => false), "ready");
  const errors = [];
  win.webContents.on("console-message", (_event, details) => {
    if (details.level === "error" || details.level === 3) errors.push(details.message);
  });
  async function tripleClick() {
    const rect = await ui(`(() => { const r=document.getElementById("brand-secret").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()`);
    for (let i = 0; i < 3; i++) {
      win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...rect });
      win.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...rect });
      await delay(100);
    }
  }
  const dragRegions = await ui(`Array.from(document.querySelectorAll("#brand-secret, #brand-secret *")).map(e=>getComputedStyle(e).webkitAppRegion)`);
  assert.ok(dragRegions.every(value => value === "no-drag"));
  await tripleClick();
  await waitFor(async () => {
    const pet = (await state()).features.home.companion;
    return pet.secretUnlocked && pet.cosmic && pet.floating;
  }, "third real click reveals the secret and portable Miso");
  await tripleClick();
  await waitFor(async () => !(await state()).features.home.companion.cosmic, "third click toggles an already unlocked secret");
  const pet = (await state()).features.home.companion;
  await ui(`window.brujula.featureAction(${JSON.stringify({ type: "home:update", patch: { companion: { ...pet, floating: false } } })})`);
  const backgrounds = [];
  for (const value of [25, 80]) {
    await ui(`(() => {const s=document.getElementById("chrome-opacity");s.value=${value};s.dispatchEvent(new Event("input",{bubbles:true}));s.dispatchEvent(new Event("change",{bubbles:true}));})()`);
    await waitFor(async () => (await state()).appearance.chromeOpacity === value, "slider saves opacity");
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, "appearance.json"), "utf8")).chromeOpacity, value);
    backgrounds.push(await ui("getComputedStyle(document.querySelector('.titlebar')).backgroundColor"));
  }
  assert.notEqual(backgrounds[0], backgrounds[1], "opacity changes the actual bar background");
  await ui(`window.brujula.setAppearance({contrast:"alto"})`);
  await waitFor(() => ui("document.getElementById('chrome-opacity').disabled"), "high contrast keeps bars opaque");
  await ui(`window.brujula.setAppearance({contrast:"normal"})`);
  assert.equal(await ui(`(() => {const s=document.getElementById("home-background-scrim");s.hidden=false;return getComputedStyle(s).display;})()`), "none", "video never receives a color overlay");
  win.webContents.reload();
  await waitFor(() => ui("document.getElementById('chrome-opacity')?.value === '80'").catch(() => false), "saved opacity survives UI reload");
  await ui("document.getElementById('customize-toggle').click()");
  await ui("document.getElementById('chrome-opacity').scrollIntoView({block:'center'})");
  await delay(200);
  const output = path.resolve(__dirname, "../../../generated-artifacts");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "slate-configuracion-opacidad.png"), (await win.capturePage()).toPNG());
  await ui("window.brujula.newTab()");
  await waitFor(async () => (await state()).tabs.length === 2, "two tabs");
  await ui(`document.querySelector('.tab[aria-selected="true"] .tab-close').click()`);
  await waitFor(async () => (await state()).tabs.length === 1, "closing an extra tab does not quit");
  assert.equal(win.isDestroyed(), false);
  assert.deepEqual(errors, [], "no renderer errors");
  if (process.argv.includes("--clear-on-exit")) {
    // Consent applies only to this disposable test profile, never the user's profile.
    const confirm = dialog.showMessageBox;
    dialog.showMessageBox = async () => ({ response: 1 });
    await ui(`window.brujula.featureAction({type:"settings:update",patch:{clearOnExit:true}})`);
    dialog.showMessageBox = confirm;
  }
  console.info("PASS: real secret clicks, repeated activation, opacity control/save/reload, high contrast and overlay removal.");
  app.once("will-quit", () => console.info("LAST_TAB_QUIT: waiting for the outer runner to confirm natural process exit."));
  await ui(`setTimeout(()=>document.querySelector('.tab-close').click(),100);true`);
})().catch(error => { console.error(error); app.exit(1); });
