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
