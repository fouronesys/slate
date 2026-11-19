const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { arrangeZones, nearestZone, intersects, ZONES } = require("../src/home-layout.cjs");
const { FeatureStore, homePatch, DEFAULT_HOME } = require("../src/features.cjs");
const { normalizeLibrary } = require("../src/background-library.cjs");
test("nine widget anchors pack without intersections, including crowded and narrow windows", () => {
  assert.equal(nearestZone({ x: .9, y: .1 }), "top-right");
  assert.equal(nearestZone({ x: .5, y: .9 }), "bottom-center");
  for (const width of [340, 760, 1320]) {
    const obstacles = [{ x: 25, y: 20, width: 310, height: 200 }];
    const items = Array.from({ length: 30 }, (_, i) => ({ id: String(i), zone: ZONES[i % 9], width: 400, height: 80 + i * 9 }));
    const placed = arrangeZones(items, { width, height: 690 }, obstacles);
    for (const item of placed) {
      assert.ok(item.x >= 0 && item.x + item.width <= width);
      for (const other of [...obstacles, ...placed.filter(p => p.id !== item.id)]) assert.equal(intersects(item, other, 17), false);
    }
    assert.deepEqual(placed, arrangeZones(items, { width, height: 690 }, obstacles), "stable geometry");
  }
  assert.throws(() => homePatch(DEFAULT_HOME, { anchors: { clock: "offscreen" } }));
});
test("workspace layouts and hidden widgets survive switches and a fresh store", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slate-zones-"));
  try {
    let store = new FeatureStore(dir);
    store.action({ type: "home:update", patch: { hidden: ["clock"], anchors: { search: "bottom-left" } } });
    store.action({ type: "workspace:switch", id: "trabajo" });
    assert.deepEqual(store.data.home.hidden, ["games"]);
    store.action({ type: "home:update", patch: { anchors: { clock: "top-left" } } });
    store.action({ type: "workspace:switch", id: "personal" });
    assert.deepEqual(store.data.home.hidden, ["clock"]);
    assert.equal(store.data.home.anchors.search, "bottom-left");
    store = new FeatureStore(dir);
    store.action({ type: "workspace:switch", id: "trabajo" });
    assert.equal(store.data.home.anchors.clock, "top-left");
    store.action({ type: "workspace:switch", id: "compras" });
    assert.equal(store.data.home.anchors.collections, "middle-center");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("background library migrates the former active video and rejects paths, duplicates and missing files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slate-video-library-"));
  const name = "12345678-1234-1234-1234-123456789012.mp4";
  try {
    fs.writeFileSync(path.join(dir, name), "fixture");
    assert.deepEqual(normalizeLibrary([{ fileName: "../private.mp4" }, { fileName: name, name: "Mar" }, { fileName: name }], dir, name),
      [{ fileName: name, name: "Mar" }]);
    assert.equal(normalizeLibrary(null, dir, name).length, 1);
    fs.unlinkSync(path.join(dir, name));
    assert.equal(normalizeLibrary(null, dir, name).length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
