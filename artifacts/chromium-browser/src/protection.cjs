const fs = require("node:fs/promises");
const path = require("node:path");
const { webContents, ipcMain } = require("electron");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const { getDomain } = require("tldts");
const {
  hostnameOf, cleanNavigation, isThirdParty, requestHeaders, responseHeaders,
} = require("./privacy-policy.cjs");

const UPDATE_INTERVAL = 6 * 60 * 60 * 1000;
const { NATIVE_COVERAGE } = require("./native-privacy.cjs");
const sessionShields = new Map();
let cosmeticRouterInstalled = false;

// The upstream Electron adapter registers process-wide IPC handlers once per
// session. That cannot support multiple isolated spaces. Own the one router
// here, select the engine by the sender's native session, and keep the
// per-session preload and our existing composed webRequest pipeline.
function registerCosmeticSession(shield) {
  if (!cosmeticRouterInstalled) {
    ipcMain.handle("@ghostery/adblocker/inject-cosmetic-filters", (event, url, message) =>
      sessionShields.get(event.sender.session)?.engine?.onInjectCosmeticFilters(event, url, message));
    ipcMain.handle("@ghostery/adblocker/is-mutation-observer-enabled", (event) =>
      sessionShields.get(event.sender.session)?.engine?.config.enableMutationObserver === true);
    cosmeticRouterInstalled = true;
  }
  sessionShields.set(shield.session, shield);
  if (!shield.preloadScriptId) {
    const preload = require.resolve("@ghostery/adblocker-electron-preload", {
      paths: [path.dirname(require.resolve("@ghostery/adblocker-electron"))],
    });
    shield.preloadScriptId = shield.session.registerPreloadScript({ type: "frame", filePath: preload });
  }
}

class Protection {
  constructor(browserSession, dataPath, onChange, preferences = {}) {
    preferences = preferences && typeof preferences === "object" ? preferences : {};
    this.session = browserSession;
    this.dataPath = dataPath;
    this.onChange = onChange;
    this.engine = null;
    this.metrics = new Map();
    this.status = "loading";
    this.updating = false;
    this.lastUpdated = null;
    this.lastError = null;
    this.exceptions = new Set(
      Array.isArray(preferences.exceptions)
        ? preferences.exceptions.filter((host) => typeof host === "string" && hostnameOf(`https://${host}`) === host)
        : [],
    );
    this.rememberHistory = preferences.rememberHistory === true;
    this.refreshPromise = null;
    this.shutdown = new AbortController();
    this.bindNetwork();
  }

  get ready() { return this.engine !== null; }

  preferences() {
    return { exceptions: [...this.exceptions], rememberHistory: this.rememberHistory };
  }

  getState(id, url = "") {
    const site = hostnameOf(url);
    return {
      status: this.status,
      updating: this.updating,
      lastUpdated: this.lastUpdated,
      stale: Boolean(this.lastUpdated && Date.now() - this.lastUpdated > UPDATE_INTERVAL),
      lastError: this.lastError,
      scriptWarning: this.scriptWarning || null,
      site,
      siteEnabled: !this.exceptions.has(site),
      rememberHistory: this.rememberHistory,
      nativeCoverage: NATIVE_COVERAGE,
      ...this.counts(id),
    };
  }

  counts(id) {
    return this.metrics.get(id) || { blocked: 0, cookieHeaders: 0, cleanedLinks: 0 };
  }

  increment(id, key) {
    if (!id || id < 0) return;
    const counts = { ...this.counts(id) };
    counts[key] += 1;
    this.metrics.set(id, counts);
    if (!this.notifyTimer) {
      this.notifyTimer = setTimeout(() => {
        this.notifyTimer = null;
        this.onChange();
      }, 250);
      this.notifyTimer.unref();
    }
  }

  forget(id) { this.metrics.delete(id); }

  topUrl(details) {
    const contents = details.webContentsId && webContents.fromId(details.webContentsId);
    return (contents && !contents.isDestroyed() && contents.getURL()) || details.referrer || "";
  }

  enabledFor(details) {
    const top = details.resourceType === "mainFrame" ? details.url : this.topUrl(details);
    return !this.exceptions.has(hostnameOf(top));
  }

  // Electron permits only one listener per webRequest event. Compose policies
  // here rather than registering a second ad-block or cookie listener.
  bindNetwork() {
    this.session.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, originalCallback) => {
      // Electron 41 crashes in HandleBeforeRequestRedirect when a CORS
      // preflight has no target URLLoaderClient. Fail closed instead of
      // redirecting OPTIONS, including redirects returned by filter resources.
      // https://github.com/electron/electron/issues/52592
      const callback = (result) => originalCallback(
        details.method === "OPTIONS" && result.redirectURL ? { cancel: true } : result,
      );
      if (!/^https?:/i.test(details.url)) return callback({});
      if (!this.engine) return callback({ cancel: true });
      if (details.resourceType === "mainFrame") {
        const cleaned = cleanNavigation(details.url);
        if (cleaned && cleaned.url !== details.url) {
          if (cleaned.removed) this.increment(details.webContentsId, "cleanedLinks");
          return callback({ redirectURL: cleaned.url });
        }
      }
      if (!this.enabledFor(details)) return callback({});
      this.engine.onBeforeRequest(
        { ...details, referrer: this.topUrl(details) || details.referrer },
        (result) => {
          if (result.cancel || result.redirectURL) this.increment(details.webContentsId, "blocked");
          callback(result);
        },
      );
    });

    this.session.webRequest.onBeforeSendHeaders({ urls: ["<all_urls>"] }, (details, callback) => {
      const thirdParty = isThirdParty(details.url, this.topUrl(details), details.resourceType);
      const filtered = requestHeaders(details.requestHeaders, thirdParty);
      if (filtered.cookieBlocked) this.increment(details.webContentsId, "cookieHeaders");
      callback({ requestHeaders: filtered.headers });
    });

    this.session.webRequest.onHeadersReceived({ urls: ["<all_urls>"] }, (details, callback) => {
      const thirdParty = isThirdParty(details.url, this.topUrl(details), details.resourceType);
      const finish = (result) => {
        const filtered = responseHeaders(result.responseHeaders || details.responseHeaders, thirdParty);
        if (filtered.cookieBlocked) this.increment(details.webContentsId, "cookieHeaders");
        callback({ ...result, responseHeaders: filtered.headers });
      };
      if (this.engine && this.enabledFor(details)) {
        this.engine.onHeadersReceived(details, finish);
      } else {
        finish({});
      }
    });
  }

  install(engine) {
    if (this.disposed) return;
    this.scriptWarning = null;
    engine.onInjectCosmeticFilters = async (event, url, message) => {
      // Remote content can never use the browser UI bridge. Validate the
      // blocker's own IPC too, including subframe origin and session.
      if (event.sender.session !== this.session || event.sender.isDestroyed()) return;
      if (this.exceptions.has(hostnameOf(event.sender.getURL()))) return;
      let frameUrl;
      try { frameUrl = event.senderFrame?.url; } catch { return; }
      if (!frameUrl || frameUrl !== url || !/^https?:/i.test(url)) return;
      const frame = event.senderFrame;
      const hostname = hostnameOf(url);
      const firstRun = message === undefined;
      const { active, styles, scripts } = engine.getCosmeticsFilters({
        domain: getDomain(hostname) || "",
        hostname,
        url,
        classes: message?.classes,
        hrefs: message?.hrefs,
        ids: message?.ids,
        getBaseRules: firstRun,
        getInjectionRules: firstRun,
        getExtendedRules: false,
        getRulesFromHostname: firstRun,
        getRulesFromDOM: !firstRun,
        callerContext: { frameId: event.frameId, processId: event.processId, lifecycle: message?.lifecycle },
      });
      if (!active) return;
      // Execute in the requesting frame, not indiscriminately in the top frame.
      // One awaited bundle also avoids the upstream adapter's unhandled
      // executeJavaScript promises and dozens of queued load listeners.
      try {
        const styleCode = styles && frame !== event.sender.mainFrame
          ? `const style = document.createElement('style'); style.textContent = ${JSON.stringify(styles)}; (document.head || document.documentElement)?.append(style);`
          : "";
        if (scripts.length || styleCode) {
          const code = `(() => { let failures = 0; ${styleCode}\n${
            scripts.map((script) => `try { ${script}\n } catch { failures += 1; }`).join("\n")
          }\nreturn failures; })()`;
          const failures = await frame.executeJavaScript(code, true);
          if (failures) throw new Error("Scriptlet execution failed");
        }
        if (styles && frame === event.sender.mainFrame) {
          await event.sender.insertCSS(styles, { cssOrigin: "user" });
        }
      } catch {
        try {
          if (event.sender.isDestroyed() || frame.detached || frame.url !== url) return;
        } catch { return; }
        this.scriptWarning = "Algunas reglas de página no pudieron aplicarse. El bloqueo de red sigue activo; el vídeo puede mostrar anuncios.";
        this.onChange();
        console.warn("Brújula: algunas reglas de página no se pudieron aplicar.");
      }
    };
    this.engine = engine;
    registerCosmeticSession(this);
    this.bindNetwork();
    this.status = "ready";
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.shutdown.abort();
    clearInterval(this.timer);
    clearTimeout(this.notifyTimer);
    if (this.preloadScriptId) this.session.unregisterPreloadScript(this.preloadScriptId);
    this.preloadScriptId = null;
    sessionShields.delete(this.session);
    this.session.webRequest.onBeforeRequest(null);
    this.session.webRequest.onHeadersReceived(null);
    this.session.webRequest.onBeforeSendHeaders(null);
  }

  async start() {
    try {
      const file = path.join(this.dataPath, "adblock-engine.bin");
      const [bytes, stat] = await Promise.all([fs.readFile(file), fs.stat(file)]);
      this.install(ElectronBlocker.deserialize(bytes));
      this.lastUpdated = stat.mtimeMs;
    } catch {
      // No valid cache: navigation remains closed until lists are available.
      this.status = "loading";
    }
    if (this.disposed) return;
    this.onChange();
    if (!this.engine || Date.now() - this.lastUpdated > UPDATE_INTERVAL) await this.refresh();
    this.timer = setInterval(() => { void this.refresh(); }, UPDATE_INTERVAL);
    this.timer.unref();
  }

  refresh() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performRefresh().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  async performRefresh() {
    this.updating = true;
    this.lastError = null;
    this.onChange();
    try {
      const fetchList = async (input) => {
        const url = new URL(input);
        if (url.protocol !== "https:" || url.hostname !== "raw.githubusercontent.com") {
          throw new Error("Origen de filtros no permitido");
        }
        const response = await fetch(url, {
          signal: AbortSignal.any([AbortSignal.timeout(15000), this.shutdown.signal]),
          redirect: "error", credentials: "omit",
        });
        if (!response.ok) throw new Error(`Descarga de filtros: HTTP ${response.status}`);
        return response;
      };
      const engine = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetchList);
      if (this.disposed) return false;
      this.install(engine);
      this.lastUpdated = Date.now();
      try {
        await fs.mkdir(this.dataPath, { recursive: true });
        const file = path.join(this.dataPath, "adblock-engine.bin");
        await fs.writeFile(`${file}.tmp`, engine.serialize());
        await fs.rename(`${file}.tmp`, file);
      } catch {
        this.lastError = "Los filtros están activos, pero no se pudieron guardar para el próximo inicio.";
      }
      console.info("Brújula: filtros de anuncios, rastreo y reglas de página activos.");
    } catch {
      this.status = this.engine ? "ready" : "error";
      this.lastError = this.engine
        ? "No se pudo actualizar. Se mantienen los últimos filtros descargados."
        : "No se pudieron descargar los filtros. La navegación está bloqueada para no dejarte sin protección.";
      console.warn("Brújula: actualización de filtros no disponible.");
    } finally {
      this.updating = false;
      this.onChange();
    }
    return this.ready;
  }
}

module.exports = { Protection, UPDATE_INTERVAL };
