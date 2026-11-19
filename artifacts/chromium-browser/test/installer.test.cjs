const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseOptions, inspectArtwork, inspectSigningConfiguration, checkConfiguration } = require("../scripts/package-mac.cjs");
const { build } = require("../package.json");

test("Mac packaging defaults to both architectures and rejects unknown options", () => {
  assert.deepEqual(parseOptions([]), { check: false, arches: ["--arm64", "--x64"], vmpMode: "off", allowBinaryUpload: false });
  assert.deepEqual(parseOptions(["--check", "--arm64"]), { check: true, arches: ["--arm64"], vmpMode: "off", allowBinaryUpload: false });
  assert.throws(() => parseOptions(["--publish"]), /no reconocida/);
});

test("distribution preflight rejects lost signing hooks and bundled build tools", () => {
  inspectSigningConfiguration(build);
  for (const mutate of [
    value => { delete value.mac.sign; },
    value => { value.mac.hardenedRuntime = false; },
    value => { delete value.afterPack; },
    value => { delete value.afterSign; },
    value => { value.files.push("scripts/**/*"); },
    value => { value.files.push("release/**/*"); },
  ]) {
    const invalid = structuredClone(build);
    mutate(invalid);
    assert.throws(() => inspectSigningConfiguration(invalid));
  }
});

test("assisted package keeps manual launch, separate identity and fingerprint signing from staging", () => {
  const { installerConfiguration } = require("../scripts/package-mac-assisted.cjs");
  for (const arch of ["arm64", "x64"]) {
    const config = installerConfiguration("/stage", "/payload", arch);
    assert.equal(config.appId, "com.brujula.browser.installer");
    assert.equal(config.productName, "Instalar Slate Privacy");
    assert.equal(config.mac.sign, path.resolve(__dirname, "../scripts/apple-sign.cjs"));
    assert.equal(config.mac.hardenedRuntime, true);
    for (const key of ["sign", "entitlements", "entitlementsInherit"]) {
      assert.ok(path.isAbsolute(config.mac[key]));
      assert.ok(fs.existsSync(config.mac[key]));
    }
    assert.deepEqual(config.files, ["*.cjs", "guide.html", "package.json"]);
    assert.deepEqual(config.extraResources, [{ from: "/payload", to: "payload/Slate Privacy.app", filter: ["**/*"] }]);
    assert.deepEqual(config.dmg.contents, [{ x: 240, y: 180, type: "file" }]);
    assert.ok(config.dmg.artifactName.includes(`Asistido-\${version}-${arch}`));
    assert.equal(config.afterPack, undefined); // Never request VMP for the outer installer.
    assert.equal(config.mac.minimumSystemVersion, build.mac.minimumSystemVersion);
  }
});

test("DMG has the matching Retina artwork, native app and Applications link", async () => {
  const { artwork } = await checkConfiguration();
  assert.equal(artwork.width, 720);
  assert.equal(artwork.height, 480);
  assert.equal(artwork.retinaWidth, 1440);
  assert.equal(artwork.retinaHeight, 960);
  assert.deepEqual(build.dmg.contents, [
    { x: 198, y: 270, type: "file" },
    { x: 522, y: 270, type: "link", path: "/Applications" },
  ]);
  assert.equal(build.appId, "com.brujula.browser");
  assert.ok(build.dmg.artifactName.includes("${arch}"));
  assert.ok(!build.files.some((pattern) => pattern.includes("installer")));
});

test("installer rejects the old oversized Retina base and missing Retina partner", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slate-installer-scale-"));
  try {
    fs.mkdirSync(path.join(root, "installer"));
    const base = path.join(root, build.dmg.background);
    fs.copyFileSync(path.resolve(__dirname, "../installer/background@2x.png"), base);
    assert.throws(() => inspectArtwork(build, root), /720×480/);
    fs.copyFileSync(path.resolve(__dirname, "../installer/background.png"), base);
    assert.throws(() => inspectArtwork(build, root), /ENOENT/);
    fs.copyFileSync(path.resolve(__dirname, "../installer/background@2x.png"), base.replace(".png", "@2x.png"));
    assert.equal(inspectArtwork(build, root).width, 720);
    const invalid = structuredClone(build);
    invalid.dmg.contents[0].x = 800;
    assert.throws(() => inspectArtwork(invalid, root), /dentro de la ventana/);
    const wrongDensity = fs.readFileSync(base);
    const chunk = wrongDensity.indexOf(Buffer.from("pHYs"));
    assert.ok(chunk > 0);
    wrongDensity.writeUInt32BE(5669, chunk + 4);
    wrongDensity.writeUInt32BE(5669, chunk + 8);
    fs.writeFileSync(base, wrongDensity);
    assert.throws(() => inspectArtwork(build, root), /72 ppp/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("installer preflight fails explicitly if background is invalid", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slate-installer-"));
  try {
    fs.mkdirSync(path.join(root, "installer"));
    fs.writeFileSync(path.join(root, build.dmg.background), "not a PNG");
    assert.throws(() => inspectArtwork(build, root), /PNG válido/);
    assert.throws(() => inspectArtwork({ ...build, dmg: { ...build.dmg, background: "missing.png" } }, root), /ENOENT/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
