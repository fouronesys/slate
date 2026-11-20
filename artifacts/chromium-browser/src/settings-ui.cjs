(() => {
  "use strict";

  const bridge = window.brujula;
  const docs = window.SlateLegalDocuments || {};
  const panel = document.getElementById("side-panel");
  const nav = document.getElementById("settings-nav");
  const navigation = window.SlateSettingsNavigation;
  const categories = navigation.categories;
  const labels = navigation.sectionLabels;
  let active = "general";
  let latestState = {};
  let built = false;
  let indexVisible = false;
  let searchResults = [];
  let gateWasOpen = false;
  let gateSaving = false;
  let documentSelection = "terms";
  let renderedSection = "";
  const scrollOffsets = new Map();
  const lastSections = new Map();
  const byId = id => document.getElementById(id);

  function showToast(message) {
    window.showToast?.(message);
  }

  function createNavigation() {
    if (built) return;
    built = true;
    const workspace = document.createElement("div");
    workspace.id = "settings-workspace";
    workspace.className = "settings-workspace";
    const content = document.createElement("div");
    content.id = "settings-content";
    content.className = "settings-content";
    const index = document.createElement("section");
    index.id = "settings-index";
    index.className = "settings-index";
    index.setAttribute("aria-label", "Índice de categorías");
    const intro = document.createElement("div");
    intro.className = "settings-index-card";
    const introMark = document.createElement("span");
    introMark.className = "settings-index-rule";
    const introTitle = document.createElement("h3");
    introTitle.textContent = "Un mapa más corto.";
    const introCopy = document.createElement("p");
    introCopy.textContent = "Cinco categorías reúnen los 13 destinos actuales sin ocultar dónde encontrar cada uno.";
    const indexList = document.createElement("ol");
    for (const item of [
      "Categorías antes que listas largas. Cada fila nombra su contenido con ejemplos.",
      "Búsqueda local, siempre disponible. Encuentra un ajuste sin salir de esta ventana.",
      "Protección y Descargas siguen accesibles en la barra superior.",
    ]) {
      const row = document.createElement("li");
      row.textContent = item;
      indexList.append(row);
    }
    const indexNote = document.createElement("p");
    indexNote.className = "settings-index-note";
    indexNote.textContent = "La fila activa se puede distinguir por fondo, texto e icono; el chevón indica que se puede entrar.";
    intro.append(introMark, introTitle, introCopy, indexList, indexNote);
    index.append(intro);
    content.append(index);
    const search = byId("settings-search");
    panel.insertBefore(workspace, search.nextSibling);
    workspace.append(nav, content);
    for (const child of [...panel.children]) {
      if (child === workspace || child === search || child.classList.contains("panel-heading")) continue;
      content.append(child);
    }
    byId("settings-index").hidden = true;
    renderNavigation();
    byId("settings-search-input").addEventListener("input", renderSearchResults);
    byId("settings-search-input").addEventListener("keydown", onSearchKeydown);
    byId("settings-search-clear").addEventListener("click", () => clearSearch(true));
    byId("settings-search-results").addEventListener("keydown", onResultKeydown);
    for (const button of document.querySelectorAll("[data-legal-document]")) {
      button.addEventListener("click", () => showLegalDocument(button.dataset.legalDocument));
    }
    byId("default-zoom").addEventListener("change", event => saveBrowserPreferences({ defaultZoom: Number(event.target.value) }));
    byId("background-tabs").addEventListener("change", event => saveBrowserPreferences({ backgroundTabs: event.target.checked }));
    byId("pip-button-enabled").addEventListener("change", event => saveBrowserPreferences({ pipButton: event.target.checked }));
    byId("search-engine").addEventListener("change", event => saveSearchEngine(event.target.value));
    byId("online-suggestions").addEventListener("change", event => saveBrowserPreferences({ onlineSuggestions: event.target.checked }));
    byId("legal-accept").addEventListener("click", acceptLegal);
    byId("legal-decline").addEventListener("click", quit);
    for (const checkbox of document.querySelectorAll("#legal-terms-check,#legal-privacy-check,#legal-adult-check")) {
      checkbox.addEventListener("change", updateGateButton);
    }
    for (const button of document.querySelectorAll("[data-gate-document]")) {
      button.addEventListener("click", () => {
        documentSelection = button.dataset.gateDocument;
        renderDocument(byId("legal-gate-reading"), documentSelection);
        byId("legal-gate-reading").hidden = false;
        byId("legal-gate-reading").focus();
      });
    }
    document.addEventListener("keydown", event => {
      if (!gateWasOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else if (event.key === "Tab") {
        trapGateFocus(event);
      }
    }, true);
  }

  function renderNavigation() {
    if (!built) return;
    const category = navigation.categoryForSection(active);
    const view = indexVisible ? "index" : category?.id;
    if (nav.dataset.view === view) {
      for (const button of nav.querySelectorAll("[data-settings-section]")) {
        if (button.dataset.settingsSection === active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      }
      return;
    }
    nav.dataset.view = view;
    nav.replaceChildren();
    if (indexVisible) {
      for (const category of categories) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "settings-category";
        button.dataset.settingsCategory = category.id;
        if (lastSections.get(category.id) === active) {
          button.setAttribute("aria-current", "location");
        }
        const icon = document.createElement("span");
        icon.className = "settings-category-mark";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = `0${categories.indexOf(category) + 1}`;
        const copy = document.createElement("span");
        copy.className = "settings-category-copy";
        const title = document.createElement("strong");
        title.textContent = category.label;
        const detail = document.createElement("small");
        detail.textContent = category.description;
        const arrow = document.createElement("span");
        arrow.className = "settings-category-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "›";
        copy.append(title, detail);
        button.append(icon, copy, arrow);
        button.addEventListener("click", () => openCategory(category.id));
        nav.append(button);
      }
      return;
    }
    if (!category) return;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "settings-back";
    back.dataset.settingsIndex = "true";
    back.innerHTML = '<span aria-hidden="true">←</span><span>Todas las categorías</span>';
    back.addEventListener("click", () => {
      showIndex();
      nav.querySelector(`[data-settings-category="${category.id}"]`)?.focus({ preventScroll: true });
    });
    nav.append(back);
    const heading = document.createElement("p");
    heading.className = "settings-nav-label";
    heading.textContent = category.label;
    nav.append(heading);
    const items = document.createElement("div");
    items.className = "settings-nav-items";
    for (const section of category.sections) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = labels[section];
      button.dataset.settingsSection = section;
      if (section === active) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => select(section));
      items.append(button);
    }
    nav.append(items);
    const note = document.createElement("p");
    note.className = "settings-nav-note";
    note.textContent = "Al volver, conservas la ubicación y encuentras el resto de categorías.";
    nav.append(note);
  }

  function openCategory(categoryId) {
    const category = categories.find(item => item.id === categoryId);
    if (category) {
      select(lastSections.get(category.id) || category.sections[0]);
      nav.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
    }
  }

  function showIndex() {
    if (!indexVisible) {
      scrollOffsets.set(active, byId("settings-content").scrollTop);
      renderedSection = "";
      clearSearch(false);
    }
    indexVisible = true;
    renderNavigation();
    window.setPanelMode?.("settings-index");
    renderIndex();
  }

  function renderIndex() {
    indexVisible = true;
    if (!built) return;
    byId("settings-workspace").classList.add("is-index");
    byId("settings-index").hidden = false;
    byId("settings-content").classList.remove("is-section");
    for (const id of ["general-settings", "video-settings", "commands-settings", "legal-settings", "appearance-settings", "privacy-settings", "panel-items", "clear-history", "experience-settings"]) {
      const node = byId(id);
      if (node) node.hidden = true;
    }
    byId("panel-title").textContent = "Ajustes";
    byId("panel-kicker").textContent = "SLATE PRIVACY · AJUSTES";
    byId("customize-toggle").setAttribute("aria-expanded", "false");
  }

  function renderSearchResults() {
    const input = byId("settings-search-input");
    const results = byId("settings-search-results");
    const clear = byId("settings-search-clear");
    const query = input.value.trim();
    clear.hidden = !query;
    results.replaceChildren();
    searchResults = navigation.search(query);
    if (!query) {
      results.hidden = true;
      input.setAttribute("aria-expanded", "false");
      byId("settings-search-status").textContent = "";
      return;
    }
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (!searchResults.length) {
      const empty = document.createElement("p");
      empty.className = "settings-search-empty";
      empty.textContent = "No se encontraron ajustes. Prueba con otra palabra.";
      results.append(empty);
      byId("settings-search-status").textContent = "No se encontraron ajustes.";
      return;
    }
    searchResults.forEach((entry, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-search-result";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", "false");
      button.dataset.resultIndex = String(index);
      button.addEventListener("focus", () => {
        for (const option of results.querySelectorAll('[role="option"]')) {
          option.setAttribute("aria-selected", String(option === button));
        }
      });
      const title = document.createElement("strong");
      title.textContent = entry.label;
      const meta = document.createElement("small");
      meta.textContent = `${navigation.categoryForSection(entry.section).label} · ${labels[entry.section]}`;
      button.append(title, meta);
      button.addEventListener("click", () => openSearchResult(entry));
      results.append(button);
    });
    byId("settings-search-status").textContent = `${searchResults.length} ${searchResults.length === 1 ? "resultado" : "resultados"}.`;
  }

  function openSearchResult(entry) {
    select(entry.section);
    clearSearch(false);
    requestAnimationFrame(() => {
      let target;
      try { target = document.querySelector(entry.target); } catch {}
      if (!target || !target.getClientRects().length || target.matches(":disabled")) {
        target = byId("settings-content").querySelector(":scope > :not([hidden])");
      }
      if (!target) return;
      target.scrollIntoView?.({ block: "center", behavior: "auto" });
      if (!target.matches("input,select,textarea,button,[tabindex]")) target.setAttribute("tabindex", "-1");
      target.focus?.({ preventScroll: true });
    });
  }

  function clearSearch(focusInput) {
    const input = byId("settings-search-input");
    input.value = "";
    renderSearchResults();
    if (focusInput) input.focus();
  }

  function onSearchKeydown(event) {
    if (event.key === "ArrowDown" && !byId("settings-search-results").hidden) {
      const first = byId("settings-search-results").querySelector("button");
      if (first) { event.preventDefault(); first.focus(); }
    } else if (event.key === "Enter" && searchResults.length) {
      event.preventDefault();
      openSearchResult(searchResults[0]);
    } else if (event.key === "Escape" && byId("settings-search-input").value) {
      event.preventDefault();
      event.stopPropagation();
      clearSearch(false);
    }
  }

  function onResultKeydown(event) {
    const buttons = [...byId("settings-search-results").querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (event.key === "ArrowUp" && index === 0) {
        byId("settings-search-input").focus();
        return;
      }
      const next = event.key === "ArrowDown" ? Math.min(buttons.length - 1, index + 1) : Math.max(0, index - 1);
      buttons[next]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      clearSearch(false);
      byId("settings-search-input").focus();
    }
  }

  function select(section) {
    if (!labels[section]) return;
    if (!indexVisible && section !== active) scrollOffsets.set(active, byId("settings-content").scrollTop);
    active = section;
    lastSections.set(navigation.categoryForSection(section).id, section);
    indexVisible = false;
    window.setPanelMode?.(section);
    renderNavigation();
    renderSelection();
  }

  function showLegalDocument(type) {
    if (!["terms", "privacy"].includes(type)) return;
    documentSelection = type;
    renderDocument(byId("legal-document"), documentSelection);
  }

  function renderSelection() {
    const sectionChanged = renderedSection !== active;
    const content = byId("settings-content");
    if (!sectionChanged) scrollOffsets.set(active, content.scrollTop);
    const features = byId("experience-settings");
    const mode = active;
    const items = byId("panel-items");
    byId("settings-workspace").classList.remove("is-index");
    byId("settings-index").hidden = true;
    content.classList.add("is-section");
    byId("general-settings").hidden = mode !== "general";
    byId("video-settings").hidden = mode !== "videos";
    byId("commands-settings").hidden = mode !== "commands";
    byId("legal-settings").hidden = mode !== "legal";
    byId("appearance-settings").hidden = mode !== "appearance";
    byId("privacy-settings").hidden = mode !== "privacy";
    items.hidden = !["bookmarks", "history", "downloads"].includes(mode);
    byId("clear-history").hidden = mode !== "history";
    if (features) features.hidden = !["collections", "workspaces", "feature-privacy", "home"].includes(mode);

    byId("customize-toggle").setAttribute("aria-expanded", String(mode === "appearance"));
    if (["bookmarks", "history"].includes(mode)) window.renderPanelItems?.(mode);
    if (mode === "downloads") window.SlateDownloads?.renderPanel(items, latestState.downloads);
    if (["collections", "workspaces", "feature-privacy", "home"].includes(mode)) {
      const feature = { collections: "colecciones", workspaces: "espacios", "feature-privacy": "privacidad", home: "inicio" }[mode];
      window.SlateFeatures?.renderPanel(feature);
      const featureRoot = byId("experience-settings");
      if (featureRoot && featureRoot.parentElement !== content) content.append(featureRoot);
    }
    if (mode === "commands") renderCommands(latestState.commands || []);
    if (mode === "legal") renderDocument(byId("legal-document"), documentSelection);
    if (["privacy", "videos"].includes(mode)) window.renderPrivacy?.();
    syncLocation();
    content.scrollTop = scrollOffsets.get(active) || 0;
    renderedSection = active;
  }

  function syncLocation() {
    if (indexVisible) {
      byId("panel-title").textContent = "Ajustes";
      byId("panel-kicker").textContent = "SLATE PRIVACY · AJUSTES";
      return;
    }
    const category = navigation.categoryForSection(active);
    byId("panel-title").textContent = labels[active] || "Ajustes";
    byId("panel-kicker").textContent = `ESTÁS EN · ${category?.label || "AJUSTES"}`;
  }

  function setMenuState(nextState) {
    latestState = nextState || latestState;
    window.SlateUpdates?.render(latestState);
    const prefs = latestState.browserPreferences || { pipButton: true, defaultZoom: 100, backgroundTabs: false };
    const zoom = byId("default-zoom");
    if (document.activeElement !== zoom) zoom.value = String(prefs.defaultZoom ?? 100);
    const background = byId("background-tabs");
    const pip = byId("pip-button-enabled");
    const engine = byId("search-engine");
    if (document.activeElement !== background) background.checked = Boolean(prefs.backgroundTabs);
    if (document.activeElement !== pip) pip.checked = prefs.pipButton !== false;
    if (document.activeElement !== byId("online-suggestions")) byId("online-suggestions").checked = prefs.onlineSuggestions === true;
    if (document.activeElement !== engine) engine.value = latestState.features?.settings?.searchEngine || "google";
    if (!built) createNavigation();
    renderCommands(latestState.commands || []);
    if (!panel.hidden) {
      if (indexVisible) renderIndex();
      else renderSelection();
    }
    updateGate(latestState.legal);
  }

  async function saveBrowserPreferences(patch) {
    try {
      const result = await bridge.setBrowserPreferences(patch);
      if (result && result.browserPreferences) latestState = { ...latestState, ...result };
      else if (result && typeof result === "object") latestState.browserPreferences = { ...latestState.browserPreferences, ...result };
      setMenuState(latestState);
    } catch (error) {
      showToast(error?.message || "No se pudo guardar el ajuste.");
      setMenuState(latestState);
    }
  }

  async function saveSearchEngine(value) {
    const select = byId("search-engine");
    const previous = latestState.features?.settings?.searchEngine || "google";
    select.disabled = true;
    try {
      if (typeof bridge.featureAction !== "function") throw new Error("El cambio del buscador todavía no está disponible.");
      const result = await bridge.featureAction({ type: "settings:update", patch: { searchEngine: value } });
      if (result?.error) throw new Error(result.error);
      latestState = {
        ...latestState,
        features: {
          ...latestState.features,
          settings: { ...latestState.features?.settings, searchEngine: value },
        },
      };
      if (document.activeElement !== select) select.value = value;
      window.renderSearchEngine?.(value);
    } catch (error) {
      select.value = previous;
      showToast(error?.message || "No se pudo guardar el buscador.");
    } finally {
      select.disabled = false;
    }
  }

  function renderCommands(commands) {
    const container = byId("browser-commands");
    if (!container) return;
    const key = JSON.stringify(commands);
    if (container.dataset.commandsKey === key) return;
    container.dataset.commandsKey = key;
    container.replaceChildren();
    if (!Array.isArray(commands) || !commands.length) {
      const empty = document.createElement("p");
      empty.className = "settings-empty";
      empty.textContent = "No hay comandos disponibles en esta versión.";
      container.append(empty);
      return;
    }
    for (const command of commands) {
      if (!command || typeof command.id !== "string" || typeof command.label !== "string") continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "browser-command";
      const label = document.createElement("span");
      label.textContent = command.label;
      button.append(label);
      if (command.shortcut) {
        const shortcut = document.createElement("kbd");
        shortcut.textContent = command.shortcut;
        button.append(shortcut);
      }
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { await bridge.runCommand(command.id); }
        catch (error) { showToast(error?.message || "No se pudo ejecutar el comando."); }
        finally { button.disabled = false; }
      });
      container.append(button);
    }
  }

  function renderDocument(container, type) {
    if (!container) return;
    const documentKey = `${type}:${docs.version || ""}`;
    if (container.dataset.documentKey === documentKey) return;
    container.dataset.documentKey = documentKey;
    const isTerms = type === "terms";
    const sections = isTerms ? docs.terms : docs.privacy;
    const title = isTerms ? "Términos de uso" : "Aviso de privacidad";
    container.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = title;
    container.append(heading);
    const metadata = document.createElement("p");
    metadata.textContent = `Versión ${docs.version || "pendiente"} · ${docs.operator || "Four One Solutions"} · ${docs.country || "República Dominicana"}`;
    container.append(metadata);
    if (Array.isArray(sections)) {
      for (const section of sections) {
        if (!section || typeof section.title !== "string" || typeof section.text !== "string") continue;
        const subheading = document.createElement("h4");
        subheading.textContent = section.title;
        const text = document.createElement("p");
        text.textContent = section.text;
        container.append(subheading, text);
      }
    }
    if (!isTerms && docs.contact) {
      const contactHeading = document.createElement("h4");
      contactHeading.textContent = "Contacto";
      const contact = document.createElement("p");
      contact.textContent = docs.contact;
      container.append(contactHeading, contact);
    }
    if (docs.disclaimer) {
      const disclaimer = document.createElement("p");
      disclaimer.textContent = docs.disclaimer;
      container.append(disclaimer);
    }
  }

  function updateLegalNotices() {
    const text = docs.disclaimer || "DOCUMENTO BORRADOR: plantilla pendiente de revisión legal. No constituye asesoramiento legal, certificación ni garantía.";
    for (const notice of document.querySelectorAll(".legal-draft-notice")) {
      notice.textContent = `${text} Debe revisarse antes de cualquier distribución, incluida una futura versión para Mac App Store.`;
    }
    document.querySelectorAll("[data-legal-version]").forEach(node => { node.textContent = docs.version || "pendiente"; });
    document.querySelectorAll("[data-minimum-age]").forEach(node => { node.textContent = String(docs.minimumAge ?? 6); });
  }

  function updateGate(legal) {
    const requiredVersion = String(docs.version || "");
    const accepted = legal?.accepted === true && legal?.version === requiredVersion && Boolean(requiredVersion);
    const shouldShow = !accepted;
    const gate = byId("legal-gate");
    updateLegalNotices();
    if (shouldShow === gateWasOpen) return;
    gateWasOpen = shouldShow;
    gate.hidden = !shouldShow;
    for (const child of document.body.children) {
      if (child !== gate) child.inert = shouldShow;
    }
    if (shouldShow) {
      byId("legal-gate-error").hidden = true;
      byId("legal-gate-error").textContent = "";
      updateGateButton();
      requestAnimationFrame(() => byId("legal-terms-check").focus());
    } else {
      byId("settings-toggle").focus({ preventScroll: true });
    }
  }

  function updateGateButton() {
    byId("legal-accept").disabled = gateSaving || !(
      byId("legal-terms-check").checked &&
      byId("legal-privacy-check").checked &&
      byId("legal-adult-check").checked
    );
  }

  async function acceptLegal() {
    if (byId("legal-accept").disabled || gateSaving) return;
    gateSaving = true;
    updateGateButton();
    const errorNode = byId("legal-gate-error");
    errorNode.hidden = true;
    try {
      const result = await bridge.acceptLegal({
        version: String(docs.version || ""),
        terms: true,
        privacy: true,
        adult: true,
      });
      if (result?.error) throw new Error(result.error);
      const legal = result?.legal || result;
      const requiredVersion = String(docs.version || "");
      if (legal?.accepted !== true || legal?.version !== requiredVersion || !requiredVersion) {
        throw new Error("Slate no confirmó el guardado de esta versión. Reintenta.");
      }
      latestState = { ...latestState, legal };
      updateGate(legal);
    } catch (error) {
      errorNode.textContent = error?.message || "No se pudo guardar la aceptación. Reintenta.";
      errorNode.hidden = false;
    } finally {
      gateSaving = false;
      updateGateButton();
    }
  }

  async function quit() {
    try { await bridge.quit(); }
    catch (error) {
      const errorNode = byId("legal-gate-error");
      errorNode.textContent = error?.message || "No se pudo cerrar Slate.";
      errorNode.hidden = false;
    }
  }

  function trapGateFocus(event) {
    const focusable = [...byId("legal-gate").querySelectorAll("button:not(:disabled),input:not(:disabled),[tabindex='0']")]
      .filter(node => !node.hidden && node.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  updateLegalNotices();
  window.SlateSettings = {
    render: setMenuState,
    open(section = "general") {
      if (section === "settings-index" || section === "index") showIndex();
      else select(labels[section] ? section : "general");
    },
    select,
    showIndex,
    openCategory,
    syncLocation,
    search: query => navigation.search(query),
    showLegalDocument,
  };
})();
