const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const WIDGETS = ["search", "bookmarks", "clock", "collections", "companion", "games"];
const DEFAULT_HOME = {
  order: WIDGETS,
  hidden: [],
  size: "normal",
  corners: "soft",
  transparency: 90,
  positions: {},
  anchors: {},
  widgetBackground: false,
  companion: { enabled: true, kind: "cat", name: "Miso", color: "#63795e",
    floating: false, followCursor: true, secretUnlocked: false, cosmic: false },
};
function text(value, max = 2000) {
  if (typeof value !== "string") throw new Error("Introduce un texto válido.");
  return value.trim().slice(0, max);
}
function webUrl(value) {
  const url = new URL(text(value));
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Solo se admiten enlaces web sin credenciales.");
  }
  return url.href;
}
function homePatch(current, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Diseño no válido.");
  const next = structuredClone(current);
  for (const [key, value] of Object.entries(patch)) {
    if (key === "order") {
      if (!Array.isArray(value) || value.length !== WIDGETS.length ||
          new Set(value).size !== WIDGETS.length || value.some((id) => !WIDGETS.includes(id))) throw new Error("Orden no válido.");
    } else if (key === "hidden") {
      if (!Array.isArray(value) || new Set(value).size !== value.length ||
          value.some((id) => !WIDGETS.includes(id))) throw new Error("Widgets no válidos.");
    } else if (key === "size") {
      if (!["normal", "compact", "large"].includes(value)) throw new Error("Tamaño no válido.");
    } else if (key === "corners") {
      if (!["soft", "square", "round"].includes(value)) throw new Error("Esquinas no válidas.");
    } else if (key === "transparency") {
      if (!Number.isInteger(value) || value < 30 || value > 100) throw new Error("Opacidad no válida.");
    } else if (key === "widgetBackground") {
      if (typeof value !== "boolean") throw new Error("Fondo de widget no válido.");
    } else if (key === "anchors") {
      const { ZONES } = require("./home-layout.cjs");
      if (!value || typeof value !== "object" || Array.isArray(value) ||
          Object.entries(value).some(([id, zone]) => !WIDGETS.includes(id) || !ZONES.includes(zone))) {
        throw new Error("Zona de widget no válida.");
      }
    } else if (key === "positions") {
      if (!value || typeof value !== "object" || Array.isArray(value) ||
          Object.entries(value).some(([id, point]) =>
            !WIDGETS.includes(id) || !point || typeof point !== "object" || Array.isArray(point) ||
            Object.keys(point).length !== 2 || !Object.hasOwn(point, "x") || !Object.hasOwn(point, "y") ||
            [point.x, point.y].some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1))) {
        throw new Error("Posición de widget no válida.");
      }
    } else if (key === "companion") {
      if (!value || typeof value.enabled !== "boolean" || !["cat", "robot"].includes(value.kind) ||
          typeof value.name !== "string" || !value.name.trim() || value.name.length > 40 ||
          !/^#[\da-f]{6}$/i.test(value.color)) throw new Error("Compañero no válido.");
      for (const option of ["floating", "followCursor", "secretUnlocked", "cosmic"]) {
        if (Object.hasOwn(value, option) && typeof value[option] !== "boolean") throw new Error("Opción del compañero no válida.");
      }
      next.companion = { ...DEFAULT_HOME.companion, ...current.companion, ...value };
      if (!next.companion.secretUnlocked) next.companion.cosmic = false;
      continue;
    } else throw new Error("Preferencia desconocida.");
    next[key] = structuredClone(value);
  }
  return next;
}
const { isSearchEngine } = require("./search-engines.cjs");
function initialData() {
  return {
    version: 1,
    workspaceId: "personal",
    workspaces: [{ id: "personal", name: "Personal" }, { id: "trabajo", name: "Trabajo" }, { id: "compras", name: "Compras" }],
    collections: [{ id: "inbox", name: "Para después" }],
    items: [],
    home: structuredClone(DEFAULT_HOME),
    settings: { youtubeFocus: false, youtubeMute: false, clearOnExit: false, searchEngine: "google", companionSuggestions: true },
  };
}
class FeatureStore {
  constructor(directory) {
    this.file = path.join(directory, "features.json");
    this.undo = [];
    this.data = initialData();
    if (fs.existsSync(this.file)) {
      const saved = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (saved.version !== 1 || !Array.isArray(saved.workspaces) || !Array.isArray(saved.collections) ||
          !Array.isArray(saved.items) || !saved.workspaces.some((w) => w.id === saved.workspaceId)) {
        throw new Error("No se pudieron leer tus espacios. Se conserva el archivo original.");
      }
      saved.home = homePatch(DEFAULT_HOME, saved.home);
      saved.workspaceHomes = Object.fromEntries(Object.entries(saved.workspaceHomes || {})
        .filter(([id]) => saved.workspaces.some(w => w.id === id))
        .map(([id, home]) => [id, homePatch(DEFAULT_HOME, home)]));
      saved.settings = { ...initialData().settings, ...saved.settings };
      if (!isSearchEngine(saved.settings.searchEngine)) saved.settings.searchEngine = "google";
      if (typeof saved.settings.companionSuggestions !== "boolean") saved.settings.companionSuggestions = true;
      this.data = saved;
    }
  }
  snapshot() { return structuredClone(this.data); }
  commit(next) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(`${this.file}.tmp`, this.file);
    this.data = next;
  }
  action(action) {
    if (!action || typeof action.type !== "string") throw new Error("Acción no válida.");
    const next = this.snapshot();
    let result = true;
    const collection = (id) => {
      const found = next.collections.find((c) => c.id === id);
      if (!found) throw new Error("La colección ya no existe.");
      return found;
    };
    const item = (id) => {
      const found = next.items.find((i) => i.id === id);
      if (!found) throw new Error("El elemento ya no existe.");
      return found;
    };
    switch (action.type) {
      case "workspace:add": {
        const name = text(action.name, 40);
        if (!name || next.workspaces.length >= 20) throw new Error("Elige un nombre; máximo 20 espacios.");
        result = { id: randomUUID(), name };
        next.workspaces.push(result);
        break;
      }
      case "workspace:switch": {
        if (!next.workspaces.some((w) => w.id === action.id)) throw new Error("Espacio no válido.");
        if (next.workspaceId === action.id) break;
        next.workspaceHomes ||= {};
        next.workspaceHomes[next.workspaceId] = structuredClone(next.home);
        next.workspaceId = action.id;
        if (!next.workspaceHomes[action.id]) {
          next.workspaceHomes[action.id] = structuredClone(DEFAULT_HOME);
          if (action.id === "trabajo") next.workspaceHomes[action.id].hidden = ["games"];
          if (action.id === "compras") {
            next.workspaceHomes[action.id].hidden = ["games", "clock"];
            next.workspaceHomes[action.id].anchors = { collections: "middle-center", search: "top-center", bookmarks: "bottom-center" };
          }
        }
        next.home = structuredClone(next.workspaceHomes[action.id]);
        break;
      }
      case "collection:add": {
        const name = text(action.name, 80);
        if (!name || next.collections.length >= 100) throw new Error("Elige un nombre; máximo 100 colecciones.");
        result = { id: randomUUID(), name };
        next.collections.push(result);
        break;
      }
      case "collection:rename": {
        const name = text(action.name, 80);
        if (!name) throw new Error("La colección necesita un nombre.");
        collection(action.id).name = name;
        break;
      }
      case "collection:delete":
        collection(action.id);
        next.collections = next.collections.filter((c) => c.id !== action.id);
        next.items = next.items.filter((i) => i.collectionId !== action.id);
        break;
      case "item:add": {
        collection(action.collectionId);
        if (next.items.length >= 500) throw new Error("Límite local de 500 elementos alcanzado.");
        if (!["link", "text", "image"].includes(action.kind)) throw new Error("Tipo no válido.");
        const entry = {
          id: randomUUID(), collectionId: action.collectionId, kind: action.kind,
          title: text(action.title || "", 160), text: text(action.text || "", 12000),
          url: action.url ? webUrl(action.url) : "", notes: text(action.notes || "", 4000),
          image: "", createdAt: new Date().toISOString(),
        };
        if (action.kind === "link" && !entry.url) throw new Error("Falta el enlace.");
        if (action.kind === "text" && !entry.text) throw new Error("Falta el texto.");
        if (action.kind === "image") {
          if (!action.trustedImage || typeof action.image !== "string" ||
              !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(action.image) ||
              action.image.length > 2800000) throw new Error("Imagen no válida o demasiado grande.");
          entry.image = action.image;
        }
        next.items.unshift(entry);
        result = entry;
        break;
      }
      case "item:update": {
        const entry = item(action.id);
        if (action.title !== undefined) entry.title = text(action.title, 160);
        if (action.notes !== undefined) entry.notes = text(action.notes, 4000);
        if (action.collectionId !== undefined) {
          collection(action.collectionId);
          entry.collectionId = action.collectionId;
        }
        break;
      }
      case "item:delete":
        item(action.id);
        next.items = next.items.filter((i) => i.id !== action.id);
        break;
      case "settings:update":
        if (!action.patch || typeof action.patch !== "object") throw new Error("Preferencias no válidas.");
        for (const [key, value] of Object.entries(action.patch)) {
          if (!Object.hasOwn(next.settings, key) ||
              (key === "searchEngine" ? !isSearchEngine(value) : typeof value !== "boolean")) throw new Error("Preferencia no válida.");
          next.settings[key] = value;
        }
        break;
      case "home:update":
        next.home = homePatch(next.home, action.patch);
        break;
      case "home:reset":
        next.home = structuredClone(DEFAULT_HOME);
        break;
      case "home:undo":
        if (!this.undo.length) return false;
        next.home = this.undo[this.undo.length - 1];
        break;
      default: throw new Error("Acción desconocida.");
    }
    const previousHome = this.data.home;
    this.commit(next);
    if (action.type === "workspace:switch") this.undo = [];
    if (action.type === "home:undo") this.undo.pop();
    else if (action.type.startsWith("home:")) {
      this.undo.push(previousHome);
      if (this.undo.length > 30) this.undo.shift();
    }
    return result;
  }
}
function searchLibrary(query, bookmarks, history) {
  const term = text(query, 200).toLocaleLowerCase("es");
  if (!term) return [];
  return [...bookmarks.map((entry) => ({ ...entry, source: "Marcador" })),
    ...history.map((entry) => ({ ...entry, source: "Historial" }))]
    .filter((entry) => `${entry.title} ${entry.url}`.toLocaleLowerCase("es").includes(term))
    .filter((entry, index, all) => all.findIndex((e) => e.url === entry.url) === index)
    .slice(0, 100);
}
module.exports = { FeatureStore, DEFAULT_HOME, WIDGETS, homePatch, searchLibrary };
