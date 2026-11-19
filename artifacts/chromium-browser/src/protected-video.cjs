// Browser-owned CDM lifecycle. Video decoding stays on the user's machine.
// Components API: ECS v43 (not the incompatible v46 alpha API).
class ProtectedVideo {
  constructor({ components, enabled = false, persist, changed, timeout = 30000 }) {
    this.components = components;
    this.enabled = enabled === true;
    this.persist = persist;
    this.changed = changed;
    this.timeout = timeout;
    this.version = null;
    this.status = components ? "consent" : "unsupported";
    this.busy = null;
    this.generation = 0;
  }
  start() {
    if (!this.components) return;
    this.components.updatesEnabled = this.enabled;
    this.disabledAtStart = !this.enabled;
    if (this.enabled) void this.install();
    else {
      this.status = "consent";
      // ECS v43 creates one readiness promise per process. Observe it now,
      // with downloads disabled, rather than leaving an unhandled rejection.
      this.components.whenReady([this.components.WIDEVINE_CDM_ID]).catch(() => {});
    }
  }
  snapshot() {
    return {
      supported: Boolean(this.components),
      enabled: this.enabled,
      status: this.status,
      version: this.version,
    };
  }
  setEnabled(enabled) {
    if (typeof enabled !== "boolean") throw new Error("Preferencia de vídeo no válida.");
    if (!this.components) throw new Error("Este motor no incluye soporte de vídeo protegido.");
    this.persist({ enabled });
    this.enabled = enabled;
    this.components.updatesEnabled = enabled;
    this.changed();
    if (enabled && this.disabledAtStart) {
      // Its initial disabled readiness promise cannot be reused to install.
      this.status = "restart";
      this.changed();
    } else if (enabled) void this.install();
    else {
      this.generation++;
      this.status = "offline";
      this.changed();
    }
    return this.snapshot();
  }
  install() {
    if (!this.enabled || !this.components) return Promise.resolve();
    if (this.busy) return this.busy;
    const generation = ++this.generation;
    this.status = "installing";
    this.changed();
    let timer;
    this.busy = Promise.race([
      Promise.resolve().then(() => this.components.whenReady([this.components.WIDEVINE_CDM_ID])),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), this.timeout); }),
    ]).then(results => {
      if (generation !== this.generation) return;
      const result = results.find(entry => entry.id === this.components.WIDEVINE_CDM_ID);
      const version = result?.version || this.components.status()[this.components.WIDEVINE_CDM_ID]?.version;
      if (!version) throw new Error("missing-version");
      this.version = String(version);
      this.status = "installed";
    }).catch(() => {
      if (generation === this.generation) this.status = "error";
    }).finally(() => {
      clearTimeout(timer);
      this.busy = null;
      this.changed();
      // Re-enabling during an in-flight operation uses a fresh generation.
      if (this.enabled && generation !== this.generation) void this.install();
    });
    return this.busy;
  }
}

function allowProtectedMedia(contents, origin, details, enabled) {
  if (!enabled || !contents || contents.isDestroyed() || details?.isMainFrame === false) return false;
  try {
    const top = new URL(contents.getURL());
    const requesting = new URL(origin);
    return top.protocol === "https:" && requesting.origin === top.origin;
  } catch { return false; }
}

async function probeProtectedVideo() {
  if (!window.isSecureContext || !navigator.requestMediaKeySystemAccess) return { available: false, reason: "context" };
  try {
    await navigator.requestMediaKeySystemAccess("com.widevine.alpha", [{
      initDataTypes: ["cenc"],
      videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
      audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }],
      distinctiveIdentifier: "not-allowed", persistentState: "not-allowed", sessionTypes: ["temporary"],
    }]);
    return { available: true };
  } catch (error) {
    return { available: false, reason: error.name === "NotSupportedError" ? "unsupported" : "denied" };
  }
}
module.exports = { ProtectedVideo, allowProtectedMedia, probeProtectedVideo };
