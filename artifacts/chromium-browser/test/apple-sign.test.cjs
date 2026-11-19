const { test } = require("node:test");
const assert = require("node:assert/strict");
const { signWithFingerprint } = require("../scripts/apple-sign.cjs");
const pkg = require("../package.json");

test("Apple signing preserves fingerprint and all signing protections", async () => {
  const options = {
    identity: "A".repeat(40),
    app: "/build/Slate Privacy.app",
    platform: "darwin",
    type: "distribution",
    keychain: "/keychain",
    optionsForFile: () => ({ hardenedRuntime: true, entitlements: "build/entitlements.mac.plist" }),
  };
  let received;
  await signWithFingerprint(options, async (value) => { received = value; });
  assert.deepEqual(received, options);
  assert.notEqual(received, options);
  assert.equal(pkg.build.mac.sign, "./scripts/apple-sign.cjs");
  assert.equal(pkg.build.mac.hardenedRuntime, true);
  assert.equal(pkg.build.afterSign, "./scripts/vmp-after-sign.cjs");
});

test("Apple signing refuses missing identities and display-name fallbacks", async () => {
  for (const identity of [undefined, "", "-", "Apple Development: Ejemplo", "A".repeat(39)]) {
    let called = false;
    await assert.rejects(signWithFingerprint({ identity }, async () => { called = true; }), /huella/);
    assert.equal(called, false);
  }
});

test("installed builder passes the fingerprint through the custom signing hook", async () => {
  const path = require("node:path");
  const builderDir = path.dirname(require.resolve("electron-builder"));
  require(require.resolve("app-builder-lib", { paths: [builderDir] }));
  const resolve = (name) => require.resolve(`app-builder-lib/out/${name}`, { paths: [builderDir] });
  const { MacPackager } = require(resolve("macPackager.js"));
  const codeSign = require(resolve("codeSign/macCodeSign.js"));
  const original = codeSign.sign;
  let received;
  codeSign.sign = async (options) => { received = options; };
  try {
    const root = path.resolve(__dirname, "..");
    const { installerConfiguration } = require("../scripts/package-mac-assisted.cjs");
    for (const mac of [pkg.build.mac, installerConfiguration("/stage", "/payload", "arm64").mac]) {
      await MacPackager.prototype.doSign.call({
        appInfo: { type: "commonjs" },
        info: { getWorkspaceRoot: async () => root },
      }, {
        identity: "B".repeat(40), app: "/build/Slate Privacy.app", platform: "darwin",
      }, mac, {
        name: "Apple Development: Nombre con acento á", hash: "B".repeat(40),
      });
      assert.equal(received.identity, "B".repeat(40));
    }
  } finally {
    codeSign.sign = original;
  }
});
