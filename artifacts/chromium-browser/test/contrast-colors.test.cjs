"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { ink, luminance, ratio, over, cover } = require("../src/contrast-colors.cjs");
test("the browser-only contrast controller has valid classic-script syntax", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/home-contrast.cjs"), "utf8");
  assert.doesNotThrow(() => new (require("node:vm").Script)(source));
});
test("local contrast preserves readable ink and uses negative only when needed", () => {
  const readable = [230, 230, 230];
  assert.equal(ink([12, 12, 12], readable), readable);
  assert.deepEqual(ink([240, 240, 240], readable), [15, 15, 15]);
  assert.deepEqual(ink([10, 20, 30], [15, 15, 15]), [245, 235, 225]);
});
test("middle greys never rely on their nearly identical negative", () => {
  for (let v = 0; v < 256; v++) {
    const background = [v, v, v], selected = ink(background, background);
    assert.ok(ratio(luminance(background), luminance(selected)) >= 4.5);
  }
});
test("coloured backgrounds have readable output without changing the background", () => {
  for (const r of [0, 64, 128, 192, 255]) for (const g of [0, 64, 128, 192, 255]) for (const b of [0, 64, 128, 192, 255]) {
    const background = [r, g, b], copy = [...background];
    const result = ink(background, [120, 130, 140]);
    assert.ok(ratio(luminance(background), luminance(result)) >= 4.5);
    assert.deepEqual(background, copy);
  }
});
test("widget surfaces compose in paint order; cover crops match the video", () => {
  assert.deepEqual(over([200, 200, 200], [0, 0, 0, 255]), [0, 0, 0]);
  assert.deepEqual(over([200, 200, 200], [0, 0, 0, 0]), [200, 200, 200]);
  assert.deepEqual(cover(1920, 1080, 1000, 1000), { x: 420, y: 0, width: 1080, height: 1080 });
});
