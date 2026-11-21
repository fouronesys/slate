"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseOptions: parseVmpOptions } = require("./package-mac.cjs");
const { buildEnvironment } = require("./vmp-client.cjs");
const ROOT = path.resolve(__dirname, "..");
const CONFIG = path.join(ROOT, "build/windows.cjs");

function parseOptions(args) {
  const authenticode = args.includes("--authenticode");
  const options = parseVmpOptions(args.filter(arg => arg !== "--authenticode" && arg !== "--x64"));
  if (args.includes("--arm64")) throw new Error("Esta entrega Windows solo admite x64.");
  return { check: options.check, vmpMode: options.vmpMode, allowBinaryUpload: options.allowBinaryUpload, authenticode };
}
function windowsEnvironment(options, base = process.env) {
  return { ...buildEnvironment(options, base), SLATE_WINDOWS_AUTHENTICODE: options.authenticode ? "yes" : "no" };
}
async function checkConfiguration() {
  const builderDir = path.dirname(require.resolve("electron-builder"));
  const resolveBuilder = file => require.resolve(`app-builder-lib/out/${file}`, { paths: [builderDir] });
  const { getConfig, validateConfiguration } = require(resolveBuilder("util/config/config.js"));
  // Check the effective config loaded by the real packager, not just our object.
  const config = await getConfig(ROOT, CONFIG);
  await validateConfiguration(config, { isEnabled: false });
  if (config.mac || config.dmg || config.afterPack) throw new Error("La configuración Windows ha heredado opciones de Mac.");
  if (config.electronVersion !== require("electron/package.json").version) throw new Error("El motor ECS instalado no coincide.");
  const { createRequire } = require("node:module");
  const downloader = resolveBuilder("util/electronGet.js");
  const { buildElectronArtifactConfig } = require(downloader);
  const { getArtifactVersion, getArtifactRemoteURL } = createRequire(downloader)("@electron/get/dist/cjs/artifact-utils");
  const details = await buildElectronArtifactConfig({ version: config.electronVersion, platformName: "win32",
    arch: "x64", artifactName: "electron", electronDownload: config.electronDownload });
  details.version = getArtifactVersion(details);
  const url = await getArtifactRemoteURL(details);
  if (!url.includes(`/v${config.electronVersion}/electron-v${config.electronVersion}-win32-x64.zip`)) {
    throw new Error(`URL inesperada para ECS Windows: ${url}`);
  }
  if (!fs.existsSync(path.join(ROOT, config.nsis.include))) throw new Error("Falta el control de versión Windows del instalador.");
  return { config, url };
}
async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  const { config, url } = await checkConfiguration();
  console.info(`Configuración NSIS x64 válida. Motor: ${url}`);
  console.info(`Windows 10/11 x64. Authenticode: ${options.authenticode ? "obligatoria" : "desactivada"}. VMP: ${options.vmpMode}.`);
  if (options.check) {
    console.info("Solo comprobación: no se ha compilado, descargado, firmado ni probado un instalador Windows.");
    return;
  }
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Compila en Windows x64 con Node x64; no se valida Windows mediante Wine ni desde Mac/Linux.");
  const result = spawnSync(process.execPath, [require.resolve("electron-builder/out/cli/cli.js"),
    "--config", CONFIG, "--win", "nsis", "--x64", "--publish", "never"], {
    cwd: ROOT, stdio: "inherit", shell: false, env: windowsEnvironment(options),
  });
  if (result.error || result.status !== 0) throw new Error("Falló la compilación Windows. No distribuyas los archivos parciales.");
  console.info(`Instalador en ${path.join(ROOT, config.directories.output)}. Sigue docs/WINDOWS.md antes de distribuir.`);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { parseOptions, windowsEnvironment, checkConfiguration };
