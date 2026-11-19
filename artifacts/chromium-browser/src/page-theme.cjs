const fs = require("node:fs");
const { resolveTheme } = require("./appearance.cjs");
const WORLD_ID = 1004;
function pageHost(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.hostname : "";
  } catch { return ""; }
}
function normalizeThemeExceptions(value) {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter(host => typeof host === "string" && host.length <= 253 &&
    pageHost(`https://${host}`) === host && !/[/?#@]/.test(host)).slice(0, 500));
}
function themePlan(tab, appearance, systemDark, exceptions) {
  const host = pageHost(tab?.url);
  const overridden = typeof tab?.pageThemeOverride === "boolean" ? tab.pageThemeOverride : null;
  return {
    host,
    enabled: Boolean(host) && appearance.pageTheme !== "original" && (overridden ?? !exceptions.has(host)),
    scheme: resolveTheme(appearance, systemDark),
    contrast: appearance.contrast === "alto",
  };
}
let bundle;
function themeScript(url, plan) {
  if (!bundle && plan.enabled) bundle = fs.readFileSync(require.resolve("darkreader"), "utf8");
  const options = {
    mode: plan.scheme === "oscuro" ? 1 : 0,
    brightness: 100, contrast: 100, sepia: 0, grayscale: 0, useFont: false,
    darkSchemeBackgroundColor: plan.contrast ? "#000000" : "#202124",
    darkSchemeTextColor: "#f1f3f4",
    lightSchemeBackgroundColor: plan.contrast ? "#ffffff" : "#f8f8f7",
    lightSchemeTextColor: "#202124",
    styleSystemControls: true,
  };
  // Runs in an isolated, unprivileged world. No preload, Node or IPC is exposed.
  // No page data leaves this world. Block Dark Reader's optional remote fetches.
  return `(() => {
    if (location.href !== ${JSON.stringify(url)}) return {skipped:true};
    if (document.contentType !== "text/html" && document.contentType !== "application/xhtml+xml") return {enabled:false};
    ${plan.enabled ? `if (!globalThis.DarkReader) { ${bundle}\n }
    DarkReader.setFetchMethod(() => Promise.reject(new Error("Slate no descarga recursos para adaptar colores.")));
    DarkReader.enable(${JSON.stringify(options)}, {
      ignoreImageAnalysis: ["*"],
      ignoreInlineStyle: ["img", "picture", "video", "canvas", "iframe", "input[type=color]"],
      disableStyleSheetsProxy: true
    });
    return {enabled:DarkReader.isEnabled()};` :
    `globalThis.DarkReader?.disable(); return {enabled:false};`}
  })()`;
}
class PageTheme {
  constructor(onChange = () => {}) {
    this.states = new Map();
    this.onChange = onChange;
  }
  status(tab) {
    return this.states.get(tab?.view.webContents.id)?.status || "pending";
  }
  invalidate(contents) {
    const state = this.states.get(contents.id);
    if (state) { state.revision++; state.key = null; }
  }
  forget(contents) { this.states.delete(contents.id); }
  async apply(tab, plan) {
    const contents = tab.view.webContents;
    if (contents.isDestroyed() || !pageHost(tab.url)) return;
    let state = this.states.get(contents.id);
    if (!state) {
      state = { revision: 0, key: null, status: "pending", queue: Promise.resolve() };
      this.states.set(contents.id, state);
    }
    const url = tab.url;
    const key = JSON.stringify([url, plan]);
    if (state.key === key) return state.queue;
    state.key = key;
    state.status = "pending";
    const revision = ++state.revision;
    state.queue = state.queue.catch(() => {}).then(async () => {
      if (contents.isDestroyed() || state.revision !== revision) return;
      try {
        const result = await contents.executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code: themeScript(url, plan) }]);
        if (state.revision !== revision || contents.isDestroyed()) return;
        state.status = result?.skipped ? "pending" : result?.enabled ? "adapted" : "original";
      } catch (error) {
        if (state.revision !== revision || contents.isDestroyed()) return;
        state.status = "error";
        console.warn("No se pudo adaptar el tema de una página:", error.message);
      }
      this.onChange();
    });
    return state.queue;
  }
}
module.exports = { WORLD_ID, pageHost, normalizeThemeExceptions, themePlan, themeScript, PageTheme };
