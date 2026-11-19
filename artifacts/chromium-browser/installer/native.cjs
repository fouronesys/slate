"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs/promises");
const ID = "com.brujula.browser";

function createNativeOps() {
  let copyProcess;
  let cancellationTimer;
  const command = (bin, args, copying = false) => new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    if (copying) copyProcess = child;
    let stdout = "", stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr = (stderr + data).slice(-8192); });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (copying) {
        copyProcess = null;
        clearTimeout(cancellationTimer);
        cancellationTimer = null;
      }
      if (code === 0) resolve(stdout.trim());
      else {
        const error = new Error(`No se pudo completar ${path.basename(bin)} (${signal || code}). ${stderr.trim()}`);
        if (/no space left/i.test(stderr)) error.code = "ENOSPC";
        else if (/permission denied|operation not permitted|read-only file system/i.test(stderr)) error.code = "EACCES";
        reject(error);
      }
    });
  });
  return {
    async validate(bundle) {
      const plist = path.join(bundle, "Contents/Info.plist");
      const get = (key) => command("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist]);
      if (await get("CFBundleIdentifier") !== ID || await get("CFBundleExecutable") !== "Slate Privacy" || await get("CFBundlePackageType") !== "APPL") throw new Error("La aplicación no corresponde a Slate Privacy.");
      const exe = await fs.lstat(path.join(bundle, "Contents/MacOS/Slate Privacy"));
      if (!exe.isFile() || exe.isSymbolicLink() || !(exe.mode & 0o111)) throw new Error("No se encontró un ejecutable válido de Slate.");
      await command("/usr/bin/codesign", ["--verify", "--deep", "--strict", bundle]);
    },
    async assertStopped(target) {
      const output = await command("/bin/ps", ["-ww", "-axo", "comm="]);
      if (output.split("\n").some((line) => line.trim().startsWith(`${target}/Contents/`) || /\/Slate Privacy\.app\/Contents\/MacOS\/Slate Privacy$/.test(line.trim()))) throw new Error("Slate Privacy está abierto. Ciérralo completamente antes de instalar; tus datos no se modificarán.");
    },
    copy: (source, target) => command("/usr/bin/ditto", ["--rsrc", "--extattr", "--acl", source, target], true),
    cancelCopy: () => {
      const child = copyProcess;
      if (!child || cancellationTimer) return;
      child.kill("SIGTERM");
      // Escalate only the held child handle, never a discovered/reused PID.
      // Cleanup still waits for its close event before removing staging.
      cancellationTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
    },
    open: (target) => command("/usr/bin/open", ["-n", target]),
  };
}
module.exports = { createNativeOps };
