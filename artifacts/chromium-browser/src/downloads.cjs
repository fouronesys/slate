const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
function safeName(name) {
  let clean = path.basename(String(name || "archivo").replace(/\\/g, "/"))
    .replace(/[<>:"|?*\x00-\x1f\x7f]/g, "_").slice(0, 180).replace(/[. ]+$/, "") || "archivo";
  // Win32 device names are reserved even with an extension, in any case.
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(clean)) clean = `_${clean}`;
  return clean;
}
function unusedPath(directory, name, reserved = new Set(), platform = process.platform) {
  const parsed = path.parse(safeName(name));
  const key = value => platform === "win32" ? value.toLowerCase() : value;
  const occupied = new Set([...reserved].map(key));
  for (let i = 0; i < 10000; i++) {
    const candidate = path.join(directory, `${parsed.name}${i ? ` (${i})` : ""}${parsed.ext}`);
    if (!occupied.has(key(candidate)) && !fs.existsSync(candidate)) return candidate;
  }
  throw new Error("No se encontró un nombre libre para la descarga.");
}
class Downloads {
  constructor({ directory, changed, started, shell }) {
    this.directory = directory;
    this.changed = changed;
    this.started = started;
    this.shell = shell;
    this.entries = [];
    this.items = new Map();
    this.sessions = new WeakSet();
    this.reserved = new Set();
  }
  bind(session, workspaceId, ephemeral = false) {
    if (this.sessions.has(session)) return;
    this.sessions.add(session);
    session.on("will-download", (event, item) => {
      let savePath;
      try {
        fs.mkdirSync(this.directory, { recursive: true });
        savePath = unusedPath(this.directory, item.getFilename(), this.reserved);
        item.setSavePath(savePath);
      } catch {
        event.preventDefault();
        this.changed("No se pudo guardar en Descargas. Comprueba el espacio y los permisos de la carpeta.");
        return;
      }
      this.reserved.add(savePath);
      const entry = { id: randomUUID(), name: path.basename(savePath), path: savePath,
        workspaceId, ephemeral, received: 0, total: item.getTotalBytes(), state: "progressing", paused: false };
      this.entries.unshift(entry);
      this.items.set(entry.id, item);
      // Keep only recent finished entries; never lose an active download's controls.
      const finished = this.entries.filter(e => !this.items.has(e.id)).slice(0, 100);
      this.entries = this.entries.filter(e => this.items.has(e.id) || finished.includes(e));
      this.changed();
      this.started({ id: entry.id });
      let last = 0;
      item.on("updated", (_event, state) => {
        entry.state = state;
        entry.received = item.getReceivedBytes();
        entry.total = item.getTotalBytes();
        entry.paused = item.isPaused();
        if (Date.now() - last > 120 || state !== "progressing") { last = Date.now(); this.changed(); }
      });
      item.once("done", (_event, state) => {
        entry.state = state;
        entry.received = item.getReceivedBytes();
        entry.total = item.getTotalBytes();
        entry.paused = false;
        this.items.delete(entry.id);
        this.reserved.delete(savePath);
        this.changed(state === "completed" ? `Descarga completada: ${entry.name}` :
          state === "interrupted" ? `No se completó ${entry.name}. Puedes reintentar la descarga desde su página.` : undefined);
      });
    });
  }
  snapshot(workspaceId) {
    const entries = this.entries.filter(e => e.workspaceId === workspaceId);
    return { directory: this.directory, active: entries.filter(e => this.items.has(e.id)).length,
      entries: entries.map(e => ({ ...e, active: this.items.has(e.id), resumable: Boolean(this.items.get(e.id) && (e.paused || this.items.get(e.id).canResume())) })) };
  }
  hasActive() { return this.items.size > 0; }
  async action(workspaceId, id, action) {
    if (action === "folder") {
      fs.mkdirSync(this.directory, { recursive: true });
      const error = await this.shell.openPath(this.directory);
      if (error) throw new Error("No se pudo abrir la carpeta Descargas.");
      return true;
    }
    const entry = this.entries.find(e => e.id === id && e.workspaceId === workspaceId);
    if (!entry) throw new Error("Esta descarga ya no está disponible en este espacio.");
    const item = this.items.get(id);
    if (action === "pause" && item && entry.state === "progressing" && !entry.paused) item.pause();
    else if (action === "resume" && item && (item.isPaused() || item.canResume())) item.resume();
    else if (action === "cancel" && item) item.cancel();
    else if (action === "show" && entry.state === "completed") {
      if (!fs.existsSync(entry.path)) throw new Error("El archivo se movió o ya no existe en esta ubicación.");
      this.shell.showItemInFolder(entry.path);
    } else throw new Error("La acción no está disponible para esta descarga.");
    if (item && this.items.has(id)) entry.paused = item.isPaused();
    this.changed();
    return true;
  }
}
module.exports = { Downloads, safeName, unusedPath };
