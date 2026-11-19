const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  NATIVE_FEATURES, REMOTE_WEB_PREFERENCES, NATIVE_COVERAGE,
  configureNativePrivacy, restrictPermissions,
} = require("../src/native-privacy.cjs");
const { schemefulSite, isThirdParty } = require("../src/privacy-policy.cjs");

test("native features are set before readiness without overriding unrelated features", () => {
  const switches = new Map([
    ["enable-features", "OtherFeature,ThirdPartyStoragePartitioning:override/false"],
    ["disable-features", "ForceThirdPartyCookieBlockingEnabled,OtherDisabled"],
  ]);
  const commandLine = {
    getSwitchValue: (key) => switches.get(key) || "",
    removeSwitch: (key) => switches.delete(key),
    appendSwitch: (key, value) => switches.set(key, value),
  };
  configureNativePrivacy(commandLine);
  configureNativePrivacy(commandLine);
  assert.equal(switches.get("enable-features"), ["OtherFeature", ...NATIVE_FEATURES].join(","));
  assert.equal(switches.get("disable-features"), "OtherDisabled");
});

test("native permission requests cannot bypass storage isolation or enumerate local fonts", () => {
  let request, check;
  restrictPermissions({
    setPermissionRequestHandler: (fn) => { request = fn; },
    setPermissionCheckHandler: (fn) => { check = fn; },
  });
  for (const permission of ["storage-access", "top-level-storage-access", "local-fonts"]) {
    assert.equal(check(null, permission), false);
    request(null, permission, (allowed) => assert.equal(allowed, false));
  }
  assert.equal(REMOTE_WEB_PREFERENCES.disableBlinkFeatures, "FontAccess");
  assert.equal(REMOTE_WEB_PREFERENCES.sandbox, true);
});

test("fullscreen policy can never grant camera, storage or other permissions", () => {
  let request, check;
  restrictPermissions({
    setPermissionRequestHandler: (fn) => { request = fn; },
    setPermissionCheckHandler: (fn) => { check = fn; },
  }, () => true);
  for (const permission of ["storage-access", "top-level-storage-access", "local-fonts", "media",
    "display-capture", "geolocation", "notifications", "automatic-fullscreen"]) {
    assert.equal(check(null, permission), false);
    request(null, permission, (allowed) => assert.equal(allowed, false));
  }
  assert.equal(check(null, "fullscreen"), true);
  request(null, "fullscreen", (allowed) => assert.equal(allowed, true));
});

test("sites are schemeful and respect private public suffixes", () => {
  assert.equal(schemefulSite("https://cdn.example.co.uk:8443/path"), "https://example.co.uk");
  assert.equal(schemefulSite("file:///tmp/page"), "");
  assert.equal(isThirdParty("https://example.com/x", "http://example.com", "xhr"), true);
  assert.notEqual(schemefulSite("https://one.github.io"), schemefulSite("https://two.github.io"));
});

test("coverage never presents unsupported fingerprint randomization as protection", () => {
  for (const key of ["canvas", "audio", "webgl"]) assert.match(NATIVE_COVERAGE[key], /Sin aleatorización/);
  assert.match(NATIVE_COVERAGE.fonts, /CSS detectable/);
});
