const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Downloads, safeName, unusedPath } = require("../src/downloads.cjs");
test("download names stay in the target directory and do not reuse existing or reserved names", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slate-downloads-"));
  try {
    assert.equal(safeName("../../outside.txt"), "outside.txt");
    assert.equal(safeName("C:\\files\\evil?.txt"), "evil_.txt");
    fs.writeFileSync(path.join(dir, "file.txt"), "keep");
    assert.equal(unusedPath(dir, "file.txt"), path.join(dir, "file (1).txt"));
    assert.equal(unusedPath(dir, "file.txt", new Set([path.join(dir, "file (1).txt")])), path.join(dir, "file (2).txt"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("download actions are scoped, progress is local, and revealing never executes a file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slate-downloads-"));
  let starts = 0;
  const revealed = [];
  const manager = new Downloads({ directory: dir, changed: () => {}, started: () => starts++,
    shell: { openPath: async p => { assert.equal(p, dir); return ""; }, showItemInFolder: p => revealed.push(p) } });
  const session = new EventEmitter();
  manager.bind(session, "personal");
  manager.bind(session, "personal");
  const item = new EventEmitter();
  let paused = false;
  Object.assign(item, { getFilename: () => "report.txt", getTotalBytes: () => 10, getReceivedBytes: () => 5,
    setSavePath: p => item.target = p, canResume: () => true, isPaused: () => paused,
    pause: () => paused = true, resume: () => paused = false, cancel: () => item.emit("done", {}, "cancelled") });
  session.emit("will-download", {}, item);
  const id = manager.snapshot("personal").entries[0].id;
  assert.equal(starts, 1);
  assert.equal(manager.snapshot("trabajo").entries.length, 0);
  await assert.rejects(manager.action("trabajo", id, "pause"));
  await manager.action("personal", id, "pause");
  assert.equal(manager.snapshot("personal").entries[0].paused, true);
  await manager.action("personal", id, "resume");
  assert.equal(paused, false);
  await assert.rejects(manager.action("personal", id, "show"));
  fs.writeFileSync(item.target, "hello");
  item.emit("done", {}, "completed");
  await manager.action("personal", id, "show");
  assert.deepEqual(revealed, [item.target]);
  assert.equal(manager.snapshot("personal").active, 0);
  await assert.rejects(manager.action("personal", id, "cancel"));
  fs.unlinkSync(item.target);
  await assert.rejects(manager.action("personal", id, "show"), /movió/);
  fs.rmSync(dir, { recursive: true, force: true });
});
