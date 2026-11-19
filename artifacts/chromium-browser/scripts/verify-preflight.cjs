// Deterministic native regression for Electron's preflight redirect crash.
// Two loopback servers, a disposable session, no YouTube or personal data.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { app, BrowserWindow, session } = require("electron");
const { Protection } = require("../src/protection.cjs");

const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
});

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "brujula-preflight-"));
  const servers = [];
  let win;
  let timer;
  let exitCode = 1;
  try {
    app.setPath("userData", profile);
    await app.whenReady();
    timer = setTimeout(() => {
      console.error("FAIL: native preflight regression exceeded its deadline.");
      app.exit(1);
    }, 20000);
    const requests = [];
    const target = http.createServer((request, response) => {
      requests.push({ method: request.method, path: request.url });
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Headers", "x-trigger");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.end(request.url === "/get-target" ? "redirect-ok" : "ok");
    });
    servers.push(target);
    const targetUrl = await listen(target);
    const source = http.createServer((_request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.end("<!doctype html><title>Disposable preflight regression</title>");
    });
    servers.push(source);
    const sourceUrl = await listen(source);
    const browsing = session.fromPartition("preflight-regression");
    win = new BrowserWindow({
      show: false,
      webPreferences: { session: browsing, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    // Load the trusted HTTP fixture before installing the production HTTPS
    // navigation policy; all measured fetches use the real protection pipeline.
    await win.loadURL(sourceUrl);
    const protection = new Protection(browsing, profile, () => {});
    let preflights = 0;
    let redirects = 0;
    protection.engine = {
      onBeforeRequest(details, callback) {
        if (details.method === "OPTIONS" && details.url === `${targetUrl}/blocked-preflight`) {
          preflights += 1;
          return callback({ redirectURL: `${targetUrl}/preflight-target` });
        }
        if (details.method === "GET" && details.url === `${targetUrl}/get-source`) {
          redirects += 1;
          return callback({ redirectURL: `${targetUrl}/get-target` });
        }
        callback({});
      },
      onHeadersReceived(_details, callback) { callback({}); },
    };
    const result = await win.webContents.executeJavaScript(`(async () => {
      const attempt = async (url) => fetch(url, {
        method: 'POST', headers: { 'X-Trigger': '1' }, body: 'fixture',
      }).then(response => response.text(), () => 'blocked');
      return {
        blocked: await attempt(${JSON.stringify(`${targetUrl}/blocked-preflight`)}),
        allowed: await attempt(${JSON.stringify(`${targetUrl}/allowed-preflight`)}),
        redirected: await fetch(${JSON.stringify(`${targetUrl}/get-source`)}).then(response => response.text()),
      };
    })()`);
    assert.equal(preflights, 1, "actual CORS preflight must reach the filter");
    assert.equal(result.blocked, "blocked");
    assert.equal(result.allowed, "ok", "unmatched preflights must not be globally blocked");
    assert.equal(result.redirected, "redirect-ok", "ordinary GET redirects must be retained");
    assert.equal(redirects, 1);
    assert.equal(requests.some((request) => request.path === "/blocked-preflight"), false);
    assert.equal(requests.some((request) => request.path === "/preflight-target"), false);
    assert.ok(requests.some((request) => request.method === "OPTIONS" && request.path === "/allowed-preflight"));
    assert.ok(requests.some((request) => request.method === "POST" && request.path === "/allowed-preflight"));
    assert.equal(protection.counts(win.webContents.id).blocked, 2);
    console.info("PASS: redirected OPTIONS safely cancelled; normal preflight/POST and GET redirects work; no native crash.");
    exitCode = 0;
  } catch (error) {
    console.error(error);
  } finally {
    clearTimeout(timer);
    if (win && !win.isDestroyed()) win.destroy();
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await fs.rm(profile, { recursive: true, force: true });
    app.exit(exitCode);
  }
})().catch((error) => {
  console.error(error);
  app.exit(1);
});
