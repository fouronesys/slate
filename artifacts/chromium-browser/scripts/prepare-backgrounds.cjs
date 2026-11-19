"use strict";
// Build/development utility only. The installed browser never contacts GitHub
// to fetch a wallpaper and never needs a GitHub token.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const manifest = require("../src/default-backgrounds.json");
const directory = path.resolve(__dirname, "../../../generated-artifacts/slate-default-backgrounds");
function validAsset(file, asset) {
  try {
    return fs.statSync(file).size === asset.bytes &&
      createHash("sha256").update(fs.readFileSync(file)).digest("hex") === asset.sha256;
  } catch { return false; }
}
function prepareBackgrounds({ source, execute = spawnSync } = {}) {
  fs.mkdirSync(directory, { recursive: true });
  for (const asset of manifest.assets) {
    const target = path.join(directory, asset.name);
    if (validAsset(target, asset)) continue;
    const stage = fs.mkdtempSync(path.join(directory, ".prepare-"));
    try {
      const staged = path.join(stage, asset.name);
      if (source) fs.copyFileSync(path.join(source, asset.name), staged);
      else {
        const result = execute("gh", ["release", "download", manifest.release, "--repo", manifest.repository,
          "--pattern", asset.name, "--dir", stage], { stdio: "inherit", timeout: 120000 });
        if (result.error || result.status !== 0) {
          throw new Error("Faltan los fondos Slate. Ejecuta backgrounds:fetch con GitHub CLI autenticado para este repositorio.");
        }
      }
      if (!validAsset(staged, asset)) throw new Error(`Integridad de fondo no válida: ${asset.name}. No se empaquetará.`);
      fs.renameSync(staged, target);
    } finally { fs.rmSync(stage, { recursive: true, force: true }); }
  }
  return directory;
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--source")) throw new Error("Usa backgrounds:fetch [--source carpeta].");
  try { console.info(`Fondos locales 1080p comprobados: ${prepareBackgrounds({ source: args[1] })}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { prepareBackgrounds, validAsset, directory };
