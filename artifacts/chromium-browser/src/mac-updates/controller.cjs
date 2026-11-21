"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const policy = require("./policy.json");
const { assertPolicy, compare, downloadURL, verifyRecord, hashFile } = require("./verify.cjs");
const { exists, save, safeDirectory, paths, validatePlan } = require("./transaction.cjs");
const { createNativeOps } = require("./native.cjs");
const network = require("./network.cjs");
const { writeRecoveryEntry, NAME: RECOVERY_ENTRY } = require("./recovery.cjs");

class MacUpdater {
  constructor({ app, dialog, getWindow, prepareQuit, engine, platform = process.platform, mas = process.mas }) {
    Object.assign(this, { app, dialog, getWindow, prepareQuit, engine, platform, mas });
    this.root = path.join(app.getPath("appData"), "Slate Updates");
    this.target = "/Applications/Slate Privacy.app";
    this.ops = createNativeOps();
    this.busy = false;
  }
  get supported() { return this.platform === "darwin" && !this.mas && this.app.isPackaged; }
  async message(options) {
    const parent = this.getWindow?.();
    const config = { title: "Actualizaciones de Slate Privacy", noLink: true, ...options };
    return parent && !parent.isDestroyed() ? this.dialog.showMessageBox(parent, config) : this.dialog.showMessageBox(config);
  }
  async readPlan() {
    const file = path.join(this.root, "transaction.json");
    if (!await exists(file)) return null;
    const plan = JSON.parse(await fs.readFile(file, "utf8"));
    await validatePlan(plan, this.root);
    return plan;
  }
  async initializeRoot() {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    await safeDirectory(this.root);
    await fs.chmod(this.root, 0o700);
  }
  async startHelper(plan, action) {
    plan.parentPid = process.pid;
    await save(paths(plan).journal, plan);
    const child = spawn(process.execPath, [path.join(this.root, "helper/helper.cjs"), this.root, action], {
      detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: os.homedir(), TMPDIR: os.tmpdir(), ELECTRON_RUN_AS_NODE: "1" },
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error("El ayudante no confirmó que estuviera preparado. Slate no se cerrará.")); }, 15000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("No se pudo iniciar el ayudante de actualización.")); });
      child.once("message", value => {
        if (value !== "ready") return;
        clearTimeout(timer); resolve();
      });
    });
    child.unref();
    try { await this.prepareQuit(); }
    catch (e) { child.kill(); throw e; }
    this.app.quit();
  }
  async bootstrap() {
    if (!this.supported) return true;
    const plan = await this.readPlan();
    if (plan?.phase === "restored" && plan.error) {
      await this.message({ type: "warning", message: "La actualización falló y se recuperó la versión anterior.", detail: `${plan.error}\n\nLas copias se conservan. Puedes revisarlas en Ajustes → General → Actualizaciones de Mac.`, buttons: ["Continuar con la versión anterior"] });
    }
    if (!plan || ["accepted", "restored"].includes(plan.phase) || (plan.phase === "prepared" && !plan.helperPid)) return true;
    if (plan.phase === "testing" && process.env.SLATE_UPDATE_TOKEN === plan.token &&
        this.app.getVersion() === plan.record.version &&
        path.resolve(process.execPath, "../../..") === this.target &&
        this.app.getPath("userData") === plan.profile) {
      this.testing = plan;
      delete process.env.SLATE_UPDATE_TOKEN;
      return true;
    }
    // Do not read any database or preferences from a possibly migrated profile.
    const result = await this.message({
      type: "warning", message: "Hay una actualización pendiente de recuperar.",
      detail: "Slate no abrirá el perfil hasta resolverla. Si el ayudante sigue trabajando, espera a que termine. Si se interrumpió, recupera la versión anterior. No elimines las carpetas de recuperación.",
      buttons: ["Cerrar", "Recuperar versión anterior"], defaultId: 0, cancelId: 0,
    });
    if (result.response === 1) await this.startHelper(plan, "rollback");
    else this.app.quit();
    return false;
  }
  async confirmStartup() {
    const plan = this.testing;
    if (!plan || this.confirming) return;
    this.confirming = true;
    const result = await this.message({
      type: "question", message: `Slate ${plan.record.version} ha abierto el perfil.`,
      detail: "¿Quieres conservar esta actualización? Si eliges volver o no confirmas en tres minutos, se intentará recuperar la app y el perfil anteriores. La copia de recuperación contiene cookies y otros datos privados; se guarda solo en este Mac.",
      buttons: ["Volver a la versión anterior", "Conservar actualización"], defaultId: 0, cancelId: 0,
    });
    await save(paths(plan).decision, { token: plan.token, accept: result.response === 1 });
  }
  async open() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (!this.supported) {
        await this.message({ message: "Este actualizador es exclusivo de la distribución directa de Slate para Mac.", detail: "No funciona en MAS, Windows, Linux ni en la vista previa.", buttons: ["Cerrar"] });
        return;
      }
      await this.initializeRoot();
      const plan = await this.readPlan();
      if (plan) {
        if (plan.phase === "prepared") {
          const result = await this.message({
            message: `Slate ${plan.record.version} está preparado para instalar.`,
            detail: `La actualización está aplazada. Puedes continuar navegando, iniciar el reemplazo o eliminar la descarga preparada. Las firmas y VMP se vuelven a comprobar antes del reemplazo.\n\nSi el proceso se interrumpe y la app no está en Aplicaciones, en Finder → Ir a la carpeta abre ${this.root} y ejecuta «${RECOVERY_ENTRY}». Guarda esa ruta antes de continuar.`,
            buttons: ["Seguir aplazando", "Actualizar y reiniciar", "Eliminar descarga preparada"], defaultId: 0, cancelId: 0,
          });
          if (result.response === 1) await this.startHelper(plan, "install");
          if (result.response === 2) await this.discard(plan);
          return;
        }
        const result = await this.message({
          message: plan.phase === "restored" ? "La versión anterior se ha recuperado." : "Hay una copia de recuperación conservada.",
          detail: `${plan.error ? `Último resultado: ${plan.error}\n\n` : ""}Antes de otra actualización debes resolver esta copia. Restaurar también devuelve el perfil a su estado anterior: los cambios posteriores quedan en una carpeta aparte, sin fusionarse. Eliminar las copias es irreversible.`,
          buttons: ["Cerrar", ...(plan.phase === "accepted" ? ["Restaurar app y perfil anteriores"] : []), "Eliminar copias de recuperación"],
          defaultId: 0, cancelId: 0,
        });
        if (plan.phase === "accepted" && result.response === 1) {
          if ((await this.message({ type: "warning", message: "¿Restaurar la app y el perfil anteriores?", detail: "Se cerrará Slate. Los datos creados desde la actualización quedarán separados en el perfil posterior y no aparecerán en el perfil restaurado.", buttons: ["Cancelar", "Restaurar y reiniciar"], defaultId: 0, cancelId: 0 })).response === 1) await this.startHelper(plan, "rollback");
        } else if (result.response === (plan.phase === "accepted" ? 2 : 1)) await this.discard(plan);
        return;
      }
      await this.check();
    } catch (error) {
      await this.message({ type: "error", message: "No se pudo completar la actualización.", detail: error.message, buttons: ["Cerrar"] });
    } finally { this.busy = false; }
  }
  async discard(plan) {
    if (!["accepted", "restored", "prepared"].includes(plan.phase) || plan.helperPid) throw new Error("La transacción no ha terminado. Recupera primero la versión anterior.");
    if ((await this.message({ type: "warning", message: "¿Eliminar las copias locales de recuperación?", detail: "Se borrarán definitivamente la app anterior y los perfiles de recuperación conservados. La app y el perfil activos no se borran.", buttons: ["Cancelar", "Eliminar copias"], defaultId: 0, cancelId: 0 })).response !== 1) return;
    await fs.rm(plan.work, { recursive: true });
    for (const name of ["profile-before", "profile-after", "decision.json", "helper", RECOVERY_ENTRY, "RECUPERAR SLATE.txt"]) await fs.rm(path.join(this.root, name), { recursive: true, force: true });
    await fs.rm(paths(plan).journal);
  }
  async check() {
    assertPolicy(policy); // Fail before any network request if trust is unconfigured.
    if (path.resolve(process.execPath, "../../..") !== this.target) throw new Error("Abre la copia instalada en /Applications/Slate Privacy.app, no el DMG ni otra carpeta.");
    const current = await this.ops.inspect(this.target);
    const macOS = await this.ops.macOS();
    const consent = await this.message({
      message: "Buscar una actualización estable en GitHub",
      detail: "Solo se contacta con github.com y su servicio de archivos. GitHub recibirá tu IP y la solicitud, no tus páginas, cookies ni marcadores. No hay búsquedas automáticas ni telemetría.",
      buttons: ["Ahora no", "Buscar actualización"], defaultId: 0, cancelId: 0,
    });
    if (consent.response !== 1) return;
    const release = await network.json("https://api.github.com/repos/fouronesys/slate/releases/latest");
    if (release.draft || release.prerelease || typeof release.tag_name !== "string") throw new Error("GitHub no devolvió una release estable.");
    const version = release.tag_name.replace(/^v/, "");
    if (compare(version, current.version) <= 0) {
      await this.message({ message: "No hay una versión estable posterior.", buttons: ["Cerrar"] }); return;
    }
    // process.arch intentionally selects x64 under Rosetta; no silent arch migration.
    const name = `Slate-Privacy-${version}-${process.arch}.update.json`;
    if (!Array.isArray(release.assets) || !release.assets.some(asset => asset.name === name)) throw new Error("Esta release todavía no tiene una promoción verificada para tu arquitectura.");
    const envelope = await network.json(downloadURL(version, name));
    const record = verifyRecord(envelope, policy, { current, arch: process.arch, macOS, engine: this.engine });
    if (record.version !== version) throw new Error("El registro firmado no corresponde a la release.");
    const result = await this.message({
      message: `Slate ${record.version} está disponible.`,
      detail: `Canal estable · ${record.arch} · ${Math.ceil(record.size / 1024 / 1024)} MB.\nSe descargará y verificará sin cerrar Slate. Después podrás aplazar el reemplazo. Se conserva una copia local del perfil, incluidas cookies y preferencias, y de la app anterior.`,
      buttons: ["Aplazar", "Descargar y verificar"], defaultId: 0, cancelId: 0,
    });
    if (result.response !== 1) return;
    await this.stage({ record, envelope, current, macOS });
  }
  async stage({ record, envelope, current, macOS }) {
    const download = await fs.mkdtemp(path.join(this.root, "download-"));
    let work, saved = false;
    try {
      const dmg = path.join(download, record.asset);
      await network.download(downloadURL(record.version, record.asset), dmg, record.size);
      if (await hashFile(dmg) !== record.sha256) throw new Error("El SHA-256 del DMG no coincide con la promoción firmada.");
      await safeDirectory("/Applications");
      work = await fs.mkdtemp("/Applications/.slate-update-");
      await fs.chmod(work, 0o700);
      const stage = path.join(work, "Slate Privacy.app");
      await this.ops.withDMG(dmg, path.join(download, "mounted"), async source => {
        await this.ops.validate(source, record);
        await this.ops.copy(source, stage);
      });
      await this.ops.validate(stage, record);
      // Include profile size in the space check by asking statfs after staging.
      const profile = this.app.getPath("userData");
      await safeDirectory(profile);
      const required = Number((await require("./native.cjs").command("/usr/bin/du", ["-sk", profile])).stdout.split(/\s+/)[0]) * 1024;
      const free = await fs.statfs(this.root);
      if (!Number.isFinite(required) || Number(free.bavail) * Number(free.bsize) < required * 1.2 + 256 * 1024 ** 2) throw new Error("No hay espacio suficiente para conservar una copia completa del perfil.");
      await fs.cp(__dirname, path.join(this.root, "helper"), { recursive: true, errorOnExist: true, force: false });
      const plan = {
        root: this.root, work, profile, record, envelope, current, macOS, engine: this.engine,
        token: crypto.randomBytes(32).toString("hex"), parentPid: process.pid, phase: "prepared",
      };
      await writeRecoveryEntry(plan);
      await save(paths(plan).journal, plan); saved = true;
      verifyRecord(envelope, policy, { current, arch: process.arch, macOS, engine: this.engine });
      const result = await this.message({
        message: "La descarga y las firmas se han verificado.",
        detail: `Al continuar, Slate cerrará las pestañas y esperará a terminar de guardar el perfil antes de copiarlo. Este reinicio de mantenimiento no ejecuta «borrar datos al salir». Después del arranque tendrás tres minutos para confirmar; si falla, se intentará restaurar la app y el perfil. No apagues el Mac durante el reemplazo.\n\nSi Slate desaparece de Aplicaciones por una interrupción, en Finder → Ir a la carpeta abre:\n${this.root}\ny ejecuta «${RECOVERY_ENTRY}». El lanzador funciona fuera de la app; guarda esta ruta.`,
        buttons: ["Aplazar y seguir navegando", "Actualizar y reiniciar"], defaultId: 0, cancelId: 0,
      });
      if (result.response === 1) await this.startHelper(plan, "install");
    } finally {
      await require("./native.cjs").removeDownloadDirectory(download);
      if (!saved) {
        if (work) await fs.rm(work, { recursive: true, force: true });
        await fs.rm(path.join(this.root, "helper"), { recursive: true, force: true });
      }
    }
  }
}
module.exports = { MacUpdater };
