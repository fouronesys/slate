const { test } = require("node:test");
const assert = require("node:assert/strict");
const layout = require("../src/home-layout.cjs");

test("widget positions round-trip within usable space rather than total window size", () => {
  for (const bounds of [{ width: 1320, height: 760 }, { width: 366, height: 1200 }]) {
    const size = { width: 230, height: 95 };
    for (const position of [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.3, y: 0.8 }]) {
      const rect = layout.fromNormalized(position, bounds, size);
      const restored = layout.toNormalized(rect, bounds);
      assert.ok(Math.abs(restored.x - position.x) < 0.00001);
      assert.ok(Math.abs(restored.y - position.y) < 0.00001);
      assert.ok(rect.x + rect.width <= bounds.width && rect.y + rect.height <= bounds.height);
    }
  }
});

test("crowded and narrow layouts grow vertically without covering widgets or reserved controls", () => {
  for (const width of [260, 366, 552, 926, 1320]) {
    const bounds = { width, height: 690 };
    const obstacles = [{ x: 12, y: 22, width: Math.min(310, width-24), height: 160 }];
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: String(i), x: i % 2 ? 1000 : -90, y: i * 5, width: Math.min(width, i % 2 ? 320 : 520), height: i === 4 ? 320 : 130,
    }));
    const placed = layout.resolveCollisions(items, bounds, 14, obstacles);
    assert.equal(placed.length, 6);
    assert.ok(placed.contentHeight >= Math.max(...placed.map((r) => r.y + r.height)));
    for (const rect of placed) {
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width);
      for (const obstacle of obstacles) assert.equal(layout.intersects(rect, obstacle, 0), false);
    }
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      assert.equal(layout.intersects(placed[i], placed[j], 0), false, `overlap at ${width}`);
    }
  }
});
