"use strict";

// No Electron import here: the controller can be tested without native code.
const FEED = Object.freeze({ provider: "github", owner: "fouronesys", repo: "slate", private: false });
class AppUpdates {
  constructor({ version, supported, factory, changed = () => {}, prepareInstall = async () => true }) {
    this.factory = factory;
    this.changed = changed;
    this.prepareInstall = prepareInstall;
    this.updater = null;
    this.busy = false;
    this.timer = null;
    this.generation = 0;
    this.state = { supported, version, status: supported ? "idle" : "unsupported", nextVersion: "", percent: 0, message: "" };
  }
  snapshot() { return { ...this.state }; }
  set(patch) { Object.assign(this.state, patch); this.changed(); }
  ready() {
    if (!this.state.supported) throw new Error("Las actualizaciones requieren Slate instalado en macOS desde una distribución firmada.");
    if (this.updater) return this.updater;
    const updater = this.factory();
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.logger = null; // Never log URLs, query parameters or raw server errors.
    updater.setFeedURL({ ...FEED });
    updater.netSession?.setPermissionRequestHandler((_web, _permission, done) => done(false));
    updater.netSession?.setPermissionCheckHandler(() => false);
    updater.on("checking-for-update", () => this.set({ status: "checking", message: "" }));
    updater.on("update-available", info => this.set({ status: "available", nextVersion: String(info.version), percent: 0 }));
    updater.on("update-not-available", () => this.set({ status: "current", nextVersion: "", message: "" }));
    updater.on("download-progress", info => this.set({
      status: "downloading", percent: Math.max(0, Math.min(100, Number(info.percent) || 0)),
    }));
    updater.on("update-downloaded", () => this.set({ status: "downloaded", percent: 100, message: "" }));
    updater.on("error", () => this.failed());
    this.updater = updater;
    return updater;
  }
  failed() {
    this.set({ status: "error", message: "No se pudo comprobar, descargar o instalar la actualización. Reintenta; no se omitirá la verificación de firma." });
  }
  async action(action) {
    if (!["check", "download", "install"].includes(action)) throw new Error("Acción de actualización no válida.");
    if (this.busy) return this.snapshot();
    if (action === "check" && ["downloading", "downloaded", "installing"].includes(this.state.status)) return this.snapshot();
    if (action === "download" && this.state.status !== "available") throw new Error("Comprueba primero si hay una versión disponible.");
    if (action === "install" && this.state.status !== "downloaded") throw new Error("Descarga primero la actualización.");
    this.busy = true;
    try {
      const updater = this.ready();
      if (action === "check") {
        this.set({ status: "checking", message: "" });
        await updater.checkForUpdates();
      } else if (action === "download") {
        this.set({ status: "downloading", percent: 0, message: "" });
        await updater.downloadUpdate();
      } else if (await this.prepareInstall()) {
        this.set({ status: "installing", message: "" });
        updater.quitAndInstall();
      }
    } catch {
      this.failed();
    } finally { this.busy = false; }
    return this.snapshot();
  }
  schedule(enabled, { delay = 20000, interval = 6 * 60 * 60 * 1000 } = {}) {
    this.stop();
    if (!enabled || !this.state.supported) return;
    const generation = this.generation;
    const tick = async () => {
      await this.action("check");
      if (this.timer && this.generation === generation) {
        this.timer = setTimeout(tick, interval);
        this.timer.unref?.();
      }
    };
    this.timer = setTimeout(tick, delay);
    this.timer.unref?.();
  }
  stop() { clearTimeout(this.timer); this.timer = null; this.generation++; }
}
module.exports = { AppUpdates, FEED };
