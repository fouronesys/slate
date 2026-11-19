// Builds the real Finder DMG on macOS. --check is read-only and cross-platform.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { buildEnvironment } = require("./vmp-client.cjs");

const projectDir = path.resolve(__dirname, "..");

function parseOptions(args) {
  const allowed = new Set(["--check", "--arm64", "--x64", "--vmp-verify", "--vmp-sign", "--allow-binary-upload"]);
  for (const arg of args) {
    if (!allowed.has(arg)) throw new Error(`Opción no reconocida: ${arg}`);
  }
  const arches = ["--arm64", "--x64"].filter((arch) => args.includes(arch));
  if (args.includes("--vmp-verify") && args.includes("--vmp-sign")) throw new Error("Elige verificar o firmar, no ambos modos.");
  const allowBinaryUpload = args.includes("--allow-binary-upload");
  const vmpMode = args.includes("--vmp-sign") ? "sign" : args.includes("--vmp-verify") ? "verify" : "off";
  if ((vmpMode === "sign") !== allowBinaryUpload) throw new Error("La firma requiere --vmp-sign junto a --allow-binary-upload; no se autoriza ninguna subida por defecto.");
  return { check: args.includes("--check"), arches: arches.length ? arches : ["--arm64", "--x64"], vmpMode, allowBinaryUpload };
}

function inspectArtwork(build, root = projectDir) {
  const imagePath = path.resolve(root, build.dmg.background);
  const retinaImagePath = imagePath.replace(/\.png$/i, "@2x.png");
  if (!/\.png$/i.test(imagePath)) throw new Error("El fondo base debe ser un PNG con su pareja @2x.png.");
  const base = inspectPng(imagePath, build.dmg.window.width, build.dmg.window.height, 72);
  const retina = inspectPng(retinaImagePath, build.dmg.window.width * 2, build.dmg.window.height * 2, 144);
  const margin = build.dmg.iconSize / 2;
  for (const item of build.dmg.contents) {
    if (item.x < margin || item.x > base.width - margin ||
        item.y < margin || item.y > base.height - margin - build.dmg.iconTextSize * 2) {
      throw new Error("Los iconos del instalador deben quedar dentro de la ventana, incluidos sus nombres.");
    }
  }
  return { imagePath, retinaImagePath, width: base.width, height: base.height, retinaWidth: retina.width, retinaHeight: retina.height };
}

function inspectPng(imagePath, expectedWidth, expectedHeight, dpi) {
  const png = fs.readFileSync(imagePath);
  if (!png.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    throw new Error("El fondo del instalador no es un PNG válido.");
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`El fondo ${path.basename(imagePath)} debe medir ${expectedWidth}×${expectedHeight} píxeles para coincidir con la ventana.`);
  }
  // Both pixel size AND density must match the representation's point size.
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  let densityOK = false;
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (offset + 12 + length > png.length) throw new Error("PNG incompleto.");
    if (type === "pHYs" && length === 9) {
      const x = png.readUInt32BE(offset + 8);
      const y = png.readUInt32BE(offset + 12);
      densityOK = png[offset + 16] === 1 && Math.abs(x - pixelsPerMeter) <= 1 && Math.abs(y - pixelsPerMeter) <= 1;
    }
    offset += length + 12;
  }
  if (!densityOK) throw new Error(`El fondo ${path.basename(imagePath)} debe tener una resolución de ${dpi} ppp.`);
  return { imagePath, width, height };
}

async function checkConfiguration() {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
  const builderDir = path.dirname(require.resolve("electron-builder"));
  const { validateConfiguration } = require(require.resolve("app-builder-lib/out/util/config/config.js", {
    paths: [builderDir],
  }));
  await validateConfiguration(pkg.build, { isEnabled: false });
  if (pkg.build.electronVersion !== require("electron/package.json").version) {
    throw new Error("El motor instalado no coincide con el motor ECS fijado para el paquete.");
  }
  inspectSigningConfiguration(pkg.build);
  return { pkg, artwork: inspectArtwork(pkg.build) };
}

function inspectSigningConfiguration(build) {
  if (build.mac.sign !== "./scripts/apple-sign.cjs" || build.mac.hardenedRuntime !== true ||
      build.afterPack !== "./scripts/vmp-after-pack.cjs" ||
      build.afterSign !== "./scripts/vmp-after-sign.cjs") {
    throw new Error("Conservar firma Apple por huella, hardened runtime y VMP antes/después de Apple.");
  }
  if (JSON.stringify(build.files) !== JSON.stringify(["src/**/*", "package.json"])) {
    throw new Error("El navegador solo debe incluir src y package.json, no herramientas ni credenciales de firma.");
  }
}

async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  const { pkg, artwork } = await checkConfiguration();
  console.info(`Configuración DMG válida: ${pkg.build.productName}, ventana y fondo base ${artwork.width}×${artwork.height} a 72 ppp; Retina ${artwork.retinaWidth}×${artwork.retinaHeight} a 144 ppp.`);
  console.info(`Motor ECS ${pkg.build.electronVersion}. Modo VMP: ${options.vmpMode}. Widevine instalado no verifica Netflix/Disney+. La firma VMP y la firma Apple son independientes.`);
  if (options.check) {
    console.info("Solo comprobación: no se ha creado ni probado un DMG.");
    return;
  }
  if (process.platform !== "darwin") {
    throw new Error("La creación del DMG requiere macOS (hdiutil/Finder). Ejecuta este mismo comando en un Mac.");
  }
  require("./prepare-backgrounds.cjs").prepareBackgrounds();
  const hdiutil = spawnSync("/usr/bin/hdiutil", ["help"], { stdio: "ignore" });
  if (hdiutil.status !== 0) throw new Error("No se pudo ejecutar hdiutil en este Mac.");
  const cli = require.resolve("electron-builder/out/cli/cli.js");
  const result = spawnSync(process.execPath, [cli, "--mac", "dmg", ...options.arches, "--publish", "never"], {
    cwd: projectDir,
    stdio: "inherit",
    env: buildEnvironment(options),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`No se generó el DMG correctamente (${result.signal || result.status}).`);
  console.info(`DMG generado en ${path.join(projectDir, pkg.build.directories.output)}.`);
  console.info("Antes de distribuir: montar en Finder, copiar a Aplicaciones y comprobar la apertura en un Mac.");
  console.info("La firma y notarización de Apple se configuran por separado.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`No se pudo preparar el instalador: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseOptions, inspectArtwork, inspectSigningConfiguration, checkConfiguration };
