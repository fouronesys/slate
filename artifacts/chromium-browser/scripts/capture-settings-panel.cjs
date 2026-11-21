// Extract the actual native panel DOM and CSS for a faithful canvas reference.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { app, BrowserWindow } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const { version } = require("../src/legal-documents.cjs");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  for (let i = 0; i < 150; i++) {
    const result = await check();
    if (result) return result;
    await pause(100);
  }
  throw new Error(`Timeout: ${label}`);
}
(async () => {
  const target = process.argv.includes("--after") ? "Compact" : "Current";
  const folder = path.resolve(__dirname, "../../mockup-sandbox/src/components/mockups/slate-settings-compact");
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "slate-panel-capture-"));
  app.setPath("userData", profile);
  await fs.writeFile(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||ads.test^").serialize());
  await fs.writeFile(path.join(profile, "legal-acceptance.json"), JSON.stringify({
    version, terms: true, privacy: true, adult: true, acceptedAt: new Date().toISOString(),
  }));
  require("../src/main.cjs");
  await app.whenReady();
  const win = await waitFor(() => BrowserWindow.getAllWindows()[0], "window");
  const ui = code => win.webContents.executeJavaScript(code);
  await waitFor(() => ui("Boolean(window.SlateSettings && document.documentElement.dataset.uiReady)"), "UI");
  await ui("window.openPanel('general')");
  await pause(250);
  const snapshot = await ui(`(() => {
    const css=[...document.styleSheets].map(sheet=>{
      try{return [...sheet.cssRules].map(rule=>rule.cssText).join('\\n')}catch{return ''}
    }).join('\\n');
    const panel=document.getElementById('side-panel'),copy=panel.cloneNode(true);
    const controls=[...panel.querySelectorAll('input[id],select[id],textarea[id]')].map(control=>({
      id:control.id,tag:control.tagName,value:control.value,checked:control.checked
    }));
    for(const control of controls) {
      const target=copy.querySelector('#'+CSS.escape(control.id));
      if(control.tag==='SELECT')for(const option of target.options)
        option.toggleAttribute('selected',option.value===control.value);
      else if(control.tag==='TEXTAREA')target.textContent=control.value;
      else {target.setAttribute('value',control.value);target.toggleAttribute('checked',control.checked===true)}
    }
    return {css,html:copy.outerHTML,controls,
      attrs:[...document.documentElement.attributes].map(a=>[a.name,a.value]),
      width:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-width'))};
  })()`);
  const fontUrls = [];
  for (const name of ["dm-sans.ttf", "fraunces.ttf", "ibm-plex-mono.ttf"]) {
    const bytes = await fs.readFile(path.resolve(__dirname, "../src/assets/fonts", name));
    fontUrls.push([`url("./assets/fonts/${name}")`, `url("data:font/ttf;base64,${bytes.toString("base64")}")`]);
  }
  const inlineFonts = text => fontUrls.reduce((result, [source, data]) => result.replaceAll(source, data), text);
  snapshot.css = inlineFonts(snapshot.css);
  const escape = value => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  const attrs = snapshot.attrs.map(([name, value]) => `${name}="${escape(value)}"`).join(" ");
  const html = `<!doctype html><html ${attrs}><head><meta charset="utf-8">
    <style>${snapshot.css}</style><style>
    :root{--chrome-height:0px!important;--panel-width:${snapshot.width}px!important}
    body{margin:0;min-height:100dvh;background:var(--canvas)}
    #side-panel{top:12px;bottom:12px;right:12px}
    </style></head><body>${snapshot.html}</body></html>`;
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, `_${target.toLowerCase()}.html`), html);
  if (target === "Compact") {
    const baseline = path.join(folder, "_current.html");
    const source = inlineFonts(await fs.readFile(baseline, "utf8"));
    const reflected = await ui(`(() => {
      const doc=new DOMParser().parseFromString(${JSON.stringify(source)},'text/html');
      for(const control of ${JSON.stringify(snapshot.controls)}) {
        const target=doc.getElementById(control.id);if(!target)continue;
        if(control.tag==='SELECT')for(const option of target.options)
          option.toggleAttribute('selected',option.value===control.value);
        else if(control.tag==='TEXTAREA')target.textContent=control.value;
        else {target.setAttribute('value',control.value);target.toggleAttribute('checked',control.checked===true)}
      }
      return '<!doctype html>'+doc.documentElement.outerHTML;
    })()`);
    await fs.writeFile(baseline, reflected);
  }
  await fs.writeFile(path.join(folder, `${target}.tsx`),
    `import './_group.css';\nimport html from './_${target.toLowerCase()}.html?raw';\nexport function ${target}(){return <iframe className="slate-settings-source-preview" title="Panel de ajustes — captura del código real" srcDoc={html} sandbox="" />}\n`);
  await fs.writeFile(path.join(folder, "_group.css"),
    ".slate-settings-source-preview{display:block;width:100%;height:100dvh;min-height:100vh;border:0;background:transparent}\n");
  if (target === "Compact") {
    const geometry = await ui(`(() => {
      const p=document.getElementById('side-panel'),c=document.getElementById('settings-content');
      return {width:p.getBoundingClientRect().width,overflow:p.scrollWidth>p.clientWidth,
        contentOverflow:c.scrollWidth>c.clientWidth};
    })()`);
    assert.ok(geometry.width <= 360);
    assert.equal(geometry.overflow, false);
    assert.equal(geometry.contentOverflow, false);
  }
  await fs.writeFile(path.resolve(__dirname, `../../../generated-artifacts/slate-panel-${target.toLowerCase()}.jpg`),
    (await win.webContents.capturePage()).toJPEG(88));
  console.log(`SLATE PANEL EXTRACTED: ${target}, reserved width ${snapshot.width}px`);
  app.quit();
})().catch(error => { console.error(error.stack || error); app.exit(1); });
