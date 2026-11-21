"use strict";
// Explicit, offline promotion on the distributor's Mac. Never uploads/publishes.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { createClient } = require("./vmp-client.cjs");
const { createNativeOps } = require("../src/mac-updates/native.cjs");
const { REPOSITORY, FRAMEWORK, publicKey, assertPolicy, hashFile, treeHash, verifyRecord } = require("../src/mac-updates/verify.cjs");
const root = path.resolve(__dirname, "..");
function options(args) {
  const [action, ...pairs] = args;
  if (!["trust", "promote"].includes(action) || pairs.length % 2) throw new Error("Usa trust --public-key archivo.pub, o promote --app ruta --dmg ruta --arch arm64|x64 --key-file ruta --acceptance informe.json.");
  const result = { action };
  const allowed = action === "trust" ? ["--public-key"] : ["--app", "--dmg", "--arch", "--key-file", "--acceptance"];
  for (let i = 0; i < pairs.length; i += 2) {
    if (!allowed.includes(pairs[i]) || result[pairs[i]]) throw new Error("Opción de promoción desconocida o duplicada.");
    result[pairs[i]] = pairs[i + 1];
  }
  for (const key of allowed) if (!result[key] || result[key].startsWith("--")) throw new Error(`Falta ${key}.`);
  return result;
}
function acceptance(report, version, arch, sha256) {
  const checks = ["macOS12", "macOSCurrent", "stockMac", "install", "profile", "recovery", "recoveryLauncher", "video", "pip", "quit"];
  if (report.version !== version || report.arch !== arch || !/^[a-f0-9]{64}$/.test(sha256 || "") || report.sha256 !== sha256 ||
      !checks.every(key => report[key] === "APROBADO") ||
      typeof report.evidence !== "string" || report.evidence.trim().length < 20) {
    throw new Error("Falta aceptación manual por versión, arquitectura y SHA-256 final, con evidencia: macOS12, macOSCurrent, stockMac, install, profile, recovery, recoveryLauncher, video, pip y quit deben ser APROBADO.");
  }
}
function bundleFile(app, relative) {
  const builder = path.dirname(require.resolve("electron-builder"));
  const asar = require(require.resolve("@electron/asar", { paths: [builder] }));
  return asar.extractFile(path.join(app, "Contents/Resources/app.asar"), relative).toString("utf8");
}
async function promote(opts) {
  if (process.platform !== "darwin") throw new Error("La promoción requiere un Mac real, Developer ID, notarización y VMP local. No se ha firmado ni publicado nada.");
  const arch = opts["--arch"];
  if (!["arm64", "x64"].includes(arch)) throw new Error("Arquitectura no admitida.");
  const app = await fs.realpath(opts["--app"]), dmg = await fs.realpath(opts["--dmg"]);
  if (path.basename(app) !== "Slate Privacy.app") throw new Error("Indica el navegador, no el asistente.");
  const packaged = JSON.parse(bundleFile(app, "package.json"));
  const runtime = JSON.parse(bundleFile(app, "src/runtime-metadata.json"));
  const packagedPolicy = JSON.parse(bundleFile(app, "src/mac-updates/policy.json"));
  assertPolicy(packagedPolicy);
  const configured = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  if (runtime.electronVersion !== configured.build.electronVersion ||
      runtime.minimumSystemVersion !== "12.0") throw new Error("No se promoverá un cambio de motor ni de compatibilidad macOS.");
  const report = JSON.parse(await fs.readFile(opts["--acceptance"], "utf8"));
  const dmgSha256 = await hashFile(dmg);
  acceptance(report, packaged.version, arch, dmgSha256);
  const ops = createNativeOps({ publisherTools: true }), info = await ops.inspect(app);
  if (info.version !== packaged.version) throw new Error("La versión del bundle no coincide con el paquete.");
  const expectedName = `Slate-Privacy-${info.version}-${arch}.dmg`;
  if (path.basename(dmg) !== expectedName) throw new Error("Solo se promueve el DMG tradicional con nombre versionado; no el asistido.");
  // Local verification only; never sign-pkg, setup, account creation or upload.
  createClient().verify(app);
  const now = Date.now();
  const record = {
    schema: 1, repository: REPOSITORY, channel: "stable", bundleId: "com.brujula.browser",
    version: info.version, build: info.build, teamId: info.teamId, arch,
    minMacOS: runtime.minimumSystemVersion, engine: runtime.electronVersion,
    asset: expectedName, size: (await fs.stat(dmg)).size, sha256: dmgSha256,
    bundleSha256: await treeHash(app), frameworkSha256: await hashFile(path.join(app, FRAMEWORK)),
    vmpCheckedAt: now, vmpValidUntil: now + 29 * 86400000,
  };
  await ops.validate(app, record);
  const temp = await fs.mkdtemp(path.join(root, "release", ".update-verification-"));
  try {
    await ops.withDMG(dmg, path.join(temp, "mounted"), async payload => {
      await ops.validate(payload, record);
      createClient().verify(payload);
    });
  } finally { await require("../src/mac-updates/native.cjs").removeDownloadDirectory(temp); }
  // Private signing material is read only by this explicit local command.
  // It must not live inside the project, app, release folder or repository.
  const keyPath = await fs.realpath(opts["--key-file"]);
  if (keyPath.startsWith(`${path.resolve(root, "../..")}/`)) throw new Error("Conserva la clave privada fuera del proyecto y de los archivos de distribución.");
  const keyStat = await fs.stat(keyPath);
  if ((keyStat.mode & 0o077) !== 0) throw new Error("La clave privada debe tener permisos 600 o más restrictivos.");
  const key = crypto.createPrivateKey(await fs.readFile(keyPath));
  if (key.asymmetricKeyType !== "ed25519" ||
      crypto.createPublicKey(key).export({ type: "spki", format: "pem" }) !== publicKey(packagedPolicy.publicKey).export({ type: "spki", format: "pem" })) throw new Error("La clave de promoción no corresponde a la clave pública incorporada en Slate.");
  const payload = Buffer.from(JSON.stringify(record));
  const envelope = { payload: payload.toString("base64"), signature: crypto.sign(null, payload, key).toString("base64") };
  verifyRecord(envelope, packagedPolicy, { current: info, arch, macOS: "12.0", engine: record.engine, requireNewer: false });
  const output = path.join(root, "release", "updates");
  await fs.mkdir(output, { recursive: true });
  const file = path.join(output, `Slate-Privacy-${info.version}-${arch}.update.json`);
  await fs.writeFile(file, JSON.stringify(envelope, null, 2), { mode: 0o644 });
  // Only public evidence is written; never echo a key or EVS account output.
  await fs.writeFile(`${file}.acceptance.json`, JSON.stringify({ ...report, sha256: record.sha256, vmpCheckedAt: now }, null, 2));
  console.info(`Registro de promoción local: ${file}\nNo se ha publicado ni creado ninguna release. VMP debe volver a verificarse antes de que venza la atestación.`);
}
async function main(args = process.argv.slice(2)) {
  const opts = options(args);
  if (opts.action === "promote") return promote(opts);
  const pem = await fs.readFile(opts["--public-key"], "utf8");
  if (!/^-----BEGIN PUBLIC KEY-----\r?\n/.test(pem)) throw new Error("Indica únicamente una clave PÚBLICA Ed25519 PEM. No copies una clave privada al proyecto.");
  publicKey(pem);
  const policyFile = path.join(root, "src/mac-updates/policy.json");
  await fs.writeFile(policyFile, `${JSON.stringify({ repository: REPOSITORY, channel: "stable", publicKey: pem.trim() + "\n" }, null, 2)}\n`);
  console.info("Clave pública incorporada para futuras compilaciones. No se ha publicado nada. No cambies esta clave sin un plan de transición.");
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { options, acceptance, main };
