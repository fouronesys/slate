"use strict";
// Explicit CI entry point. Never run by push, tests, the browser or an installer.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const yaml = require("js-yaml");
const { buildEnvironment, createClient } = require("./vmp-client.cjs");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "release-github");

function releaseGate(env, pkg) {
  if (env.GITHUB_REPOSITORY !== "fouronesys/slate" || env.GITHUB_REF !== "refs/heads/main") {
    throw new Error("Solo se permiten entregas desde main en fouronesys/slate.");
  }
  if (env.SLATE_RELEASE_UPLOADS !== "yes") throw new Error("Falta autorizar las subidas de esta compilación.");
  if (!/^\d+\.\d+\.\d+$/.test(env.SLATE_RELEASE_VERSION || "") || env.SLATE_RELEASE_VERSION !== pkg.version) {
    throw new Error("La versión solicitada debe coincidir exactamente con package.json, sin prefijo v.");
  }
  for (const name of ["CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"]) {
    if (!env[name]) throw new Error(`Falta el secreto de compilación ${name}.`);
  }
}
function digest(file, algorithm = "sha512") {
  return createHash(algorithm).update(fs.readFileSync(file)).digest(algorithm === "sha512" ? "base64" : "hex");
}
function finalizeMetadata(directory, version) {
  const file = path.join(directory, "latest-mac.yml");
  const info = yaml.load(fs.readFileSync(file, "utf8"));
  if (info?.version !== version || !Array.isArray(info.files)) throw new Error("Metadatos de actualización incompletos.");
  if (!info.files.some(entry => entry.url.endsWith("-arm64.zip")) ||
      !info.files.some(entry => entry.url.endsWith("-arm64.dmg"))) throw new Error("Se requieren ZIP y DMG arm64.");
  for (const entry of info.files) {
    if (typeof entry.url !== "string" || !/^Slate-Privacy-[0-9.]+-arm64\.(zip|dmg)$/.test(entry.url)) {
      throw new Error("Recurso no permitido en los metadatos de actualización.");
    }
    const target = path.join(directory, entry.url);
    entry.sha512 = digest(target);
    entry.size = fs.statSync(target).size;
  }
  const primary = info.files.find(entry => entry.url === info.path);
  if (!primary) throw new Error("El recurso principal de actualización no está presente.");
  info.sha512 = primary.sha512;
  fs.writeFileSync(file, yaml.dump(info));
  const artifacts = fs.readdirSync(directory).filter(name => /\.(dmg|zip|yml|blockmap)$/.test(name)).sort();
  fs.writeFileSync(path.join(directory, "SHA256SUMS.txt"), artifacts.map(name =>
    `${digest(path.join(directory, name), "sha256")}  ${name}\n`).join(""));
}
async function main() {
  const pkg = require("../package.json");
  releaseGate(process.env, pkg);
  if (process.platform !== "darwin") throw new Error("La entrega firmada exige macOS.");
  if (fs.existsSync(output)) throw new Error("release-github ya existe; usa un checkout limpio para no mezclar entregas.");
  function run(command, args, options = {}) {
    const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
    if (result.error || result.status !== 0) throw new Error(`Falló ${path.basename(command)}; no se publicará la entrega.`);
    return result;
  }
  const env = buildEnvironment({ vmpMode: "sign", allowBinaryUpload: true });
  run(process.execPath, [require.resolve("electron-builder/out/cli/cli.js"),
    "--mac", "dmg", "zip", "--arm64", "--publish", "never",
    "-c.directories.output=release-github", "-c.mac.notarize=true", "-c.forceCodeSigning=true"], { env });
  const app = path.join(output, "mac-arm64", "Slate Privacy.app");
  const dmg = path.join(output, `Slate-Privacy-${pkg.version}-arm64.dmg`);
  const zip = path.join(output, `Slate-Privacy-${pkg.version}-arm64.zip`);
  const client = createClient();
  for (const target of [app, dmg]) run("/usr/bin/codesign", ["--verify", "--deep", "--strict", target]);
  client.verify(app);
  run("/usr/bin/xcrun", ["stapler", "validate", app]);
  run("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=2", app]);
  // The app is notarized by electron-builder before ZIP/DMG generation.
  // The signed DMG also needs its own submission and ticket.
  const submission = run("/usr/bin/xcrun", ["notarytool", "submit", dmg,
    "--apple-id", process.env.APPLE_ID, "--password", process.env.APPLE_APP_SPECIFIC_PASSWORD,
    "--team-id", process.env.APPLE_TEAM_ID, "--wait", "--output-format", "json"],
  { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  const receipt = JSON.parse(submission.stdout);
  if (receipt.status !== "Accepted") throw new Error("Apple no aceptó el DMG; no se distribuirá.");
  console.info(`Apple aceptó el DMG: ${receipt.id}`);
  run("/usr/bin/xcrun", ["stapler", "staple", dmg]);
  run("/usr/bin/xcrun", ["stapler", "validate", dmg]);
  run("/usr/bin/codesign", ["--verify", "--strict", dmg]);
  run("/usr/sbin/spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=2", dmg]);
  const extracted = path.join(output, "zip-verificado");
  run("/usr/bin/ditto", ["-x", "-k", zip, extracted]);
  const zippedApp = path.join(extracted, "Slate Privacy.app");
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", zippedApp]);
  run("/usr/bin/xcrun", ["stapler", "validate", zippedApp]);
  client.verify(zippedApp);
  // Stapling changes the DMG bytes: hash only the final files.
  finalizeMetadata(output, pkg.version);
  console.info("Artefactos comprobados. Falta revisar el borrador de GitHub y probar la actualización en un Mac real.");
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { releaseGate, finalizeMetadata, digest };
