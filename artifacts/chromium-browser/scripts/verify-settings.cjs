// Real Electron checks with a disposable profile and an offline HTTPS fixture.
// No production account, site login, signature request or user data is used.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { app, BrowserWindow, session, webContents } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await pause(80);
  }
  throw new Error(`Timeout: ${label}`);
}
const output = path.resolve(__dirname, "../../../generated-artifacts");
const failures = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", details => {
    if (details.level === "error" && !/ERR_|favicon|Content Security Policy|Widevine/i.test(details.message)) {
      failures.push(details.message);
    }
  });
});
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "slate-settings-"));
  app.setPath("userData", profile);
  await fs.writeFile(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||ads.test^").serialize());
  require("../src/main.cjs");
  await app.whenReady();
  const win = await waitFor(() => BrowserWindow.getAllWindows()[0], "main window");
  const ui = async code => {
    try { return await win.webContents.executeJavaScript(code); }
    catch (error) {
      throw new Error(`${error.message}\nUI check: ${code.slice(0, 220)}\nConsole: ${failures.join("; ")}`, { cause: error });
    }
  };
  const click = async selector => {
    const point = await ui(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) throw Error("Control ausente");
      node.scrollIntoView({block:"nearest"});
      const r = node.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (!r.width || !r.height || !node.contains(document.elementFromPoint(x,y)))
        throw Error("Control oculto o cubierto: " + ${JSON.stringify(selector)});
      return {x:Math.round(x), y:Math.round(y)};
    })()`);
    win.webContents.sendInputEvent({type:"mouseDown",button:"left",clickCount:1,...point});
    win.webContents.sendInputEvent({type:"mouseUp",button:"left",clickCount:1,...point});
    await pause(40);
  };
  await waitFor(() => ui("Boolean(window.brujula && window.SlateSettings && document.documentElement.dataset.uiReady)"), "UI ready");
  await fs.mkdir(output, { recursive: true });
  const capture = async name => {
    await pause(180); // Let the native compositor paint the selected section.
    const image = await win.webContents.capturePage();
    await fs.writeFile(path.join(output, name), image.toJPEG(88));
    if (/appearance-(light|dark)|custom-claro|index-light/.test(name)) {
      const bounds = await ui(`(() => {
        const r=document.getElementById("side-panel").getBoundingClientRect();
        return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};
      })()`);
      await fs.writeFile(path.join(output, name.replace(".jpg", "-panel.jpg")), image.crop(bounds).toJPEG(90));
    }
  };
  assert.equal((await ui("window.brujula.getState()")).legal.accepted, false);
  assert.equal(await ui("document.getElementById('legal-accept').disabled"), true);
  await assert.rejects(ui("window.brujula.navigate('https://slate-video.test')"), /primer inicio/);
  await assert.rejects(ui("window.brujula.acceptLegal({version:window.SlateLegalDocuments.version,terms:true,privacy:true,adult:false})"), /declarar/);
  await capture("slate-primer-inicio.jpg");
  await ui(`for (const id of ['legal-terms-check','legal-privacy-check','legal-adult-check']) {
    const checkbox=document.getElementById(id); checkbox.click();
  } document.getElementById('legal-accept').click();`);
  await waitFor(() => ui("document.getElementById('legal-gate').hidden"), "acceptance saved");
  const record = JSON.parse(await fs.readFile(path.join(profile, "legal-acceptance.json"), "utf8"));
  assert.equal(record.adult, true);
  assert.ok(!Object.hasOwn(record, "name"));
  await waitFor(async () => (await ui("window.brujula.getState()")).privacy.status === "ready", "offline fixture engine");
  assert.equal(await ui("getComputedStyle(document.getElementById('customize-toggle')).display"), "none");
  for (const id of ["privacy-toggle", "downloads-toggle", "settings-toggle"]) {
    assert.equal(await ui(`document.getElementById('${id}').getBoundingClientRect().width > 0`), true);
  }
  await ui("document.getElementById('privacy-toggle').click()");
  assert.equal(await ui("document.getElementById('privacy-settings').hidden"), false);
  assert.equal(await ui("document.getElementById('privacy-toggle').getAttribute('aria-expanded')"), "true");
  await ui("document.getElementById('downloads-toggle').click()");
  assert.equal(await ui("document.querySelector('[data-settings-section][aria-current]').dataset.settingsSection"), "downloads");
  assert.equal(await ui("document.getElementById('privacy-toggle').getAttribute('aria-expanded')"), "false");
  assert.equal(await ui("document.getElementById('downloads-toggle').getAttribute('aria-expanded')"), "true");
  assert.equal(await ui("Boolean(document.querySelector('#panel-items .downloads-center'))"), true);
  await capture("slate-barra-proteccion-descargas.jpg");
  // A pointerdown on a quick access must not close/reopen the same panel.
  await ui("document.getElementById('downloads-toggle').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));document.getElementById('downloads-toggle').click()");
  assert.equal(await ui("document.getElementById('side-panel').hidden"), true);
  assert.equal(await ui("document.getElementById('downloads-toggle').getAttribute('aria-expanded')"), "false");
  const downloadBadge = await ui(`(async()=>{
    window.SlateDownloads.render({...await window.brujula.getState(),downloads:{active:2,items:[]}});
    return {
      text:document.getElementById('downloads-count').textContent,
      hidden:document.getElementById('downloads-count').hidden,
      active:document.getElementById('downloads-toggle').dataset.activeDownloads
    };
  })()`);
  assert.deepEqual(downloadBadge, {text:"2", hidden:false, active:"2"});
  await ui("document.getElementById('privacy-toggle').click();document.getElementById('home-screen').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  assert.equal(await ui("document.getElementById('side-panel').hidden"), true);
  assert.equal(await ui("document.querySelector('.home-content h1') === null"), true);
  assert.equal((await ui("window.brujula.getState()")).appearance.headingFont, "system");
  await ui("document.getElementById('settings-toggle').click()");
  win.setContentSize(1320, 860);
  await waitFor(() => ui("document.querySelectorAll('[data-settings-category]').length===5"), "five-category index");
  await capture("slate-menu-index-light.jpg");
  const menuCatalog = require("../src/settings-navigation.cjs");
  for (const category of menuCatalog.categories) {
    await click(`[data-settings-category="${category.id}"]`);
    for (const section of category.sections) {
      await click(`[data-settings-section="${section}"]`);
      assert.equal(await ui("document.getElementById('side-panel').hidden"), false);
      assert.equal(await ui("document.querySelector('[data-settings-section][aria-current]').dataset.settingsSection"), section);
      assert.deepEqual(await ui(`(() => {
        const panel=document.getElementById("side-panel"),content=document.getElementById("settings-content");
        return {compact:panel.getBoundingClientRect().width<=360,
          panelOverflow:panel.scrollWidth>panel.clientWidth+1,
          contentOverflow:content.scrollWidth>content.clientWidth+1};
      })()`), {compact:true,panelOverflow:false,contentOverflow:false}, section);
    }
    await click("[data-settings-index]");
    assert.equal(await ui("document.querySelectorAll('[data-settings-category]').length"), 5);
  }
  await ui("window.SlateSettings.select('appearance')");
  await capture("slate-menu-appearance-light.jpg");
  // Same-section refreshes must preserve navigation focus, controls and scroll.
  assert.equal(await ui(`(async()=>{
    const nav=document.querySelector('[data-settings-section="appearance"]');
    const input=document.getElementById("default-zoom");
    const content=document.getElementById("settings-content");
    nav.focus(); content.scrollTop=200;
    window.SlateSettings.render(await window.brujula.getState());
    window.SlateSettings.select("appearance");
    return document.activeElement===nav && input===document.getElementById("default-zoom") && content.scrollTop>=190;
  })()`), true);
  await click("[data-settings-index]");
  await click('[data-settings-category="appearance"]');
  assert.equal(await ui("document.getElementById('settings-content').scrollTop>=190"), true);
  // Reproduce opposite theme/custom-color combinations from the Mac report.
  // Read real paint, not just the preference values or inherited CSS tokens.
  const { contrast } = require("../src/theme-tokens.cjs");
  const originalAppearance = (await ui("window.brujula.getState()")).appearance;
  for (const [theme, surfaceColor, canvasColor] of [
    ["claro", "#2b2c30", "#202124"],
    ["oscuro", "#fafafa", "#ffffff"],
  ]) {
    await ui(`window.brujula.setAppearance(${JSON.stringify({
      theme, colorMode:"propio", surfaceColor, canvasColor, backdrop:"slate",
      accent:"personalizado", customAccent: theme === "claro" ? "#00ffff" : "#ffff00",
    })})`);
    await waitFor(() => ui('!document.getElementById("appearance-color-notice").hidden'), "custom-color explanation");
    await pause(200);
    const samples = await ui(`(() => {
      const context=document.createElement("canvas").getContext("2d");
      const hex=value=>{
        context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);
        return "#"+[...context.getImageData(0,0,1,1).data].slice(0,3).map(n=>n.toString(16).padStart(2,"0")).join("");
      };
      const samples=[];
      for(const selector of ["#settings-search","#appearance-settings .segmented","#home-widget-background-toggle"]) {
        const node=document.querySelector(selector);
        const text=selector==="#settings-search"?node.querySelector("input"):
          selector==="#appearance-settings .segmented"?node.querySelector('button[aria-pressed="false"]'):node;
        samples.push({selector,bg:hex(getComputedStyle(node).backgroundColor),ink:hex(getComputedStyle(text).color)});
      }
      const panel=document.getElementById("side-panel");
      return {samples,scheme:getComputedStyle(panel).colorScheme,
        width:panel.getBoundingClientRect().width,mode:document.documentElement.dataset.colorMode};
    })()`);
    assert.equal(samples.mode, "propio");
    assert.equal(samples.scheme, theme === "claro" ? "dark" : "light");
    assert.ok(samples.width <= 360, "settings remain compact with custom colors");
    for (const sample of samples.samples) assert.ok(contrast(sample.bg,sample.ink)>=4.5, JSON.stringify(sample));
    await ui('document.getElementById("settings-content").scrollTop=0');
    await capture(`slate-menu-custom-${theme}.jpg`);
    if(theme==="claro") {
      const saved = (await ui("window.brujula.getState()")).appearance;
      await ui('document.querySelector("#appearance-color-notice [data-color-mode=tema]").click()');
      await waitFor(() => ui('document.documentElement.dataset.colorMode==="tema"'), "follow-theme action");
      assert.equal(await ui('document.getElementById("appearance-color-notice").hidden'), true);
      const restored = (await ui("window.brujula.getState()")).appearance;
      for(const key of ["surfaceColor","canvasColor","customAccent"]) assert.equal(restored[key],saved[key]);
      await capture("slate-menu-follow-theme-light.jpg");
    }
    if(theme==="oscuro") {
      await ui('window.brujula.setAppearance({contrast:"alto"})');
      await waitFor(() => ui('document.documentElement.dataset.contrast==="alto"'), "high contrast with opposite custom surface");
      assert.equal(await ui('document.getElementById("appearance-color-notice").hidden'), true);
      assert.equal(await ui('getComputedStyle(document.getElementById("side-panel")).backgroundColor'), "rgb(0, 0, 0)");
      await ui('window.brujula.setAppearance({contrast:"normal"})');
    }
  }
  await ui(`window.brujula.setAppearance(${JSON.stringify(originalAppearance)})`);
  // Every catalog entry must reach its real destination without changing a preference.
  const beforeSearch = await ui("(async()=>{const s=await window.brujula.getState();return {appearance:s.appearance,browserPreferences:s.browserPreferences}})()");
  for (const entry of menuCatalog.entries) {
    await ui(`(() => {
      const input=document.getElementById("settings-search-input");
      input.value=${JSON.stringify(entry.label)};
      input.dispatchEvent(new Event("input",{bubbles:true}));
      const button=[...document.querySelectorAll(".settings-search-result")].find(node=>node.querySelector("strong").textContent===${JSON.stringify(entry.label)});
      if(!button) throw Error("Resultado ausente");
      button.click();
    })()`);
    await waitFor(() => ui(`(() => {
      const target=document.querySelector(${JSON.stringify(entry.target)});
      if(!target) throw Error("Destino inexistente");
      const expected=target.getClientRects().length && !target.matches(":disabled") ? target
        : document.getElementById("settings-content").querySelector(":scope > :not([hidden])");
      return document.querySelector('[data-settings-section][aria-current]')?.dataset.settingsSection===${JSON.stringify(entry.section)}
        && document.activeElement===expected;
    })()`), `search ${entry.label}`);
  }
  assert.deepEqual(await ui("(async()=>{const s=await window.brujula.getState();return {appearance:s.appearance,browserPreferences:s.browserPreferences}})()"), beforeSearch);
  await ui(`(()=>{const input=document.getElementById("settings-search-input");input.focus();input.value="PiP";input.dispatchEvent(new Event("input",{bubbles:true}));})()`);
  win.webContents.focus();
  for (const keyCode of ["ArrowDown", "Enter"]) {
    win.webContents.sendInputEvent({type:"keyDown",keyCode});
    win.webContents.sendInputEvent({type:"keyUp",keyCode});
  }
  await waitFor(() => ui('document.activeElement?.id==="pip-button-enabled"'), "keyboard search result");
  await ui(`(()=>{const input=document.getElementById("settings-search-input");input.focus();input.value="no-existe-este-ajuste";input.dispatchEvent(new Event("input",{bubbles:true}));})()`);
  assert.equal(await ui('document.querySelectorAll(".settings-search-result").length'), 0);
  win.webContents.sendInputEvent({type:"keyDown",keyCode:"Escape"});
  win.webContents.sendInputEvent({type:"keyUp",keyCode:"Escape"});
  assert.equal(await ui('document.getElementById("side-panel").hidden'), false);
  assert.equal(await ui('document.getElementById("settings-search-input").value'), "");
  await ui("window.brujula.setAppearance({theme:'oscuro'})");
  await waitFor(() => ui('document.documentElement.dataset.theme==="oscuro"'), "dark menu");
  await ui("window.SlateSettings.showIndex()");
  await capture("slate-menu-index-dark.jpg");
  await ui(`(()=>{const input=document.getElementById("settings-search-input");input.value="actualizaciones";input.dispatchEvent(new Event("input",{bubbles:true}));})()`);
  await capture("slate-menu-search-dark.jpg");
  await ui("document.getElementById('settings-search-clear').click();window.SlateSettings.select('appearance')");
  await ui('document.getElementById("settings-content").scrollTop=0');
  await capture("slate-menu-appearance-dark.jpg");
  await ui("window.brujula.setAppearance({contrast:'alto'})");
  await waitFor(() => ui('document.documentElement.dataset.contrast==="alto"'), "high contrast menu");
  assert.equal(await ui('getComputedStyle(document.getElementById("side-panel")).backgroundColor'), "rgb(0, 0, 0)");
  await ui("window.brujula.setAppearance({theme:'claro',contrast:'normal',tabStyle:'vertical'})");
  win.setContentSize(800, 650);
  await waitFor(() => ui("innerWidth<=850"), "narrow vertical menu");
  await ui("window.SlateSettings.showIndex()");
  await waitFor(() => ui(`(async()=>{
    const s=await window.brujula.getState(),r=document.getElementById("side-panel").getBoundingClientRect();
    return s.layout.bounds.width>=260 && r.left>=s.layout.bounds.x+s.layout.bounds.width-1 && r.right<=innerWidth;
  })()`), "native bounds and panel agree after resize");
  await capture("slate-menu-narrow.jpg");
  await click('[data-settings-category="appearance"]');
  await click('[data-settings-section="home"]');
  await click("[data-settings-index]");
  await click('[data-settings-category="appearance"]');
  assert.equal(await ui("document.querySelector('[data-settings-section][aria-current]').dataset.settingsSection"), "home");
  await ui("window.brujula.setAppearance({tabStyle:'superior'})");
  win.setContentSize(1320, 860);
  await ui("window.SlateSettings.select('legal')");
  await ui("document.querySelector('[data-legal-document=\"privacy\"]').click()");
  assert.match(await ui("document.getElementById('legal-document').textContent"), /Widevine/);
  await ui("window.SlateSettings.select('history');window.SlateSettings.select('downloads');window.SlateSettings.select('history')");
  assert.equal(await ui("document.getElementById('panel-items').querySelector('.downloads-center')===null"), true);
  await ui("window.SlateSettings.select('commands')");
  assert.equal(await ui("document.querySelectorAll('#browser-commands .browser-command').length"), 11);
  await pause(200);
  assert.equal(await ui("document.getElementById('panel-title').textContent"), "Comandos");
  assert.match(await ui("getComputedStyle(document.getElementById('panel-title')).fontFamily"), /Segoe UI|sans-serif/);
  await capture("slate-configuracion-comandos.jpg");
  await ui("window.brujula.setBrowserPreferences({defaultZoom:125,pipButton:false,backgroundTabs:true})");
  const prefs = JSON.parse(await fs.readFile(path.join(profile, "browser-preferences.json"), "utf8"));
  assert.deepEqual(prefs, {
    defaultZoom: 125, pipButton: false, backgroundTabs: true,
    onlineSuggestions: false, automaticUpdates: false,
  });
  await new Promise(resolve => { win.webContents.once("did-finish-load", resolve); win.webContents.reload(); });
  await waitFor(() => ui("document.documentElement.dataset.uiReady && document.getElementById('legal-gate').hidden"), "legal acceptance after reload");
  assert.equal((await ui("window.brujula.getState()")).browserPreferences.defaultZoom, 125);
  await ui("window.brujula.setBrowserPreferences({defaultZoom:100,pipButton:true})");
  if (process.argv.includes("--ui-only")) {
    assert.deepEqual(failures, []);
    console.log("SLATE UI OK: category index/back, all 13 destinations, all search targets, keyboard/escape, unchanged preferences, focus/scroll preservation, both themes, high contrast, narrow vertical layout, quick accesses, legal acceptance and persistence.");
    app.quit();
    return;
  }
  // Render only local fixtures under secure test origins.
  const videoHtml = `<meta charset="utf-8"><body style="margin:0;background:#172333;color:white;font:16px sans-serif">
    <video id="fixture" muted autoplay playsinline style="display:block;width:640px;height:360px;margin:20px"></video>
    <script>
    const canvas=document.createElement('canvas'); canvas.width=640;canvas.height=360;
    const ctx=canvas.getContext('2d');let t=0;setInterval(()=>{
      ctx.fillStyle='#233b60';ctx.fillRect(0,0,640,360);
      ctx.fillStyle='#fff';ctx.font='26px sans-serif';ctx.fillText('Slate • Video local '+(++t),40,90);
    },50);
    document.getElementById('fixture').srcObject=canvas.captureStream(20);
    </script></body>`;
  session.defaultSession.protocol.handle("https", request =>
    new Response(videoHtml, { headers: { "content-type": "text/html" } }));
  await ui("window.brujula.navigate('https://slate-video.test')");
  const videoContents = await waitFor(() => webContents.getAllWebContents().find(wc => wc.getURL().startsWith("https://slate-video.test")), "fixture tab");
  await waitFor(() => videoContents.executeJavaScript("document.querySelector('video')?.readyState >= 2 && document.querySelectorAll('[data-slate-pip]').length===1"), "visible PiP control");
  assert.equal(await videoContents.executeJavaScript("typeof window.brujula"), "undefined");
  const control = await videoContents.executeJavaScript(`(() => {
    const r=document.querySelector('[data-slate-pip]').getBoundingClientRect();
    const v=document.querySelector('video').getBoundingClientRect();
    if(r.width!==34 || r.height!==24 || Math.abs(r.x+r.width/2-(v.x+v.width/2))>1)
      throw new Error('PiP must be compact and top-centered');
    return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
  })()`);
  videoContents.sendInputEvent({ type: "mouseMove", x: 10, y: 10 });
  await waitFor(() => videoContents.executeJavaScript("document.querySelector('[data-slate-pip]').style.opacity==='0'"), "PiP initially hidden outside video");
  videoContents.sendInputEvent({ type: "mouseMove", x: 100, y: 100 });
  await waitFor(() => videoContents.executeJavaScript("getComputedStyle(document.querySelector('[data-slate-pip]')).opacity==='1'"), "PiP fades in on video hover");
  await fs.writeFile(path.join(output, "slate-pip-discreto-visible.jpg"), (await videoContents.capturePage()).toJPEG(90));
  await waitFor(() => videoContents.executeJavaScript("getComputedStyle(document.querySelector('[data-slate-pip]')).opacity==='0'"), "PiP auto-hides while pointer is idle");
  assert.equal(await videoContents.executeJavaScript(`(() => {
    const h=document.querySelector('[data-slate-pip]'),r=h.getBoundingClientRect();
    return h.style.pointerEvents==='none' && document.elementFromPoint(r.x+17,r.y+12)!==h;
  })()`), true);
  await fs.writeFile(path.join(output, "slate-pip-discreto-oculto.jpg"), (await videoContents.capturePage()).toJPEG(90));
  videoContents.sendInputEvent({ type: "mouseMove", x: 120, y: 110 });
  await waitFor(() => videoContents.executeJavaScript("document.querySelector('[data-slate-pip]').style.opacity==='1'"), "PiP reappears on movement");
  videoContents.sendInputEvent({ type: "mouseMove", x: 10, y: 10 });
  await waitFor(() => videoContents.executeJavaScript("document.querySelector('[data-slate-pip]').style.opacity==='0'"), "PiP hides on leaving video");
  videoContents.focus();
  videoContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
  videoContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
  await waitFor(() => videoContents.executeJavaScript("document.querySelector('[data-slate-pip]').matches(':focus-within') && document.querySelector('[data-slate-pip]').style.opacity==='1'"), "keyboard focus reveals PiP");
  await pause(1800);
  assert.equal(await videoContents.executeJavaScript("document.querySelector('[data-slate-pip]').style.opacity"), "1");
  await videoContents.executeJavaScript("document.body.tabIndex=-1;document.body.focus();document.querySelector('video').disablePictureInPicture=true");
  videoContents.sendInputEvent({ type: "mouseMove", ...control });
  await waitFor(() => videoContents.executeJavaScript("getComputedStyle(document.querySelector('[data-slate-pip]')).opacity==='1'"), "icon hit target ready");
  videoContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...control });
  videoContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...control });
  await waitFor(() => videoContents.executeJavaScript("Boolean(document.pictureInPictureElement)"), "PiP from actual mouse click");
  await fs.writeFile(path.join(output, "slate-boton-pip.jpg"), (await videoContents.capturePage()).toJPEG(88));
  await videoContents.executeJavaScript("document.exitPictureInPicture()");
  await waitFor(() => videoContents.executeJavaScript("document.querySelector('video').disablePictureInPicture===true"), "restore original video PiP attribute");
  await ui("window.brujula.setBrowserPreferences({pipButton:false})");
  await waitFor(() => videoContents.executeJavaScript("document.querySelectorAll('[data-slate-pip]').length===0"), "disable control cleans up");
  await ui("window.brujula.setBrowserPreferences({pipButton:true})");
  await waitFor(() => videoContents.executeJavaScript("document.querySelectorAll('[data-slate-pip]').length===1"), "reenable control");
  // Same installer covers open shadow roots, dynamically inserted video and frames.
  await videoContents.executeJavaScript(`(() => {
    const root=document.createElement('div');document.body.append(root);
    const shadow=root.attachShadow({mode:'open'});
    const video=document.createElement('video');shadow.append(video);
    video.muted=true;video.srcObject=document.getElementById('fixture').srcObject;video.play();
    const frame=document.createElement('iframe');frame.src='https://embedded-video.test';
    frame.allow='picture-in-picture';document.body.append(frame);
  })()`);
  await waitFor(() => videoContents.executeJavaScript("document.querySelectorAll('[data-slate-pip]').length===2"), "dynamic shadow video");
  await waitFor(async () => {
    const frame = videoContents.mainFrame.framesInSubtree.find(f => f.url.startsWith("https://embedded-video.test"));
    return frame && frame.executeJavaScript("document.querySelectorAll('[data-slate-pip]').length===1");
  }, "cross-origin iframe control");
  assert.deepEqual(failures, []);
  console.log("SLATE SETTINGS OK: compact top-center PiP, hover, idle/exit auto-hide, no invisible hit target, keyboard focus, real PiP click, attribute restoration, settings, dynamic shadow video and cross-origin frame.");
  app.quit();
})().catch(error => {
  console.error("SLATE SETTINGS FAILED", error.stack || error);
  app.exit(1);
});
