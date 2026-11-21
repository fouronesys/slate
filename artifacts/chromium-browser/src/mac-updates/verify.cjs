"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const REPOSITORY = "fouronesys/slate";
const FRAMEWORK = "Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework";

function versionParts(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,5})(\.(0|[1-9]\d{0,5})){1,3}$/.test(value)) throw new Error("Versión no válida; solo se admiten versiones estables numéricas.");
  return value.split(".").map(Number);
}
function compare(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const delta = (left[i] || 0) - (right[i] || 0);
    if (delta) return Math.sign(delta);
  }
  return 0;
}
function publicKey(pem) {
  const key = crypto.createPublicKey(pem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("La clave pública de actualizaciones debe ser Ed25519.");
  return key;
}
function assertPolicy(policy) {
  if (policy.repository !== REPOSITORY || policy.channel !== "stable" || !policy.publicKey) {
    throw new Error("Actualizaciones aún no habilitadas: el responsable debe incorporar la clave pública de promoción antes de distribuir Slate. No se ha contactado con GitHub.");
  }
  publicKey(policy.publicKey);
}
function downloadURL(version, name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(name)) throw new Error("Nombre de archivo no permitido.");
  versionParts(version);
  return `https://github.com/${REPOSITORY}/releases/download/v${version}/${name}`;
}
function verifyRecord(envelope, policy, { current, arch, macOS, engine, now = Date.now(), requireNewer = true } = {}) {
  assertPolicy(policy);
  if (typeof envelope?.payload !== "string" || envelope.payload.length > 16000 ||
      typeof envelope.signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) throw new Error("Registro de promoción incompleto.");
  const bytes = Buffer.from(envelope.payload, "base64");
  if (!crypto.verify(null, bytes, publicKey(policy.publicKey), Buffer.from(envelope.signature, "base64"))) throw new Error("Firma de promoción no válida.");
  const record = JSON.parse(bytes);
  if (record.schema !== 1 || record.repository !== REPOSITORY || record.channel !== "stable" ||
      record.bundleId !== "com.brujula.browser" || !/^[A-Z0-9]{10}$/.test(record.teamId || "") ||
      !["x64", "arm64"].includes(record.arch) || record.arch !== arch ||
      record.engine !== engine || record.minMacOS !== "12.0" || compare(macOS, record.minMacOS) < 0) {
    throw new Error("La actualización no corresponde a este canal, motor, arquitectura o macOS 12.");
  }
  versionParts(record.version); versionParts(record.build);
  if (requireNewer && (compare(record.version, current.version) <= 0 || compare(record.build, current.build) <= 0)) throw new Error("La actualización no es posterior a la versión y build instaladas.");
  if (current.teamId !== record.teamId) throw new Error("El Team ID no coincide con la instalación de confianza.");
  for (const key of ["sha256", "bundleSha256", "frameworkSha256"]) {
    if (!/^[a-f0-9]{64}$/.test(record[key] || "")) throw new Error("Integridad de la actualización incompleta.");
  }
  if (!Number.isSafeInteger(record.size) || record.size <= 0 || record.size > 4 * 1024 ** 3 ||
      record.asset !== `Slate-Privacy-${record.version}-${arch}.dmg`) throw new Error("Archivo de actualización no válido.");
  // EVS verifies at least 30 days at promotion; the publisher attests only 29.
  if (!Number.isSafeInteger(record.vmpCheckedAt) || !Number.isSafeInteger(record.vmpValidUntil) ||
      record.vmpCheckedAt > now + 300000 || record.vmpValidUntil <= now + 86400000 ||
      record.vmpValidUntil > record.vmpCheckedAt + 29 * 86400000) throw new Error("La verificación VMP de producción ha caducado o no es válida. Hace falta una nueva promoción.");
  return record;
}
async function hashFile(file) {
  const hash = crypto.createHash("sha256");
  const handle = await fs.open(file, "r");
  try { for await (const data of handle.createReadStream({ autoClose: false })) hash.update(data); }
  finally { await handle.close(); }
  return hash.digest("hex");
}
async function treeHash(root, { bundle = true } = {}) {
  root = path.resolve(root);
  const hash = crypto.createHash("sha256");
  async function walk(relative) {
    const file = path.join(root, relative), stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) {
      const link = await fs.readlink(file), target = path.resolve(path.dirname(file), link);
      if (bundle && (path.isAbsolute(link) || !target.startsWith(`${root}/`))) throw new Error("Enlace fuera del bundle.");
      hash.update(JSON.stringify([relative, "link", link]));
    } else if (stat.isDirectory()) {
      hash.update(JSON.stringify([relative, "dir", stat.mode & 0o777]));
      for (const name of (await fs.readdir(file)).sort()) await walk(path.join(relative, name));
    } else if (stat.isFile()) {
      hash.update(JSON.stringify([relative, "file", stat.mode & 0o777, stat.size, await hashFile(file)]));
    } else throw new Error("Archivo especial no permitido en la copia; no se continuará.");
  }
  await walk("");
  return hash.digest("hex");
}
module.exports = { REPOSITORY, FRAMEWORK, compare, versionParts, publicKey, assertPolicy, downloadURL, verifyRecord, hashFile, treeHash };
