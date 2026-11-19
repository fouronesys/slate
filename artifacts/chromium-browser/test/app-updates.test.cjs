const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AppUpdates, FEED } = require("../src/app-updates.cjs");
const { releaseGate, finalizeMetadata, digest } = require("../scripts/release-mac.cjs");
const { normalizePreferences, updatePreferences } = require("../src/browser-preferences.cjs");
const yaml = require("js-yaml");
function fixture(options = {}) {
  const calls = [];
  const updater = new EventEmitter();
  updater.setFeedURL = feed => { assert.deepEqual(feed, FEED); calls.push("feed"); };
  updater.checkForUpdates = async () => { calls.push("check"); updater.emit("update-available", { version: "0.2.0" }); };
  updater.downloadUpdate = async () => { calls.push("download"); updater.emit("download-progress", { percent: 75 }); updater.emit("update-downloaded"); };
  updater.quitAndInstall = () => calls.push("install");
  const controller = new AppUpdates({ supported: true, version: "0.1.1", factory: () => updater, ...options });
  return { controller, updater, calls };
}
test("checking never downloads, downloading never installs, and the public feed contains no token", async () => {
  const { controller, updater, calls } = fixture();
  assert.deepEqual(calls, []);
  assert.equal((await controller.action("check")).status, "available");
  assert.deepEqual(calls, ["feed", "check"]);
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.allowPrerelease, false);
  assert.equal((await controller.action("download")).status, "downloaded");
  assert.deepEqual(calls, ["feed", "check", "download"]);
  await controller.action("check");
  assert.equal(calls.at(-1), "download", "do not invalidate a ready download with a periodic check");
  await controller.action("install");
  assert.equal(calls.at(-1), "install");
});
test("unsupported platforms, invalid actions and missing prerequisites do not use the network", async () => {
  const { controller, calls } = fixture({ supported: false });
  await assert.rejects(controller.action("shell"), /no válida/);
  await assert.rejects(controller.action("download"), /primero/);
  await assert.rejects(controller.action("install"), /primero/);
  assert.equal((await controller.action("check")).status, "error");
  assert.deepEqual(calls, []);
});
test("installation cancellation and preparation failure never invoke the native installer", async () => {
  for (const prepareInstall of [async () => false, async () => { throw new Error("sensitive details"); }]) {
    const { controller, calls } = fixture({ prepareInstall });
    await controller.action("check");
    await controller.action("download");
    await controller.action("install");
    assert.ok(!calls.includes("install"));
    assert.ok(!JSON.stringify(controller.snapshot()).includes("sensitive"));
  }
});
test("concurrent checks are coalesced, errors are explicit, and automatic checks remain opt-in", async () => {
  const { controller, updater, calls } = fixture();
  let done;
  updater.checkForUpdates = () => new Promise(resolve => { done = resolve; });
  const first = controller.action("check");
  await controller.action("check");
  assert.equal(calls.filter(c => c === "feed").length, 1);
  done();
  await first;
  updater.emit("error", new Error("https://private.invalid/token"));
  assert.equal(controller.snapshot().status, "error");
  assert.ok(!JSON.stringify(controller.snapshot()).includes("private.invalid"));
  assert.equal(normalizePreferences({}).automaticUpdates, false);
  assert.equal(normalizePreferences({ automaticUpdates: "true" }).automaticUpdates, false);
  assert.equal(updatePreferences({}, { automaticUpdates: true }).automaticUpdates, true);
  assert.throws(() => updatePreferences({}, { automaticUpdates: "true" }), /no válida/);
  controller.schedule(false);
  assert.equal(controller.timer, null);
  controller.schedule(true, { delay: 10000 });
  assert.ok(controller.timer);
  controller.stop();
  assert.equal(controller.timer, null);
});
test("a disabled automatic check does not reschedule when an in-flight request finishes", async () => {
  const { controller, updater } = fixture();
  let finish;
  let began;
  const started = new Promise(resolve => { began = resolve; });
  updater.checkForUpdates = () => new Promise(resolve => { finish = resolve; began(); });
  controller.schedule(true, { delay: 1, interval: 10000 });
  await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error("timer")), 1000))]);
  controller.schedule(false);
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controller.timer, null);
});
test("release gate requires this repository, main, exact version, consent and all signing secrets", () => {
  const env = {
    GITHUB_REPOSITORY: "fouronesys/slate", GITHUB_REF: "refs/heads/main",
    SLATE_RELEASE_UPLOADS: "yes", SLATE_RELEASE_VERSION: "0.1.1",
    CSC_LINK: "fixture", CSC_KEY_PASSWORD: "fixture", APPLE_ID: "fixture",
    APPLE_APP_SPECIFIC_PASSWORD: "fixture", APPLE_TEAM_ID: "fixture",
  };
  assert.doesNotThrow(() => releaseGate(env, { version: "0.1.1" }));
  for (const key of Object.keys(env)) assert.throws(() => releaseGate({ ...env, [key]: "" }, { version: "0.1.1" }));
  assert.throws(() => releaseGate(env, { version: "0.2.0" }));
  const workflow = fs.readFileSync(path.join(__dirname, "../../../.github/workflows/slate-release.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /--draft/);
});
test("update metadata hashes the final stapled DMG and ZIP and rejects paths outside the release", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "slate-release-")));
  try {
    const zip = "Slate-Privacy-0.1.1-arm64.zip";
    const dmg = "Slate-Privacy-0.1.1-arm64.dmg";
    fs.writeFileSync(path.join(dir, zip), "zip containing signed app");
    fs.writeFileSync(path.join(dir, dmg), "final stapled dmg");
    const metadata = { version: "0.1.1", path: zip, sha512: "old", files: [{ url: zip }, { url: dmg }] };
    const file = path.join(dir, "latest-mac.yml");
    fs.writeFileSync(file, yaml.dump(metadata));
    finalizeMetadata(dir, "0.1.1");
    const info = yaml.load(fs.readFileSync(file, "utf8"));
    assert.equal(info.sha512, digest(path.join(dir, zip)));
    assert.equal(info.files[1].sha512, digest(path.join(dir, dmg)));
    assert.equal(info.files[1].size, fs.statSync(path.join(dir, dmg)).size);
    assert.match(fs.readFileSync(path.join(dir, "SHA256SUMS.txt"), "utf8"), /latest-mac.yml/);
    metadata.files.push({ url: "../outside" });
    fs.writeFileSync(file, yaml.dump(metadata));
    assert.throws(() => finalizeMetadata(dir, "0.1.1"), /no permitido/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
