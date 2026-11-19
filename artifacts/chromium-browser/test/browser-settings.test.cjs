const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizePreferences, updatePreferences } = require("../src/browser-preferences.cjs");
const { legalSnapshot, acceptLegal } = require("../src/legal-state.cjs");
const documents = require("../src/legal-documents.cjs");
const { commandsFor } = require("../src/browser-commands.cjs");
const { normalizeAppearance } = require("../src/appearance.cjs");
const { syncVideoButtons, installVideoButtons } = require("../src/video-buttons.cjs");

test("new profiles use system type and existing choices remain unchanged", () => {
  assert.equal(normalizeAppearance({}).fontFamily, "system");
  assert.equal(normalizeAppearance({}).headingFont, "system");
  assert.equal(normalizeAppearance({ fontFamily: "sans", headingFont: "editorial" }).fontFamily, "sans");
  assert.equal(normalizeAppearance({ fontFamily: "sans", headingFont: "editorial" }).headingFont, "editorial");
});
test("browser preferences accept only bounded functional settings", () => {
  assert.deepEqual(normalizePreferences({}), { pipButton: true, defaultZoom: 100, backgroundTabs: false, onlineSuggestions: false, automaticUpdates: false });
  assert.equal(updatePreferences({}, { defaultZoom: 125 }).defaultZoom, 125);
  for (const patch of [{ defaultZoom: 999 }, { pipButton: "yes" }, { backgroundTabs: 1 }, { onlineSuggestions: "yes" }, { inject: true }, null, []]) {
    assert.throws(() => updatePreferences({}, patch));
  }
  assert.deepEqual(normalizePreferences({ defaultZoom: 999, pipButton: false, backgroundTabs: true }),
    { pipButton: false, defaultZoom: 100, backgroundTabs: true, onlineSuggestions: false, automaticUpdates: false });
  assert.equal(updatePreferences({}, { onlineSuggestions: true }).onlineSuggestions, true);
  assert.equal(normalizePreferences({ onlineSuggestions: "true" }).onlineSuggestions, false);
});
test("legal acceptance requires current version and each independent declaration", () => {
  const input = { version: documents.version, terms: true, privacy: true, adult: true };
  for (const key of ["terms", "privacy", "adult"]) {
    assert.throws(() => acceptLegal({ ...input, [key]: false }, () => true));
  }
  assert.throws(() => acceptLegal({ ...input, version: "old" }, () => true));
  assert.throws(() => acceptLegal(input, () => false), /guardar/);
  const record = acceptLegal({ ...input, dateOfBirth: "not retained", name: "not retained" }, () => true,
    () => "2026-11-18T00:00:00.000Z");
  assert.equal(legalSnapshot(record).accepted, true);
  assert.equal(legalSnapshot({ ...record, adult: false }).accepted, false);
  assert.equal(legalSnapshot({ ...record, acceptedAt: "invalid" }).accepted, false);
  assert.equal(legalSnapshot({ ...record, version: "old" }).accepted, false);
  assert.equal(legalSnapshot({}).accepted, false);
  assert.deepEqual(Object.keys(record).sort(), ["acceptedAt", "adult", "privacy", "terms", "version"]);
});
test("legal drafts disclose local storage, external providers and minors", () => {
  assert.equal(documents.minimumAge, 6);
  assert.equal(documents.country, "República Dominicana");
  assert.match(documents.disclaimer, /revisión/);
  for (const term of ["Google", "GitHub", "Widevine", "menor", "descargas", "perfil", "aceptación"]) {
    assert.ok(JSON.stringify(documents).includes(term), term);
  }
});
test("command catalog keeps only existing shortcuts and unique command IDs", () => {
  const mac = commandsFor("darwin");
  assert.equal(new Set(mac.map(command => command.id)).size, mac.length);
  assert.equal(mac.find(command => command.id === "pip").shortcut, "⌘⇧P");
  assert.equal(commandsFor("win32").find(command => command.id === "pip").shortcut, "Ctrl+Shift+P");
  assert.equal(mac.find(command => command.id === "quit").shortcut, "");
});
test("PiP controls are page-local and cover live HTTP frames without a privileged bridge", async () => {
  const scripts = [];
  const frames = [
    { url: "https://example.test", executeJavaScript: async s => scripts.push(s) },
    { url: "https://embed.test", executeJavaScript: async s => scripts.push(s) },
    { url: "about:blank", executeJavaScript: async () => assert.fail("skip browser/blank pages") },
    { get url() { throw new Error("detached"); } },
  ];
  await syncVideoButtons({ isDestroyed: () => false, mainFrame: { framesInSubtree: frames } }, true);
  assert.equal(scripts.length, 2);
  assert.match(scripts[0], /\)\(true\)$/);
  assert.doesNotMatch(installVideoButtons.toString(), /ipcRenderer|brujula|fetch\(|require\(/);
  assert.match(installVideoButtons.toString(), /event\.isTrusted/);
  assert.match(installVideoButtons.toString(), /requestPictureInPicture/);
  assert.match(installVideoButtons.toString(), /observer\.disconnect/);
  scripts.length = 0;
  await syncVideoButtons({ isDestroyed: () => false, mainFrame: { framesInSubtree: frames } }, false);
  assert.match(scripts[0], /\)\(false\)$/);
});
