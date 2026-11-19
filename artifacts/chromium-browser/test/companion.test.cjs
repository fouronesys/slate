const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { FeatureStore, DEFAULT_HOME, homePatch } = require("../src/features.cjs");
// Exercise pure geometry directly: loading the native controller under Node
// can make the ECS package download an executable before any test can run.
const { boundedPosition, chooseWaypoint, stepToward } = require("../src/companion-motion.cjs");

test("short strolls choose safe targets instead of chasing the mouse", () => {
  const area = { x: 218, y: 100, width: 800, height: 600 };
  const start = boundedPosition({ x: 700, y: 430 }, area);
  for (const random of [() => 0, () => .25, () => .5, () => .9]) {
    const target = chooseWaypoint(start, area, random);
    assert.ok(target.x >= area.x && target.y >= area.y);
    assert.ok(target.x + target.width <= area.x + area.width);
    assert.ok(target.y + target.height <= area.y + area.height);
    assert.ok(Math.hypot(target.x - start.x, target.y - start.y) > 0);
  }
});
test("walking uses elapsed time, rests at its target and cannot leap after inactivity", () => {
  const start = { x: 0, y: 0, width: 250, height: 240 };
  const target = { x: 100, y: 0 };
  assert.equal(stepToward(start, target, 50).x, 2.1);
  assert.equal(stepToward(start, target, 0).x, 0);
  assert.equal(stepToward(start, target, 60000).x, 4.2);
  assert.deepEqual(stepToward({ ...start, x: 99 }, target, 50), { ...start, x: 100, arrived: true });
});

test("companion upgrade keeps existing choices and validates portable and secret preferences", () => {
  const old = { enabled: false, kind: "robot", name: "Nova", color: "#abcdef" };
  const upgraded = homePatch(DEFAULT_HOME, { companion: old }).companion;
  assert.deepEqual(upgraded, { ...DEFAULT_HOME.companion, ...old });
  const unlocked = homePatch(DEFAULT_HOME, { companion: { ...old, enabled: true, secretUnlocked: true, cosmic: true, floating: true } });
  assert.equal(unlocked.companion.cosmic, true);
  assert.equal(homePatch(unlocked, { companion: { ...old, enabled: true } }).companion.floating, true);
  assert.equal(homePatch(DEFAULT_HOME, { companion: { ...old, cosmic: true } }).companion.cosmic, false);
  for (const key of ["floating", "followCursor", "secretUnlocked", "cosmic"]) {
    assert.throws(() => homePatch(DEFAULT_HOME, { companion: { ...old, [key]: "true" } }), /no válida/);
  }
});
test("companion placement stays in page bounds even beside vertical tabs and a panel", () => {
  for (const area of [{ x: 0, y: 97, width: 1320, height: 763 }, { x: 218, y: 91, width: 226, height: 509 }]) {
    for (const point of [{ x: -800, y: -800 }, { x: 9999, y: 9999 }, { x: 450, y: 240 }]) {
      const result = boundedPosition(point, area);
      assert.ok(result.x >= area.x && result.y >= area.y);
      assert.ok(result.x + result.width <= area.x + area.width);
      assert.ok(result.y + result.height <= area.y + area.height);
    }
  }
});
test("portable companion and unlocked appearance persist without losing collections", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slate-pet-"));
  try {
    const store = new FeatureStore(root);
    store.action({ type: "home:update", patch: { companion: { ...DEFAULT_HOME.companion, floating: true, secretUnlocked: true, cosmic: true } } });
    const restored = new FeatureStore(root);
    assert.equal(restored.data.home.companion.floating, true);
    assert.equal(restored.data.home.companion.cosmic, true);
    assert.equal(restored.data.collections[0].id, "inbox");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
