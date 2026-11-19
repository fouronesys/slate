"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseOptions, checkConfiguration } = require("./package-mac.cjs");
const { buildGuide } = require("./build-install-guide.cjs");
const { buildEnvironment, createClient } = require("./vmp-client.cjs");
const root = path.resolve(__dirname, "..");

function installerConfiguration(stage, payload, arch, {
  verifyVmp = false,
  validatePayload = app => require("../installer/native.cjs").createNativeOps().validate(app),
  verifyPayload = app => createClient().verify(app),
} = {}) {
  return {
    appId: "com.brujula.browser.installer",
    productName: "Instalar Slate Privacy",
    electronVersion: require("electron/package.json").version,
    electronDownload: require("../package.json").build.electronDownload,
    asar: true,
    directories: { app: stage, output: path.join(root, "release", `assisted-${arch}`) },
    files: ["*.cjs", "guide.html", "package.json"],
    extraResources: [{ from: payload, to: "payload/Slate Privacy.app", filter: ["**/*"] }],
    afterSign: async (context) => {
      const copiedApp = path.join(context.appOutDir, "Instalar Slate Privacy.app/Contents/Resources/payload/Slate Privacy.app");
      await validatePayload(copiedApp);
      if (verifyVmp) await verifyPayload(copiedApp);
    },
    mac: {
      // Absolute paths: this configuration runs from a separate staged project.
      sign: path.join(root, "scripts/apple-sign.cjs"),
      hardenedRuntime: true,
      entitlements: path.join(root, "build/entitlements.mac.plist"),
      entitlementsInherit: path.join(root, "build/entitlements.mac.plist"),
      category: "public.app-category.utilities",
      minimumSystemVersion: "12.0",
      icon: path.join(root, "src/assets/icon.png"),
    },
    dmg: {
      title: "Slate Privacy — instalación asistida",
      artifactName: `Slate-Privacy-Asistido-\${version}-${arch}.\${ext}`,
      // No drag-to-Applications artwork: the explicitly named installer is opened.
      contents: [{ x: 240, y: 180, type: "file" }],
      window: { width: 480, height: 360 },
    },
  };
}

async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  const { pkg } = await checkConfiguration();
  console.info(`DMG asistido (apertura manual). VMP: ${options.vmpMode}; firma Apple independiente. Sin VMP verificada no se acredita reproducción comercial.`);
  const { output } = buildGuide();
  const { build, Platform, Arch } = require("electron-builder");
  const builderDir = path.dirname(require.resolve("electron-builder"));
  const { validateConfiguration } = require(require.resolve("app-builder-lib/out/util/config/config.js", { paths: [builderDir] }));
  const stage = path.join(root, "release", "installer-stage");
  const payload = path.join(root, "release", "source-check", "Slate Privacy.app");
  for (const flag of options.arches) {
    await validateConfiguration(installerConfiguration(stage, payload, flag.slice(2)), { isEnabled: false });
  }
  if (options.check) {
    console.info("Configuración asistida y guía válidas. No se ha generado, montado ni ejecutado un DMG; no se ha instalado nada.");
    return;
  }
  if (process.platform !== "darwin") throw new Error("Generar el instalador asistido requiere macOS. La guía HTML sí puede abrirse sin conexión en este entorno.");
  fs.mkdirSync(stage, { recursive: true });
  for (const file of ["main.cjs", "preload.cjs", "engine.cjs", "native.cjs"]) fs.copyFileSync(path.join(root, "installer", file), path.join(stage, file));
  fs.copyFileSync(output, path.join(stage, "guide.html"));
  fs.writeFileSync(path.join(stage, "package.json"), JSON.stringify({
    name: "slate-privacy-installer", version: pkg.version, private: true,
    description: "Asistente local de instalación de Slate Privacy", author: "Slate Privacy", main: "main.cjs",
  }));
  const cli = require.resolve("electron-builder/out/cli/cli.js");
  const { createNativeOps } = require("../installer/native.cjs");
  for (const flag of options.arches) {
    const arch = flag.slice(2);
    const sourceOutput = path.join(root, "release", `assisted-source-${arch}`);
    const result = spawnSync(process.execPath, [cli, "--mac", "dir", flag, `--config.directories.output=${sourceOutput}`, "--publish", "never"], { cwd: root, stdio: "inherit", env: buildEnvironment(options) });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`No se pudo empaquetar Slate para ${arch}.`);
    const appBundle = path.join(sourceOutput, arch === "arm64" ? "mac-arm64" : "mac", "Slate Privacy.app");
    // Unsigned/incomplete payloads fail before making a misleading installer DMG.
    await createNativeOps().validate(appBundle);
    if (options.vmpMode !== "off") createClient().verify(appBundle);
    // A separate projectDir prevents the browser's package.json build section
    // from being merged into the installer (identity, files or Finder artwork).
    await build({ projectDir: stage, config: installerConfiguration(stage, appBundle, arch, { verifyVmp: options.vmpMode !== "off" }), targets: Platform.MAC.createTarget("dmg", arch === "arm64" ? Arch.arm64 : Arch.x64), publish: "never" });
    console.info(`DMG asistido ${arch} generado. Aún requiere la matriz de validación manual en macOS.`);
  }
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { installerConfiguration, main };
