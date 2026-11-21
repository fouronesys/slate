"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { promisify } = require("node:util");
const execFile = promisify(require("node:child_process").execFile);
const { architectures } = require("../src/mac-updates/macho.cjs");
const { createNativeOps } = require("../src/mac-updates/native.cjs");
const { hashFile, treeHash, FRAMEWORK } = require("../src/mac-updates/verify.cjs");
const { writeRecoveryEntry, NAME } = require("../src/mac-updates/recovery.cjs");
const { save } = require("../src/mac-updates/transaction.cjs");
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
async function temporary(t) {
  // macOS TMPDIR may use /var while the native verifier requires /private/var.
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "slate-boundary-")));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
function thin(cpu) {
  const data = Buffer.alloc(64);
  data.writeUInt32LE(0xfeedfacf); data.writeUInt32LE(cpu, 4);
  return data;
}
function fat(is64) {
  const data = Buffer.alloc(256), stride = is64 ? 32 : 20;
  data.writeUInt32BE(is64 ? 0xcafebabf : 0xcafebabe);
  data.writeUInt32BE(2, 4);
  for (const [i, cpu] of [0x01000007, 0x0100000c].entries()) {
    const at = 8 + i * stride, offset = 128 + i * 64;
    data.writeUInt32BE(cpu, at);
    if (is64) { data.writeBigUInt64BE(BigInt(offset), at + 8); data.writeBigUInt64BE(64n, at + 16); }
    else { data.writeUInt32BE(offset, at + 8); data.writeUInt32BE(64, at + 12); }
    thin(cpu).copy(data, offset);
  }
  return data;
}
test("architecture verification reads thin and universal Mach-O without lipo or developer tools", async t => {
  const root = await temporary(t), file = path.join(root, "binary");
  for (const [data, expected] of [
    [thin(0x01000007), ["x86_64"]], [thin(0x0100000c), ["arm64"]],
    [fat(false), ["x86_64", "arm64"]], [fat(true), ["x86_64", "arm64"]],
  ]) {
    await fs.writeFile(file, data);
    assert.deepEqual(await architectures(file), expected);
  }
  for (const data of [Buffer.from("not mach-o"), thin(1), fat(false).subarray(0, 150)]) {
    await fs.writeFile(file, data);
    await assert.rejects(architectures(file));
  }
});
test("client verification uses stock commands only; publisher still validates stapled tickets", async t => {
  const root = await temporary(t), bundle = path.join(root, "Slate Privacy.app");
  const executable = path.join(bundle, "Contents/MacOS/Slate Privacy");
  const framework = path.join(bundle, FRAMEWORK);
  for (const file of [executable, framework]) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, thin(0x0100000c), { mode: 0o755 });
  }
  const calls = [];
  const get = {
    CFBundleIdentifier: "com.brujula.browser", CFBundleExecutable: "Slate Privacy",
    CFBundleShortVersionString: "0.2.0", CFBundleVersion: "0.2.0", LSMinimumSystemVersion: "12.0",
  };
  const execute = async (bin, args) => {
    calls.push([bin, args]);
    if (bin.endsWith("PlistBuddy")) return { stdout: get[args[1].replace("Print :", "")], stderr: "" };
    if (args.includes("-dv")) return { stdout: "", stderr: "Authority=Developer ID Application: Example\nTeamIdentifier=ABCD123456\nflags=0x10000(runtime)\nTimestamp=Example" };
    return { stdout: "", stderr: "" };
  };
  const record = {
    version: "0.2.0", build: "0.2.0", teamId: "ABCD123456", arch: "arm64",
    frameworkSha256: await hashFile(framework), bundleSha256: await treeHash(bundle),
  };
  const client = createNativeOps({ execute });
  await client.validate(bundle, record);
  await client.withDMG("fixture.dmg", path.join(root, "mount-client"), async () => {});
  assert.ok(calls.some(([bin]) => bin.endsWith("/spctl")));
  assert.ok(calls.every(([bin]) => !/xcrun|stapler|lipo|xcode/.test(bin)));
  const stock = new Set(["/usr/libexec/PlistBuddy", "/usr/bin/codesign", "/usr/sbin/spctl", "/usr/bin/hdiutil"]);
  assert.ok(calls.every(([bin]) => stock.has(bin)));
  calls.length = 0;
  const publisher = createNativeOps({ publisherTools: true, execute });
  await publisher.inspect(bundle);
  await publisher.withDMG("fixture.dmg", path.join(root, "mount-publisher"), async () => {});
  const staplerCalls = calls.filter(([bin]) => bin.endsWith("/xcrun"));
  assert.deepEqual(staplerCalls.map(([, args]) => args), [["stapler", "validate", bundle], ["stapler", "validate", "fixture.dmg"]]);
});
test("the user-accessible shell launcher restores the previous app while the normal launcher is absent", async t => {
  const root = await temporary(t), work = path.join(root, ".slate-update-fixture");
  await fs.mkdir(work);
  const previous = path.join(work, "previous.app"), target = path.join(root, "Slate Privacy.app");
  const profile = path.join(root, "profile");
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, "Cookies"), "cookie-before-update");
  const profileHash = await treeHash(profile, { bundle: false });
  const runtime = path.join(previous, "Contents/MacOS/Slate Privacy");
  await fs.mkdir(path.dirname(runtime), { recursive: true });
  // Test-only stand-in for the previous packaged ECS runtime. The actual
  // launcher never depends on a system node/python/Xcode installation.
  await fs.writeFile(runtime, `#!/bin/sh\nexec ${quote(process.execPath)} "$@"\n`, { mode: 0o700 });
  const current = { version: "0.1.0", build: "0.1.0", teamId: "ABCD123456" };
  const plan = { root, work, profile, current, record: { version: "0.2.0" }, parentPid: process.pid, phase: "replacing" };
  const locations = {
    previous, target, stage: path.join(work, "Slate Privacy.app"), failed: path.join(work, "failed.app"),
    snapshot: path.join(root, "profile-before"), failedProfile: path.join(root, "profile-after"),
    journal: path.join(root, "transaction.json"), decision: path.join(root, "decision.json"),
  };
  await save(locations.journal, plan);
  await writeRecoveryEntry(plan);
  await fs.mkdir(path.join(root, "helper"));
  const helper = require.resolve("../src/mac-updates/helper.cjs");
  // Drive the production helper and transaction engine via the real generated
  // shell entry. Inject only OS operations and temporary filesystem locations.
  await fs.writeFile(path.join(root, "helper/helper.cjs"), `
    const fs = require('node:fs');
    const { main } = require(${JSON.stringify(helper)});
    const current = ${JSON.stringify(current)};
    main(process.argv[2], process.argv[3], {
      platform: 'darwin',
      validate: async () => {},
      locations: ${JSON.stringify(locations)},
      ops: { assertStopped: async () => {}, inspect: async () => current },
      start: () => { fs.writeFileSync(${JSON.stringify(path.join(root, "opened"))}, 'previous'); return { unref() {} }; }
    }).catch(error => { console.error(error); process.exitCode = 1; });
  `);
  await assert.rejects(fs.stat(target), { code: "ENOENT" });
  assert.ok((await fs.stat(path.join(root, NAME))).mode & 0o100);
  const result = await execFile("/bin/sh", [path.join(root, NAME)], { timeout: 10000 });
  assert.match(result.stdout, /Slate se ha recuperado/);
  assert.ok(await fs.stat(path.join(target, "Contents/MacOS/Slate Privacy")));
  assert.equal(await treeHash(profile, { bundle: false }), profileHash);
  assert.equal(JSON.parse(await fs.readFile(locations.journal, "utf8")).phase, "restored");
  assert.equal(await fs.readFile(path.join(root, "opened"), "utf8"), "previous");
  await assert.rejects(fs.stat(previous), { code: "ENOENT" });
  // parentPid deliberately remains alive: recover must not wait on an old PID.
  assert.doesNotThrow(() => process.kill(process.pid, 0));
});
