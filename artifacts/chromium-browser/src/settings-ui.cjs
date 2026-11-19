(() => {
  "use strict";

  const bridge = window.brujula;
  const docs = window.SlateLegalDocuments || {};
  const panel = document.getElementById("side-panel");
  const nav = document.getElementById("settings-nav");
  const menuItems = [
    { group: "NAVEGADOR", items: [["general", "General"], ["videos", "Vídeos"], ["appearance", "Apariencia"], ["privacy", "Protección"]] },
    { group: "BIBLIOTECA", items: [["bookmarks", "Marcadores"], ["history", "Historial"], ["downloads", "Descargas"]] },
    { group: "TU ESPACIO", items: [["collections", "Colecciones"], ["workspaces", "Espacios"], ["feature-privacy", "Permisos del sitio"], ["home", "Inicio y widgets"]] },
    { group: "INFORMACIÓN", items: [["commands", "Comandos"], ["legal", "Documentos legales"]] },
  ];
  const labels = Object.fromEntries(menuItems.flatMap(group => group.items));
  let active = "general";
  let latestState = {};
  let built = false;
  let gateWasOpen = false;
  let gateSaving = false;
  let documentSelection = "terms";
  let renderedSection = "";
  const scrollOffsets = new Map();
  const byId = id => document.getElementById(id);

  function showToast(message) {
    window.showToast?.(message);
  }

  function createNavigation() {
    if (built) return;
    built = true;
    for (const group of menuItems) {
      const section = document.createElement("section");
      section.className = "settings-nav-group";
      const heading = document.createElement("p");
      heading.className = "settings-nav-label";
      heading.textContent = group.group;
      const items = document.createElement("div");
      items.className = "settings-nav-items";
      for (const [key, label] of group.items) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.dataset.settingsSection = key;
        button.addEventListener("click", () => select(key));
        items.append(button);
      }
      section.append(heading, items);
      nav.append(section);
    }
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

  function select(section) {
    if (!labels[section]) return;
    if (section !== active) scrollOffsets.set(active, panel.scrollTop);
    active = section;
    window.setPanelMode?.(section);
    for (const button of nav.querySelectorAll("[data-settings-section]")) {
      if (button.dataset.settingsSection === active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    renderSelection();
  }

  function showLegalDocument(type) {
    if (!["terms", "privacy"].includes(type)) return;
    documentSelection = type;
    renderDocument(byId("legal-document"), documentSelection);
  }

  function renderSelection() {
    const sectionChanged = renderedSection !== active;
    if (!sectionChanged) scrollOffsets.set(active, panel.scrollTop);
    const features = byId("experience-settings");
    const mode = active;
    const items = byId("panel-items");
    byId("general-settings").hidden = mode !== "general";
    byId("video-settings").hidden = mode !== "videos";
    byId("commands-settings").hidden = mode !== "commands";
    byId("legal-settings").hidden = mode !== "legal";
    byId("appearance-settings").hidden = mode !== "appearance";
    byId("privacy-settings").hidden = mode !== "privacy";
    items.hidden = !["bookmarks", "history", "downloads"].includes(mode);
    byId("clear-history").hidden = mode !== "history";
    if (features) features.hidden = !["collections", "workspaces", "feature-privacy", "home"].includes(mode);

    const title = labels[mode] || "Ajustes";
    byId("panel-title").textContent = title;
    byId("panel-kicker").textContent = "SLATE PRIVACY · AJUSTES";
    byId("customize-toggle").setAttribute("aria-expanded", String(mode === "appearance"));
    if (["bookmarks", "history"].includes(mode)) window.renderPanelItems?.(mode);
    if (mode === "downloads") window.SlateDownloads?.renderPanel(items, latestState.downloads);
    if (["collections", "workspaces", "feature-privacy", "home"].includes(mode)) {
      const feature = { collections: "colecciones", workspaces: "espacios", "feature-privacy": "privacidad", home: "inicio" }[mode];
      window.SlateFeatures?.renderPanel(feature);
    }
    if (mode === "commands") renderCommands(latestState.commands || []);
    if (mode === "legal") renderDocument(byId("legal-document"), documentSelection);
    if (["privacy", "videos"].includes(mode)) window.renderPrivacy?.();
    panel.scrollTop = scrollOffsets.get(active) || 0;
    renderedSection = active;
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
    byId("online-suggestions").checked = prefs.onlineSuggestions === true;
    if (document.activeElement !== engine) engine.value = latestState.features?.settings?.searchEngine || "google";
    if (!nav.childElementCount) createNavigation();
    renderCommands(latestState.commands || []);
    if (!panel.hidden) renderSelection();
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
      select(labels[section] ? section : "general");
    },
    select,
    showLegalDocument,
  };
})();
