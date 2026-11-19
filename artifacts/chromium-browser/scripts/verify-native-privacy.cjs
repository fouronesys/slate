// Offline behavioural checks of Chromium, using the actual app and a fresh
// disposable profile. Fixture certificates and test rules never enter a user
// profile. This is not a Brave-equivalence or YouTube certification.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");
const { execFileSync } = require("node:child_process");
const { app, BrowserWindow, session, webContents, dialog } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");

const hosts = ["orchard.test", "harbor.test", "embed.test"];
let profile, server, cacheRequests = 0;
async function waitFor(check, description) {
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout: ${description}`);
}

// Executed only in the test page, not installed as a browser API override.
const storageProbe = `(async (value) => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("partition-proof", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("values");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const operation = async (mode, fn) => new Promise((resolve, reject) => {
    const tx = db.transaction("values", mode);
    const request = fn(tx.objectStore("values"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
  const cache = await caches.open("partition-proof");
  const root = await navigator.storage.getDirectory();
  if (value !== undefined) {
    localStorage.setItem("proof", value);
    await operation("readwrite", (store) => store.put(value, "proof"));
    await cache.put("/proof", new Response(value));
    const file = await root.getFileHandle("proof", {create: true});
    const stream = await file.createWritable();
    await stream.write(value);
    await stream.close();
  }
  const cached = await cache.match("/proof");
  let fileValue = null;
  try { fileValue = await (await (await root.getFileHandle("proof")).getFile()).text(); }
  catch (error) { if (error.name !== "NotFoundError") throw error; }
  const result = [localStorage.getItem("proof"),
    (await operation("readonly", (store) => store.get("proof"))) ?? null,
    cached ? await cached.text() : null, fileValue];
  db.close();
  return result;
})`;

function tone() {
  const pcm = Buffer.alloc(8000);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.sin(i * 0.17) * 1000, i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF"); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24); header.writeUInt32LE(16000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

(async () => {
  // No await before requiring main: app.ready would race startup-only flags.
  profile = fsSync.mkdtempSync(path.join(os.tmpdir(), "brujula-native-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", path.join(profile, "key.pem"), "-out", path.join(profile, "cert.pem"),
    "-days", "1", "-subj", "/CN=embed.test", "-addext", `subjectAltName=${hosts.map((h) => `DNS:${h}`).join(",")}`],
  { stdio: "ignore" });
  // Seed minimal offline rules; the separate test:privacy verifies real lists.
  fsSync.writeFileSync(path.join(profile, "adblock-engine.bin"), ElectronBlocker.parse("||blocked.invalid^").serialize());
  app.setPath("userData", profile);
  app.commandLine.appendSwitch("host-resolver-rules", hosts.map((h) => `MAP ${h} 127.0.0.1`).join(","));
  app.commandLine.appendSwitch("no-proxy-server");
  require("../src/main.cjs");
  await app.whenReady();
  if (require("electron").components) {
    const components = require("electron").components;
    components.updatesEnabled = false;
    components.whenReady([components.WIDEVINE_CDM_ID]).catch(() => {});
  }
  session.defaultSession.setCertificateVerifyProc(({ hostname }, callback) => {
    callback(hosts.includes(hostname) ? 0 : -3);
  });
  server = https.createServer({
    key: await fs.readFile(path.join(profile, "key.pem")),
    cert: await fs.readFile(path.join(profile, "cert.pem")),
  }, (request, response) => {
    const port = server.address().port;
    const url = new URL(request.url, `https://${request.headers.host}`);
    response.setHeader("Cache-Control", "no-store");
    if (url.pathname === "/sw.js") {
      response.setHeader("Content-Type", "text/javascript");
      return response.end("self.addEventListener('install', () => self.skipWaiting()); self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));");
    }
    if (url.pathname === "/shared.js") {
      response.setHeader("Content-Type", "text/javascript");
      return response.end(`let value = null;
        self.onconnect = e => { const port = e.ports[0];
          port.onmessage = event => {
            if (event.data !== null) value = event.data;
            port.postMessage(value);
          }; port.start();
        };`);
    }
    if (url.pathname === "/network-cache") {
      response.setHeader("Cache-Control", "public, max-age=600");
      return response.end(String(++cacheRequests));
    }
    if (url.pathname === "/tone.wav") {
      response.setHeader("Content-Type", "audio/wav");
      return response.end(tone());
    }
    if (url.pathname === "/echo") {
      response.setHeader("Content-Type", "application/json");
      response.setHeader("Set-Cookie", "serverSession=firstparty; Secure; SameSite=None; Path=/");
      return response.end(JSON.stringify({ cookie: request.headers.cookie || "" }));
    }
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><title>Prueba nativa</title>
      ${url.pathname === "/top" ? `<iframe src="https://embed.test:${port}/frame"></iframe>` : ""}
      <video id="media" src="/tone.wav" muted></video>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const win = await waitFor(() => BrowserWindow.getAllWindows()[0], "window");
  const ui = (code) => win.webContents.executeJavaScript(code);
  await waitFor(async () => {
    try { return (await ui("window.brujula.getState()")).privacy.status === "ready"; }
    catch { return false; }
  }, "app with offline engine");
  const open = async (host) => {
    const url = `https://${host}:${port}/top`;
    await ui(`window.brujula.navigate(${JSON.stringify(url)})`);
    const contents = await waitFor(() => webContents.getAllWebContents().find((c) =>
      c.id !== win.webContents.id && c.getURL() === url && !c.isLoading()), "fixture top");
    const frame = await waitFor(() => contents.mainFrame.frames.find((f) =>
      f.url === `https://embed.test:${port}/frame`), "fixture iframe");
    return { contents, frame };
  };
  const read = (frame, value) => frame.executeJavaScript(`${storageProbe}(${JSON.stringify(value) ?? ""})`);
  const a = await open(hosts[0]);
  assert.deepEqual(await read(a.frame), [null, null, null, null]);
  assert.deepEqual(await read(a.frame, "site-A"), Array(4).fill("site-A"));
  const register = `(async () => {
    await navigator.serviceWorker.register('/sw.js?owner=A');
    return (await navigator.serviceWorker.ready).active.scriptURL;
  })()`;
  assert.match(await a.frame.executeJavaScript(register), /owner=A$/);
  // A separate top-level tab at a different eTLD+1 must not see A's data.
  await ui("window.brujula.newTab()");
  const b = await open(hosts[1]);
  assert.deepEqual(await read(b.frame), [null, null, null, null]);
  assert.equal(await b.frame.executeJavaScript("navigator.serviceWorker.getRegistration().then(r => r?.active?.scriptURL || null)"), null);
  assert.deepEqual(await read(b.frame, "site-B"), Array(4).fill("site-B"));
  assert.deepEqual(await read(a.frame), Array(4).fill("site-A"));
  const cacheProbe = "fetch('/network-cache').then(r => r.text())";
  const cachedA = await a.frame.executeJavaScript(cacheProbe);
  assert.equal(await a.frame.executeJavaScript(cacheProbe), cachedA);
  const cachedB = await b.frame.executeJavaScript(cacheProbe);
  assert.notEqual(cachedB, cachedA, "HTTP cache entries must be partitioned");
  const workerProbe = `(value => new Promise((resolve, reject) => {
    window.partitionWorker ||= new SharedWorker('/shared.js', {name: 'partition-proof'});
    partitionWorker.onerror = () => reject(new Error('SharedWorker failed'));
    partitionWorker.port.onmessage = e => resolve(e.data);
    partitionWorker.port.start();
    partitionWorker.port.postMessage(value);
  }))`;
  assert.equal(await a.frame.executeJavaScript(`${workerProbe}('worker-A')`), "worker-A");
  assert.equal(await b.frame.executeJavaScript(`${workerProbe}(null)`), null);
  assert.equal(await b.frame.executeJavaScript(`${workerProbe}('worker-B')`), "worker-B");
  assert.equal(await a.frame.executeJavaScript(`${workerProbe}(null)`), "worker-A");
  await a.frame.executeJavaScript(`window.partitionChannel = new BroadcastChannel('partition-proof');
    window.received = []; partitionChannel.onmessage = e => received.push(e.data);`);
  await b.frame.executeJavaScript(`window.partitionChannel = new BroadcastChannel('partition-proof');
    partitionChannel.postMessage('must-not-cross-sites');`);
  // Same-site peer confirms that lack of delivery isn't a broken fixture.
  await a.frame.executeJavaScript(`window.sameSiteChannel = new BroadcastChannel('partition-proof');
    sameSiteChannel.postMessage('same-site-control');`);
  await waitFor(async () => (await a.frame.executeJavaScript("received")).includes("same-site-control"), "BroadcastChannel control");
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(await a.frame.executeJavaScript("received"), ["same-site-control"]);
  await b.contents.reload();
  await waitFor(() => !b.contents.isLoading(), "reload");
  const reloadedB = b.contents.mainFrame.frames.find((f) => f.url.includes("embed.test"));
  assert.deepEqual(await read(reloadedB), Array(4).fill("site-B"));
  console.info("PASS: localStorage, IndexedDB, CacheStorage, OPFS and service workers isolated by top-level site; same-site persistence retained.");
  console.info("PASS: HTTP cache, SharedWorker and BroadcastChannel do not link the same embedded origin across sites.");

  // Create a real first-party cookie for the embedded origin, then try to
  // read/overwrite it from an embedded context (the old header-only gap).
  await session.defaultSession.cookies.set({
    url: `https://embed.test:${port}`, name: "firstParty", value: "keep",
    secure: true, sameSite: "no_restriction",
  });
  assert.equal(await reloadedB.executeJavaScript("document.cookie"), "");
  await reloadedB.executeJavaScript("document.cookie = 'thirdParty=leak; Secure; SameSite=None; Path=/'");
  assert.equal((await session.defaultSession.cookies.get({ name: "thirdParty" })).length, 0);
  assert.equal((await session.defaultSession.cookies.get({ name: "firstParty" }))[0].value, "keep");
  assert.equal(await reloadedB.executeJavaScript("document.requestStorageAccess().then(() => true, () => false)", true), false);
  // Preserve normal same-site sessions across requests and reloads.
  const login = await b.contents.executeJavaScript(`(async () => {
    await fetch('/echo');
    return (await (await fetch('/echo')).json()).cookie;
  })()`);
  assert.match(login, /serverSession=firstparty/);
  await b.contents.reload();
  await waitFor(() => !b.contents.isLoading(), "session reload");
  assert.match(await b.contents.executeJavaScript("document.cookie"), /serverSession=firstparty/);
  console.info("PASS: native third-party document.cookie read/write denied; first-party cookies and login-like session survive reload.");

  const surface = await b.contents.executeJavaScript(`(async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '15px serif'; ctx.fillText('Brújula', 1, 20);
    const canvasReadable = canvas.toDataURL().startsWith('data:image/png');
    const audio = new OfflineAudioContext(1, 512, 44100);
    const oscillator = audio.createOscillator();
    oscillator.connect(audio.destination); oscillator.start();
    const rendered = await audio.startRendering();
    const webgl = document.createElement('canvas').getContext('webgl');
    let localFonts = false;
    if (typeof queryLocalFonts === 'function') {
      try { await queryLocalFonts(); localFonts = true; } catch {}
    }
    const media = document.getElementById('media');
    await media.play();
    await new Promise((resolve, reject) => {
      media.onended = resolve; media.onerror = () => reject(new Error('Media playback failed'));
      setTimeout(() => reject(new Error('Media did not finish')), 5000);
    });
    return { canvasReadable, audioReadable: rendered.getChannelData(0).some(v => v !== 0),
      webglAvailable: !!webgl, localFonts, cssFontsAvailable: document.fonts.check('12px serif'),
      fontEnumerationRemoved: typeof queryLocalFonts === 'undefined',
      nativeCanvas: HTMLCanvasElement.prototype.toDataURL.toString().includes('[native code]'),
      mediaPlayed: media.currentTime > 0 };
  })()`, true);
  assert.equal(surface.canvasReadable, true);
  assert.equal(surface.audioReadable, true);
  assert.equal(surface.localFonts, false);
  assert.equal(surface.fontEnumerationRemoved, true);
  assert.equal(surface.nativeCanvas, true);
  assert.equal(surface.cssFontsAvailable, true);
  assert.equal(surface.mediaPlayed, true);
  console.info("PASS: honest fingerprint surface matrix and native HTML media playback:", surface);
  console.info("NOTE: WebGL hardware coverage, real OAuth providers and macOS playback require platform checks; no Brave equivalence claimed.");
  await ui("document.getElementById('privacy-toggle').click()");
  assert.match(await ui("document.getElementById('coverage-canvas').textContent"), /Sin aleatorización/);
  assert.match(await ui("document.getElementById('coverage-storage').textContent"), /Partición nativa/);
  await fs.mkdir(path.resolve(__dirname, "../../../generated-artifacts"), { recursive: true });
  await fs.writeFile(path.resolve(__dirname, "../../../generated-artifacts/brujula-native-privacy.png"), (await win.capturePage()).toPNG());
  // Confirm the existing delete flow removes the partitioned stores too.
  dialog.showMessageBox = async () => ({ response: 1 });
  assert.equal(await ui("window.brujula.clearSiteData()"), true);
  const cleared = await open(hosts[0]);
  assert.deepEqual(await read(cleared.frame), [null, null, null, null]);
  assert.equal(await cleared.frame.executeJavaScript("navigator.serviceWorker.getRegistration().then(r => !!r)"), false);
  assert.equal((await session.defaultSession.cookies.get({})).length, 0);
  console.info("PASS: confirmed deletion clears partitioned data and service workers.");
  for (const window of BrowserWindow.getAllWindows()) window.destroy();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(profile, { recursive: true, force: true });
  app.exit(0);
})().catch(async (error) => {
  console.error(error);
  if (server) server.close();
  if (profile) await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  app.exit(1);
});
