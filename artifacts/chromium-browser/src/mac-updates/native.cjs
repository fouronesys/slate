"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { FRAMEWORK, treeHash, hashFile, compare } = require("./verify.cjs");
const { architectures } = require("./macho.cjs");
function command(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: require("node:os").homedir() } });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 180000);
    child.stdout.on("data", data => { stdout = (stdout + data).slice(-1024 * 1024); });
    child.stderr.on("data", data => { stderr = (stderr + data).slice(-16384); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(`Falló ${path.basename(bin)} (${code}): ${stderr.slice(-1000)}`));
    });
  });
}
function createNativeOps({ publisherTools = false, execute = command } = {}) {
  const get = async (bundle, key) => (await execute("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, path.join(bundle, "Contents/Info.plist")])).stdout;
  return {
    async inspect(bundle) {
      const stat = await fs.lstat(bundle);
      if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(bundle) !== bundle) throw new Error("Bundle no local o enlazado.");
      if (await get(bundle, "CFBundleIdentifier") !== "com.brujula.browser" ||
          await get(bundle, "CFBundleExecutable") !== "Slate Privacy") throw new Error("Identidad del navegador incorrecta.");
      await execute("/usr/bin/codesign", ["--verify", "--deep", "--strict", bundle]);
      const info = await execute("/usr/bin/codesign", ["-dv", "--verbose=4", bundle]);
      const description = `${info.stdout}\n${info.stderr}`;
      const teamId = description.match(/^TeamIdentifier=([A-Z0-9]{10})$/m)?.[1];
      if (!teamId || !/^Authority=Developer ID Application:/m.test(description) ||
          !/flags=.*\bruntime\b/.test(description) || !/^Timestamp=/m.test(description)) throw new Error("Se exige Developer ID Application, timestamp y hardened runtime.");
      const entitlements = await execute("/usr/bin/codesign", ["-d", "--entitlements", ":-", bundle]);
      if (/<key>com\.apple\.security\.get-task-allow<\/key>\s*<true\s*\/>/.test(entitlements.stdout + entitlements.stderr)) throw new Error("El bundle tiene permisos de depuración.");
      await execute("/usr/sbin/spctl", ["--assess", "--type", "execute", bundle]);
      // Only the publisher uses developer tools. On stock macOS Gatekeeper
      // assesses notarization; promotion already validated the stapled tickets
      // for these exact signed hashes.
      if (publisherTools) await execute("/usr/bin/xcrun", ["stapler", "validate", bundle]);
      return { version: await get(bundle, "CFBundleShortVersionString"), build: await get(bundle, "CFBundleVersion"), teamId, minMacOS: await get(bundle, "LSMinimumSystemVersion") };
    },
    async validate(bundle, record) {
      const info = await this.inspect(bundle);
      if (info.version !== record.version || info.build !== record.build || info.teamId !== record.teamId ||
          compare(info.minMacOS, "12.0") > 0) throw new Error("La identidad, versión, build o mínimo macOS del bundle no coincide.");
      const executable = path.join(bundle, "Contents/MacOS/Slate Privacy");
      const framework = path.join(bundle, FRAMEWORK);
      for (const file of [executable, framework]) {
        const arches = await architectures(file);
        const expected = record.arch === "x64" ? "x86_64" : "arm64";
        if (!arches.includes(expected)) throw new Error("El ejecutable o framework no corresponde a esta arquitectura.");
      }
      if (await hashFile(framework) !== record.frameworkSha256 || await treeHash(bundle) !== record.bundleSha256) throw new Error("El bundle no coincide con el verificado por Apple/VMP en la promoción.");
      return info;
    },
    async assertStopped() {
      const output = (await execute("/bin/ps", ["-ww", "-axo", "pid=,comm="])).stdout;
      if (output.split("\n").some(line => {
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        return match && Number(match[1]) !== process.pid && /\/(?:Slate Privacy|previous|failed)\.app\/Contents\/(MacOS|Frameworks)\//.test(match[2]);
      })) throw new Error("Slate o sus helpers siguen abiertos; no se modificará la app ni el perfil.");
    },
    copy: (from, to) => execute("/usr/bin/ditto", ["--rsrc", "--extattr", "--acl", from, to]),
    async withDMG(dmg, mount, callback) {
      await execute("/usr/sbin/spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", dmg]);
      if (publisherTools) await execute("/usr/bin/xcrun", ["stapler", "validate", dmg]);
      await fs.mkdir(mount, { mode: 0o700 });
      try {
        await execute("/usr/bin/hdiutil", ["attach", "-readonly", "-nobrowse", "-noautoopen", "-mountpoint", mount, dmg]);
        return await callback(path.join(mount, "Slate Privacy.app"));
      } finally {
        // Detect even an attach that mounted successfully before reporting an
        // error. Never recursively remove a mounted volume during cleanup.
        if ((await fs.stat(mount)).dev !== (await fs.stat(path.dirname(mount))).dev) {
          await execute("/usr/bin/hdiutil", ["detach", mount]);
        }
      }
    },
    macOS: async () => (await execute("/usr/bin/sw_vers", ["-productVersion"])).stdout,
  };
}
async function removeDownloadDirectory(directory) {
  try {
    const mounted = path.join(directory, "mounted");
    const mount = await fs.stat(mounted).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (mount && mount.dev !== (await fs.stat(directory)).dev) throw new Error(`El DMG sigue montado en ${mounted}. Expúlsalo con Finder antes de retirar la descarga.`);
    await fs.rm(directory, { recursive: true, force: true });
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}
module.exports = { command, createNativeOps, removeDownloadDirectory };
