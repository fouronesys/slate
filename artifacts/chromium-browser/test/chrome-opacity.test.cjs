const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_APPEARANCE, normalizeAppearance, updateAppearance } = require("../src/appearance.cjs");

test("bar opacity upgrades old profiles and persists validated percentages", () => {
  assert.equal(normalizeAppearance({}).chromeOpacity, 45);
  for (const chromeOpacity of [10, 25, 80, 100]) {
    const next = updateAppearance(DEFAULT_APPEARANCE, { chromeOpacity });
    assert.equal(normalizeAppearance(JSON.parse(JSON.stringify(next))).chromeOpacity, chromeOpacity);
    assert.equal(next.theme, DEFAULT_APPEARANCE.theme);
  }
});

test("bar opacity rejects malformed input instead of accepting arbitrary styling", () => {
  for (const chromeOpacity of [-1, 0, 9, 101, 45.5, "45", "10%;color:red", null, NaN, Infinity]) {
    assert.throws(() => updateAppearance(DEFAULT_APPEARANCE, { chromeOpacity }), /no válida/);
    assert.equal(normalizeAppearance({ chromeOpacity }).chromeOpacity, 45);
  }
});
