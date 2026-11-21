"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { verifyRecord, compare, assertPolicy, downloadURL, treeHash } = require("../src/mac-updates/verify.cjs");
const { allowed } = require("../src/mac-updates/network.cjs");
const { options, acceptance } = require("../scripts/mac-update-release.cjs");
const { install, rollback, exists } = require("../src/mac-updates/transaction.cjs");
const { MacUpdater } = require("../src/mac-updates/controller.cjs");
const pair = crypto.generateKeyPairSync("ed25519");
const policy = { repository: "fouronesys/slate", channel: "stable", publicKey: pair.publicKey.export({ type: "spki", format: "pem" }) };
const now = Date.now();
const current = { version: "0.1.0", build: "0.1.0", teamId: "ABCD123456" };
const valid = {
  schema: 1, repository: policy.repository, channel: "stable", version: "0.2.0", build: "0.2.0",
  bundleId: "com.brujula.browser", teamId: current.teamId, arch: "arm64", engine: "43.8.6+wvcus",
  minMacOS: "12.0", asset: "Slate-Privacy-0.2.0-arm64.dmg", size: 100,
  sha256: "a".repeat(64), bundleSha256: "b".repeat(64), frameworkSha256: "c".repeat(64),
  vmpCheckedAt: now, vmpValidUntil: now + 29 * 86400000,
};
const context = { current, arch: "arm64", macOS: "12.0", engine: valid.engine, now };
function signed(record = valid, key = pair.privateKey) {
  const bytes = Buffer.from(JSON.stringify(record));
  return { payload: bytes.toString("base64"), signature: crypto.sign(null, bytes, key).toString("base64") };
}
test("only signed stable records for the chosen repository and installed identity pass", () => {
  assert.deepEqual(verifyRecord(signed(), policy, context), valid);
  assert.throws(() => assertPolicy({ ...policy, publicKey: "" }), /no habilitadas/);
  assert.throws(() => verifyRecord(signed(), { ...policy, channel: "beta" }, context));
  const tampered = signed(); tampered.payload = Buffer.from(JSON.stringify({ ...valid, size: 99 })).toString("base64");
  assert.throws(() => verifyRecord(tampered, policy, context), /Firma/);
  const foreignKey = crypto.generateKeyPairSync("ed25519");
  assert.throws(() => verifyRecord(signed(valid, foreignKey.privateKey), policy, context), /Firma/);
});
for (const [field, value] of Object.entries({
  repository: "attacker/slate", channel: "beta", version: "0.1.0", build: "0.1.0",
  bundleId: "other.app", teamId: "OTHER12345", arch: "x64", engine: "44.0.0",
  minMacOS: "13.0", asset: "../other.dmg", size: -1, sha256: "bad",
  bundleSha256: "", frameworkSha256: "", vmpCheckedAt: now + 3600000,
  vmpValidUntil: now + 3600000,
})) {
  test(`rejects incompatible or incomplete ${field}`, () => assert.throws(() => verifyRecord(signed({ ...valid, [field]: value }), policy, context)));
}
test("downgrades, previews, old macOS, expired VMP and future attestations are blocked", () => {
  for (const version of ["0.0.9", "1.0.0-beta.1", "01.2.0", "garbage"]) assert.throws(() => verifyRecord(signed({ ...valid, version }), policy, context));
  assert.throws(() => verifyRecord(signed(), policy, { ...context, macOS: "11.7" }));
  assert.throws(() => verifyRecord(signed(), policy, { ...context, now: now + 29 * 86400000 }));
  assert.throws(() => verifyRecord(signed({ ...valid, vmpValidUntil: now + 31 * 86400000 }), policy, context));
  assert.equal(compare("0.10.0", "0.9.0"), 1);
  assert.equal(compare("12.0.0", "12.0"), 0);
});
test("network cannot redirect outside GitHub release hosts or to credentials/http", () => {
  for (const url of [
    "http://github.com/fouronesys/slate/releases/download/v1.0/a",
    "https://github.com/evil/slate/releases/download/v1.0/a",
    "https://evil.example/a", "https://github.com.evil.example/a",
    "https://user:password@github.com/fouronesys/slate/releases/download/v1.0/a",
    "https://api.github.com/repos/fouronesys/slate/issues",
    "https://127.0.0.1/a", "file:///etc/passwd",
  ]) assert.equal(allowed(url), false, url);
  assert.equal(allowed("https://api.github.com/repos/fouronesys/slate/releases/latest"), true);
  assert.equal(allowed(downloadURL("0.2.0", valid.asset)), true);
  assert.equal(allowed("https://release-assets.githubusercontent.com/assets/a?signature=example"), true);
  assert.throws(() => downloadURL("0.2.0", "../secret"));
});
test("promotion requires an explicit architecture-specific real-Mac acceptance report", () => {
  const report = { version: "0.2.0", arch: "arm64", sha256: valid.sha256, evidence: "Local real-Mac acceptance evidence reference" };
  for (const key of ["macOS12", "macOSCurrent", "stockMac", "install", "profile", "recovery", "recoveryLauncher", "video", "pip", "quit"]) report[key] = "APROBADO";
  acceptance(report, "0.2.0", "arm64", valid.sha256);
  assert.throws(() => acceptance({ ...report, recovery: "NO PROBADO" }, "0.2.0", "arm64", valid.sha256));
  assert.throws(() => acceptance({ ...report, stockMac: "NO PROBADO" }, "0.2.0", "arm64", valid.sha256));
  assert.throws(() => acceptance({ ...report, recoveryLauncher: "NO PROBADO" }, "0.2.0", "arm64", valid.sha256));
  assert.throws(() => acceptance(report, "0.2.0", "x64", valid.sha256));
  assert.throws(() => acceptance(report, "0.2.0", "arm64", "f".repeat(64)));
  assert.throws(() => options(["promote", "--publish", "yes"]));
  assert.throws(() => options(["trust", "--public-key", "a", "--public-key", "b"]));
});
test("unsupported platforms, development and MAS never enter the network path", async () => {
  for (const config of [{ platform: "linux", mas: false }, { platform: "darwin", mas: true }, { platform: "darwin", mas: false, packaged: false }]) {
    const messages = [];
    const updater = new MacUpdater({
      ...config, engine: valid.engine, getWindow: () => null,
      app: { isPackaged: config.packaged !== false, getPath: () => "/unused" },
      dialog: { showMessageBox: async value => { messages.push(value); return { response: 0 }; } },
    });
    await updater.open();
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /exclusivo/);
    assert.equal(await updater.bootstrap(), true);
  }
});
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "slate-update-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const p = Object.fromEntries(["target", "stage", "previous", "failed", "snapshot", "failedProfile"].map(key => [key, path.join(root, key)]));
  const profile = path.join(root, "profile");
  for (const dir of [p.target, p.stage, profile]) await fs.mkdir(dir, { mode: 0o700 });
  await fs.writeFile(path.join(p.target, "version"), "old");
  await fs.writeFile(path.join(p.stage, "version"), "new");
  await fs.writeFile(path.join(profile, "bookmarks.json"), '["saved"]');
  await fs.writeFile(path.join(profile, "Cookies"), "encrypted-cookie-fixture");
  await fs.writeFile(path.join(profile, "preferences.json"), '{"theme":"dark"}');
  await fs.mkdir(path.join(profile, "Partitions"));
  await fs.writeFile(path.join(profile, "Partitions", "workspace"), "persistent workspace cookie");
  const plan = { profile, current, record: valid, phase: "prepared" };
  const ops = {
    assertStopped: async () => {},
    validate: async bundle => assert.equal(await fs.readFile(path.join(bundle, "version"), "utf8"), "new"),
    inspect: async bundle => {
      const version = await fs.readFile(path.join(bundle, "version"), "utf8");
      return version === "old" ? current : { ...current, version: valid.version, build: valid.build };
    },
    copy: (from, to) => fs.cp(from, to, { recursive: true, preserveTimestamps: true }),
  };
  const journal = async () => {};
  return { plan, ops, journal, locations: p, p, profile, before: await treeHash(profile, { bundle: false }) };
}
test("successful replacement preserves every profile byte and retains the old app", async t => {
  const f = await fixture(t);
  await install(f.plan, { ...f, probe: async () => true });
  assert.equal(f.plan.phase, "accepted");
  assert.equal(await treeHash(f.profile, { bundle: false }), f.before);
  assert.equal(await fs.readFile(path.join(f.p.previous, "version"), "utf8"), "old");
  assert.equal(await treeHash(f.p.snapshot, { bundle: false }), f.before);
});
test("failed first launch restores the app and profile; migrated data is kept separately", async t => {
  const f = await fixture(t);
  await assert.rejects(install(f.plan, { ...f, probe: async () => {
    await fs.writeFile(path.join(f.profile, "Cookies"), "migrated-incompatible-data");
    return false;
  } }));
  await rollback(f.plan, f);
  assert.equal(f.plan.phase, "restored");
  assert.equal(await fs.readFile(path.join(f.p.target, "version"), "utf8"), "old");
  assert.equal(await treeHash(f.profile, { bundle: false }), f.before);
  assert.equal(await fs.readFile(path.join(f.p.failedProfile, "Cookies"), "utf8"), "migrated-incompatible-data");
  assert.ok(await exists(f.p.failed));
});
test("verification, permissions and running processes fail before touching the original", async t => {
  for (const failure of ["validate", "assertStopped", "copy"]) {
    const f = await fixture(t);
    f.ops[failure] = async () => { throw new Error(failure); };
    await assert.rejects(install(f.plan, { ...f, probe: async () => true }));
    assert.equal(await fs.readFile(path.join(f.p.target, "version"), "utf8"), "old");
    assert.equal(await treeHash(f.profile, { bundle: false }), f.before);
    assert.equal(await exists(f.p.previous), null);
  }
});
test("incomplete profile copies cannot replace the app", async t => {
  const f = await fixture(t);
  f.ops.copy = async (_from, to) => fs.mkdir(to);
  await assert.rejects(install(f.plan, { ...f, probe: async () => true }), /incompleta/);
  assert.equal(await fs.readFile(path.join(f.p.target, "version"), "utf8"), "old");
});
test("power loss between the two bundle renames can be recovered", async t => {
  const f = await fixture(t);
  f.plan.phase = "replacing";
  await fs.rename(f.p.target, f.p.previous);
  await rollback(f.plan, f);
  assert.equal(await fs.readFile(path.join(f.p.target, "version"), "utf8"), "old");
  assert.equal(await treeHash(f.profile, { bundle: false }), f.before);
});
test("rollback can resume after restoring the profile but before restoring the app", async t => {
  const f = await fixture(t);
  await install(f.plan, { ...f, probe: async () => true });
  f.plan.phase = "restoring"; f.plan.restoreProfile = true;
  await fs.rename(f.profile, f.p.failedProfile);
  await fs.rename(f.p.snapshot, f.profile);
  await rollback(f.plan, f);
  assert.equal(f.plan.phase, "restored");
  assert.equal(await treeHash(f.profile, { bundle: false }), f.before);
});
test("rollback resumes after moving the live profile and before restoring its snapshot", async t => {
  const f = await fixture(t);
  await install(f.plan, { ...f, probe: async () => true });
  f.plan.phase = "restoring"; f.plan.restoreProfile = true;
  await fs.rename(f.profile, f.p.failedProfile);
  await rollback(f.plan, f);
  assert.equal(await treeHash(f.profile, { bundle: false }), f.before);
  assert.equal(await fs.readFile(path.join(f.p.target, "version"), "utf8"), "old");
});
test("a crash after restoring the app but before saving the result is recoverable", async t => {
  const f = await fixture(t);
  await install(f.plan, { ...f, probe: async () => true });
  f.plan.phase = "restoring"; f.plan.restoreProfile = true;
  await fs.rename(f.profile, f.p.failedProfile);
  await fs.rename(f.p.snapshot, f.profile);
  await fs.rename(f.p.target, f.p.failed);
  await fs.rename(f.p.previous, f.p.target);
  await rollback(f.plan, f);
  assert.equal(f.plan.phase, "restored");
  assert.equal(await treeHash(f.profile, { bundle: false }), f.before);
});
test("a changed backup or missing previous app never causes a false restoration", async t => {
  const f = await fixture(t);
  await install(f.plan, { ...f, probe: async () => true });
  await fs.writeFile(path.join(f.p.snapshot, "Cookies"), "tampered-backup");
  await assert.rejects(rollback(f.plan, f), /cambió/);
  assert.ok(await exists(f.p.previous));
  await fs.rm(f.p.previous, { recursive: true });
  await assert.rejects(rollback(f.plan, f));
  assert.equal(await fs.readFile(path.join(f.p.target, "version"), "utf8"), "new");
});
test("bundle trees reject escaping symlinks while profile copies compare links without following them", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "slate-links-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.symlink("/tmp/not-read", path.join(dir, "SingletonSocket"));
  await assert.rejects(treeHash(dir), /Enlace/);
  assert.equal((await treeHash(dir, { bundle: false })).length, 64);
});
