// Read-only capability probe. No accounts, external requests or CDM downloads.
// Runs in a disposable profile, never the user's browsing profile.
const { app, BrowserWindow, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { ExpiringPermissions } = require("../src/permissions.cjs");
const { REMOTE_WEB_PREFERENCES, configureNativePrivacy } = require("../src/native-privacy.cjs");

async function capabilities() {
  const video = document.createElement("video");
  const keys = {};
  for (const [label, keySystem, videoType, audioType] of [
    ["clearKey", "org.w3.clearkey", 'video/webm; codecs="vp8"', 'audio/webm; codecs="opus"'],
    ["widevineWebm", "com.widevine.alpha", 'video/webm; codecs="vp8"', 'audio/webm; codecs="opus"'],
    ["widevineMp4", "com.widevine.alpha", 'video/mp4; codecs="avc1.42E01E"', 'audio/mp4; codecs="mp4a.40.2"'],
  ]) {
    try {
      await navigator.requestMediaKeySystemAccess(keySystem, [{
        initDataTypes: ["cenc"],
        videoCapabilities: [{ contentType: videoType }],
        audioCapabilities: [{ contentType: audioType }],
        distinctiveIdentifier: "not-allowed",
        persistentState: "not-allowed",
        sessionTypes: ["temporary"],
      }]);
      keys[label] = { available: true };
    } catch (error) {
      keys[label] = { available: false, error: error.name };
    }
  }
  return {
    secureContext: window.isSecureContext,
    eme: typeof navigator.requestMediaKeySystemAccess === "function",
    pip: Boolean(document.pictureInPictureEnabled),
    codecs: {
      h264: video.canPlayType('video/mp4; codecs="avc1.42E01E"'),
      aac: video.canPlayType('audio/mp4; codecs="mp4a.40.2"'),
      vp8: video.canPlayType('video/webm; codecs="vp8"'),
    },
    keys,
  };
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slate-video-diagnostic-"));
  app.setPath("userData", profile);
  configureNativePrivacy(app.commandLine);
  const timer = setTimeout(() => { console.error("Diagnostic timed out"); app.exit(1); }, 25000);
  const windows = [];
  try {
    await app.whenReady();
    // ECS otherwise starts its component updater on a delay timer.
    if (require("electron").components) {
      const components = require("electron").components;
      components.updatesEnabled = false;
      components.whenReady([components.WIDEVINE_CDM_ID]).catch(() => {});
    }
    const results = {};
    for (const mode of ["slatePolicy", "mediaKeyControl"]) {
      const browserSession = session.fromPartition(`video-diagnostic-${mode}`);
      browserSession.protocol.handle("https", () => new Response("<!doctype html><title>Local video diagnostic</title>", {
        headers: { "Content-Type": "text/html" },
      }));
      if (mode === "slatePolicy") new ExpiringPermissions(() => {}, () => false).bind(browserSession);
      else {
        // Isolated comparison only: authorize key-system checks for the local
        // fixture, NOT camera/microphone, storage access or ordinary browsing.
        browserSession.setPermissionCheckHandler((_wc, permission, origin) =>
          permission === "mediaKeySystem" && ["https://video-diagnostic.test", "https://video-diagnostic.test/"].includes(origin));
        browserSession.setPermissionRequestHandler((wc, permission, callback) =>
          callback(permission === "mediaKeySystem" && wc?.getURL() === "https://video-diagnostic.test/"));
      }
      const win = new BrowserWindow({ show: false, webPreferences: { ...REMOTE_WEB_PREFERENCES, session: browserSession } });
      windows.push(win);
      await win.loadURL("https://video-diagnostic.test/");
      results[mode] = await win.webContents.executeJavaScript(`(${capabilities.toString()})()`);
    }
    console.info(JSON.stringify({
      scope: "Local capability check only; does not validate service licenses or playback on macOS.",
      platform: process.platform, arch: process.arch,
      electron: process.versions.electron, chromium: process.versions.chrome, results,
    }, null, 2));
  } finally {
    clearTimeout(timer);
    for (const win of windows) if (!win.isDestroyed()) win.destroy();
    await fs.promises.rm(profile, { recursive: true, force: true });
    app.quit();
  }
})().catch(error => { console.error(error.message); app.exit(1); });
