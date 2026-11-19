const { app, BrowserWindow, WebContentsView, ipcMain, session, dialog, Menu, nativeTheme, systemPreferences, clipboard, shell } = require("electron");
const { Downloads } = require("./downloads.cjs");
const { historyEntry, reserveSpace } = require("./address-suggestions.cjs");
const { SearchSuggestions } = require("./search-suggestions.cjs");
const { searchUrl } = require("./search-engines.cjs");
const { tabMenuEntries } = require("./tabs-menu.cjs");
const { AppUpdates } = require("./app-updates.cjs");
let suggestionSession;
const searchSuggestions = new SearchSuggestions({
  fetch: (url, options) => {
    if (!suggestionSession) {
      // Never use a page/workspace session: logged-in cookies and disk caches
      // must not accompany suggestions. No persist: prefix means memory-only.
      suggestionSession = session.fromPartition("slate-search-suggestions", { cache: false });
      suggestionSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      suggestionSession.setPermissionCheckHandler(() => false);
    }
    return suggestionSession.fetch(url, options);
  },
});
const { clearFavicon, updateFavicon } = require("./tab-favicon.cjs");
const { buildContextMenu } = require("./context-menu.cjs");
const { ProtectedVideo, allowProtectedMedia, probeProtectedVideo } = require("./protected-video.cjs");
const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { NativeCompanion } = require("./native-companion.cjs");
const { PageTheme, pageHost, normalizeThemeExceptions, themePlan } = require("./page-theme.cjs");
const { contextSuggestion } = require("./companion-context.cjs");
const dismissedSuggestions = new Set();
let suggestionCooldown = null;
let companionFeedback = null;
function suggestionMeta() {
  const tab = activeTab();
  const contents = tab?.view.webContents;
  const live = contents && !contents.isDestroyed();
  return {
    zoom: live ? contents.getZoomFactor() : 1,
    audible: live && contents.isCurrentlyAudible(),
    muted: live && contents.isAudioMuted(),
    tabCount: tabs.filter(entry => entry.workspaceId === tab?.workspaceId).length,
    duplicateId: tabs.find(entry => entry.id !== tab?.id && entry.workspaceId === tab?.workspaceId && entry.url === tab?.url)?.id,
    visits: history.filter(entry => entry.url === tab?.url).length,
    collected: featureStore.data.items.some(entry => entry.url === tab?.url),
    canCollect: featureStore.data.collections.length > 0,
  };
}
function contextKey() {
  const tab = activeTab();
  return `${tab?.id}:${tab?.url}`;
}
function currentSuggestion() {
  if (suggestionCooldown?.key === contextKey() && suggestionCooldown.until > Date.now()) return null;
  return contextSuggestion(activeTab(), bookmarks, featureStore.data.settings, suggestionMeta(), dismissedSuggestions);
}
const { pathToFileURL } = require("node:url");
const { Protection } = require("./protection.cjs");
const { isWebUrl, resolveAddress, cleanNavigation } = require("./privacy-policy.cjs");
const { configureNativePrivacy, REMOTE_WEB_PREFERENCES } = require("./native-privacy.cjs");
const { DEFAULT_APPEARANCE, normalizeAppearance, updateAppearance, getLayout, resolveTheme } = require("./appearance.cjs");
const { allowFullscreen, contentBounds, togglePictureInPicture } = require("./media-controls.cjs");
const { syncVideoButtons } = require("./video-buttons.cjs");
const { normalizePreferences, updatePreferences } = require("./browser-preferences.cjs");
const { legalSnapshot, acceptLegal } = require("./legal-state.cjs");
const { commandsFor } = require("./browser-commands.cjs");
const { FeatureStore, searchLibrary } = require("./features.cjs");
const { ExpiringPermissions } = require("./permissions.cjs");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");

configureNativePrivacy(app.commandLine);

// Keep the existing profile and application identity on upgrades.
const previousAppName = app.name;
let profilePath = app.getPath("userData");
const legacyProfile = path.join(app.getPath("appData"), "Brújula");
const hasSavedProfile = ["appearance.json", "bookmarks.json", "privacy.json", "history.json"]
  .some((name) => fs.existsSync(path.join(profilePath, name)));
if (app.isPackaged && !hasSavedProfile && fs.existsSync(legacyProfile)) profilePath = legacyProfile;
app.setName("Slate Privacy");
app.setPath("userData", profilePath);

let windowRef;
let lastTabQuitPending = false;
let downloads;
let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let bookmarks = [];
let history = [];
let recentlyClosed = [];
let protection;
let panelOpen = false;
let addressPopupHeight = 0;
let appearance = { ...DEFAULT_APPEARANCE };
let titlebarRevealed = false;
let companionOverlay;
let pageTheme;
let pageThemeExceptions = new Set();
function applyPageTheme(tab) {
  if (!tab || !pageTheme) return;
  const plan = themePlan(tab, appearance, nativeTheme.shouldUseDarkColors, pageThemeExceptions);
  plan.contrast = appearance.contrast === "alto" || (appearance.contrast === "sistema" && nativeTheme.shouldUseHighContrastColors);
  return pageTheme.apply(tab, plan);
}
let backgroundVideoFile = null;
let backgroundVideos = [];
let stateFrame = null;
let lastSystemStyle = "";
const workspaceActiveTabs = new Map();
let sentFeatures;
let sentBookmarks;
let sentHistory;
let featureStore;
let permissions;
let protectedVideo;
const contexts = new Map();
let quittingAfterCleanup = false;
let browserPreferences = normalizePreferences({});
let legalRecord = {};
let appUpdates;

function scheduleAppUpdates() {
  appUpdates?.schedule(browserPreferences.automaticUpdates && legalSnapshot(legalRecord).accepted);
}

async function prepareUpdateInstall() {
  if (downloads?.hasActive()) {
    await dialog.showMessageBox(windowRef, { type: "info", message: "Espera a que terminen las descargas antes de instalar." });
    return false;
  }
  const { response } = await dialog.showMessageBox(windowRef, {
    type: "question", title: "Instalar actualización de Slate",
    message: "Slate se cerrará para instalar la actualización.",
    detail: "Guarda los formularios y el trabajo abierto. Se conservan tus preferencias, marcadores y perfil. Si activaste borrar datos al salir, se aplicará también ahora.",
    buttons: ["Cancelar", "Instalar y reiniciar"], defaultId: 0, cancelId: 0,
  });
  if (response !== 1) return false;
  if (featureStore.data.settings.clearOnExit && quittingAfterCleanup !== true) {
    for (const tab of tabs) if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    await clearBrowsingData();
    quittingAfterCleanup = true;
  }
  return true;
}

function libraryFile(name, workspaceId = featureStore?.data.workspaceId || "personal") {
  return workspaceId === "personal" ? `${name}.json` : `${name}-${workspaceId}.json`;
}

function persistLibrary(name, value, workspaceId = featureStore.data.workspaceId) {
  if (!writeJson(libraryFile(name, workspaceId), value)) throw new Error("No se pudieron guardar los datos locales.");
  const context = contexts.get(workspaceId);
  if (context) context[name] = value;
}

function tabProtection(tab) { return tab?.protection || protection; }

function createContext(workspaceId) {
  if (contexts.has(workspaceId)) return contexts.get(workspaceId);
  const browserSession = workspaceId === "personal"
    ? session.defaultSession : session.fromPartition(`persist:slate-space-${workspaceId}`);
  browserSession.setUserAgent(session.defaultSession.getUserAgent());
  permissions.bind(browserSession);
  downloads.bind(browserSession, workspaceId);
  const shield = workspaceId === "personal" ? protection : new Protection(
    browserSession, app.getPath("userData"), sendState, readJson("privacy.json", {}),
  );
  const context = {
    session: browserSession, protection: shield,
    bookmarks: readJson(libraryFile("bookmarks", workspaceId), []),
    history: readJson(libraryFile("history", workspaceId), []),
  };
  contexts.set(workspaceId, context);
  if (workspaceId !== "personal" && legalSnapshot(legalRecord).accepted) void shield.start();
  return context;
}

function switchWorkspace(id) {
  if (!featureStore.data.workspaces.some((workspace) => workspace.id === id)) throw new Error("Espacio no válido.");
  if (featureStore.data.workspaceId === id) return;
  const previous = activeTab();
  if (previous) workspaceActiveTabs.set(previous.workspaceId, previous.id);
  if (previous && windowRef.contentView.children.includes(previous.view)) {
    exitVideoFullscreen(previous);
    windowRef.contentView.removeChildView(previous.view);
  }
  featureStore.action({ type: "workspace:switch", id });
  const context = createContext(id);
  protection = context.protection;
  bookmarks = context.bookmarks;
  history = context.history;
  activeTabId = null;
  const first = tabs.find(tab => tab.id === workspaceActiveTabs.get(id)) || tabs.find((tab) => tab.workspaceId === id);
  if (first) activateTab(first.id);
  else createTab();
  setActiveViewBounds();
  sendState();
}

const YOUTUBE_FOCUS_CSS = `
  ytd-rich-grid-renderer, ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts],
  ytd-watch-next-secondary-results-renderer, #comments, ytd-mini-guide-renderer,
  ytd-guide-entry-renderer:has(a[href^="/shorts"]), .ytp-endscreen-content {
    display: none !important;
  }`;

async function applyYoutubeMode(tab) {
  const contents = tab.view.webContents;
  if (contents.isDestroyed()) return;
  const youtube = (() => { try {
    const host = new URL(contents.getURL()).hostname;
    return host === "youtube.com" || host.endsWith(".youtube.com");
  } catch { return false; } })();
  if (tab.focusCss) {
    await contents.removeInsertedCSS(tab.focusCss).catch(() => {});
    tab.focusCss = null;
  }
  contents.setAudioMuted(youtube && featureStore.data.settings.youtubeMute);
  if (youtube && featureStore.data.settings.youtubeFocus) {
    tab.focusCss = await contents.insertCSS(YOUTUBE_FOCUS_CSS, { cssOrigin: "user" }).catch(() => null);
  }
}

async function clearBrowsingData() {
  // Called only after explicit confirmation or previously opted-in exit cleanup.
  for (const context of contexts.values()) {
    await context.session.clearStorageData();
    await context.session.clearCache();
  }
  // Also clean persistent spaces that weren't opened during this run.
  for (const workspace of featureStore.data.workspaces) {
    if (!contexts.has(workspace.id)) {
      const browserSession = session.fromPartition(`persist:slate-space-${workspace.id}`);
      await browserSession.clearStorageData();
      await browserSession.clearCache();
    }
    persistLibrary("history", [], workspace.id);
  }
  history = [];
  recentlyClosed = [];
}

async function featureAction(action) {
  if (!action || typeof action.type !== "string") throw new Error("Acción no válida.");
  let result;
  switch (action.type) {
    case "workspace:switch": switchWorkspace(action.id); return true;
    case "tab:ephemeral": return createTab(null, true, { ephemeral: true });
    case "permission:respond": return permissions.respond(action.id, action.decision);
    case "permission:revoke": permissions.revoke(action.id); return true;
    case "search": return searchLibrary(action.query, bookmarks, history);
    case "item:save-tab": {
      const tab = activeTab();
      if (!tab?.url || !isWebUrl(tab.url)) throw new Error("Abre una página antes de guardarla.");
      result = featureStore.action({ type: "item:add", kind: "link", collectionId: action.collectionId,
        title: tab.title, url: tab.url });
      break;
    }
    case "item:add":
      // Only native context menu image import may pass a trustedImage flag.
      result = featureStore.action({ ...action, trustedImage: false });
      break;
    case "collection:delete": {
      const answer = await dialog.showMessageBox(windowRef, {
        type: "warning", message: "¿Eliminar la colección y todos sus elementos?",
        detail: "Esta acción no se puede deshacer.", buttons: ["Cancelar", "Eliminar"],
        defaultId: 0, cancelId: 0, noLink: true,
      });
      if (answer.response !== 1) return false;
      result = featureStore.action(action);
      break;
    }
    case "settings:update":
      if (action.patch?.clearOnExit === true && !featureStore.data.settings.clearOnExit) {
        const answer = await dialog.showMessageBox(windowRef, {
          type: "warning", message: "¿Borrar los datos de todos los espacios al salir?",
          detail: "Experimental: la limpieza de datos está comprobada, pero el cierre definitivo del proceso sigue pendiente de resolver en la prueba Linux. Recomendamos dejarla desactivada por ahora. Si la activas, se borrarán cookies, sesiones de sitios, caché e historial al salir; se conservarán marcadores, colecciones y apariencia.",
          buttons: ["Cancelar", "Activar limpieza"], defaultId: 0, cancelId: 0, noLink: true,
        });
        if (answer.response !== 1) return false;
      }
      result = featureStore.action(action);
      for (const tab of tabs) void applyYoutubeMode(tab);
      break;
    case "safe-close": {
      const answer = await dialog.showMessageBox(windowRef, {
        type: "question", message: "¿Cerrar Slate Privacy?",
        detail: featureStore.data.settings.clearOnExit
          ? "Se cerrarán las pestañas y se borrarán cookies, sesiones de sitios, caché e historial de todos los espacios. Los marcadores y colecciones se conservan."
          : "Se cerrarán todas las pestañas. Las sesiones de sitios se conservan; las pestañas fugaces se descartan.",
        buttons: ["Cancelar", "Cerrar Slate"], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (answer.response === 1) app.quit();
      return answer.response === 1;
    }
    default: result = featureStore.action(action);
  }
  sendState();
  return result;
}

async function saveContextItem(tab, params) {
  try {
    const collectionId = featureStore.data.collections[0]?.id;
    if (!collectionId) throw new Error("Crea una colección en Tu espacio antes de guardar.");
    let action;
    if (params.selectionText?.trim()) {
      action = { kind: "text", title: "Texto guardado", text: params.selectionText, url: tab.url };
    } else if (params.mediaType === "image" && isWebUrl(params.srcURL)) {
      const response = await tab.view.webContents.session.fetch(params.srcURL, {
        credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(10000),
      });
      const type = response.headers.get("content-type")?.split(";")[0];
      if (!response.ok || !["image/png", "image/jpeg", "image/webp"].includes(type)) {
        throw new Error("Solo se pueden guardar imágenes PNG, JPEG o WebP.");
      }
      if (Number(response.headers.get("content-length")) > 2 * 1024 * 1024) throw new Error("Imagen mayor de 2 MB.");
      const reader = response.body.getReader();
      let size = 0;
      const chunks = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2 * 1024 * 1024) throw new Error("Imagen mayor de 2 MB.");
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel().catch(() => {}); }
      action = { kind: "image", title: "Imagen guardada", url: tab.url,
        trustedImage: true, image: `data:${type};base64,${Buffer.concat(chunks).toString("base64")}` };
    } else {
      action = { kind: "link", title: params.linkText || tab.title, url: params.linkURL || tab.url };
    }
    featureStore.action({ ...action, type: "item:add", collectionId });
    sendState();
    windowRef.webContents.send("browser:notice", "Guardado en tu bandeja. Puedes moverlo a otra colección.");
  } catch (error) { windowRef?.webContents.send("browser:notice", error.message); }
}

function getDataFile(name) {
  return path.join(app.getPath("userData"), name);
}

function effectiveTheme() {
  return resolveTheme(appearance, nativeTheme.shouldUseDarkColors);
}

function nativeBackground() {
  const highContrast = appearance.contrast === "alto" ||
    (appearance.contrast === "sistema" && nativeTheme.shouldUseHighContrastColors);
  if (appearance.colorMode === "propio" && !highContrast) return appearance.canvasColor;
  return effectiveTheme() === "oscuro" ? "#202124" : "#f4f4f6";
}

function useNativeMaterial() {
  return process.platform === "darwin" && appearance.contrast !== "alto" &&
    !(appearance.contrast === "sistema" && nativeTheme.shouldUseHighContrastColors);
}

function parseSystemColor(value) {
  if (typeof value !== "string") return null;
  const hex = value.trim().replace(/^#/, "");
  if (/^[\da-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[\da-f]{8}$/i.test(hex)) return `#${hex.slice(0, 6).toLowerCase()}`;
  return null;
}

function getSystemAccentColor() {
  try {
    if (process.platform === "darwin") {
      const accent = parseSystemColor(systemPreferences.getAccentColor());
      if (accent) return accent;
    }
    if (process.platform === "win32") {
      const highlight = parseSystemColor(systemPreferences.getColor("highlight"));
      if (highlight) return highlight;
    }
  } catch {}
  return DEFAULT_APPEARANCE.customAccent;
}

function getBackgroundVideoPath(fileName = backgroundVideoFile) {
  if (typeof fileName !== "string" || !/^[\da-f-]{36}\.(mp4|webm|mov)$/.test(fileName)) return null;
  return path.join(getDataFile("backgrounds"), fileName);
}

function getBackgroundVideoUrl() {
  const filePath = getBackgroundVideoPath();
  return filePath ? pathToFileURL(filePath).href : null;
}

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(getDataFile(name), "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(getDataFile(name), JSON.stringify(value, null, 2));
    return true;
  } catch (error) {
    console.error(`No se pudo guardar ${name}:`, error);
    return false;
  }
}

function activeTab() {
  return tabs.find((tab) => tab.id === activeTabId) || null;
}

function publicTab(tab) {
  const live = !tab.view.webContents.isDestroyed();
  return {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    favicon: tab.favicon || "",
    loading: tab.loading,
    workspaceId: tab.workspaceId,
    ephemeral: tab.ephemeral,
    canGoBack: live && tab.view.webContents.navigationHistory.canGoBack(),
    canGoForward: live && tab.view.webContents.navigationHistory.canGoForward(),
  };
}

function snapshot(incremental = false) {
  const tab = activeTab();
  const featuresChanged = !incremental || sentFeatures !== featureStore.data;
  const result = {
    tabs: tabs.filter((entry) => entry.workspaceId === featureStore.data.workspaceId).map(publicTab),
    activeTabId,
    ...(!incremental || sentBookmarks !== bookmarks ? { bookmarks } : {}),
    ...(!incremental || sentHistory !== history ? { history } : {}),
    features: { ...(featuresChanged ? featureStore.data : {}),
      ...permissions.snapshot(tabs.filter((entry) => entry.workspaceId === featureStore.data.workspaceId)
        .map((entry) => entry.view.webContents.id)) },
    appearance,
    systemTheme: nativeTheme.shouldUseDarkColors ? "oscuro" : "claro",
    systemHighContrast: nativeTheme.shouldUseHighContrastColors,
    systemAccentColor: getSystemAccentColor(),
    backgroundVideoUrl: getBackgroundVideoUrl(),
    backgroundVideoName: backgroundVideos.find(video => video.fileName === backgroundVideoFile)?.name || (backgroundVideoFile ? "Vídeo local silenciado" : ""),
    backgroundVideos,
    backgroundVideoFile,
    platform: process.platform,
    browserPreferences,
    appUpdates: appUpdates?.snapshot(),
    commands: commandsFor(process.platform),
    legal: legalSnapshot(legalRecord),
    pageTheme: {
      ...themePlan(tab, appearance, nativeTheme.shouldUseDarkColors, pageThemeExceptions),
      status: pageTheme?.status(tab),
      exceptionCount: pageThemeExceptions.size,
      ephemeral: Boolean(tab?.ephemeral),
    },
    layout: getLayout(appearance, panelOpen, ...(windowRef?.getContentSize() || [1320, 860]), bookmarks.length > 0, titlebarRevealed),
    privacy: tabProtection(tab).getState(tab?.view.webContents.id, tab?.url),
    protectedVideo: protectedVideo.snapshot(),
    downloads: downloads.snapshot(featureStore.data.workspaceId),
  };
  if (incremental) {
    sentFeatures = featureStore.data;
    sentBookmarks = bookmarks;
    sentHistory = history;
  }
  return result;
}

function sendState() {
  if (stateFrame) return;
  stateFrame = setTimeout(flushState, 16);
}

function flushState() {
  clearTimeout(stateFrame);
  stateFrame = null;
  if (!windowRef || windowRef.isDestroyed()) return;
  companionOverlay?.sync();
  windowRef.webContents.send("browser:state", snapshot(true));
}

function setActiveViewBounds() {
  if (!windowRef || windowRef.isDestroyed()) return;
  companionOverlay?.sync();
  const tab = activeTab();
  if (!tab || !tab.url || tab.view.webContents.isDestroyed()) return;

  const [width, height] = windowRef.getContentSize();
  const bounds = contentBounds(width, height,
    getLayout(appearance, panelOpen, width, height, bookmarks.length > 0, titlebarRevealed).bounds, tab.htmlFullscreen === true);
  tab.view.setBounds(tab.htmlFullscreen ? bounds : reserveSpace(bounds, addressPopupHeight));
}

function dismissSidePanel() {
  if (!panelOpen || !windowRef || windowRef.isDestroyed()) return;
  panelOpen = false;
  setActiveViewBounds();
  windowRef.webContents.send("browser:panel-dismissed");
  sendState();
}

function updateNativeAppearance() {
  // Electron's themeSource changes this app's preference, not the macOS setting.
  // Sites with native prefers-color-scheme support should follow Slate too.
  const source = appearance.theme === "sistema" ? "system" : appearance.theme === "oscuro" ? "dark" : "light";
  if (nativeTheme.themeSource !== source) nativeTheme.themeSource = source;
  for (const tab of tabs) void applyPageTheme(tab);
  const backgroundColor = nativeBackground();
  if (windowRef && !windowRef.isDestroyed()) {
    if (process.platform === "darwin") {
      windowRef.setWindowButtonVisibility(!appearance.autoHideTitlebar || titlebarRevealed);
    }
    windowRef.setBackgroundColor(useNativeMaterial() ? "#00000000" : backgroundColor);
    if (process.platform === "darwin") windowRef.setVibrancy(useNativeMaterial() ? "under-window" : null);
    activeTab()?.view.setBackgroundColor(backgroundColor);
    setActiveViewBounds();
    sendState();
  }
}

async function chooseBackgroundVideo() {
  const result = await dialog.showOpenDialog(windowRef, {
    title: "Elegir fondo de vídeo",
    properties: ["openFile"],
    filters: [{ name: "Vídeos", extensions: ["mp4", "webm", "mov"] }],
  });
  if (result.canceled || !result.filePaths[0]) return false;

  const sourcePath = result.filePaths[0];
  if (backgroundVideos.length >= 20) throw new Error("Tu biblioteca ya tiene 20 vídeos. Puedes seguir reutilizándolos.");
  const extension = path.extname(sourcePath).slice(1).toLowerCase();
  if (!["mp4", "webm", "mov"].includes(extension)) {
    throw new Error("Elige un vídeo MP4, WebM o MOV.");
  }
  const fileInfo = await fs.promises.stat(sourcePath);
  if (!fileInfo.isFile() || fileInfo.size === 0 || fileInfo.size > 120 * 1024 * 1024) {
    throw new Error("El vídeo debe ocupar menos de 120 MB.");
  }

  const previousFile = backgroundVideoFile;
  const nextAppearance = updateAppearance(appearance, { backdrop: "video" });
  const fileName = `${randomUUID()}.${extension}`;
  const directory = getDataFile("backgrounds");
  const targetPath = path.join(directory, fileName);
  const temporaryPath = `${targetPath}.tmp`;
  await fs.promises.mkdir(directory, { recursive: true });
  try {
    await fs.promises.copyFile(sourcePath, temporaryPath);
    await fs.promises.rename(temporaryPath, targetPath);
    const library = [...backgroundVideos, { fileName, name: path.basename(sourcePath).slice(0, 120) }];
    if (!writeJson("background-videos.json", library)) throw new Error("No se pudo guardar la biblioteca de fondos.");
    if (!writeJson("background-video.json", { fileName })) {
      writeJson("background-videos.json", backgroundVideos);
      throw new Error("No se pudo guardar el fondo de vídeo.");
    }
    if (!writeJson("appearance.json", nextAppearance)) {
      writeJson("background-video.json", { fileName: previousFile });
      writeJson("background-videos.json", backgroundVideos);
      throw new Error("No se pudo guardar la apariencia.");
    }
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    await fs.promises.rm(targetPath, { force: true }).catch(() => {});
    throw error;
  }

  backgroundVideoFile = fileName;
  backgroundVideos.push({ fileName, name: path.basename(sourcePath).slice(0, 120) });
  appearance = nextAppearance;
  updateNativeAppearance();
  return true;
}

function selectBackgroundVideo(fileName) {
  if (!backgroundVideos.some(entry => entry.fileName === fileName)) throw new Error("Este vídeo no está en tu biblioteca.");
  if (!fs.existsSync(getBackgroundVideoPath(fileName))) throw new Error("No se encuentra la copia guardada del vídeo.");
  const next = updateAppearance(appearance, { backdrop: "video" });
  if (!writeJson("background-video.json", { fileName })) throw new Error("No se pudo elegir el fondo.");
  if (!writeJson("appearance.json", next)) {
    writeJson("background-video.json", { fileName: backgroundVideoFile });
    throw new Error("No se pudo guardar la apariencia.");
  }
  backgroundVideoFile = fileName;
  appearance = next;
  updateNativeAppearance();
  return true;
}

async function clearBackgroundVideo() {
  const previousFile = backgroundVideoFile;
  const nextAppearance = appearance.backdrop === "video"
    ? updateAppearance(appearance, { backdrop: "papel" })
    : appearance;
  if (!writeJson("background-video.json", { fileName: null })) {
    throw new Error("No se pudo quitar el fondo de vídeo.");
  }
  if (!writeJson("appearance.json", nextAppearance)) {
    writeJson("background-video.json", { fileName: previousFile });
    throw new Error("No se pudo guardar la apariencia.");
  }
  backgroundVideoFile = null;
  appearance = nextAppearance;
  updateNativeAppearance();
  return true;
}

function exitVideoFullscreen(tab) {
  if (!tab?.htmlFullscreen) return;
  tab.htmlFullscreen = false;
  if (!tab.view.webContents.isDestroyed()) {
    void tab.view.webContents.executeJavaScript(
      "if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); undefined;",
    ).catch(() => {});
  }
}

async function toggleVideoPiP(preferred) {
  try {
    await togglePictureInPicture(activeTab()?.view.webContents, preferred);
  } catch (error) {
    if (windowRef && !windowRef.isDestroyed()) {
      windowRef.webContents.send("browser:notice", error.message || "No se pudo abrir el vídeo en ventana flotante.");
    }
  }
}

function recordHistory(tab) {
  if (tab.ephemeral || !tabProtection(tab).rememberHistory || !tab.url || !isWebUrl(tab.url)) return;
  const context = contexts.get(tab.workspaceId);
  const previous = context.history.find(entry => entry.url === tab.url);
  const nextHistory = [
    historyEntry(tab, previous),
    ...context.history.filter((entry) => entry.url !== tab.url),
  ].slice(0, 300);
  persistLibrary("history", nextHistory, tab.workspaceId);
  if (tab.workspaceId === featureStore.data.workspaceId) history = nextHistory;
}

function attachView(tab) {
  if (!tab.url) return;
  const view = tab.view;
  view.setBackgroundColor(effectiveTheme() === "oscuro" ? "#252722" : "#f4f2eb");
  windowRef.contentView.addChildView(view);
  setActiveViewBounds();
}

function activateTab(id) {
  const next = tabs.find((tab) => tab.id === id);
  if (!next || !windowRef || next.workspaceId !== featureStore.data.workspaceId) return;

  const previous = activeTab();
  if (previous) {
    exitVideoFullscreen(previous);
    if (windowRef.contentView.children.includes(previous.view)) windowRef.contentView.removeChildView(previous.view);
  }
  activeTabId = id;
  attachView(next);
  sendState();
}

function createTab(initialUrl = null, activate = true, options = {}) {
  const id = nextTabId++;
  const workspaceId = featureStore.data.workspaceId;
  const context = createContext(workspaceId);
  const browserSession = options.ephemeral
    ? session.fromPartition(`slate-ephemeral-${randomUUID()}`) : context.session;
  let shield = context.protection;
  if (options.ephemeral) {
    permissions.bind(browserSession);
    downloads.bind(browserSession, workspaceId, true);
    browserSession.setUserAgent(context.session.getUserAgent());
    shield = new Protection(browserSession, app.getPath("userData"), sendState, {});
    if (context.protection.engine) {
      shield.install(ElectronBlocker.deserialize(context.protection.engine.serialize()));
      shield.lastUpdated = context.protection.lastUpdated;
    } else void shield.start();
  }
  const view = new WebContentsView({
    webPreferences: {
      ...REMOTE_WEB_PREFERENCES,
      session: browserSession,
    },
  });
  const tab = {
    id,
    view,
    title: "Nueva pestaña",
    url: "",
    loading: false,
    workspaceId,
    ephemeral: options.ephemeral === true,
    protection: shield,
  };

  const contents = view.webContents;
  contents.setZoomFactor(browserPreferences.defaultZoom / 100);
  contents.on("enter-html-full-screen", () => {
    if (tab.id !== activeTabId) return;
    tab.htmlFullscreen = true;
    setActiveViewBounds();
  });
  contents.on("leave-html-full-screen", () => {
    tab.htmlFullscreen = false;
    setActiveViewBounds();
  });
  contents.on("context-menu", (_event, params) => {
    if (tab.id !== activeTabId) return;
    const entries = buildContextMenu(tab, params, {
      isCurrent: () => tab.id === activeTabId && tab.workspaceId === featureStore.data.workspaceId && Boolean(tab.url),
      openTab: (url, ephemeral) => createTab(url, !browserPreferences.backgroundTabs, { ephemeral }),
      clipboard,
      searchEngine: featureStore.data.settings.searchEngine,
      notice: message => windowRef?.webContents.send("browser:notice", message),
      saveCollection: context => saveContextItem(tab, context),
    });
    Menu.buildFromTemplate(entries).popup({ window: windowRef });
  });
  contents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url) && tab.workspaceId === featureStore.data.workspaceId) {
      createTab(url, !browserPreferences.backgroundTabs, { ephemeral: tab.ephemeral });
    }
    return { action: "deny" };
  });
  contents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && handleShortcut(input)) event.preventDefault();
  });
  contents.on("before-mouse-event", (_event, input) => {
    if (input.type === "mouseDown" && addressPopupHeight && tab.id === activeTabId) {
      addressPopupHeight = 0;
      setActiveViewBounds();
      windowRef.webContents.send("browser:address-dismissed");
    }
    if (input.type === "mouseDown" && panelOpen && tab.id === activeTabId) setImmediate(dismissSidePanel);
  });
  contents.on("will-prevent-unload", () => { lastTabQuitPending = false; });
  contents.on("will-navigate", (event, url) => {
    if (!isWebUrl(url)) event.preventDefault();
  });
  contents.on("will-redirect", (event, url) => {
    if (!isWebUrl(url)) event.preventDefault();
  });
  contents.on("page-title-updated", (_event, title) => {
    tab.title = title || "Nueva pestaña";
    sendState();
  });
  contents.on("page-favicon-updated", (_event, urls) => {
    void updateFavicon(tab, urls, sendState);
  });
  contents.on("did-start-loading", () => {
    tab.loading = true;
    sendState();
  });
  contents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) {
      clearFavicon(tab);
      pageTheme?.invalidate(contents);
      sendState();
    }
  });
  contents.on("dom-ready", () => void applyPageTheme(tab));
  contents.on("did-finish-load", () => contents.setZoomFactor(browserPreferences.defaultZoom / 100));
  contents.on("did-frame-finish-load", () => void syncVideoButtons(contents, browserPreferences.pipButton));
  contents.on("destroyed", () => {
    clearFavicon(tab);
    pageTheme?.forget(contents);
  });
  contents.on("audio-state-changed", () => sendState());
  contents.on("zoom-changed", () => setImmediate(sendState));
  contents.on("did-stop-loading", () => {
    tab.loading = false;
    if (tab.url) tab.title = contents.getTitle() || new URL(tab.url).hostname;
    void applyYoutubeMode(tab);
    void applyPageTheme(tab);
    sendState();
  });
  contents.on("did-navigate", (_event, url) => {
    permissions.forget(contents.id, permissions.origin(url));
    if (isWebUrl(url)) {
      tab.url = url;
      recordHistory(tab);
    }
    sendState();
  });
  contents.on("did-navigate-in-page", (_event, url) => {
    if (isWebUrl(url)) {
      tab.url = url;
      recordHistory(tab);
    }
    sendState();
    void applyYoutubeMode(tab);
    void applyPageTheme(tab);
  });
  contents.on("render-process-gone", () => {
    tab.loading = false;
    sendState();
  });

  tabs.push(tab);
  if (activate) activateTab(id);
  if (initialUrl) navigateTab(tab, initialUrl);
  return id;
}

function navigateTab(tab, input) {
  if (!tab) return false;
  if (!legalSnapshot(legalRecord).accepted) {
    windowRef?.webContents.send("browser:notice", "Revisa y acepta los documentos de primer inicio antes de navegar.");
    return false;
  }
  if (!tabProtection(tab).ready) {
    windowRef.webContents.send("browser:notice", "Espera a que el escudo descargue los filtros. Puedes reintentarlo en Protección.");
    return false;
  }
  const target = resolveAddress(input, featureStore.data.settings.searchEngine);
  if (!target) {
    windowRef.webContents.send("browser:notice", "Ese enlace no es válido.");
    return false;
  }
  exitVideoFullscreen(tab);
  const originalUrl = isWebUrl(input) ? input : `https://${String(input).trim()}`;
  if (cleanNavigation(originalUrl)?.removed) {
    tabProtection(tab).increment(tab.view.webContents.id, "cleanedLinks");
  }
  clearFavicon(tab);
  tab.url = target;
  tab.title = "Cargando…";
  tab.loading = true;
  if (
    tab.id === activeTabId &&
    windowRef &&
    !windowRef.contentView.children.includes(tab.view)
  ) {
    windowRef.contentView.addChildView(tab.view);
  }
  if (tab.id === activeTabId) setActiveViewBounds();
  sendState();
  tab.view.webContents.loadURL(target).catch((error) => {
    if (error && error.errno !== -3 && windowRef && !windowRef.isDestroyed() &&
        !windowRef.webContents.isDestroyed()) {
      windowRef.webContents.send("browser:notice", "No se pudo abrir esta página.");
    }
  });
  return true;
}

function closeTab(id) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  if (tabs.length === 1) {
    if (lastTabQuitPending) return;
    lastTabQuitPending = true;
    require("./quit-fullscreen.cjs").quitAfterFullscreen(windowRef, () => app.quit(),
      () => exitVideoFullscreen(tabs[0]),
      () => {
        lastTabQuitPending = false;
        dialog.showErrorBox("No se pudo cerrar Slate", "No se completó la salida de pantalla completa. Sal de pantalla completa y vuelve a cerrar la pestaña.");
      });
    return;
  }
  const [tab] = tabs.splice(index, 1);
  const browserSession = tab.view.webContents.session;
  exitVideoFullscreen(tab);
  if (!tab.ephemeral && tab.url && isWebUrl(tab.url)) {
    recentlyClosed.unshift({ url: tab.url, title: tab.title, workspaceId: tab.workspaceId });
    recentlyClosed = recentlyClosed.slice(0, 10);
  }
  if (windowRef && !windowRef.isDestroyed()) {
    windowRef.contentView.removeChildView(tab.view);
  }
  permissions.forget(tab.view.webContents.id);
  tabProtection(tab).forget(tab.view.webContents.id);
  tab.view.webContents.close();
  if (tab.ephemeral) {
    tab.protection.dispose();
    permissions.forgetSession(browserSession);
    void Promise.all([browserSession.clearStorageData(), browserSession.clearCache()])
      .catch((error) => console.error("No se pudo limpiar la pestaña fugaz:", error.message));
  }

  const visibleTabs = tabs.filter((entry) => entry.workspaceId === featureStore.data.workspaceId);
  if (!visibleTabs.length) {
    createTab();
    return;
  }
  if (activeTabId === id) {
    const next = visibleTabs[Math.min(index, visibleTabs.length - 1)];
    activeTabId = null;
    activateTab(next.id);
  } else {
    sendState();
  }
}

function restoreRecentlyClosed() {
  const index = recentlyClosed.findIndex((entry) => entry.workspaceId === featureStore.data.workspaceId);
  const last = index >= 0 ? recentlyClosed.splice(index, 1)[0] : null;
  if (last) createTab(last.url, true);
}

function handleShortcut(input) {
  if (!legalSnapshot(legalRecord).accepted) return false;
  const key = input.key.toLowerCase();
  if (!input.meta && !input.control) return false;
  if (input.shift && key === "p") {
    void toggleVideoPiP();
    return true;
  }
  if (input.shift && key === "t") {
    restoreRecentlyClosed();
    return true;
  }
  if (key === "l") {
    windowRef.webContents.send("browser:focus-address");
    return true;
  }
  if (key === "t") {
    createTab();
    return true;
  }
  if (key === "w") {
    closeTab(activeTabId);
    return true;
  }
  if (key === "r") {
    activeTab()?.view.webContents.reload();
    return true;
  }
  return false;
}

function executeBrowserCommand(id) {
  if (!commandsFor(process.platform).some(command => command.id === id)) {
    throw new Error("Comando del navegador no válido.");
  }
  const contents = activeTab()?.view.webContents;
  switch (id) {
    case "new-tab": return createTab();
    case "close-tab": return closeTab(activeTabId);
    case "restore-tab": return restoreRecentlyClosed();
    case "focus-address": windowRef.webContents.send("browser:focus-address"); return true;
    case "reload": contents?.reload(); return true;
    case "pip": return toggleVideoPiP();
    case "home": {
      const tab = activeTab();
      if (tab) {
        exitVideoFullscreen(tab);
        if (windowRef.contentView.children.includes(tab.view)) windowRef.contentView.removeChildView(tab.view);
        tab.url = ""; tab.title = "Nueva pestaña"; tab.loading = false;
        clearFavicon(tab);
        contents.stop();
        setActiveViewBounds(); sendState();
      }
      return true;
    }
    case "back": if (contents?.navigationHistory.canGoBack()) contents.navigationHistory.goBack(); return true;
    case "forward": if (contents?.navigationHistory.canGoForward()) contents.navigationHistory.goForward(); return true;
    case "stop": contents?.stop(); return true;
    case "quit": app.quit(); return true;
  }
}

function createWindow() {
  windowRef = new BrowserWindow({
    show: false,
    width: 1320,
    height: 860,
    minWidth: 760,
    minHeight: 560,
    title: "Slate Privacy",
    icon: path.join(__dirname, "assets/icon.png"),
    backgroundColor: useNativeMaterial() ? "#00000000" : nativeBackground(),
    ...(process.platform === "darwin" ? {
      vibrancy: useNativeMaterial() ? "under-window" : undefined,
      visualEffectState: "followWindow",
    } : {}),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 17 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: "brujula-ui",
    },
  });
  windowRef.setMenuBarVisibility(false);
  companionOverlay = new NativeCompanion(windowRef, {
    onOutsideClick: () => setImmediate(dismissSidePanel),
    getState: () => ({
      companion: featureStore.data.home.companion,
      suggestion: currentSuggestion(),
      feedback: companionFeedback?.key === contextKey() && companionFeedback.until > Date.now() ? companionFeedback.text : null,
      theme: resolveTheme(appearance, nativeTheme.shouldUseDarkColors),
      palette: require("./companion-theme.cjs").palette(appearance,
        resolveTheme(appearance, nativeTheme.shouldUseDarkColors) === "oscuro",
        appearance.contrast === "alto" || appearance.contrast === "sistema" && nativeTheme.shouldUseHighContrastColors),
      fontFamily: appearance.fontFamily,
      highContrast: appearance.contrast === "alto" || (appearance.contrast === "sistema" && nativeTheme.shouldUseHighContrastColors),
    }),
    getArea: () => activeTab()?.htmlFullscreen || !legalSnapshot(legalRecord).accepted ? null :
      getLayout(appearance, panelOpen, ...windowRef.getContentSize(), bookmarks.length > 0, titlebarRevealed).bounds,
    action: async (action) => {
      if (action && typeof action === "object") {
        const suggestion = currentSuggestion();
        if (!suggestion || action.id !== suggestion.id || !["accept", "dismiss"].includes(action.type)) {
          throw new Error("Esta sugerencia ya no corresponde a la pestaña activa.");
        }
        if (action.type === "accept") {
          if (suggestion.action === "bookmark") {
            const tab = activeTab();
            const next = [{ title: tab.title, url: tab.url }, ...bookmarks].slice(0, 100);
            persistLibrary("bookmarks", next);
            bookmarks = next;
            setActiveViewBounds();
          } else if (suggestion.action === "focus") {
            await featureAction({ type: "settings:update", patch: { youtubeFocus: true } });
          } else if (suggestion.action === "collect") {
            await featureAction({ type: "item:save-tab", collectionId: featureStore.data.collections[0]?.id });
          } else if (suggestion.action === "copy-link") {
            clipboard.writeText(activeTab().url);
          } else if (suggestion.action === "mute" || suggestion.action === "unmute") {
            activeTab().view.webContents.setAudioMuted(suggestion.action === "mute");
          } else if (suggestion.action === "reset-zoom" || suggestion.action === "zoom-in") {
            const contents = activeTab().view.webContents;
            contents.setZoomFactor(suggestion.action === "reset-zoom" ? 1 : Math.min(3, contents.getZoomFactor() + .25));
          } else if (suggestion.action === "switch-duplicate") {
            const id = suggestionMeta().duplicateId;
            if (id) activateTab(id);
          } else if (suggestion.action === "ephemeral") {
            createTab(activeTab().url, true, { ephemeral: true });
          } else {
            throw new Error("Acción contextual no disponible.");
          }
        }
        if (dismissedSuggestions.size >= 500) dismissedSuggestions.delete(dismissedSuggestions.values().next().value);
        dismissedSuggestions.add(suggestion.id);
        suggestionCooldown = { key: contextKey(), until: Date.now() + 60000 };
        const messages = {
          bookmark: "Marcador guardado.", collect: "Enlace guardado en tu colección.",
          focus: "Enfoque de YouTube activado.", "copy-link": "Enlace copiado.",
          mute: "Pestaña silenciada.", unmute: "Sonido restaurado.", "reset-zoom": "Zoom restablecido.",
          "zoom-in": "PDF ampliado.", "switch-duplicate": "Ya estás en la otra pestaña.",
          ephemeral: "Pestaña fugaz abierta. El sitio sigue recibiendo las visitas que hagas.",
        };
        companionFeedback = { key: contextKey(), until: Date.now() + 15000,
          text: action.type === "dismiss" ? "De acuerdo. Te dejo continuar." : messages[suggestion.action] };
        sendState();
        return true;
      }
      const companion = { ...featureStore.data.home.companion };
      if (action === "home") companion.floating = false;
      if (action === "hide") { companion.enabled = false; companion.floating = false; }
      if (action === "pause") companion.followCursor = !companion.followCursor;
      await featureAction({ type: "home:update", patch: { companion } });
      return true;
    },
  });
  if (process.platform === "darwin") windowRef.setWindowButtonVisibility(!appearance.autoHideTitlebar || titlebarRevealed);
  windowRef.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  windowRef.webContents.on("will-navigate", (event) => event.preventDefault());
  windowRef.webContents.on("will-attach-webview", (event) => event.preventDefault());
  windowRef.loadFile(path.join(__dirname, "index.html"));
  windowRef.on("resize", () => { setActiveViewBounds(); sendState(); });
  windowRef.on("closed", () => {
    companionOverlay?.dispose();
    companionOverlay = null;
    for (const tab of tabs) {
      if (!tab.view.webContents.isDestroyed()) {
        permissions.forget(tab.view.webContents.id);
        tabProtection(tab).forget(tab.view.webContents.id);
        tab.view.webContents.close();
      }
    }
    tabs = [];
    activeTabId = null;
    panelOpen = false;
    addressPopupHeight = 0;
    windowRef = null;
  });
  windowRef.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && handleShortcut(input)) event.preventDefault();
  });
  createTab();
}

function addIpcHandlers() {
  function handle(channel, listener) {
    ipcMain.handle(channel, (event, ...args) => {
      if (!windowRef || event.sender !== windowRef.webContents ||
          event.senderFrame !== windowRef.webContents.mainFrame) {
        throw new Error("Origen no autorizado para los controles del navegador");
      }
      if (!legalSnapshot(legalRecord).accepted &&
          !["browser:get-state", "browser:ui-ready", "browser:accept-legal", "browser:quit",
            "browser:cancel-search-suggestions"].includes(channel)) {
        throw new Error("Revisa y acepta los documentos de primer inicio antes de utilizar Slate.");
      }
      return listener(event, ...args);
    });
  }
  handle("browser:get-state", () => snapshot());
  handle("browser:quit", () => { app.quit(); return true; });
  handle("browser:app-update", (_event, action) => appUpdates.action(action));
  handle("browser:accept-legal", (_event, input) => {
    if (!legalSnapshot(legalRecord).accepted) {
      legalRecord = acceptLegal(input, record => writeJson("legal-acceptance.json", record));
      for (const context of contexts.values()) void context.protection.start();
      scheduleAppUpdates();
    }
    sendState();
    return legalSnapshot(legalRecord);
  });
  handle("browser:set-browser-preferences", async (_event, patch) => {
    const next = updatePreferences(browserPreferences, patch);
    if (!writeJson("browser-preferences.json", next)) throw new Error("No se pudo guardar la configuración.");
    const previous = browserPreferences;
    browserPreferences = next;
    if (previous.automaticUpdates !== next.automaticUpdates) scheduleAppUpdates();
    if (!next.onlineSuggestions) searchSuggestions.cancel();
    for (const tab of tabs) {
      const contents = tab.view.webContents;
      if (contents.isDestroyed()) continue;
      if (previous.defaultZoom !== next.defaultZoom) contents.setZoomFactor(next.defaultZoom / 100);
      if (previous.pipButton !== next.pipButton) void syncVideoButtons(contents, next.pipButton);
    }
    sendState();
    return browserPreferences;
  });
  handle("browser:run-command", (_event, id) => executeBrowserCommand(id));
  handle("browser:set-protected-video", (_event, enabled) => protectedVideo.setEnabled(enabled));
  handle("browser:check-protected-video", async () => {
    const contents = activeTab()?.view.webContents;
    if (!contents || !isWebUrl(contents.getURL())) throw new Error("Abre primero una página HTTPS para comprobar el vídeo protegido.");
    return contents.executeJavaScript(`(${probeProtectedVideo.toString()})()`);
  });
  handle("browser:download-action", (_event, id, action) => downloads.action(featureStore.data.workspaceId, id, action));
  handle("browser:ui-ready", () => { windowRef.show(); return true; });
  handle("browser:feature-action", (_event, action) => {
    if (action?.type === "settings:update" && action.patch?.searchEngine) searchSuggestions.cancel();
    return featureAction(action);
  });
  handle("browser:new-tab", () => createTab());
  handle("browser:show-tabs-menu", () => {
    const entries = tabMenuEntries(tabs, activeTabId, featureStore.data.workspaceId, {
      isCurrent: (id, workspaceId) => featureStore.data.workspaceId === workspaceId &&
        tabs.some(tab => tab.id === id && tab.workspaceId === workspaceId),
      activate: activateTab,
    });
    if (!entries.length) return false;
    return new Promise(resolve => Menu.buildFromTemplate(entries).popup({
      window: windowRef, callback: () => resolve(true),
    }));
  });
  handle("browser:activate-tab", (_event, id) => activateTab(Number(id)));
  handle("browser:close-tab", (_event, id) => closeTab(Number(id)));
  handle("browser:navigate", (_event, value) => navigateTab(activeTab(), value));
  handle("browser:search", (_event, value) => {
    if (typeof value !== "string" || !value.trim() || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error("Búsqueda no válida.");
    }
    return navigateTab(activeTab(), searchUrl(value, featureStore.data.settings.searchEngine));
  });
  handle("browser:cancel-search-suggestions", () => searchSuggestions.cancel());
  handle("browser:search-suggestions", async (_event, input) => {
    if (!input || input.tabId !== activeTabId) return { status: "cancelled", items: [] };
    const scope = () => JSON.stringify([activeTabId, featureStore.data.workspaceId,
      featureStore.data.settings.searchEngine, browserPreferences.onlineSuggestions, activeTab()?.ephemeral]);
    const originalScope = scope();
    const result = await searchSuggestions.get({
      query: input.query, engine: featureStore.data.settings.searchEngine,
      enabled: browserPreferences.onlineSuggestions, ephemeral: activeTab()?.ephemeral !== false,
    });
    return scope() === originalScope ? result : { status: "cancelled", items: [] };
  });
  handle("browser:back", () => {
    const contents = activeTab()?.view.webContents;
    if (contents?.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
  });
  handle("browser:forward", () => {
    const contents = activeTab()?.view.webContents;
    if (contents?.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
  });
  handle("browser:reload", () => activeTab()?.view.webContents.reload());
  handle("browser:stop", () => activeTab()?.view.webContents.stop());
  handle("browser:set-panel-open", (_event, open) => {
    panelOpen = open === true;
    setActiveViewBounds();
    sendState();
  });
  handle("browser:set-address-popup-height", (_event, height) => {
    if (!Number.isFinite(height) || height < 0 || height > 1000) throw new Error("Altura de sugerencias no válida.");
    addressPopupHeight = Math.min(440, height);
    setActiveViewBounds();
  });
  handle("browser:set-titlebar-revealed", (_event, revealed) => {
    if (typeof revealed !== "boolean") throw new Error("Estado de barra no válido.");
    titlebarRevealed = appearance.autoHideTitlebar && revealed;
    if (process.platform === "darwin" && windowRef && !windowRef.isDestroyed()) {
      windowRef.setWindowButtonVisibility(!appearance.autoHideTitlebar || titlebarRevealed);
    }
    setActiveViewBounds();
    sendState();
    return titlebarRevealed;
  });
  handle("browser:set-appearance", (_event, patch) => {
    const next = updateAppearance(appearance, patch);
    if (patch.backdrop === "video" && !getBackgroundVideoUrl()) {
      throw new Error("Elige un vídeo local antes de activar ese fondo.");
    }
    if (!writeJson("appearance.json", next)) throw new Error("No se pudo guardar la apariencia");
    if (next.autoHideTitlebar !== appearance.autoHideTitlebar) titlebarRevealed = false;
    appearance = next;
    updateNativeAppearance();
    setActiveViewBounds();
    sendState();
    return appearance;
  });
  handle("browser:toggle-page-theme-site", async () => {
    const tab = activeTab();
    const host = pageHost(tab?.url);
    if (!host) throw new Error("Abre una página web para cambiar su tema.");
    const plan = themePlan(tab, appearance, nativeTheme.shouldUseDarkColors, pageThemeExceptions);
    if (appearance.pageTheme === "original") throw new Error("Activa primero Seguir a Slate en el tema de las páginas.");
    if (tab.ephemeral) {
      tab.pageThemeOverride = !plan.enabled;
      await applyPageTheme(tab);
    } else {
      const next = new Set(pageThemeExceptions);
      if (plan.enabled) next.add(host); else next.delete(host);
      if (next.size > 500) throw new Error("Ya hay 500 excepciones de tema. Restablece las excepciones antes de añadir más.");
      if (!writeJson("page-theme.json", [...next])) throw new Error("No se pudo guardar el tema de este sitio.");
      pageThemeExceptions = next;
      await Promise.all(tabs.filter(entry => !entry.ephemeral && pageHost(entry.url) === host).map(applyPageTheme));
    }
    sendState();
    return true;
  });
  handle("browser:reset-page-theme-sites", async () => {
    if (!writeJson("page-theme.json", [])) throw new Error("No se pudieron restablecer las excepciones.");
    pageThemeExceptions = new Set();
    await Promise.all(tabs.map(applyPageTheme));
    sendState();
    return true;
  });
  handle("browser:reset-appearance", () => {
    if (!writeJson("appearance.json", DEFAULT_APPEARANCE)) throw new Error("No se pudo restablecer la apariencia");
    appearance = { ...DEFAULT_APPEARANCE };
    titlebarRevealed = false;
    updateNativeAppearance();
    setActiveViewBounds();
    sendState();
    return appearance;
  });
  handle("browser:update-filters", () => protection.refresh());
  handle("browser:toggle-site-protection", () => {
    const shield = tabProtection(activeTab());
    const { site } = snapshot().privacy;
    if (!site) return;
    if (shield.exceptions.has(site)) shield.exceptions.delete(site);
    else shield.exceptions.add(site);
    if (!activeTab()?.ephemeral) writeJson("privacy.json", shield.preferences());
    sendState();
    activeTab()?.view.webContents.reload();
  });
  handle("browser:remember-history", (_event, enabled) => {
    for (const context of contexts.values()) context.protection.rememberHistory = enabled === true;
    writeJson("privacy.json", protection.preferences());
    sendState();
  });
  handle("browser:clear-site-data", async () => {
    const result = await dialog.showMessageBox(windowRef, {
      type: "warning",
      title: "Borrar datos de navegación",
      message: "Se cerrarán todas las pestañas y tus sesiones en los sitios.",
      detail: "Se borrarán cookies, almacenamiento de sitios, caché e historial. Los marcadores y los filtros se conservarán.",
      buttons: ["Cancelar", "Borrar datos"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (result.response !== 1) return false;
    const ids = tabs.map((tab) => tab.id);
    createTab();
    for (const id of ids) closeTab(id);
    recentlyClosed = [];
    await clearBrowsingData();
    sendState();
    return true;
  });
  handle("browser:home", () => {
    const tab = activeTab();
    if (tab) {
      exitVideoFullscreen(tab);
      tab.url = "";
      clearFavicon(tab);
      tab.title = "Nueva pestaña";
      tab.loading = false;
      tab.view.webContents.stop();
      sendState();
      if (windowRef) windowRef.contentView.removeChildView(tab.view);
    }
  });
  handle("browser:add-bookmark", () => {
    const tab = activeTab();
    if (!tab || !isWebUrl(tab.url)) return;
    if (bookmarks.some((entry) => entry.url === tab.url)) return;
    bookmarks = [{ title: tab.title, url: tab.url }, ...bookmarks].slice(0, 100);
    persistLibrary("bookmarks", bookmarks);
    setActiveViewBounds();
    sendState();
  });
  handle("browser:remove-bookmark", (_event, url) => {
    bookmarks = bookmarks.filter((entry) => entry.url !== url);
    persistLibrary("bookmarks", bookmarks);
    setActiveViewBounds();
    sendState();
  });
  handle("browser:open-url", (_event, url) => {
    if (isWebUrl(url)) createTab(url, true);
  });
  handle("browser:restore-closed", () => restoreRecentlyClosed());
  handle("browser:choose-background-video", () => chooseBackgroundVideo());
  handle("browser:select-background-video", (_event, fileName) => selectBackgroundVideo(fileName));
  handle("browser:clear-background-video", () => clearBackgroundVideo());
  handle("browser:clear-history", () => {
    history = [];
    persistLibrary("history", history);
    sendState();
  });
}

app.whenReady().then(() => {
  legalRecord = readJson("legal-acceptance.json", {});
  browserPreferences = normalizePreferences(readJson("browser-preferences.json", {}));
  appUpdates = new AppUpdates({
    version: app.getVersion(),
    supported: app.isPackaged && process.platform === "darwin",
    factory: () => {
      const { MacUpdater } = require("electron-updater");
      return new MacUpdater();
    },
    changed: () => { if (featureStore && protection && windowRef) sendState(); },
    prepareInstall: prepareUpdateInstall,
  });
  protectedVideo = new ProtectedVideo({
    components: require("electron").components,
    enabled: readJson("protected-video.json", {}).enabled === true,
    persist: value => { if (!writeJson("protected-video.json", value)) throw new Error("No se pudo guardar la preferencia de vídeo protegido."); },
    changed: () => { if (featureStore && protection && windowRef) sendState(); },
  });
  protectedVideo.start();
  featureStore = new FeatureStore(app.getPath("userData"));
  downloads = new Downloads({ directory: app.getPath("downloads"), shell,
    changed: (message) => { sendState(); if (message && windowRef && !windowRef.isDestroyed()) windowRef.webContents.send("browser:notice", message); },
    started: (event) => { if (windowRef && !windowRef.isDestroyed()) windowRef.webContents.send("browser:download-started", event); },
  });
  permissions = new ExpiringPermissions((pending) => {
    sendState();
    if (pending) windowRef?.webContents.send("browser:notice", "Un sitio solicita un permiso. Abre Configuración → Permisos para decidir (caduca en 60 s).");
  }, (contents, details, origin) =>
    allowFullscreen(contents, "fullscreen", activeTab()?.view.webContents,
      details.requestingUrl || origin, details.isMainFrame),
    (contents, origin, details) => allowProtectedMedia(contents, origin, details, protectedVideo.enabled));
  appearance = normalizeAppearance(readJson("appearance.json", DEFAULT_APPEARANCE));
  nativeTheme.themeSource = appearance.theme === "sistema" ? "system" : appearance.theme === "oscuro" ? "dark" : "light";
  pageThemeExceptions = normalizeThemeExceptions(readJson("page-theme.json", []));
  pageTheme = new PageTheme(sendState);
  const savedVideo = readJson("background-video.json", null)?.fileName;
  const savedVideoPath = getBackgroundVideoPath(savedVideo);
  backgroundVideoFile = savedVideoPath && fs.existsSync(savedVideoPath) ? savedVideo : null;
  const savedVideos = readJson("background-videos.json", []);
  backgroundVideos = require("./background-library.cjs").normalizeLibrary(savedVideos, getDataFile("backgrounds"), backgroundVideoFile);
  if (JSON.stringify(savedVideos) !== JSON.stringify(backgroundVideos) && !writeJson("background-videos.json", backgroundVideos)) {
    throw new Error("No se pudo conservar la biblioteca de fondos.");
  }
  if (appearance.backdrop === "video" && !backgroundVideoFile) {
    appearance = updateAppearance(appearance, { backdrop: "papel" });
    writeJson("appearance.json", appearance);
  }
  if (process.platform === "darwin") app.dock?.setIcon(path.join(__dirname, "assets/icon.png"));
  // Keep existing site sessions, but remove Electron/app version tokens from
  // the web user agent. This is not advanced fingerprint randomization.
  const productToken = [app.name, previousAppName].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  session.defaultSession.setUserAgent(
    app.userAgentFallback
      .replace(/\sElectron\/[^\s]+/g, "")
      .replace(new RegExp(`\\s(?:${productToken})/[\\d.]+`, "g"), ""),
  );
  protection = new Protection(
    session.defaultSession, app.getPath("userData"), sendState, readJson("privacy.json", {}),
  );
  const personal = createContext("personal");
  const context = featureStore.data.workspaceId === "personal" ? personal : createContext(featureStore.data.workspaceId);
  protection = context.protection;
  bookmarks = context.bookmarks;
  history = context.history;
  addIpcHandlers();
  createWindow();
  scheduleAppUpdates();
  if (legalSnapshot(legalRecord).accepted) void personal.protection.start();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  nativeTheme.on("updated", updateNativeAppearance);
  systemPreferences.on("accent-color-changed", updateNativeAppearance);
  const refreshSystemColors = setInterval(() => {
    if (appearance.theme === "sistema" || appearance.contrast === "sistema" || appearance.accent === "sistema") {
      const key = JSON.stringify([nativeTheme.shouldUseDarkColors, nativeTheme.shouldUseHighContrastColors, getSystemAccentColor()]);
      if (key !== lastSystemStyle) { lastSystemStyle = key; updateNativeAppearance(); }
    }
  }, 4000);
  refreshSystemColors.unref();
}).catch((error) => {
  console.error("No se pudo abrir Slate Privacy:", error.message);
  dialog.showErrorBox("No se pudo abrir Slate Privacy", error.message);
  app.quit();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", (event) => {
  appUpdates?.stop();
  searchSuggestions.cancel();
  // Cancel pending list downloads as well as update timers at shutdown.
  for (const context of contexts.values()) context.protection.dispose();
  for (const tab of tabs) if (tab.ephemeral) tab.protection.dispose();
  if (!featureStore?.data.settings.clearOnExit || quittingAfterCleanup === true) return;
  event.preventDefault();
  if (quittingAfterCleanup === false) {
    quittingAfterCleanup = "cleaning";
    // Stop page activity before removing storage so pages cannot recreate it.
    for (const tab of tabs) if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    void clearBrowsingData().then(() => {
      quittingAfterCleanup = true;
      app.quit();
    }).catch((error) => {
      quittingAfterCleanup = false;
      lastTabQuitPending = false;
      console.error("No se completó la limpieza al salir:", error.message);
      dialog.showErrorBox("No se pudo completar la limpieza", "Slate sigue abierto. Reintenta borrar los datos antes de salir.");
    });
  }
});
