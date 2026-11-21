"use strict";
const path = require("node:path");
const assert = require("node:assert/strict");

function validateRuntimeFiles(read, expected) {
  const pkg = JSON.parse(read("package.json"));
  const runtime = JSON.parse(read("src/runtime-metadata.json"));
  assert.equal(pkg.main, "src/main.cjs", "Entrada del navegador inesperada.");
  assert.equal(pkg.version, expected.version, "Versión empaquetada incorrecta.");
  assert.equal(runtime.electronVersion, expected.build.electronVersion, "Motor empaquetado incorrecto.");
  assert.equal(runtime.minimumSystemVersion, expected.build.mac.minimumSystemVersion, "Compatibilidad macOS incorrecta.");
  // Build configuration is deliberately absent from production package.json.
  // Reject this dependency even if a future packager happens to retain it.
  for (const file of ["src/main.cjs", "src/mac-updates/controller.cjs"]) {
    const source = read(file);
    assert.doesNotMatch(source, /require\(["']\.\.\/package\.json["']\)\s*\.build\b/,
      `${file} depende de metadatos eliminados al empaquetar.`);
  }
}

function checkPackagedRuntime(context) {
  const builder = path.dirname(require.resolve("electron-builder"));
  const asar = require(require.resolve("@electron/asar", { paths: [builder] }));
  const resources = context.packager.getResourcesDir(context.appOutDir);
  const archive = path.join(resources, "app.asar");
  validateRuntimeFiles(file => asar.extractFile(archive, file).toString("utf8"), require("../package.json"));
  console.info("PASS: metadatos del motor y entrada comprobados dentro del app.asar final.");
}

module.exports = { validateRuntimeFiles, checkPackagedRuntime };
