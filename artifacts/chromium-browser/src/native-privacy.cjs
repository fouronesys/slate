// These are Chromium network features, not Chrome-only preferences.
// Keep behavioural tests: an accepted command-line flag is not proof it works.
const NATIVE_FEATURES = Object.freeze([
  "ThirdPartyStoragePartitioning",
  "ForceThirdPartyCookieBlockingEnabled",
  "SplitCacheByNetworkIsolationKey",
  "SplitCodeCacheByNetworkIsolationKey",
  "PartitionConnectionsByNetworkIsolationKey",
]);

const REMOTE_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  // Native removal of the font-enumeration API. CSS font probing still exists.
  disableBlinkFeatures: "FontAccess",
});

const NATIVE_COVERAGE = Object.freeze({
  storage: "Partición nativa por sitio superior",
  cookies: "Terceros bloqueados también en JavaScript",
  canvas: "Sin aleatorización · huella accesible",
  audio: "Sin aleatorización · huella accesible",
  webgl: "Sin aleatorización · huella accesible",
  fonts: "Enumeración local desactivada · CSS detectable",
});

function configureNativePrivacy(commandLine) {
  // Apply before app.ready; retain unrelated options. A disabled copy of one
  // of our features must not silently override the privacy policy.
  const nameOf = (feature) => feature.split(/[<:]/, 1)[0];
  for (const [key, required] of [["enable-features", NATIVE_FEATURES], ["disable-features", []]]) {
    const existing = commandLine.getSwitchValue(key).split(",").filter(Boolean)
      .filter((feature) => !NATIVE_FEATURES.includes(nameOf(feature)));
    commandLine.removeSwitch(key);
    const value = [...existing, ...required].join(",");
    if (value) commandLine.appendSwitch(key, value);
  }
}

function restrictPermissions(browserSession, canFullscreen = () => false) {
  // Includes storage-access / top-level-storage-access: granting these could
  // bypass partitioning. A site adblock exception never grants permissions.
  const allowed = (contents, permission, details = {}, origin = "") =>
    permission === "fullscreen" && canFullscreen(contents, details, origin) === true;
  browserSession.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(allowed(contents, permission, details)));
  browserSession.setPermissionCheckHandler((contents, permission, origin, details) =>
    allowed(contents, permission, details, origin));
}

module.exports = {
  NATIVE_FEATURES, REMOTE_WEB_PREFERENCES, NATIVE_COVERAGE,
  configureNativePrivacy, restrictPermissions,
};
