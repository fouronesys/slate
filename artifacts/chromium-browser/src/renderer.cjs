const bridge = window.brujula;
const tabsList = document.getElementById("tabs-list");
const address = document.getElementById("address");
const homeScreen = document.getElementById("home-screen");
const sidePanel = document.getElementById("side-panel");
const panelItems = document.getElementById("panel-items");
const toast = document.getElementById("toast");
let state = { tabs: [], bookmarks: [], history: [], activeTabId: null };
let panelMode = "bookmarks";
let toastTimer;
let renderedTabId = null;
let lastTabsKey = "";
let lastBookmarksKey = "";
let panelTrigger = null;

function activeTab() {
  return state.tabs.find((tab) => tab.id === state.activeTabId);
}

function makeIconButton(label, pathData, className = "") {
  const button = document.createElement("button");
  button.className = `tab-close ${className}`;
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  svg.append(path);
  button.append(svg);
  return button;
}

function renderTabs() {
  const key = JSON.stringify([state.tabs, state.activeTabId]);
  if (key === lastTabsKey) return;
  lastTabsKey = key;
  tabsList.replaceChildren();
  for (const tab of state.tabs) {
    const item = document.createElement("div");
    item.className = `tab ${tab.id === state.activeTabId ? "active" : ""}`;
    item.dataset.tabId = String(tab.id);
    item.setAttribute("role", "tab");
    item.setAttribute("aria-selected", String(tab.id === state.activeTabId));
    item.tabIndex = 0;
    item.title = `${tab.ephemeral ? "Fugaz · " : ""}${tab.title || "Nueva pestaña"}${tab.url ? `\n${tab.url}` : ""}`;

    const favicon = document.createElement("span");
    favicon.className = `tab-favicon ${tab.loading ? "loading" : ""}`;
    if (!tab.loading) {
      const mark = document.createElement("img");
      mark.alt = "";
      mark.draggable = false;
      if (tab.url && tab.favicon) {
        favicon.classList.add("site-favicon");
        mark.src = tab.favicon;
        mark.addEventListener("error", () => {
          favicon.classList.remove("site-favicon");
          favicon.classList.add("generic-favicon");
          favicon.textContent = "◎";
        }, { once: true });
      } else if (tab.url) {
        favicon.classList.add("generic-favicon");
        favicon.textContent = "◎";
      } else {
        mark.src = "./assets/slate.svg";
      }
      if (!tab.url || tab.favicon) favicon.append(mark);
    }
    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title || "Nueva pestaña";
    if (tab.ephemeral) title.textContent = `Fugaz · ${title.textContent}`;
    const close = makeIconButton("Cerrar pestaña", "M6 6l8 8M14 6l-8 8");

    item.addEventListener("click", (event) => {
      if (event.target.closest(".tab-close")) return;
      bridge.activateTab(tab.id);
    });
    item.addEventListener("keydown", (event) => {
      if (event.target !== item) return;
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); bridge.activateTab(tab.id); }
      const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
      if (direction) {
        event.preventDefault();
        const index = state.tabs.findIndex((entry) => entry.id === tab.id);
        const next = state.tabs[(index + direction + state.tabs.length) % state.tabs.length];
        bridge.activateTab(next.id).then(() => tabsList.querySelector('[aria-selected="true"]')?.focus());
      }
    });
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      bridge.closeTab(tab.id);
    });

    item.append(favicon, title, close);
    tabsList.append(item);
  }
}

function renderToolbar() {
  const tab = activeTab();
  const workspace = state.features?.workspaces?.find(entry => entry.id === state.features.workspaceId);
  const windowTitle = document.querySelector(".window-title");
  const workspaceTitle = `Espacio ${workspace?.name || "Personal"}`;
  if (windowTitle.textContent !== workspaceTitle) windowTitle.textContent = workspaceTitle;
  const hasPage = Boolean(tab && tab.url);
  if (document.activeElement !== address) address.value = hasPage ? tab.url : "";
  document.getElementById("back").disabled = !tab?.canGoBack;
  document.getElementById("forward").disabled = !tab?.canGoForward;
  document.getElementById("bookmark").classList.toggle(
    "saved",
    Boolean(tab && state.bookmarks.some((item) => item.url === tab.url)),
  );
  document.getElementById("secure-indicator").classList.toggle("visible", hasPage);
  homeScreen.classList.toggle("is-hidden", hasPage);
  syncBackgroundVideo(state, !hasPage);
  if (!hasPage && renderedTabId !== state.activeTabId) {
    document.getElementById("home-query").value = "";
  }
  renderedTabId = state.activeTabId;
  const privacy = state.privacy;
  const ready = privacy?.status === "ready";
  const enabled = privacy?.siteEnabled !== false;
  const shield = document.getElementById("privacy-toggle");
  shield.classList.toggle("unprotected", !ready || !enabled);
  document.getElementById("shield-count").textContent = ready ? String(privacy.blocked) : "!";
  document.getElementById("home-protection-status").textContent = ready
    ? "Bloqueo de anuncios y rastreadores activo"
    : privacy?.status === "error" ? "Protección no disponible · abre el escudo" : "Descargando filtros de protección…";
  renderSearchEngine(state.features?.settings?.searchEngine || "google");
  const secure = document.getElementById("secure-indicator");
  secure.classList.toggle("visible", Boolean(tab?.url.startsWith("https://")));
}

function renderPanel() {
  if (window.SlateSettings) {
    const section = ({
      bookmarks: "bookmarks",
      history: "history",
      downloads: "downloads",
      privacy: "privacy",
      appearance: "appearance",
      features: "collections",
    })[panelMode] || panelMode || "general";
    window.SlateSettings.render(state);
    window.SlateSettings.select(section);
    return;
  }
  document.getElementById("experience-settings")?.setAttribute("hidden", "");
  if (panelMode === "features") {
    window.SlateFeatures?.renderPanel();
    return;
  }
  const isPrivacy = panelMode === "privacy";
  const isAppearance = panelMode === "appearance";
  const title = isAppearance ? "Personalizar" : isPrivacy ? "Protección" : panelMode === "bookmarks" ? "Marcadores" : "Historial reciente";
  document.getElementById("panel-title").textContent = title;
  document.getElementById("panel-kicker").textContent =
    isAppearance ? "TU ESPACIO" : isPrivacy ? "SLATE PRIVACY · PROTECCIÓN" : panelMode === "bookmarks" ? "TUS SITIOS GUARDADOS" : "ACTIVIDAD LOCAL";
  document.getElementById("clear-history").hidden = panelMode !== "history";
  document.getElementById("privacy-settings").hidden = !isPrivacy;
  document.getElementById("appearance-settings").hidden = !isAppearance;
  panelItems.hidden = isPrivacy || isAppearance;
  document.getElementById("customize-toggle").setAttribute("aria-expanded", String(isAppearance && !sidePanel.hidden));
  if (panelMode === "downloads") {
    document.getElementById("panel-title").textContent = "Descargas";
    document.getElementById("panel-kicker").textContent = "ARCHIVOS · ESTA SESIÓN";
    window.SlateDownloads.renderPanel(panelItems, state.downloads);
    return;
  }
  panelItems.replaceChildren();
  if (isAppearance) return;
  if (isPrivacy) return renderPrivacy();
  const entries = panelMode === "bookmarks" ? state.bookmarks : state.history;

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "panel-empty";
    empty.textContent =
      panelMode === "bookmarks"
        ? "Tus páginas guardadas aparecerán aquí."
        : state.privacy?.rememberHistory ? "Las páginas que visites aparecerán aquí." : "El guardado de historial está desactivado. Puedes activarlo desde Protección.";
    panelItems.append(empty);
    return;
  }

  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "panel-row";
    const open = document.createElement("button");
    open.className = "panel-link";
    open.type = "button";
    const name = document.createElement("span");
    name.className = "panel-link-title";
    name.textContent = entry.title || entry.url;
    const url = document.createElement("span");
    url.className = "panel-link-url";
    url.textContent = entry.url;
    open.append(name, url);
    open.addEventListener("click", () => bridge.openUrl(entry.url));
    row.append(open);

    if (panelMode === "bookmarks") {
      const remove = makeIconButton("Quitar marcador", "M6 6l8 8M14 6l-8 8", "remove-bookmark");
      remove.addEventListener("click", () => bridge.removeBookmark(entry.url));
      row.append(remove);
    }
    panelItems.append(row);
  }
}

window.renderPanelItems = (mode) => {
  panelMode = mode;
  const entries = mode === "bookmarks" ? state.bookmarks : state.history;
  const key = JSON.stringify([mode, entries]);
  if (window.renderPanelItems.key === key && panelItems.dataset.libraryMode === mode) return;
  window.renderPanelItems.key = key;
  panelItems.dataset.libraryMode = mode;
  panelItems.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "panel-empty";
    empty.textContent = mode === "bookmarks"
      ? "Tus páginas guardadas aparecerán aquí."
      : state.privacy?.rememberHistory ? "Las páginas que visites aparecerán aquí." : "El guardado de historial está desactivado. Puedes activarlo desde Protección.";
    panelItems.append(empty);
    return;
  }
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "panel-row";
    const open = document.createElement("button");
    open.className = "panel-link";
    open.type = "button";
    const name = document.createElement("span");
    name.className = "panel-link-title";
    name.textContent = entry.title || entry.url;
    const url = document.createElement("span");
    url.className = "panel-link-url";
    url.textContent = entry.url;
    open.append(name, url);
    open.addEventListener("click", () => bridge.openUrl(entry.url));
    row.append(open);
    if (mode === "bookmarks") {
      const remove = makeIconButton("Quitar marcador", "M6 6l8 8M14 6l-8 8", "remove-bookmark");
      remove.addEventListener("click", () => bridge.removeBookmark(entry.url));
      row.append(remove);
    }
    panelItems.append(row);
  }
};

function renderPrivacy() {
  const privacy = state.privacy;
  if (!privacy) return;
  const video = state.protectedVideo || {};
  document.getElementById("protected-video-status").textContent = ({
    unsupported: "Este motor no incluye Widevine.",
    consent: "Pendiente de tu permiso para instalar el componente.",
    installing: "Preparando el componente local… La navegación sigue disponible.",
    restart: "Permiso guardado. Cierra y vuelve a abrir Slate para preparar el componente local.",
    installed: `Componente instalado${video.version ? ` · ${video.version}` : ""}. Si el motor no lo reconoce, cierra y vuelve a abrir Slate.`,
    offline: "Instalación y actualizaciones desactivadas.",
    error: "No se pudo preparar el componente. Comprueba la conexión y reintenta; puede ser necesario reiniciar Slate.",
  })[video.status] || "Comprobando componente…";
  const videoToggle = document.getElementById("protected-video-enabled");
  if (document.activeElement !== videoToggle) videoToggle.checked = video.enabled === true;
  videoToggle.disabled = !video.supported;
  document.getElementById("protected-video-retry").disabled = !video.supported || !video.enabled || ["installing", "restart"].includes(video.status);
  const ready = privacy.status === "ready";
  document.getElementById("protection-status").textContent = privacy.updating
    ? "Actualizando listas de protección…"
    : !ready ? "Sin filtros activos · navegación bloqueada"
      : !privacy.siteEnabled ? `Bloqueo de anuncios pausado en ${privacy.site}`
        : privacy.stale ? "Protección activa · filtros pendientes de actualizar" : "Anuncios y rastreadores: protección activa";
  document.getElementById("blocked-count").textContent = privacy.blocked;
  document.getElementById("cookies-count").textContent = privacy.cookieHeaders;
  document.getElementById("cleaned-count").textContent = privacy.cleanedLinks;
  for (const key of ["cookies", "storage", "canvas", "audio", "webgl", "fonts"]) {
    document.getElementById(`coverage-${key}`).textContent = privacy.nativeCoverage?.[key] || "Estado no disponible";
  }
  const error = document.getElementById("filter-error");
  error.hidden = !privacy.lastError && !privacy.scriptWarning;
  error.textContent = [privacy.lastError, privacy.scriptWarning].filter(Boolean).join(" ");
  const toggle = document.getElementById("site-protection-toggle");
  toggle.disabled = !ready || !privacy.site;
  toggle.textContent = !privacy.site ? "Abre un sitio para gestionar su escudo"
    : `${privacy.siteEnabled ? "Pausar" : "Activar"} bloqueo en ${privacy.site}`;
  const rememberHistory = document.getElementById("remember-history");
  if (document.activeElement !== rememberHistory) rememberHistory.checked = privacy.rememberHistory;
  document.getElementById("filters-updated").textContent = privacy.lastUpdated
    ? `Última descarga: ${new Date(privacy.lastUpdated).toLocaleString("es")}`
    : "Aún no se han descargado filtros.";
  document.getElementById("update-filters").disabled = privacy.updating;
}
window.renderPrivacy = renderPrivacy;

function renderSearchEngine(engine) {
  const labels = { google: "Google", duckduckgo: "DuckDuckGo", bing: "Bing", brave: "Brave Search" };
  const display = labels[engine] || "Google";
  const node = document.getElementById("current-search-engine");
  if (node && node.textContent !== display) node.textContent = display;
}
window.renderSearchEngine = renderSearchEngine;

document.getElementById("protected-video-enabled").addEventListener("change", async event => {
  try { await bridge.setProtectedVideo(event.target.checked); }
  catch (error) { showToast(error.message); renderPrivacy(); }
});
document.getElementById("protected-video-retry").addEventListener("click", () => {
  bridge.setProtectedVideo(true).catch(error => showToast(error.message));
});
document.getElementById("protected-video-check").addEventListener("click", async () => {
  try {
    const result = await bridge.checkProtectedVideo();
    showToast(result.available ? "La pestaña reconoce Widevine; todavía no verifica la reproducción del servicio."
      : "La pestaña no reconoce Widevine. Comprueba el componente y reinicia Slate; no es un fallo de PiP.");
  } catch (error) { showToast(error.message); }
});

function syncPanelTriggers() {
  for (const [id, mode] of [["settings-toggle", null], ["privacy-toggle", "privacy"], ["downloads-toggle", "downloads"]]) {
    document.getElementById(id).setAttribute("aria-expanded", String(!sidePanel.hidden && (!mode || panelMode === mode)));
  }
}

function openPanel(mode, trigger = document.activeElement) {
  panelTrigger = trigger;
  panelMode = mode;
  sidePanel.hidden = false;
  syncPanelTriggers();
  bridge.setPanelOpen(true);
  renderPanel();
  document.getElementById("panel-close").focus();
}
window.openPanel = openPanel;
window.setPanelMode = (mode) => { panelMode = mode; syncPanelTriggers(); };

function closePanel(options = {}) {
  sidePanel.hidden = true;
  syncPanelTriggers();
  document.getElementById("customize-toggle").setAttribute("aria-expanded", "false");
  if (options.notify !== false) bridge.setPanelOpen(false);
  if (options.restoreFocus !== false) panelTrigger?.focus();
}
window.closePanel = closePanel;
document.addEventListener("pointerdown", event => {
  if (sidePanel.hidden || sidePanel.contains(event.target)) return;
  if (event.target.closest("#settings-toggle,#privacy-toggle,#customize-toggle,#bookmarks-toggle,#history-toggle,#downloads-toggle,#experiences-toggle")) return;
  closePanel({ restoreFocus: false });
}, true);
bridge.onPanelDismissed(() => closePanel({ restoreFocus: false, notify: false }));

function renderHomeBookmarks() {
  const key = JSON.stringify(state.bookmarks);
  if (key === lastBookmarksKey) return;
  lastBookmarksKey = key;
  const container = document.getElementById("home-bookmarks");
  container.replaceChildren();
  if (!state.bookmarks.length) {
    const empty = document.createElement("p");
    empty.className = "bookmark-empty";
    empty.textContent = "Un espacio para tus favoritos. Guarda una página con el icono de marcador y aparecerá aquí.";
    container.append(empty);
  }
  for (const bookmark of state.bookmarks.slice(0, 3)) {
    const button = document.createElement("button");
    button.className = "bookmark-tile";
    const glyph = document.createElement("span");
    glyph.className = "bookmark-glyph";
    glyph.textContent = "↗";
    const copy = document.createElement("span");
    copy.className = "bookmark-copy";
    const name = document.createElement("b");
    name.textContent = bookmark.title || bookmark.url;
    const url = document.createElement("small");
    url.textContent = bookmark.url;
    copy.append(name, url);
    button.append(glyph, copy);
    button.addEventListener("click", () => bridge.openUrl(bookmark.url));
    container.append(button);
  }
}

function renderBookmarksBar() {
  const key = JSON.stringify([state.appearance?.bookmarksBar, state.bookmarks]);
  if (renderBookmarksBar.key === key) return;
  renderBookmarksBar.key = key;
  const bar = document.getElementById("bookmarks-bar");
  const visible = state.appearance?.bookmarksBar && state.bookmarks.length > 0;
  bar.hidden = !visible;
  bar.replaceChildren();
  if (!visible) return;
  for (const bookmark of state.bookmarks) {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "bookmark-bar-link";
    link.textContent = bookmark.title || bookmark.url;
    link.title = bookmark.url;
    link.addEventListener("click", () => bridge.openUrl(bookmark.url));
    bar.append(link);
  }
  const manage = document.createElement("button");
  manage.type = "button";
  manage.className = "bookmark-bar-manage";
  manage.textContent = "Todos";
  manage.setAttribute("aria-label", "Ver todos los marcadores");
  manage.addEventListener("click", () => openPanel("bookmarks"));
  bar.append(manage);
}

function render(nextState) {
  state = { ...state, ...nextState, features: { ...state?.features, ...nextState.features } };
  window.SlateSettings?.render(state);
  if (!state.features?.home) return;
  renderAppearance(state);
  renderTabs();
  window.SlateTabsUI.update(state);
  renderToolbar();
  window.SlateAddressUI.update(state);
  renderHomeBookmarks();
  renderBookmarksBar();
  window.SlateFeatures?.render(state);
  window.SlateDownloads?.render(state);
  if (!sidePanel.hidden) renderPanel();
  if (!document.documentElement.hasAttribute("data-ui-ready")) {
    document.documentElement.dataset.uiReady = "true";
    bridge.uiReady().catch(error => console.error("No se pudo mostrar la ventana:", error));
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function submitAddress(value) {
  const cleaned = value.trim();
  if (!cleaned) return;
  window.SlateAddressUI.close();
  bridge.navigate(cleaned);
  address.blur();
}

document.getElementById("address-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submitAddress(address.value);
});
document.getElementById("home-search").addEventListener("submit", (event) => {
  event.preventDefault();
  submitAddress(document.getElementById("home-query").value);
});
document.getElementById("new-tab").addEventListener("click", () => bridge.newTab());
document.getElementById("back").addEventListener("click", () => bridge.back());
document.getElementById("forward").addEventListener("click", () => bridge.forward());
document.getElementById("reload").addEventListener("click", () => bridge.reload());
document.getElementById("home").addEventListener("click", () => bridge.home());
document.getElementById("bookmark").addEventListener("click", () => bridge.addBookmark());
document.getElementById("restore-button").addEventListener("click", () => bridge.restoreClosed());
document.getElementById("bookmarks-toggle").addEventListener("click", () => {
  openPanel("bookmarks");
});
document.getElementById("history-toggle").addEventListener("click", () => {
  openPanel("history");
});
for (const [id, mode] of [["privacy-toggle", "privacy"], ["downloads-toggle", "downloads"]]) {
  document.getElementById(id).addEventListener("click", event => {
    if (!sidePanel.hidden && panelMode === mode) closePanel();
    else openPanel(mode, event.currentTarget);
  });
}
document.getElementById("customize-toggle").addEventListener("click", () => {
  if (!sidePanel.hidden && panelMode === "appearance") closePanel();
  else openPanel("appearance");
});
document.getElementById("home-library").addEventListener("click", () => openPanel("bookmarks"));
document.getElementById("panel-close").addEventListener("click", closePanel);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !sidePanel.hidden) closePanel();
});
document.getElementById("site-protection-toggle").addEventListener("click", () => bridge.toggleSiteProtection());
document.getElementById("remember-history").addEventListener("change", (event) => {
  bridge.rememberHistory(event.target.checked);
});
document.getElementById("update-filters").addEventListener("click", async () => {
  const ready = await bridge.updateFilters();
  showToast(ready ? "Protección activa; consulta el estado de la descarga." : "No se pudieron descargar los filtros.");
});
document.getElementById("clear-site-data").addEventListener("click", async () => {
  try {
    if (await bridge.clearSiteData()) showToast("Datos de navegación borrados");
  } catch {
    showToast("No se pudieron borrar todos los datos. Reintenta.");
  }
});
document.getElementById("clear-history").addEventListener("click", () => {
  bridge.clearHistory();
  showToast("Historial borrado");
});

document.getElementById("settings-toggle").addEventListener("click", () => {
  const isOpen = !sidePanel.hidden;
  if (isOpen) closePanel();
  else openPanel("general");
});

address.addEventListener("focus", () => address.select());
bridge.onFocusAddress(() => {
  address.focus();
  address.select();
});
bridge.onState(render);
bridge.onNotice(showToast);
bridge.getState().then(render);
