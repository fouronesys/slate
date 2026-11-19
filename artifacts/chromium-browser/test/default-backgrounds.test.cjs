"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { defaultBackground } = require("../src/default-backgrounds.cjs");
const { DEFAULT_APPEARANCE, normalizeAppearance, updateAppearance } = require("../src/appearance.cjs");
const { validAsset } = require("../scripts/prepare-backgrounds.cjs");
test("the package pins the approved symmetric logo animations, not discarded backgrounds", () => {
  const manifest = require("../src/default-backgrounds.json");
  assert.equal(manifest.release, "slate-backgrounds-2");
  assert.equal(manifest.width, 1920);
  assert.equal(manifest.height, 1080);
  assert.equal(manifest.assets.find(asset => asset.name === "slate-dark-1080.mp4").sha256,
    "4dfb5fdade866b1e32dd9de4af573457206bc0c3eddc369da9f1995d299aedb8");
  assert.equal(manifest.assets.find(asset => asset.name === "slate-light-1080.mp4").sha256,
    "fa49f0fe5640253606b77e175d344710d603f40b4e4abe9299e1faa3e904fa25");
});
test("new profiles use local Slate videos; saved choices are never migrated over", () => {
  assert.equal(DEFAULT_APPEARANCE.backdrop, "slate");
  for (const backdrop of ["papel", "niebla", "lienzo", "video"]) {
    assert.equal(normalizeAppearance({ backdrop }).backdrop, backdrop);
    assert.equal(defaultBackground({ backdrop, theme: "oscuro" }, false, "/tmp/media"), null);
  }
  assert.equal(updateAppearance({ ...DEFAULT_APPEARANCE, backdrop: "video" }, { theme: "claro" }).backdrop, "video");
});
test("bundled video and still follow the resolved theme without remote URLs", () => {
  const directory = path.resolve("media with spaces");
  for (const [theme, systemDark, expected] of [
    ["oscuro", false, "dark"], ["claro", true, "light"],
    ["sistema", true, "dark"], ["sistema", false, "light"],
  ]) {
    const result = defaultBackground({ backdrop: "slate", theme }, systemDark, directory);
    assert.ok(result.builtin);
    assert.match(result.url, /^file:/);
    assert.ok(result.url.endsWith(`slate-${expected}-1080.mp4`));
    assert.ok(result.poster.endsWith(`slate-${expected}-1080.jpg`));
  }
});
test("asset verification rejects truncated or altered media even at matching size", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "slate-asset-check-"));
  try {
    const file = path.join(directory, "test.mp4");
    const asset = { bytes: 4, sha256: createHash("sha256").update("test").digest("hex") };
    assert.equal(validAsset(file, asset), false);
    fs.writeFileSync(file, "test");
    assert.equal(validAsset(file, asset), true);
    fs.writeFileSync(file, "fail");
    assert.equal(validAsset(file, asset), false);
    fs.writeFileSync(file, "tes");
    assert.equal(validAsset(file, asset), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
