"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

class Cancelled extends Error {
  constructor() { super("Instalación cancelada. La instalación anterior no se ha cambiado."); }
}
async function exists(file) {
  try { return await fs.lstat(file); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
}
// Comparing every file also catches incomplete copies when a tool reports success.
async function manifest(root, check = () => {}) {
  const entries = [];
  async function walk(relative) {
    check();
    const file = path.join(root, relative);
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) {
      const link = await fs.readlink(file);
      const resolved = path.resolve(path.dirname(file), link);
      if (path.isAbsolute(link) || !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Enlace fuera del bundle; no se puede instalar con seguridad.");
      entries.push([relative, "link", link]);
    } else if (stat.isDirectory()) {
      entries.push([relative, "dir", stat.mode & 0o777]);
      for (const name of (await fs.readdir(file)).sort()) await walk(path.join(relative, name));
    } else if (stat.isFile()) {
      const hash = crypto.createHash("sha256");
      const handle = await fs.open(file, "r");
      try {
        for await (const chunk of handle.createReadStream({ autoClose: false })) { check(); hash.update(chunk); }
      } finally { await handle.close(); }
      entries.push([relative, "file", stat.mode & 0o777, stat.size, hash.digest("hex")]);
    } else throw new Error("El bundle contiene un tipo de archivo no permitido.");
  }
  await walk("");
  return JSON.stringify(entries);
}

class Installer {
  constructor({ source, applications = "/Applications", platform = process.platform, ops, onState = () => {} }) {
    this.source = path.resolve(source);
    this.applications = path.resolve(applications);
    this.target = path.join(this.applications, "Slate Privacy.app");
    this.platform = platform;
    this.ops = ops;
    this.onState = onState;
    this.state = { phase: "idle", message: "Instala Slate Privacy en Aplicaciones. Tus datos de navegación no se modifican." };
    this.busy = false;
    this.cancelled = false;
  }
  emit(phase, message) { this.state = { phase, message }; this.onState(this.state); }
  check() { if (this.cancelled) throw new Cancelled(); }
  cancel() {
    if (!["preparing", "copying", "verifying"].includes(this.state.phase)) return;
    this.cancelled = true;
    this.ops.cancelCopy?.();
  }
  async validateBundle(bundle) {
    const stat = await fs.lstat(bundle);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("La aplicación no es un bundle local válido.");
    await this.ops.validate(bundle);
  }
  async run({ replace = false } = {}) {
    if (this.busy || this.state.phase === "done") return;
    this.busy = true;
    this.cancelled = false;
    let work, backup, promoted = false, originalMoved = false;
    let original;
    try {
      this.emit("preparing", "Comprobando aplicación, espacio y permisos… Puedes cancelar.");
      if (this.platform !== "darwin") throw new Error("La instalación real solo está disponible en macOS.");
      const directory = await fs.lstat(this.applications);
      if (!directory.isDirectory() || directory.isSymbolicLink() || await fs.realpath(this.applications) !== this.applications) throw new Error("Aplicaciones no es una carpeta local segura.");
      // An interrupted commit may have left the previous bundle in a hidden
      // transaction directory. Never bury that recovery copy under a new run.
      for (const name of await fs.readdir(this.applications)) {
        if (!name.startsWith(".slate-install-")) continue;
        const pending = path.join(this.applications, name);
        const stat = await fs.lstat(pending);
        if (stat.isDirectory() && !stat.isSymbolicLink() && await exists(path.join(pending, "previous.app"))) {
          throw new Error(`Hay una instalación anterior pendiente de recuperar en ${path.join(pending, "previous.app")}. En Finder usa Ir > Ir a la carpeta para conservarla o restaurarla antes de continuar.`);
        }
      }
      await this.validateBundle(this.source);
      if (this.source === this.target || this.source.startsWith(`${this.target}/`)) throw new Error("El origen no puede ser la aplicación instalada.");
      original = await exists(this.target);
      if (original) {
        await this.validateBundle(this.target);
        if (!replace) throw new Error("Ya existe Slate Privacy. No se ha reemplazado: hace falta tu consentimiento.");
      }
      await this.ops.assertStopped(this.target);
      const sourceManifest = await manifest(this.source, () => this.check());
      const space = await fs.statfs(this.applications);
      const size = JSON.parse(sourceManifest).reduce((n, entry) => n + (entry[1] === "file" ? entry[3] : 0), 0);
      if (Number(space.bavail) * Number(space.bsize) < size + 128 * 1024 * 1024) throw new Error("No hay espacio suficiente en Aplicaciones. Libera espacio e inténtalo de nuevo.");
      this.check();
      work = await fs.mkdtemp(path.join(this.applications, ".slate-install-"));
      await fs.chmod(work, 0o700);
      const staged = path.join(work, "Slate Privacy.app");
      backup = path.join(work, "previous.app");
      this.emit("copying", "Copiando la aplicación completa. La copia anterior sigue intacta…");
      await this.ops.copy(this.source, staged);
      this.check();
      this.emit("verifying", "Verificando los archivos y la firma de la copia…");
      await this.validateBundle(staged);
      if (sourceManifest !== await manifest(staged, () => this.check())) throw new Error("La copia no coincide con el original. No se ha instalado.");
      this.check();
      await this.ops.assertStopped(this.target);
      // Refuse to replace anything created/changed since consent/preparation.
      const current = await exists(this.target);
      if (Boolean(original) !== Boolean(current) || (original && (original.ino !== current.ino || original.dev !== current.dev || original.mtimeMs !== current.mtimeMs))) {
        throw new Error("La aplicación de destino ha cambiado. Vuelve a intentarlo para revisarla.");
      }
      this.check();
      this.emit("committing", "Finalizando la instalación. No cierres el instalador durante este paso.");
      if (original) { await fs.rename(this.target, backup); originalMoved = true; }
      await fs.rename(staged, this.target);
      promoted = true;
      await this.validateBundle(this.target);
      if (sourceManifest !== await manifest(this.target)) throw new Error("La comprobación final no coincide.");
      this.emit("done", "Slate Privacy está verificado en Aplicaciones. Ya puedes abrir la copia instalada.");
    } catch (e) {
      try {
        if (promoted) await fs.rename(this.target, path.join(work, "failed.app"));
        if (originalMoved) await fs.rename(backup, this.target);
        originalMoved = false;
      } catch {
        // Never delete a backup if restoration failed.
        this.emit("error", `No se pudo restaurar automáticamente. Conserva la copia anterior en ${backup}. Cierra el instalador y recupérala con Finder.`);
        work = null;
        return;
      }
      const message = e instanceof Cancelled || this.cancelled ? new Cancelled().message
        : ["EACCES", "EPERM", "EROFS"].includes(e.code) ? "No tienes permisos para escribir en Aplicaciones. No se han solicitado privilegios. Usa el DMG tradicional o pide ayuda al administrador."
        : e.code === "ENOSPC" ? "No queda espacio suficiente. Libera espacio y vuelve a intentarlo."
        : e.message;
      this.emit(e instanceof Cancelled || this.cancelled ? "cancelled" : "error", message);
    } finally {
      if (work) {
        try { await fs.rm(work, { recursive: true, force: true }); }
        catch { this.emit(this.state.phase, `${this.state.message} Quedó una carpeta temporal en ${work}; puedes retirarla con Finder.`); }
      }
      this.busy = false;
    }
  }
}
module.exports = { Installer, manifest, exists };
