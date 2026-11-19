const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DEFAULT_APPEARANCE, COLOR_KEYS, normalizeAppearance, updateAppearance, resolveTheme } = require("../src/appearance.cjs");
const { FeatureStore, DEFAULT_HOME, homePatch } = require("../src/features.cjs");
const { palette, contrast } = require("../src/theme-tokens.cjs");

test("new profiles follow the OS theme while saved explicit choices are respected", () => {
  assert.equal(DEFAULT_APPEARANCE.theme, "sistema");
  assert.equal(resolveTheme(normalizeAppearance({}), true), "oscuro");
  assert.equal(resolveTheme(normalizeAppearance({}), false), "claro");
  assert.equal(resolveTheme(normalizeAppearance({ theme: "claro" }), true), "claro");
  assert.equal(resolveTheme(normalizeAppearance({ theme: "oscuro" }), false), "oscuro");
});

test("all chrome color preferences are validated and normalized, never CSS strings", () => {
  for (const key of COLOR_KEYS) {
    assert.equal(updateAppearance(DEFAULT_APPEARANCE, { [key]: "#Aa77EE" })[key], "#aa77ee");
    for (const value of ["red", "var(--other)", "#123", "url(file:///private)", null]) {
      assert.throws(() => updateAppearance(DEFAULT_APPEARANCE, { [key]: value }), /no válida/);
      assert.equal(normalizeAppearance({ [key]: value })[key], DEFAULT_APPEARANCE[key]);
    }
  }
  assert.equal(updateAppearance(DEFAULT_APPEARANCE, { colorMode: "propio" }).colorMode, "propio");
  assert.throws(() => updateAppearance(DEFAULT_APPEARANCE, { colorMode: "untrusted" }));
});

test("custom palette generates legible text on both light and dark arbitrary colors", () => {
  for (const hex of ["#000000", "#ffffff", "#63795e", "#ff0000", "#00ff00", "#0000ff", "#777777", "#ac89bc", "#124056"]) {
    const colors = palette(hex);
    assert.ok(contrast(hex, colors.ink) >= 4.5, `ink contrast on ${hex}`);
    assert.ok(contrast(hex, colors.muted) >= 4.5, `muted contrast on ${hex}`);
    assert.ok(contrast(hex, colors.quiet) >= 4.5, `quiet contrast on ${hex}`);
  }
  assert.throws(() => palette("blue"));
});

test("free widget positions and background settings persist, undo and reset without losing collections", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "slate-home-layout-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new FeatureStore(directory);
  assert.equal(store.data.home.widgetBackground, false);
  assert.equal(store.data.home.companion.enabled, true);
  const positions = { clock: { x: 0, y: 0 }, companion: { x: 1, y: 0.65 } };
  store.action({ type: "home:update", patch: { positions, widgetBackground: true } });
  assert.deepEqual(new FeatureStore(directory).data.home.positions, positions);
  store.action({ type: "home:undo" });
  assert.deepEqual(store.data.home.positions, {});
  assert.equal(store.data.home.widgetBackground, false);
  store.action({ type: "home:reset" });
  assert.equal(store.data.collections[0].id, "inbox");
});

test("legacy home profiles keep companion opt-out and gain safe layout defaults", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "slate-home-migrate-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new FeatureStore(directory);
  const saved = store.snapshot();
  delete saved.home.positions;
  delete saved.home.widgetBackground;
  saved.home.companion.enabled = false;
  fs.writeFileSync(path.join(directory, "features.json"), JSON.stringify(saved));
  const restored = new FeatureStore(directory);
  assert.deepEqual(restored.data.home.positions, {});
  assert.equal(restored.data.home.widgetBackground, false);
  assert.equal(restored.data.home.companion.enabled, false);
});

test("invalid widget positions cannot create invisible or offscreen layouts", () => {
  for (const positions of [null, [], { evil: { x: 0, y: 0 } }, { clock: { x: -1, y: 0 } },
    { clock: { x: 0, y: Infinity } }, { clock: { x: 0, y: NaN } }, { clock: { x: 2, y: 0 } },
    { clock: { x: "1", y: 0 } }, { clock: { x: 0, y: 0, top: 999999 } }]) {
    assert.throws(() => homePatch(DEFAULT_HOME, { positions }));
  }
  assert.throws(() => homePatch(DEFAULT_HOME, { widgetBackground: "false" }));
});
