"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validateRuntimeFiles } = require("../scripts/check-packaged-runtime.cjs");
const root = path.join(__dirname, "..");
const expected = require("../package.json");

function files() {
  const pkg = structuredClone(expected);
  delete pkg.build;
  delete pkg.devDependencies;
  delete pkg.scripts;
  return {
    "package.json": JSON.stringify(pkg),
    "src/runtime-metadata.json": fs.readFileSync(path.join(root, "src/runtime-metadata.json"), "utf8"),
    "src/main.cjs": fs.readFileSync(path.join(root, "src/main.cjs"), "utf8"),
    "src/mac-updates/controller.cjs": fs.readFileSync(path.join(root, "src/mac-updates/controller.cjs"), "utf8"),
  };
}

test("installed runtime keeps exact ECS identity without development package metadata", () => {
  const packaged = files();
  assert.doesNotThrow(() => validateRuntimeFiles(file => packaged[file], expected));
  assert.match(packaged["src/main.cjs"], /require\("\.\/runtime-metadata\.json"\)\.electronVersion/);
  assert.equal(JSON.parse(packaged["src/runtime-metadata.json"]).electronVersion, expected.build.electronVersion);
});

test("packaged validation rejects missing, mismatched and build-only runtime metadata", () => {
  for (const change of [
    data => { delete data["src/runtime-metadata.json"]; },
    data => { data["src/runtime-metadata.json"] = '{"electronVersion":"wrong","minimumSystemVersion":"12.0"}'; },
    data => { data["src/main.cjs"] += '\nrequire("../package.json").build.electronVersion;'; },
  ]) {
    const data = files();
    change(data);
    assert.throws(() => validateRuntimeFiles(file => data[file], expected));
  }
});

test("afterPack inspects real app.asar files, not the source package.json", async t => {
  const os = require("node:os");
  const builder = path.dirname(require.resolve("electron-builder"));
  const asar = require(require.resolve("@electron/asar", { paths: [builder] }));
  const { checkPackagedRuntime } = require("../scripts/check-packaged-runtime.cjs");
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "slate-runtime-asar-")));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, "input");
  const resources = path.join(dir, "resources");
  fs.mkdirSync(resources);
  for (const [name, content] of Object.entries(files())) {
    const target = path.join(input, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  await asar.createPackage(input, path.join(resources, "app.asar"));
  assert.doesNotThrow(() => checkPackagedRuntime({
    appOutDir: dir,
    packager: { getResourcesDir: out => { assert.equal(out, dir); return resources; } },
  }));
});
