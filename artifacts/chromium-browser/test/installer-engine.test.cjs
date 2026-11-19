"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { Installer, manifest } = require("../installer/engine.cjs");
const { installerConfiguration } = require("../scripts/package-mac-assisted.cjs");
const { buildGuide } = require("../scripts/build-install-guide.cjs");

async function fixture(t) {
  // The real installer only accepts canonical local destinations. macOS's
  // os.tmpdir() may use /var while realpath returns /private/var.
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "slate-copy-test-")));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "payload/Slate Privacy.app");
  const applications = path.join(root, "Applications");
  await fs.mkdir(path.join(source, "Contents/MacOS"), { recursive: true });
  await fs.mkdir(applications);
  await fs.writeFile(path.join(source, "Contents/MacOS/Slate Privacy"), "new-slate", { mode: 0o755 });
  await fs.symlink("MacOS/Slate Privacy", path.join(source, "Contents/link"));
  const states = [];
  const ops = {
    validate: async () => {},
    assertStopped: async () => {},
    copy: (from, to) => fs.cp(from, to, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true }),
  };
  const engine = new Installer({ source, applications, ops, platform: "darwin", onState: state => states.push(state.phase) });
  const target = engine.target;
  const prior = async () => {
    await fs.cp(source, target, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
    await fs.writeFile(path.join(target, "Contents/MacOS/Slate Privacy"), "old-slate");
  };
  return { source, applications, engine, ops, target, states, prior };
}
test("copy is staged, verified and promoted with executable mode and bundle symlinks", async t => {
  const f = await fixture(t);
  await f.engine.run();
  assert.equal(f.engine.state.phase, "done");
  assert.equal(await manifest(f.source), await manifest(f.target));
  assert.deepEqual(f.states, ["preparing", "copying", "verifying", "committing", "done"]);
  assert.deepEqual(await fs.readdir(f.applications), ["Slate Privacy.app"]);
});
test("existing app requires consent; consent replaces only the bundle", async t => {
  const f = await fixture(t);
  await f.prior();
  await f.engine.run();
  assert.match(f.engine.state.message, /consentimiento/);
  assert.equal(await fs.readFile(path.join(f.target, "Contents/MacOS/Slate Privacy"), "utf8"), "old-slate");
  await f.engine.run({ replace: true });
  assert.equal(f.engine.state.phase, "done");
  assert.equal(await manifest(f.source), await manifest(f.target));
});
for (const phase of ["preparing", "copying", "verifying"]) {
  test(`cancellation during ${phase} preserves prior app and removes staging`, async t => {
    const f = await fixture(t);
    await f.prior();
    f.engine.onState = state => { if (state.phase === phase) f.engine.cancel(); };
    await f.engine.run({ replace: true });
    assert.equal(f.engine.state.phase, "cancelled");
    assert.equal(await fs.readFile(path.join(f.target, "Contents/MacOS/Slate Privacy"), "utf8"), "old-slate");
    assert.deepEqual(await fs.readdir(f.applications), ["Slate Privacy.app"]);
  });
}
test("copy failure, corrupt copy and failure after promotion preserve prior installation", async t => {
  for (const failure of ["copy", "corrupt", "promote"]) {
    const f = await fixture(t);
    await f.prior();
    const copy = f.ops.copy;
    if (failure === "copy") f.ops.copy = async () => { throw Object.assign(new Error("write denied"), { code: "EACCES" }); };
    if (failure === "corrupt") f.ops.copy = async (a, b) => { await copy(a, b); await fs.writeFile(path.join(b, "Contents/link"), "corruption"); };
    if (failure === "promote") f.ops.validate = async bundle => { if (bundle === f.target && f.engine.state.phase === "committing") throw new Error("firma inválida"); };
    await f.engine.run({ replace: true });
    assert.equal(f.engine.state.phase, "error", failure);
    assert.equal(await fs.readFile(path.join(f.target, "Contents/MacOS/Slate Privacy"), "utf8"), "old-slate", failure);
    assert.deepEqual(await fs.readdir(f.applications), ["Slate Privacy.app"], failure);
  }
});
test("running app and symlinked destination are rejected before copy", async t => {
  const f = await fixture(t);
  f.ops.assertStopped = async () => { throw new Error("Slate está abierto"); };
  await f.engine.run();
  assert.match(f.engine.state.message, /abierto/);
  f.ops.assertStopped = async () => {};
  await fs.symlink(f.source, f.target);
  await f.engine.run({ replace: true });
  assert.equal(f.engine.state.phase, "error");
  assert.ok((await fs.lstat(f.target)).isSymbolicLink());
  assert.equal(await fs.readFile(path.join(f.source, "Contents/MacOS/Slate Privacy"), "utf8"), "new-slate");
});
test("a symlinked Applications directory remains rejected before copying", async t => {
  const f = await fixture(t);
  const alias = path.join(path.dirname(f.applications), "Applications-alias");
  await fs.symlink(f.applications, alias, process.platform === "win32" ? "junction" : "dir");
  const engine = new Installer({
    source: f.source, applications: alias, platform: "darwin",
    ops: { ...f.ops, copy: async () => assert.fail("must not copy through a directory alias") },
  });
  await engine.run();
  assert.equal(engine.state.phase, "error");
  assert.match(engine.state.message, /carpeta local segura/);
  assert.deepEqual(await fs.readdir(f.applications), []);
});
test("bundle rejects escaping links and unsupported systems explicitly", async t => {
  const f = await fixture(t);
  await fs.symlink("/etc/passwd", path.join(f.source, "escape"));
  await f.engine.run();
  assert.match(f.engine.state.message, /fuera del bundle/);
  f.engine.platform = "linux";
  await f.engine.run();
  assert.match(f.engine.state.message, /solo.*macOS/);
  assert.deepEqual(await fs.readdir(f.applications), []);
});
test("destination changes between preparation and commit are not overwritten", async t => {
  const f = await fixture(t);
  const copy = f.ops.copy;
  f.ops.copy = async (a, b) => { await copy(a, b); await f.prior(); };
  await f.engine.run();
  assert.equal(f.engine.state.phase, "error");
  assert.match(f.engine.state.message, /destino ha cambiado/);
  assert.equal(await fs.readFile(path.join(f.target, "Contents/MacOS/Slate Privacy"), "utf8"), "old-slate");
});
test("duplicate calls are locked; cancellation cannot interrupt commit", async t => {
  const f = await fixture(t);
  let copies = 0;
  const copy = f.ops.copy;
  f.ops.copy = async (...args) => { copies++; await copy(...args); };
  f.engine.onState = state => { if (state.phase === "committing") f.engine.cancel(); };
  await Promise.all([f.engine.run(), f.engine.run()]);
  assert.equal(copies, 1);
  assert.equal(f.engine.state.phase, "done");
});
test("insufficient space stops preparation without modifying existing app", async t => {
  const f = await fixture(t);
  await f.prior();
  t.mock.method(fs, "statfs", async () => ({ bavail: 0, bsize: 4096 }));
  await f.engine.run({ replace: true });
  assert.match(f.engine.state.message, /espacio suficiente/);
  assert.deepEqual(await fs.readdir(f.applications), ["Slate Privacy.app"]);
  assert.equal(await fs.readFile(path.join(f.target, "Contents/MacOS/Slate Privacy"), "utf8"), "old-slate");
});
test("failed restoration keeps the previous bundle and reports its recovery path", async t => {
  const f = await fixture(t);
  await f.prior();
  const rename = fs.rename.bind(fs);
  t.mock.method(fs, "rename", async (from, to) => {
    if (from.endsWith("previous.app")) throw new Error("restoration blocked");
    return rename(from, to);
  });
  f.ops.validate = async bundle => {
    if (bundle === f.target && f.engine.state.phase === "committing") throw new Error("final check failed");
  };
  await f.engine.run({ replace: true });
  assert.equal(f.engine.state.phase, "error");
  assert.match(f.engine.state.message, /Conserva la copia anterior/);
  const work = (await fs.readdir(f.applications)).find(name => name.startsWith(".slate-install-"));
  assert.ok(work);
  assert.equal(await fs.readFile(path.join(f.applications, work, "previous.app/Contents/MacOS/Slate Privacy"), "utf8"), "old-slate");
});
test("interrupted commit recovery is surfaced before another installation", async t => {
  const f = await fixture(t);
  const pending = path.join(f.applications, ".slate-install-interrupted");
  await fs.mkdir(pending);
  await fs.cp(f.source, path.join(pending, "previous.app"), { recursive: true, verbatimSymlinks: true });
  await f.engine.run();
  assert.match(f.engine.state.message, /pendiente de recuperar/);
  assert.equal(await fs.readFile(path.join(pending, "previous.app/Contents/MacOS/Slate Privacy"), "utf8"), "new-slate");
  assert.deepEqual(await fs.readdir(f.applications), [".slate-install-interrupted"]);
});
test("guide is self-contained with approved Miso and restrictive CSP; packaging is separate", () => {
  const { html, mascotHash } = buildGuide();
  assert.ok(mascotHash);
  assert.match(html, /Miso, pequeño gato negro/);
  assert.match(html, /Solo es una demostración/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:|url\(["']?https?:|__[A-Z_]+__/);
  assert.match(html, /prefers-reduced-motion/);
  const config = installerConfiguration("/stage", "/payload/Slate Privacy.app", "arm64");
  assert.notEqual(config.appId, require("../package.json").build.appId);
  assert.equal(config.extraResources[0].to, "payload/Slate Privacy.app");
  assert.ok(!require("../package.json").build.files.some(file => file.includes("installer")));
});
