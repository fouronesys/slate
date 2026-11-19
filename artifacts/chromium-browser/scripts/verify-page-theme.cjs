const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, webContents, session, nativeTheme } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  const until = Date.now() + 12000;
  while (Date.now() < until) {
    if (await check()) return;
    await delay(80);
  }
  throw new Error(`Timeout: ${label}`);
}
const css = `
  body { background:#fff; color:#171717; font:18px Arial,sans-serif; margin:32px; }
  .card { background:#eee; color:#222; padding:20px; border:1px solid #888; border-radius:12px; }
  button { background:#1454b4; color:white; border:0; padding:12px; border-radius:8px; }
  input, textarea, select { background:white; color:#111; padding:8px; border:1px solid #777; }
  .media { display:flex; gap:20px; margin:24px 0; }
  img, canvas, video, .wallpaper { width:100px; height:80px; }
  .wallpaper { background-image:linear-gradient(90deg,#e02020,#20d040); }
`;
const picture = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><path fill="#ef3131" d="M0 0h50v80H0z"/><path fill="#2fd15b" d="M50 0h50v80H50z"/></svg>');
function fixture(dark = false, strict = false) {
  return `<!doctype html><meta charset=utf-8>${strict ? '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; style-src \'self\'; img-src data:; script-src \'none\'">' : ""}
    <title>Prueba local de colores</title>${strict ? '<link rel="stylesheet" href="/theme.css">' : `<style>${css}${dark ? "@media(prefers-color-scheme:dark) {body,.card {background:#121212;color:#eee}}" : ""}</style>`}
    <h1>Una página que sigue a Slate</h1><div class="card" id="card"><p>Texto, enlaces y controles legibles.</p>
    <a href="#detalle">Un enlace de ejemplo</a>
    <p><input id="entry" value="Mi texto se conserva"><select id="choice"><option>Primera opción</option><option>Segunda opción</option></select></p>
    <textarea id="note">Una nota escrita</textarea><input id="color" type="color" value="#ea2244"><input id="check" type="checkbox" checked>
    <button id="action">Botón de la página</button></div>
    <div class="media"><img id="photo" src="${picture}"><canvas id="drawing" width="100" height="80"></canvas>
    <video id="movie" poster="${picture}" controls></video><div class="wallpaper" id="wallpaper"></div></div>
    <p>Imágenes, vídeo y lienzo conservan sus colores.</p>`;
}
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slate-page-theme-"));
  app.setPath("userData", profile);
  fs.writeFileSync(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||blocked.invalid^").serialize());
  require("../src/main.cjs");
  await app.whenReady();
  let win;
  await waitFor(() => (win = BrowserWindow.getAllWindows()[0]), "window");
  win.setContentSize(1320, 860);
  const ui = code => win.webContents.executeJavaScript(code);
  const state = () => ui("window.brujula.getState()");
  await waitFor(() => ui("Boolean(window.brujula && document.getElementById('customize-toggle'))").catch(() => false), "UI");
  const requests = [];
  session.defaultSession.protocol.handle("https", request => {
    const url = new URL(request.url);
    requests.push(url.pathname);
    return new Response(url.pathname === "/theme.css" ? css : fixture(url.pathname === "/dark", url.pathname === "/strict"),
      { headers: { "content-type": url.pathname.endsWith(".css") ? "text/css" : "text/html" } });
  });
  await ui(`window.brujula.setAppearance({theme:"claro",pageTheme:"original"})`);
  let page;
  const go = async (url = "https://colors.test/light") => {
    await ui(`window.brujula.navigate(${JSON.stringify(url)})`);
    await waitFor(async () => {
      page = webContents.getAllWebContents().find(wc => wc.getURL() === url);
      return page && !page.isLoadingMainFrame() && await page.executeJavaScript('Boolean(document.getElementById("entry"))').catch(() => false);
    }, "fixture navigation");
  };
  await go();
  const pageUI = code => page.executeJavaScript(code);
  const background = () => pageUI('getComputedStyle(document.body).backgroundColor');
  const luminance = text => {
    const values = text.match(/[\d.]+/g).map(Number);
    return (values[0] + values[1] + values[2]) / 3;
  };
  await pageUI(`document.getElementById("drawing").getContext("2d").fillStyle="#2469ef";document.getElementById("drawing").getContext("2d").fillRect(0,0,100,80);document.getElementById("entry").value="Texto editado"; document.getElementById("choice").selectedIndex=1`);
  const rects = await pageUI(`Object.fromEntries(["photo","drawing","movie","wallpaper","card","entry","action"].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,width:r.width,height:r.height}]}))`);
  await delay(100);
  const before = await page.capturePage();
  const samples = image => Object.fromEntries(["photo","drawing","movie","wallpaper"].map(id => {
    const r = rects[id];
    return [id, [...image.crop({x:Math.round(r.x+20),y:Math.round(r.y+20),width:1,height:1}).toBitmap()]];
  }));
  const beforePixels = samples(before);
  await ui(`document.getElementById("customize-toggle").click();document.querySelector('[data-preference="theme"][data-value="oscuro"]').click()`);
  await waitFor(async () => (await state()).appearance.theme === "oscuro", "dark UI");
  assert.equal(await pageUI('matchMedia("(prefers-color-scheme: dark)").matches'), true);
  await ui(`document.querySelector('[data-preference="pageTheme"][data-value="seguir"]').click()`);
  await waitFor(async () => (await state()).pageTheme.status === "adapted" && luminance(await background()) < 90, "dark page");
  await ui("window.closePanel()");
  await delay(300);
  const output = path.resolve(__dirname, "../../../generated-artifacts");
  fs.mkdirSync(output, {recursive:true});
  const darkImage = await page.capturePage();
  fs.writeFileSync(path.join(output,"slate-pagina-tema-oscuro.png"), darkImage.toPNG());
  assert.deepEqual(samples(darkImage), beforePixels, "no image, video poster, canvas or background-image recoloring");
  const afterRects = await pageUI(`Object.fromEntries(["photo","drawing","movie","wallpaper","card","entry","action"].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,width:r.width,height:r.height}]}))`);
  assert.deepEqual(afterRects, rects, "no layout changes");
  assert.equal(await pageUI('document.getElementById("entry").value'), "Texto editado");
  assert.equal(await pageUI('document.getElementById("choice").selectedIndex'), 1);
  assert.equal(await pageUI('typeof window.brujula'), "undefined");
  assert.equal(await pageUI('typeof window.DarkReader'), "undefined", "theme engine stays out of the page's JS world");
  await pageUI(`const late=document.createElement("div");late.id="late";late.style.cssText="background:white;color:black;padding:10px";late.textContent="Contenido añadido después";document.body.append(late)`);
  await waitFor(async () => luminance(await pageUI('getComputedStyle(document.getElementById("late")).backgroundColor')) < 90, "dynamic content");
  await ui(`document.getElementById("customize-toggle").click();document.getElementById("page-theme-site").click()`);
  await waitFor(async () => (await state()).pageTheme.status === "original" && luminance(await background()) > 240, "site exception restores original");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile,"page-theme.json"))), ["colors.test"]);
  await page.reload();
  await waitFor(async () => !page.isLoadingMainFrame() && (await state()).pageTheme.status === "original", "exception after reload");
  await ui("window.brujula.resetPageThemeSites()");
  await waitFor(async () => (await state()).pageTheme.status === "adapted" && luminance(await background()) < 90, "reset exceptions");
  await ui(`window.brujula.setAppearance({theme:"claro"})`);
  await waitFor(async () => luminance(await background()) > 200, "light theme");
  await ui("window.closePanel()");
  fs.writeFileSync(path.join(output,"slate-pagina-tema-claro.png"), (await page.capturePage()).toPNG());
  await go("https://colors.test/dark");
  await waitFor(async () => (await state()).pageTheme.status === "adapted" && luminance(await background()) > 180, "native dark page to light");
  await ui(`window.brujula.setAppearance({theme:"sistema"})`);
  await waitFor(() => nativeTheme.themeSource === "system", "system preference restored");
  await waitFor(async () => await pageUI('matchMedia("(prefers-color-scheme:dark)").matches') === nativeTheme.shouldUseDarkColors, "page follows system preference");
  await go("https://strict.test/strict");
  await ui(`window.brujula.setAppearance({theme:"oscuro"})`);
  await waitFor(async () => (await state()).pageTheme.status !== "pending", "strict CSP settles");
  console.info("CSP:", (await state()).pageTheme.status, await background());
  assert.equal((await state()).privacy.siteEnabled, true, "theming must not disable protections");
  assert.ok(requests.every(url => ["/light","/dark","/strict","/theme.css"].includes(url)), "no extra theming requests");
  console.info("PASS: native dark/light, system preference, original-site exception, restoration/reload, dynamic content, form values, unchanged image/video/canvas/background pixels and layout; isolated JS world. Offline fixtures only.");
  app.quit();
})().catch(error => {console.error(error);app.exit(1)});
