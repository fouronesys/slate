"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("./vmp-client.cjs");

function executablePath(input) {
  if (!input) throw new Error("Indica la ruta completa a Slate Privacy.exe, no al instalador.");
  const exe = fs.realpathSync(path.resolve(input));
  const directory = path.dirname(exe);
  if (path.basename(exe) !== "Slate Privacy.exe" || !fs.statSync(exe).isFile() ||
      !fs.existsSync(path.join(directory, "resources/app.asar"))) {
    throw new Error("La ruta debe ser Slate Privacy.exe dentro del navegador empaquetado, no el setup ni una carpeta general.");
  }
  const fd = fs.openSync(exe, "r");
  try {
    const magic = Buffer.alloc(2);
    fs.readSync(fd, magic, 0, 2, 0);
    if (magic.toString("ascii") !== "MZ") throw new Error("El ejecutable Windows no tiene cabecera PE.");
  } finally { fs.closeSync(fd); }
  return exe;
}
function windowsClient(options = {}) {
  return createClient({ ...options, resolveBundle: executablePath });
}
async function runWindowsHook(context, { mode = "off", allowBinaryUpload = false,
  client = windowsClient(), log = console.info } = {}) {
  if (!["off", "verify", "sign"].includes(mode)) throw new Error("Modo VMP Windows no reconocido.");
  if (mode === "off") { log("VMP Windows desactivada; no se garantiza reproducción comercial."); return; }
  if (context.electronPlatformName !== "win32") throw new Error("Este flujo VMP solo admite Windows.");
  if (mode === "sign" && !allowBinaryUpload) throw new Error("Subida del ejecutable Windows no autorizada.");
  const exe = path.join(context.appOutDir, "Slate Privacy.exe");
  // afterSign is after executable resource editing AND Authenticode, but before
  // NSIS compresses the payload. Windows VMP has the opposite order to macOS.
  if (mode === "sign") {
    log("VMP: se autoriza subir el ejecutable Windows del motor a Castlabs; nunca el perfil.");
    client.sign(exe, { allowBinaryUpload });
  } else client.verify(exe);
  log("Firma VMP Windows de streaming verificada tras editar/firmar el EXE. No acredita reproducción en Netflix/Disney+.");
}
function main(args = process.argv.slice(2), client = windowsClient()) {
  if (args.length !== 1) throw new Error("Uso: video:windows:verify «C:\\ruta\\Slate Privacy.exe».");
  client.verify(args[0]);
  console.info("VMP Windows de streaming verificada sin red; mínimo 30 días. Reproducción y Authenticode son verificaciones distintas.");
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { executablePath, windowsClient, runWindowsHook, main };
