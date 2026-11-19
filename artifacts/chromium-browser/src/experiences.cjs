(() => {
  "use strict";

  const bridge = window.brujula;
  const homeLayout = window.SlateHomeLayout;
  const WIDGETS = ["search", "bookmarks", "clock", "collections", "companion", "games"];
  const LABELS = {
    search: "Búsqueda web",
    bookmarks: "Marcadores",
    clock: "Hora y fecha",
    collections: "Colecciones",
    companion: "Acompañante",
    games: "Juegos breves",
  };
  const memoryFaces = ["●", "◇", "⌂", "○", "△", "□"];
  let currentState = {};
  let homeRoot;
  let panelRoot;
  let activeSection = "colecciones";
  let gameMode = "";
  let memory = null;
  let drawState = null;
  let clockTimer = null;
  let lastFeatureError = "";
  let selectedCollection = "";
  let originalSearchForm;
  let originalBookmarksSection;
  let originalHomeFooter;
  let homeParking;
  const widgetCache = {};
  let lastHomeKey = "";
  let lastPanelKey = "";
  let editingCollectionId = "";
  let editingItemId = "";
  let addingItemToCollection = "";
  let homeResizeObserver;
  let homeLayoutFrame = 0;
  let activeWidgetDrag = null;
  let widgetsEditing = false;
  let companionCleanup = null;
  let companionSignature = "";
  let companionMount = null;

  const getFeatures = () => currentState.features || {};
  const getHome = () => {
    const saved = getFeatures().home || {};
    return {
      order: Array.isArray(saved.order) ? [...saved.order] : [...WIDGETS],
      hidden: Array.isArray(saved.hidden) ? [...saved.hidden] : [],
      size: saved.size || "normal",
      corners: saved.corners || "soft",
      transparency: Number.isFinite(saved.transparency) ? saved.transparency : 90,
      positions: saved.positions && typeof saved.positions === "object" ? { ...saved.positions } : {},
      anchors: saved.anchors || {},
      widgetBackground: Boolean(saved.widgetBackground),
      companion: {
        enabled: true, kind: "cat", name: "Miso", color: "#63795e",
        floating: false, followCursor: true, secretUnlocked: false, cosmic: false,
        ...(saved.companion || {}),
      },
    };
  };
  const esc = (value) => String(value ?? "");
  const safeColor = (color) => /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#63795e";
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label, className = "experience-button", handler) => {
    const node = el("button", className, label);
    node.type = "button";
    node.dataset.panelFocus = label;
    if (handler) node.addEventListener("click", handler);
    return node;
  };
  const field = (label, type, value, options = {}) => {
    const wrap = el("label", "experience-field");
    wrap.append(el("span", "", label));
    const input = document.createElement(type === "textarea" ? "textarea" : "input");
    if (type !== "textarea") input.type = type;
    if (options.name) input.name = options.name;
    if (options.maxLength) input.maxLength = options.maxLength;
    input.dataset.draftKey = options.key || label;
    if (type === "checkbox") input.checked = Boolean(value);
    else input.value = value ?? "";
    wrap.append(input);
    return { wrap, input };
  };
  const notify = (message) => {
    if (typeof window.showToast === "function") window.showToast(message);
    else if (typeof window.SlateFeatures?.onToast === "function") window.SlateFeatures.onToast(message);
  };
  async function act(action) {
    lastFeatureError = "";
    try {
      if (!bridge || typeof bridge.featureAction !== "function") throw new Error("Esta acción todavía no está disponible en esta versión.");
      const result = await bridge.featureAction(action);
      if (result && result.error) throw new Error(result.error);
      return result;
    } catch (error) {
      lastFeatureError = error?.message || "No se pudo completar la acción.";
      if (panelRoot) renderPanel();
      notify(lastFeatureError);
      return null;
    }
  }
  function appendError(parent) {
    if (lastFeatureError) parent.append(el("p", "experience-error", lastFeatureError));
  }
  function makeWidget(name, content) {
    const widget = el("section", "slate-widget");
    widget.id = `slate-widget-${name}`;
    widget.dataset.test = `home-widget-${name}`;
    widget.dataset.widget = name;
    widget.dataset.size = getHome().size;
    widget.draggable = false;
    widget.tabIndex = 0;
    widget.setAttribute("aria-label", LABELS[name]);
    const tools = el("div", "slate-widget-edit-tools");
    tools.setAttribute("aria-label", `Orden de ${LABELS[name]}`);
    const dragHandle = button("⠿", "slate-widget-drag-handle", () => {});
    dragHandle.setAttribute("aria-label", `Arrastrar ${LABELS[name]} para mover`);
    dragHandle.title = "Arrastra para mover";
    const anchor = document.createElement("select");
    anchor.setAttribute("aria-label", `Zona de ${LABELS[name]}`);
    homeLayout.ZONES.forEach((zone, index) => {
      const option = document.createElement("option");
      option.value = zone;
      option.textContent = `${["Arriba", "Centro", "Abajo"][Math.floor(index / 3)]} · ${["izquierda", "centro", "derecha"][index % 3]}`;
      anchor.append(option);
    });
    anchor.addEventListener("change", () => saveHome({ anchors: { ...getHome().anchors, [name]: anchor.value } }));
    const hide = button("×", "experience-quiet-button", () => setHomeWidgetVisibility(name, false));
    hide.setAttribute("aria-label", `Ocultar ${LABELS[name]}`);
    hide.title = "Ocultar widget (conserva sus datos)";
    tools.append(dragHandle, anchor, hide);
    const body = el("div", "slate-widget-body");
    body.append(content);
    widget.append(tools, body);
    widget.addEventListener("pointerdown", (event) => beginWidgetDrag(event, widget, name));
    widget.addEventListener("lostpointercapture", (event) => finishWidgetDrag(event, widget));
    widget.addEventListener("keydown", (event) => moveWidgetKeyboard(event, widget, name));
    widget.addEventListener("dragover", (event) => {
      const external = event.dataTransfer.types.includes("text/uri-list") || event.dataTransfer.types.includes("text/plain");
      if (!(name === "collections" && external)) return;
      event.preventDefault();
      widget.classList.add("is-drop-target");
    });
    widget.addEventListener("dragleave", () => widget.classList.remove("is-drop-target"));
    widget.addEventListener("drop", (event) => {
      event.preventDefault();
      widget.classList.remove("is-drop-target");
      if (name === "collections") saveDroppedContent(event.dataTransfer, currentCollectionId());
    });
    widget.addEventListener("paste", (event) => {
      if (name !== "collections" || event.target.closest("input,textarea,select,[contenteditable='true']")) return;
      if (event.clipboardData?.getData("text/plain")) {
        event.preventDefault();
        saveDroppedContent(event.clipboardData, currentCollectionId());
      }
    });
    if (name === "collections") {
      widget.tabIndex = 0;
      widget.setAttribute("aria-label", "Colecciones. Arrastra un enlace o texto aquí, o pega contenido.");
    }
    return widget;
  }
  function ensureHome() {
    const content = document.querySelector(".home-content");
    if (!content) return null;
    if (!homeRoot) {
      homeRoot = content;
      homeRoot.classList.add("slate-home-grid");
      // Document routing is a fallback when native capture is lost or the
      // pointer crosses another widget. Never leave a drag waiting on its source.
      document.addEventListener("pointermove", event => {
        if (activeWidgetDrag) moveWidgetPointer(event, activeWidgetDrag.widget);
      });
      for (const type of ["pointerup", "pointercancel"]) document.addEventListener(type, event => {
        if (activeWidgetDrag) finishWidgetDrag(event, activeWidgetDrag.widget);
      });
      const oldHeader = document.createElement("div");
      oldHeader.className = "slate-home-header";
      originalSearchForm = document.getElementById("home-search");
      originalBookmarksSection = document.querySelector(".home-bookmarks");
      originalHomeFooter = document.querySelector(".home-footer");
      const parts = [...homeRoot.children].filter((node) =>
        node !== originalSearchForm && node !== originalBookmarksSection && node !== originalHomeFooter,
      );
      for (const part of parts) oldHeader.append(part);
      const anchor = homeRoot.querySelector(".home-symbol");
      homeRoot.insertBefore(oldHeader, anchor || homeRoot.firstChild);
      homeParking = el("div", "slate-feature-parking");
      homeParking.id = "slate-feature-parking";
      homeParking.setAttribute("aria-hidden", "true");
      homeRoot.append(homeParking);
      if (originalHomeFooter) homeParking.append(originalHomeFooter);
      const bar = el("div", "experience-homebar");
      const backgroundButton = button("Fondos: no", "", () => {
        const next = !getHome().widgetBackground;
        saveHome({ widgetBackground: next });
      });
      backgroundButton.id = "home-widget-background-toggle";
      backgroundButton.setAttribute("aria-pressed", "false");
      const companionButton = button("Mostrar acompañante", "", () => {
        const home = getHome();
        const enabled = !home.companion.enabled || home.hidden.includes("companion");
        saveHome({ hidden: home.hidden.filter(id => id !== "companion"), companion: { ...home.companion, enabled, floating: enabled ? home.companion.floating : false } });
      });
      companionButton.id = "home-companion-toggle";
      companionButton.setAttribute("aria-pressed", "false");
      const editButton = button("Editar widgets", "slate-home-edit-toggle", () => {
        widgetsEditing = !widgetsEditing;
        homeRoot.classList.toggle("slate-home-editing", widgetsEditing);
        editButton.textContent = widgetsEditing ? "Listo" : "Editar widgets";
        editButton.setAttribute("aria-pressed", String(widgetsEditing));
        positionWidgets();
      });
      editButton.id = "home-widget-edit-toggle";
      editButton.setAttribute("aria-pressed", "false");
      bar.append(backgroundButton, companionButton, editButton);
      const available = el("details", "slate-widget-available");
      available.append(el("summary", "", "Añadir widgets"), el("div", "slate-widget-available-list"));
      bar.append(available);
      homeRoot.append(bar, el("div", "slate-widget-zone"), el("div", "slate-home-footer"));
      homeResizeObserver = new ResizeObserver(() => {
        if (homeLayoutFrame) return;
        homeLayoutFrame = requestAnimationFrame(() => {
          homeLayoutFrame = 0;
        const heading = homeRoot.querySelector(".slate-home-header");
        const controls = homeRoot.querySelector(".experience-homebar");
        if (controls) controls.style.top = `${heading?.offsetHeight ? Math.max(14, heading.offsetTop + heading.offsetHeight + 16) : 14}px`;
        positionWidgets();
        });
      });
      homeResizeObserver.observe(homeRoot.querySelector(".slate-widget-zone"));
      homeResizeObserver.observe(oldHeader);
      homeResizeObserver.observe(bar);
      window.addEventListener("resize", () => positionWidgets());
    }
    return homeRoot;
  }
  function defaultWidgetPosition(name) {
    return ({
      clock: { x: 0.83, y: 0.07 },
      search: { x: 0.5, y: 0.18 },
      bookmarks: { x: 0.5, y: 0.34 },
      collections: { x: 0.15, y: 0.74 },
      games: { x: 0.77, y: 0.72 },
      companion: { x: 0.84, y: 0.31 },
    })[name] || { x: 0.5, y: 0.5 };
  }
  function positionWidgets(home = getHome()) {
    return widgetPositions(home);
  }
  function homeCanvasBounds(zone) {
    // Use a stable viewport-based coordinate space. The expanded scroll height
    // is an output of collision resolution, never its next input.
    return {
      width: zone.clientWidth,
      height: Math.max(690, document.getElementById("home-screen")?.clientHeight || 0),
    };
  }
  function widgetPositions(home = getHome()) {
    if (activeWidgetDrag) return [];
    const zone = homeRoot?.querySelector(".slate-widget-zone");
    if (!zone || !homeLayout) return [];
    const bounds = homeCanvasBounds(zone);
    if (!bounds.width || !bounds.height) return [];
    const widgets = [...zone.querySelectorAll(".slate-widget:not([hidden])")];
    const items = widgets.map((node) => {
      const id = node.dataset.widget;
      const size = { width: node.offsetWidth, height: node.offsetHeight };
      const zone = home.anchors[id] || homeLayout.nearestZone(home.positions[id] || defaultWidgetPosition(id));
      const select = node.querySelector(".slate-widget-edit-tools select");
      if (select && document.activeElement !== select) select.value = zone;
      node.dataset.anchor = zone;
      return { id, zone, ...size };
    });
    const zoneRect = zone.getBoundingClientRect();
    const obstacles = [homeRoot.querySelector(".slate-home-header"), homeRoot.querySelector(".experience-homebar")]
      .filter(Boolean)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.left - zoneRect.left, y: rect.top - zoneRect.top, width: rect.width, height: rect.height };
      });
    const placed = homeLayout.arrangeZones(items, bounds, obstacles);
    for (const rect of placed) {
      const node = widgetCache[rect.id];
      if (node) {
        node.style.left = `${rect.x}px`;
        node.style.top = `${rect.y}px`;
      }
    }
    const baseHeight = Math.max(690, document.getElementById("home-screen")?.clientHeight || 0);
    const targetHeight = Math.max(baseHeight, Math.ceil(placed.contentHeight + 28));
    if (Math.abs(targetHeight - homeRoot.offsetHeight) > 2) {
      homeRoot.style.height = `${targetHeight}px`;
    }
    return placed;
  }
  function beginWidgetDrag(event, widget, name) {
    const handle = event.target.closest(".slate-widget-drag-handle");
    if (!widgetsEditing || !handle || !event.isPrimary || event.button !== 0) return;
    const zone = widget.closest(".slate-widget-zone");
    const bounds = zone?.getBoundingClientRect();
    if (!bounds) return;
    event.preventDefault();
    widget.setPointerCapture(event.pointerId);
    activeWidgetDrag = {
      id: name, pointerId: event.pointerId, widget, zone,
      startX: event.clientX, startY: event.clientY,
      left: widget.offsetLeft, top: widget.offsetTop,
      bounds: homeCanvasBounds(zone),
    };
    activeWidgetDrag.targets = [...zone.querySelectorAll(".slate-widget:not([hidden])")]
      .filter(node => node !== widget).map(node => ({ node, rect: node.getBoundingClientRect() }));
    widget.classList.add("is-dragging");
  }
  function moveWidgetPointer(event, widget) {
    const drag = activeWidgetDrag;
    if (!drag || drag.widget !== widget || drag.pointerId !== event.pointerId) return;
    const x = drag.left + event.clientX - drag.startX;
    const y = drag.top + event.clientY - drag.startY;
    widget.style.transform = `translate3d(${x - drag.left}px,${y - drag.top}px,0)`;
    drag.x = x; drag.y = y;
    for (const target of drag.targets) {
      const r = target.rect;
      target.node.classList.toggle("is-drop-target", event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom);
    }
  }
  function finishWidgetDrag(event, widget) {
    const drag = activeWidgetDrag;
    if (!drag || drag.widget !== widget || drag.pointerId !== event.pointerId) return;
    widget.classList.remove("is-dragging");
    activeWidgetDrag = null;
    widget.style.transform = "";
    if (widget.hasPointerCapture(event.pointerId)) widget.releasePointerCapture(event.pointerId);
    const home = getHome();
    const anchors = { ...home.anchors };
    const target = drag.targets.find(entry => entry.node.classList.contains("is-drop-target"))?.node;
    drag.targets.forEach(entry => entry.node.classList.remove("is-drop-target"));
    if (event.type === "pointercancel" || event.type === "lostpointercapture" || drag.x === undefined) {
      positionWidgets(); return;
    }
    const fromZone = widget.dataset.anchor;
    const rect = drag.zone.getBoundingClientRect();
    anchors[drag.id] = target ? target.dataset.anchor : homeLayout.nearestZone({
      x: (event.clientX - rect.left) / drag.bounds.width,
      y: (event.clientY - rect.top) / drag.bounds.height,
    });
    const order = [...home.order];
    if (target) {
      anchors[target.dataset.widget] = fromZone;
      const a = order.indexOf(drag.id), b = order.indexOf(target.dataset.widget);
      [order[a], order[b]] = [order[b], order[a]];
    }
    saveHome({ anchors, order });
  }
  function moveWidgetKeyboard(event, widget, name) {
    if (!widgetsEditing || (event.target !== widget && !event.target.closest(".slate-widget-drag-handle")) ||
        !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const home = getHome();
    const index = homeLayout.ZONES.indexOf(widget.dataset.anchor);
    const col = homeLayout.clamp(index % 3 + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0), 0, 2);
    const row = homeLayout.clamp(Math.floor(index / 3) + (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0), 0, 2);
    saveHome({ anchors: { ...home.anchors, [name]: homeLayout.ZONES[row * 3 + col] } });
  }
  function moveWidget(name, amount) {
    const home = getHome();
    const order = home.order.filter((key) => WIDGETS.includes(key));
    const index = order.indexOf(name);
    const target = Math.max(0, Math.min(order.length - 1, index + amount));
    if (index < 0 || index === target) return;
    [order[index], order[target]] = [order[target], order[index]];
    const anchors = { ...home.anchors };
    anchors[name] = widgetCache[order[index]]?.dataset.anchor || homeLayout.nearestZone(defaultWidgetPosition(order[index]));
    anchors[order[index]] = widgetCache[name]?.dataset.anchor || homeLayout.nearestZone(defaultWidgetPosition(name));
    saveHome({ order, anchors });
  }
  function currentCollectionId() {
    const collections = getFeatures().collections || [];
    return selectedCollection || collections[0]?.id || "";
  }
  function attachDropTarget(target, collectionIdGetter) {
    target.addEventListener("dragover", (event) => {
      if (event.dataTransfer.types.includes("text/uri-list") || event.dataTransfer.types.includes("text/plain")) {
        event.preventDefault();
        target.classList.add("is-drop-target");
      }
    });
    target.addEventListener("dragleave", () => target.classList.remove("is-drop-target"));
    target.addEventListener("drop", (event) => {
      event.preventDefault();
      target.classList.remove("is-drop-target");
      saveDroppedContent(event.dataTransfer, collectionIdGetter());
    });
  }
  async function saveDroppedContent(dataTransfer, collectionId) {
    if (!collectionId) return notify("Crea una colección antes de guardar aquí.");
    const uriText = dataTransfer?.getData("text/uri-list") || "";
    const plainText = dataTransfer?.getData("text/plain") || "";
    const urlCandidate = (uriText.split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith("#")) || plainText.trim()).trim();
    let url = "";
    try {
      const parsed = new URL(urlCandidate);
      if (["http:", "https:"].includes(parsed.protocol)) url = parsed.href;
    } catch {}
    if (url) {
      let title = url;
      try { title = new URL(url).hostname.replace(/^www\./, ""); } catch {}
      await act({ type: "item:add", collectionId, kind: "link", title, url, text: "", notes: "" });
      notify("Enlace guardado en la colección.");
    } else if (plainText.trim()) {
      await act({ type: "item:add", collectionId, kind: "text", title: plainText.trim().slice(0, 60), text: plainText.trim(), url: "", notes: "" });
      notify("Texto guardado en la colección.");
    }
  }
  async function saveHome(patch) { await act({ type: "home:update", patch }); }
  function searchWidget() {
    if (!originalSearchForm) return null;
    if (!widgetCache.search) widgetCache.search = makeWidget("search", originalSearchForm);
    return widgetCache.search;
  }
  function bookmarksWidget() {
    if (!originalBookmarksSection) return null;
    if (!widgetCache.bookmarks) widgetCache.bookmarks = makeWidget("bookmarks", originalBookmarksSection);
    return widgetCache.bookmarks;
  }
  function clockWidget() {
    if (widgetCache.clock) return widgetCache.clock;
    const content = el("div", "");
    content.append(el("p", "slate-widget-title", "Tu hora local"));
    const display = el("div", "slate-clock");
    display.append(el("time", "slate-clock-time"), el("span", "slate-clock-date"));
    content.append(display);
    widgetCache.clock = makeWidget("clock", content);
    return widgetCache.clock;
  }
  function collectionsBody() {
    const content = el("div", "");
    const head = el("p", "slate-widget-title", "Colecciones a mano");
    content.append(head);
    const strip = el("div", "slate-collection-strip");
    const collections = getFeatures().collections || [];
    if (!collections.length) {
      strip.append(el("span", "experience-copy", "Guarda aquí enlaces, ideas e imágenes para volver a ellos."));
    } else {
      for (const collection of collections.slice(0, 8)) {
        const chip = button(collection.name, "slate-collection-chip", () => {
          selectedCollection = collection.id;
          window.openPanel?.("features");
          activeSection = "colecciones";
          window.SlateFeatures?.renderPanel();
        });
        chip.title = "Abrir colección";
        chip.addEventListener("dragover", (event) => { event.preventDefault(); chip.classList.add("is-drop-target"); });
        chip.addEventListener("dragleave", () => chip.classList.remove("is-drop-target"));
        chip.addEventListener("drop", (event) => {
          event.preventDefault();
          event.stopPropagation();
          chip.classList.remove("is-drop-target");
          saveDroppedContent(event.dataTransfer, collection.id);
        });
        strip.append(chip);
      }
    }
    content.append(strip);
    return content;
  }
  function collectionsWidget() {
    if (widgetCache.collections) return widgetCache.collections;
    widgetCache.collections = makeWidget("collections", collectionsBody());
    return widgetCache.collections;
  }
  function companionBody() {
    const content = el("div", "slate-companion");
    const mount = el("div", "slate-companion-mount");
    content.append(mount);
    return content;
  }
  function mountCompanion(container) {
    const companion = getHome().companion;
    const signature = JSON.stringify(companion);
    if (!container || (signature === companionSignature && companionMount === container)) return;
    companionCleanup?.();
    companionCleanup = null;
    companionSignature = signature;
    companionMount = container;
    if (!window.SlateCompanion) return;
    companionCleanup = window.SlateCompanion.mount(container, companion, {
      mode: companion.floating || !companion.enabled ? "home-parked" : "home",
      onAction(action, value) {
        if (action === "home") saveHome({ companion: { ...getHome().companion, floating: false, enabled: true } });
        else if (action === "hide") saveHome({ companion: { ...getHome().companion, floating: false, enabled: false } });
        else if (action === "pause") saveHome({ companion: { ...getHome().companion, followCursor: !getHome().companion.followCursor } });
        else if (action === "cosmic") saveHome({ companion: { ...getHome().companion, cosmic: Boolean(value) } });
        else if (action === "float") saveHome({ companion: { ...getHome().companion, floating: true, enabled: true } });
      },
    });
  }
  function companionWidget() {
    if (!widgetCache.companion) {
      widgetCache.companion = makeWidget("companion", companionBody());
      companionMount = widgetCache.companion.querySelector(".slate-companion-mount");
      mountCompanion(companionMount);
    }
    return widgetCache.companion;
  }
  function petSvg(kind, color) {
    if (kind === "robot") {
      return `<svg viewBox="0 0 64 64" role="img" aria-label="Pequeño robot"><path d="M32 7v8M28 7h8" stroke="${color}" stroke-width="3" stroke-linecap="round"/><rect x="11" y="16" width="42" height="36" rx="13" fill="${color}" opacity=".18" stroke="${color}" stroke-width="2"/><rect x="18" y="23" width="28" height="20" rx="7" fill="var(--surface)" stroke="${color}" stroke-width="2"/><circle cx="26" cy="32" r="2.5" fill="${color}"/><circle cx="38" cy="32" r="2.5" fill="${color}"/><path d="M27 38q5 4 10 0M6 30h5m42 0h5M23 52v5m18-5v5" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/></svg>`;
    }
    return `<svg viewBox="0 0 64 64" role="img" aria-label="Pequeño gato"><path d="m14 24 3-14 13 9 17-9 3 14c5 5 7 12 5 19-3 10-12 14-23 14S12 53 9 43c-2-7 0-14 5-19Z" fill="${color}" opacity=".18" stroke="${color}" stroke-width="2.3" stroke-linejoin="round"/><path d="M17 17 18 30m29-13-1 13" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/><ellipse cx="24" cy="36" rx="2.3" ry="3" fill="${color}"/><ellipse cx="40" cy="36" rx="2.3" ry="3" fill="${color}"/><path d="m30 41 2 2 2-2m-2 2v3m-6-2-11-2m11 5-11 2m23-5 11-2m-11 5 11 2" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  }
  function gamesWidget() {
    if (widgetCache.games) return widgetCache.games;
    widgetCache.games = makeWidget("games", gamesBody());
    return widgetCache.games;
  }
  function gamesBody() {
    const content = el("div", "slate-games-home");
    content.append(el("p", "slate-widget-title", "Un rato breve"));
    if (!gameMode) {
      const launchers = el("div", "slate-game-launchers");
      launchers.append(
        gameLauncher("Parejas", "Memoria visual · 12 cartas", () => startMemory()),
        gameLauncher("Dibujo libre", "Un lienzo pequeño, sin guardar", () => startDrawing()),
      );
      content.append(launchers);
    } else if (gameMode === "memory") renderMemory(content);
    else if (gameMode === "drawing") renderDrawing(content);
    return content;
  }
  function refreshWidgetBody(name, content) {
    if (name === "companion") {
      mountCompanion(companionMount);
      return;
    }
    const widget = widgetCache[name];
    const body = widget?.querySelector(".slate-widget-body");
    if (body) body.replaceChildren(content);
  }
  function refreshGame() {
    refreshWidgetBody("games", gamesBody());
  }
  function gameLauncher(title, desc, handler) {
    const node = button("", "slate-game-launch", handler);
    node.append(el("strong", "", title), el("small", "", desc));
    return node;
  }
  function startMemory() {
    const cards = [...memoryFaces, ...memoryFaces].map((face, index) => ({ face, key: `${face}-${index}`, matched: false, shown: false }));
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    memory = { cards, open: [], moves: 0, locked: false };
    gameMode = "memory";
    refreshGame();
    renderHome(true);
  }
  function renderMemory(parent) {
    const top = el("div", "slate-game-top");
    top.append(el("strong", "", "Encuentra las parejas"), el("span", "experience-copy", `${memory?.moves || 0} intentos`));
    top.append(button("Salir", "experience-quiet-button", () => { gameMode = ""; memory = null; refreshGame(); }));
    parent.append(top);
    const grid = el("div", "slate-memory-grid");
    (memory?.cards || []).forEach((card, index) => {
      const tile = button(card.shown || card.matched ? card.face : "·", `slate-memory-card${card.shown ? " revealed" : ""}${card.matched ? " matched" : ""}`, () => flipCard(index));
      tile.setAttribute("aria-label", card.matched ? `Pareja ${card.face} encontrada` : card.shown ? card.face : "Carta oculta");
      tile.disabled = card.matched || card.shown || memory.locked;
      grid.append(tile);
    });
    parent.append(grid);
    if (memory?.cards.every((card) => card.matched)) parent.append(el("p", "experience-copy", `Listo. Lo resolviste en ${memory.moves} intentos.`));
  }
  function flipCard(index) {
    if (!memory || memory.locked) return;
    const card = memory.cards[index];
    if (!card || card.matched || card.shown) return;
    card.shown = true;
    memory.open.push(index);
    if (memory.open.length === 2) {
      memory.moves++;
      const [firstIndex, secondIndex] = memory.open;
      if (memory.cards[firstIndex].face === memory.cards[secondIndex].face) {
        memory.cards[firstIndex].matched = true;
        memory.cards[secondIndex].matched = true;
        memory.open = [];
      } else {
        memory.locked = true;
        window.setTimeout(() => {
          if (!memory) return;
          memory.cards[firstIndex].shown = false;
          memory.cards[secondIndex].shown = false;
          memory.open = [];
          memory.locked = false;
          refreshGame();
        }, 720);
      }
    }
    refreshGame();
  }
  function startDrawing() {
    gameMode = "drawing";
    refreshGame();
    renderHome(true);
  }
  function renderDrawing(parent) {
    const top = el("div", "slate-game-top");
    top.append(el("strong", "", "Dibujo libre"), button("Salir", "experience-quiet-button", () => { gameMode = ""; drawState = null; refreshGame(); }));
    const tools = el("div", "slate-draw-tools");
    const color = document.createElement("input");
    color.type = "color";
    color.value = "#63795e";
    color.setAttribute("aria-label", "Color del trazo");
    const width = document.createElement("input");
    width.type = "range"; width.min = "1"; width.max = "16"; width.value = "4"; width.setAttribute("aria-label", "Grosor del trazo");
    const clear = button("Borrar lienzo", "experience-quiet-button", () => {
      const canvas = parent.querySelector("canvas");
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
    });
    tools.append(el("span", "experience-copy", "Trazo"), color, width, clear);
    const canvas = document.createElement("canvas");
    canvas.className = "slate-draw-canvas";
    canvas.width = 900; canvas.height = 420;
    canvas.setAttribute("aria-label", "Lienzo de dibujo libre");
    const context = canvas.getContext("2d");
    context.lineCap = "round"; context.lineJoin = "round";
    let drawing = false;
    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
    };
    canvas.addEventListener("pointerdown", (event) => {
      drawing = true; canvas.setPointerCapture(event.pointerId);
      const p = point(event); context.beginPath(); context.moveTo(p.x, p.y);
      context.strokeStyle = color.value; context.lineWidth = Number(width.value);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) return;
      const p = point(event); context.lineTo(p.x, p.y); context.stroke();
    });
    canvas.addEventListener("pointerup", () => { drawing = false; });
    canvas.addEventListener("pointercancel", () => { drawing = false; });
    parent.append(top, tools, canvas, el("p", "experience-copy", "El dibujo vive solo en esta pantalla; al salir se descarta."));
  }
  function setHomeWidgetVisibility(widget, visible) {
    const home = getHome();
    const hidden = home.hidden.filter((key) => key !== widget);
    if (!visible) hidden.push(widget);
    saveHome({ hidden });
  }
  function renderHome(force = false) {
    if (activeWidgetDrag) return;
    const focused = document.activeElement;
    const root = ensureHome();
    if (!root) return;
    const home = getHome();
    const zone = root.querySelector(".slate-widget-zone");
    const footer = root.querySelector(".slate-home-footer");
    if (!zone || !footer) return;
    const activeTab = (currentState.tabs || []).find((tab) => tab.id === currentState.activeTabId);
    const onHome = !activeTab?.url;
    const homeKey = JSON.stringify([home, getFeatures().workspaceId, getFeatures().collections || [], currentState.privacy?.status || "", onHome]);
    if (!force && homeKey === lastHomeKey) return;
    lastHomeKey = homeKey;
    root.classList.toggle("slate-home-editing", widgetsEditing);
    const homeHeader = root.querySelector(".slate-home-header");
    const workspace = getFeatures().workspaces?.find(w => w.id === getFeatures().workspaceId);
    const eyebrow = homeHeader?.querySelector(".eyebrow");
    if (eyebrow) eyebrow.textContent = `Slate Privacy · ${workspace?.name || "Personal"}`;
    const available = root.querySelector(".slate-widget-available-list");
    available.replaceChildren();
    for (const name of WIDGETS) {
      const visible = !home.hidden.includes(name) && (name !== "companion" || home.companion.enabled);
      const toggle = button(`${visible ? "✓ " : "+ "}${LABELS[name]}`, "experience-quiet-button", () => {
        if (name === "companion" && !visible) {
          saveHome({ hidden: getHome().hidden.filter(id => id !== name), companion: { ...getHome().companion, enabled: true } });
        } else setHomeWidgetVisibility(name, !visible);
      });
      toggle.setAttribute("aria-pressed", String(visible));
      available.append(toggle);
    }
    const homeBar = root.querySelector(".experience-homebar");
    if (homeHeader && homeBar) {
      homeBar.style.top = `${Math.max(178, homeHeader.offsetTop + homeHeader.offsetHeight + 16)}px`;
    }
    root.dataset.widgetBackground = String(home.widgetBackground);
    const backgroundToggle = root.querySelector("#home-widget-background-toggle");
    if (backgroundToggle) {
      backgroundToggle.textContent = home.widgetBackground ? "Fondos: sí" : "Fondos: no";
      backgroundToggle.setAttribute("aria-pressed", String(home.widgetBackground));
    }
    const companionToggle = root.querySelector("#home-companion-toggle");
    if (companionToggle) {
      const visible = home.companion.enabled && !home.hidden.includes("companion");
      companionToggle.textContent = visible ? "Ocultar acompañante" : "Mostrar acompañante";
      companionToggle.setAttribute("aria-pressed", String(visible));
    }
    const editToggle = root.querySelector("#home-widget-edit-toggle");
    if (editToggle) {
      editToggle.textContent = widgetsEditing ? "Listo" : "Editar widgets";
      editToggle.setAttribute("aria-pressed", String(widgetsEditing));
    }
    root.dataset.corners = home.corners;
    root.style.setProperty("--widget-radius", home.corners === "square" ? "3px" : home.corners === "round" ? "22px" : "13px");
    root.style.setProperty("--widget-opacity", `${Math.max(35, Math.min(100, home.transparency))}%`);
    const creators = {
      search: searchWidget,
      bookmarks: bookmarksWidget,
      clock: clockWidget,
      collections: collectionsWidget,
      companion: companionWidget,
      games: gamesWidget,
    };
    const order = [...home.order.filter((key) => WIDGETS.includes(key)), ...WIDGETS.filter((key) => !home.order.includes(key))];
    const visible = new Set();
    for (const key of order) {
      if (home.hidden.includes(key) || (key === "companion" && !home.companion.enabled)) continue;
      const widget = creators[key]?.();
      if (widget) {
        visible.add(key);
        widget.hidden = false;
        widget.dataset.size = home.size;
        widget.draggable = false;
        zone.append(widget);
        homeResizeObserver?.observe(widget);
      }
    }
    for (const key of WIDGETS) {
      const widget = creators[key]?.();
      if (!widget || visible.has(key)) continue;
      widget.hidden = true;
      widget.draggable = false;
      homeParking.append(widget);
    }
    refreshWidgetBody("collections", collectionsBody());
    refreshWidgetBody("companion");
    positionWidgets(home);
    if (focused?.isConnected && root.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
    const status = currentState.privacy?.status === "ready" ? "Protección del navegador activa" : "Consulta el estado de protección en el panel";
    footer.replaceChildren(el("span", "", status), el("span", "", "Tu espacio, sin prisa."));
    updateClock();
    if (!onHome && clockTimer) { window.clearInterval(clockTimer); clockTimer = null; }
    if (onHome && !clockTimer) clockTimer = window.setInterval(updateClock, 30000);
  }
  function updateClock() {
    if (!homeRoot) return;
    const time = homeRoot.querySelector(".slate-clock-time");
    const date = homeRoot.querySelector(".slate-clock-date");
    if (!time || !date) return;
    const now = new Date();
    time.textContent = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" }).format(now);
    date.textContent = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" }).format(now);
  }
  function ensureToolbar() {
    if (document.getElementById("settings-toggle")) return;
    if (document.getElementById("experiences-toggle")) return;
    const toolbar = document.querySelector(".toolbar");
    if (!toolbar) return;
    const trigger = button("", "slate-feature-toggle", () => {
      const isOpen = !document.getElementById("side-panel")?.hidden && document.getElementById("panel-title")?.textContent === "Tu espacio";
      if (isOpen) window.closePanel?.();
      else window.openPanel?.("features");
    });
    trigger.id = "experiences-toggle";
    trigger.setAttribute("aria-label", "Abrir herramientas de tu espacio");
    trigger.title = "Tu espacio y privacidad";
    trigger.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10c2.2-4 4.5-6 7-6s4.8 2 7 6c-2.2 4-4.5 6-7 6s-4.8-2-7-6Z"/><circle cx="10" cy="10" r="2.4"/></svg><span>Mi espacio</span>';
    toolbar.append(trigger);
  }
  function ensurePanel() {
    const aside = document.getElementById("side-panel");
    if (!aside) return null;
    let root = document.getElementById("experience-settings");
    if (!root) {
      root = el("section", "experience-settings");
      root.id = "experience-settings";
      root.hidden = true;
      aside.append(root);
    }
    panelRoot = root;
    return root;
  }
  function renderPanel(section) {
    if (section && ["colecciones", "espacios", "privacidad", "inicio"].includes(section)) {
      activeSection = section;
      lastFeatureError = "";
    }
    const root = ensurePanel();
    if (!root) return;
    root.hidden = false;
    for (const id of ["panel-items", "appearance-settings", "privacy-settings", "clear-history"]) {
      const node = document.getElementById(id);
      if (node) node.hidden = true;
    }
    const title = document.getElementById("panel-title");
    const kicker = document.getElementById("panel-kicker");
    const sectionTitles = { colecciones: "Colecciones", espacios: "Espacios", privacidad: "Permisos del sitio", inicio: "Inicio y widgets" };
    if (title) title.textContent = sectionTitles[activeSection] || "Tu espacio";
    if (kicker) kicker.textContent = "SLATE · LOCAL Y A TU MANERA";
    const panelKey = getPanelKey();
    if (panelKey === lastPanelKey) return;
    const panelScrollTop = root.parentElement?.scrollTop || 0;
    const draft = capturePanelDraft(root);
    lastPanelKey = panelKey;
    root.replaceChildren();
    const pending = getFeatures().pendingPermissions || [];
    if (pending.length) {
      const notice = el("div", "experience-pending-banner");
      const copy = el("p", "", "");
      copy.append(el("strong", "", `${pending.length} solicitud${pending.length === 1 ? "" : "es"} de permiso pendiente${pending.length === 1 ? "" : "s"}`));
      copy.append(el("span", "", " · Revisa qué quiere usar el sitio antes de decidir."));
      notice.append(copy, button("Revisar", "experience-button", () => { activeSection = "privacidad"; renderPanel(); }));
      root.append(notice);
    }
    if (activeSection === "colecciones") renderCollectionsPanel(root);
    else if (activeSection === "espacios") renderWorkspacesPanel(root);
    else if (activeSection === "privacidad") renderPrivacyPanel(root);
    else renderEditorPanel(root);
    appendError(root);
    restorePanelDraft(root, draft);
    if (root.parentElement) root.parentElement.scrollTop = panelScrollTop;
  }
  function getPanelKey() {
    const features = getFeatures();
    const tabs = (currentState.tabs || []).map((tab) => [tab.id, tab.title, tab.url, tab.workspaceId, tab.ephemeral, tab.privacy?.siteEnabled]);
    let relevant;
    if (activeSection === "colecciones") relevant = [features.collections, features.items, selectedCollection, editingCollectionId, editingItemId, tabs.find((tab) => tab[0] === currentState.activeTabId)];
    else if (activeSection === "espacios") relevant = [features.workspaces, features.workspaceId, tabs];
    else if (activeSection === "privacidad") relevant = [features.pendingPermissions, features.grants, features.settings, features.searchResults, currentState.privacy, tabs];
    else relevant = [features.home];
    return JSON.stringify([activeSection, relevant, addingItemToCollection, getFeatures().pendingPermissions || [], lastFeatureError]);
  }
  function capturePanelDraft(root) {
    const values = {};
    root.querySelectorAll("[data-draft-key]").forEach((node) => {
      // Saved settings are owned by the main process. Restoring stale inputs
      // here would visually undo Reset/Undo and rejected native confirmations.
      if (node.type === "checkbox" || node.type === "range" || node.type === "color" ||
          (node.tagName === "SELECT" && ["Tamaño", "Esquinas", "Figura"].includes(node.dataset.draftKey))) return;
      values[node.dataset.draftKey] = node.type === "checkbox" ? node.checked : node.value;
    });
    const active = document.activeElement;
    let focus = null;
    if (root.contains(active)) {
      if (active.dataset?.draftKey) focus = { type: "draft", key: active.dataset.draftKey };
      else if (active.dataset?.panelFocus) {
        const peers = [...root.querySelectorAll("[data-panel-focus]")]
          .filter((node) => node.dataset.panelFocus === active.dataset.panelFocus);
        focus = { type: "button", key: active.dataset.panelFocus, index: peers.indexOf(active) };
      }
    }
    return { values, focus };
  }
  function restorePanelDraft(root, draft) {
    if (!draft) return;
    root.querySelectorAll("[data-draft-key]").forEach((node) => {
      if (!(node.dataset.draftKey in draft.values)) return;
      if (node.type === "checkbox") node.checked = draft.values[node.dataset.draftKey];
      else if (node.tagName === "SELECT" && ![...node.options].some((option) => option.value === draft.values[node.dataset.draftKey])) return;
      else node.value = draft.values[node.dataset.draftKey];
    });
    root.querySelectorAll("[data-refresh-fields='true']").forEach((node) => node.dispatchEvent(new Event("change", { bubbles: true })));
    if (draft.focus?.type === "draft") {
      [...root.querySelectorAll("[data-draft-key]")]
        .find((node) => node.dataset.draftKey === draft.focus.key)?.focus({ preventScroll: true });
    } else if (draft.focus?.type === "button") {
      const peers = [...root.querySelectorAll("[data-panel-focus]")]
        .filter((node) => node.dataset.panelFocus === draft.focus.key);
      peers[draft.focus.index]?.focus({ preventScroll: true });
    }
  }
  function renderCollectionsPanel(root) {
    const section = el("div", "experience-section");
    section.tabIndex = 0;
    section.setAttribute("aria-label", "Bandeja de colecciones. Arrastra enlaces o pega texto para guardarlo.");
    section.addEventListener("paste", (event) => {
      if (event.target.closest("input,textarea,select,[contenteditable='true']")) return;
      if (event.clipboardData?.getData("text/plain")) {
        event.preventDefault();
        saveDroppedContent(event.clipboardData, currentCollectionId());
      }
    });
    const heading = el("h3", "", "Tu bandeja visual");
    section.append(heading, el("p", "experience-copy", "Enlaces, notas e imágenes de páginas que quieres volver a mirar. Todo se queda en este dispositivo."));
    const collectionSelect = document.createElement("select");
    collectionSelect.setAttribute("aria-label", "Colección de destino");
    collectionSelect.dataset.draftKey = "Colección actual";
    const collections = getFeatures().collections || [];
    collections.forEach((collection) => {
      const option = document.createElement("option");
      option.value = collection.id; option.textContent = collection.name;
      collectionSelect.append(option);
    });
    if (selectedCollection) collectionSelect.value = selectedCollection;
    collectionSelect.addEventListener("change", () => { selectedCollection = collectionSelect.value; renderPanel(); });
    const addCollection = field("Crear colección", "text", "", { maxLength: 60 });
    addCollection.input.placeholder = "Ideas para después";
    const create = button("Crear colección", "experience-button", async () => {
      const name = addCollection.input.value.trim();
      if (!name) return addCollection.input.focus();
      if (await act({ type: "collection:add", name })) {
        const currentInput = panelRoot?.querySelector('[data-draft-key="Crear colección"]');
        if (currentInput) currentInput.value = "";
        renderPanel();
      }
    });
    section.append(addCollection.wrap, create);
    if (collections.length) {
      const manage = el("div", "experience-inline");
      const rename = button("Renombrar", "experience-quiet-button", async () => {
        const collection = collections.find((item) => item.id === collectionSelect.value);
        if (!collection) return;
        editingCollectionId = editingCollectionId === collection.id ? "" : collection.id;
        renderPanel();
        if (editingCollectionId) panelRoot?.querySelector('[data-draft-key="Nuevo nombre de colección"]')?.focus();
      });
      const remove = button("Eliminar", "experience-quiet-button", async () => {
        const collection = collections.find((item) => item.id === collectionSelect.value);
        if (collection) {
          await act({ type: "collection:delete", id: collection.id });
          selectedCollection = ""; editingCollectionId = ""; renderPanel();
        }
      });
      manage.append(rename, remove);
      const choose = el("label", "experience-field");
      choose.append(el("span", "", "Colección actual"), collectionSelect);
      section.append(choose, manage);
      attachDropTarget(section, () => collectionSelect.value || currentCollectionId());
      const editingCollection = collections.find((item) => item.id === editingCollectionId);
      if (editingCollection) {
        const renameForm = el("form", "experience-inline-edit");
        const name = field("Nuevo nombre de colección", "text", editingCollection.name, { maxLength: 60 });
        const saveName = button("Guardar nombre", "experience-button");
        saveName.type = "submit";
        const cancelName = button("Cancelar", "experience-quiet-button", () => { editingCollectionId = ""; renderPanel(); });
        renameForm.append(name.wrap, saveName, cancelName);
        renameForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const value = name.input.value.trim();
          if (!value) return name.input.focus();
          const result = await act({ type: "collection:rename", id: editingCollection.id, name: value });
          if (result === null) return;
          editingCollectionId = "";
          renderPanel();
        });
        section.append(renameForm);
      }
      const addItem = button("Guardar una nota o enlace", "experience-button", () => {
        addingItemToCollection = addingItemToCollection === collectionSelect.value ? "" : collectionSelect.value;
        renderPanel();
        if (addingItemToCollection) panelRoot?.querySelector('[data-draft-key="Título"]')?.focus();
      });
      const saveTab = button("Guardar pestaña actual", "experience-quiet-button", async () => {
        if (!collectionSelect.value) return notify("Elige una colección primero.");
        await act({ type: "item:save-tab", collectionId: collectionSelect.value }); renderPanel();
      });
      section.append(addItem, saveTab);
      const list = el("div", "experience-list");
      const items = (getFeatures().items || []).filter((item) => item.collectionId === collectionSelect.value);
      if (!items.length) list.append(el("div", "experience-empty", "Esta colección está lista para recibir su primera pieza."));
      items.forEach((item) => list.append(itemRow(item)));
      section.append(list);
      if (addingItemToCollection === collectionSelect.value) renderItemForm(section, collectionSelect.value);
    } else {
      section.append(el("div", "experience-empty", "Empieza con una colección. Después podrás guardar notas, páginas y pestañas desde aquí."));
    }
    section.append(el("div", "experience-callout", "Puedes arrastrar un enlace o texto hasta una colección; también puedes enfocar este panel y pegar. Para imágenes, usa el menú contextual nativo de la página: Slate las importa localmente (PNG, JPEG o WebP, máximo 2 MB). La interfaz nunca descarga imágenes remotas."));
    root.append(section);
  }
  function renderItemForm(parent, collectionId) {
    const form = el("form", "experience-section");
    form.setAttribute("aria-label", "Guardar en colección");
    const title = field("Título", "text", "", { maxLength: 120 });
    const kind = document.createElement("select");
    [["text", "Nota"], ["link", "Enlace"]].forEach(([value, name]) => {
      const option = document.createElement("option"); option.value = value; option.textContent = name; kind.append(option);
    });
    const typeField = el("label", "experience-field"); typeField.append(el("span", "", "Tipo"), kind);
    const url = field("Dirección web", "url", "");
    const text = field("Texto", "textarea", "");
    const notes = field("Nota privada", "textarea", "");
    const save = button("Guardar pieza", "experience-button");
    const cancel = button("Cancelar", "experience-quiet-button", () => { addingItemToCollection = ""; renderPanel(); });
    const actions = el("div", "experience-inline"); actions.append(save, cancel);
    kind.dataset.draftKey = "Tipo de pieza";
    const syncKindFields = () => { url.wrap.hidden = kind.value !== "link"; text.wrap.hidden = kind.value !== "text"; };
    kind.dataset.refreshFields = "true";
    kind.addEventListener("change", syncKindFields);
    syncKindFields();
    url.wrap.hidden = true;
    save.type = "submit";
    form.append(typeField, title.wrap, url.wrap, text.wrap, notes.wrap, actions);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const action = { type: "item:add", collectionId, kind: kind.value, title: title.input.value.trim(), text: text.input.value.trim(), url: url.input.value.trim(), notes: notes.input.value.trim() };
      if (!action.title) action.title = action.kind === "link" ? action.url : action.text.slice(0, 60);
      if (action.kind === "link" && !action.url) return url.input.focus();
      if (action.kind === "text" && !action.text) return text.input.focus();
      const result = await act(action);
      if (result === null) return;
      addingItemToCollection = "";
      renderPanel();
    });
    parent.append(form);
  }
  function itemRow(item) {
    const row = el("article", "experience-row");
    const copy = el("div", "experience-row-copy");
    copy.append(el("strong", "", item.title || "Sin título"));
    copy.append(el("small", "", item.kind === "image" ? "Imagen local" : item.kind === "link" ? item.url || "Enlace guardado" : item.text || "Nota"));
    const imageData = item.image || "";
    const imagePayload = imageData.split(",")[1] || "";
    const padding = imagePayload.endsWith("==") ? 2 : imagePayload.endsWith("=") ? 1 : 0;
    const decodedBytes = Math.floor(imagePayload.length * 3 / 4) - padding;
    if (item.kind === "image" && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(imageData) && decodedBytes <= 2 * 1024 * 1024) {
      const image = document.createElement("img");
      image.src = item.image; image.alt = item.title || "Imagen guardada"; image.loading = "lazy";
      image.className = "experience-image-preview";
      copy.append(image);
    } else if (item.notes) {
      const note = el("small", "", item.notes);
      note.classList.add("experience-note-copy");
      copy.append(note);
    }
    const actions = el("div", "experience-row-actions");
    if (item.kind === "link" && item.url) actions.append(button("Abrir", "experience-quiet-button", () => bridge?.openUrl?.(item.url)));
    actions.append(button("Editar", "experience-quiet-button", () => {
      editingItemId = editingItemId === item.id ? "" : item.id;
      renderPanel();
      if (editingItemId) panelRoot?.querySelector('[data-draft-key="Título de la pieza"]')?.focus();
    }));
    actions.append(button("Quitar", "experience-quiet-button", async () => {
      if (window.confirm(`¿Quitar «${item.title || "esta pieza"}»?`)) { await act({ type: "item:delete", id: item.id }); renderPanel(); }
    }));
    row.append(copy, actions);
    if (editingItemId === item.id) {
      const editForm = el("form", "experience-inline-edit");
      const title = field("Título de la pieza", "text", item.title || "", { maxLength: 120 });
      const notes = field("Nota privada", "textarea", item.notes || "");
      const target = selectField("Mover a colección", (getFeatures().collections || []).map((collection) => [collection.id, collection.name]), item.collectionId, () => {});
      const save = button("Guardar cambios", "experience-button"); save.type = "submit";
      const cancel = button("Cancelar", "experience-quiet-button", () => { editingItemId = ""; renderPanel(); });
      editForm.append(title.wrap, notes.wrap, target, save, cancel);
      editForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!title.input.value.trim()) return title.input.focus();
        const result = await act({ type: "item:update", id: item.id, title: title.input.value.trim(), notes: notes.input.value.trim(), collectionId: target.querySelector("select").value });
        if (result === null) return;
        editingItemId = "";
        renderPanel();
      });
      row.append(editForm);
    }
    return row;
  }
  function renderWorkspacesPanel(root) {
    const section = el("div", "experience-section");
    section.append(el("h3", "", "Espacios aislados"), el("p", "experience-copy", "Cada espacio reúne pestañas con su propio contexto de navegación. Cambiar de espacio no mezcla sus sesiones."));
    const workspaces = getFeatures().workspaces || [];
    const list = el("div", "experience-list");
    workspaces.forEach((workspace) => {
      const row = el("div", "experience-row");
      const copy = el("div", "experience-row-copy");
      copy.append(el("strong", "", workspace.name), el("small", "", workspace.id === getFeatures().workspaceId ? "Espacio actual" : "Espacio separado"));
      const action = button(workspace.id === getFeatures().workspaceId ? "Activo" : "Cambiar", "experience-quiet-button", async () => {
        if (workspace.id !== getFeatures().workspaceId) await act({ type: "workspace:switch", id: workspace.id });
      });
      action.disabled = workspace.id === getFeatures().workspaceId;
      row.append(copy, action); list.append(row);
    });
    if (!workspaces.length) list.append(el("div", "experience-empty", "Tu espacio personal está listo. Puedes añadir otro para separar contextos."));
    const name = field("Nombre del espacio", "text", "", { maxLength: 40 }); name.input.placeholder = "Lecturas, trabajo…";
    const add = button("Crear espacio", "experience-button", async () => {
      const value = name.input.value.trim();
      if (value && await act({ type: "workspace:add", name: value })) {
        const currentInput = panelRoot?.querySelector('[data-draft-key="Nombre del espacio"]');
        if (currentInput) currentInput.value = "";
        renderPanel();
      }
    });
    section.append(list, name.wrap, add);
    const ephemeral = el("div", "experience-callout");
    ephemeral.innerHTML = "<strong>Pestañas efímeras</strong><br>Se guardan solo en memoria y desaparecen al cerrar la pestaña o la aplicación. No borran las cookies ni los datos de otras pestañas.";
    const openEphemeral = button("Abrir pestaña efímera", "experience-quiet-button", async () => { await act({ type: "tab:ephemeral" }); });
    section.append(ephemeral, openEphemeral);
    section.append(el("div", "experience-callout", "Cerrar Slate de forma segura solicita confirmación nativa antes de terminar todas las pestañas."));
    section.append(button("Cerrar navegador de forma segura", "experience-quiet-button", async () => {
      await act({ type: "safe-close" });
    }));
    const tabsTitle = el("h3", "", "Pestañas de este momento");
    section.append(tabsTitle);
    const tabList = el("div", "experience-list");
    (currentState.tabs || []).forEach((tab) => {
      const row = el("div", "experience-row");
      const copy = el("div", "experience-row-copy");
      copy.append(el("strong", "", tab.title || "Nueva pestaña"), el("small", "", `${tab.workspaceId || "personal"}${tab.ephemeral ? " · efímera" : ""}`));
      const details = el("small", "", [
        tab.url?.startsWith("https://") ? "HTTPS" : tab.url ? "HTTP o local" : "Sin sitio",
        tab.privacy?.siteEnabled === false ? "escudo pausado" : "escudo global",
        tab.ephemeral ? "memoria temporal" : "sesión habitual",
      ].join(" · "));
      details.classList.add("experience-note-copy"); copy.append(details);
      row.append(copy);
      tabList.append(row);
    });
    if (!(currentState.tabs || []).length) tabList.append(el("div", "experience-empty", "No hay pestañas abiertas."));
    section.append(tabList);
    root.append(section);
  }
  function renderPrivacyPanel(root) {
    const section = el("div", "experience-section");
    section.append(el("h3", "", "Permisos del sitio"), el("p", "experience-copy", "Decide qué puede usar cada página. «Una vez» autoriza esta solicitud, no futuras solicitudes. Revocar impide nuevas solicitudes, pero una captura que ya empezó puede seguir activa hasta cerrar esa pestaña."));
    const pending = getFeatures().pendingPermissions || [];
    const grants = getFeatures().grants || [];
    if (pending.length) {
      section.append(el("div", "experience-subhead", "Decisiones pendientes"));
      pending.forEach((request) => {
        const card = el("article", "experience-permission");
        card.append(el("strong", "", request.permission || "Permiso"), el("p", "", `Una página solicita ${request.permission || "acceso"} · ${request.origin || "origen desconocido"}`));
        const actions = el("div", "experience-permission-actions");
        [["deny", "Denegar"], ["once", "Una vez"], ["tab", "Esta pestaña"], ["session", "Esta sesión"]].forEach(([decision, label]) => {
          actions.append(button(label, decision === "deny" ? "experience-quiet-button" : "experience-button", () => act({ type: "permission:respond", id: request.id, decision })));
        });
        const requestingTab = (currentState.tabs || []).find((tab) => {
          try { return new URL(tab.url).origin === new URL(request.origin).origin; } catch { return false; }
        });
        if (requestingTab) actions.append(button("Cerrar pestaña (detener captura)", "experience-quiet-button", () => bridge?.closeTab?.(requestingTab.id)));
        card.append(actions); section.append(card);
      });
    } else section.append(el("div", "experience-empty", "No hay solicitudes pendientes. Si una página pide acceso, aparecerá aquí para que puedas decidir."));
    section.append(el("div", "experience-subhead", "Permisos concedidos"));
    if (!grants.length) section.append(el("div", "experience-empty", "Todavía no has concedido permisos desde este panel."));
    grants.forEach((grant) => {
      const row = el("div", "experience-row");
      const copy = el("div", "experience-row-copy");
      copy.append(el("strong", "", grant.permission || "Permiso"), el("small", "", grant.origin || "Origen desconocido"));
      const expires = grant.expiresAt;
      const parsedExpiry = expires ? new Date(expires) : null;
      const expiry = !expires ? "Sin vencimiento informado"
        : parsedExpiry && Number.isFinite(parsedExpiry.getTime()) ? parsedExpiry.toLocaleString("es")
          : String(expires);
      copy.append(el("small", "", `Caduca: ${expiry}`));
      const actions = el("div", "experience-row-actions");
      actions.append(button("Revocar", "experience-quiet-button", () => act({ type: "permission:revoke", id: grant.id })));
      const matchingTab = (currentState.tabs || []).find((tab) => {
        try { return new URL(tab.url).origin === new URL(grant.origin).origin; } catch { return false; }
      });
      if (matchingTab) actions.append(button("Cerrar pestaña", "experience-quiet-button", () => bridge?.closeTab?.(matchingTab.id)));
      row.append(copy, actions);
      section.append(row);
    });
    const settings = getFeatures().settings || {};
    section.append(selectField("Buscador predeterminado", [
      ["google", "Google"], ["duckduckgo", "DuckDuckGo"], ["bing", "Bing"], ["brave", "Brave Search"],
    ], settings.searchEngine || "google", value => act({ type: "settings:update", patch: { searchEngine: value } })));
    section.append(el("p", "experience-copy", "Se usa en la barra de direcciones y en la búsqueda del inicio. Las consultas se envían al proveedor elegido. Google es el predeterminado; puedes elegir otra opción."));
    section.append(el("div", "experience-subhead", "Preferencias de privacidad"));
    section.append(toggleSetting("Enfoque de YouTube", "Oculta recomendaciones, estantes de Shorts, la barra lateral de relacionados y comentarios en YouTube. No es un bloqueador de anuncios ni una garantía contra cambios del sitio.", "youtubeFocus", settings.youtubeFocus));
    section.append(toggleSetting("Silenciar pestañas de YouTube", "El navegador silencia la pestaña completa de YouTube al abrirla; no depende de conceder permisos de audio o micrófono al sitio.", "youtubeMute", settings.youtubeMute));
    section.append(toggleSetting("Borrar datos normales al salir", "Experimental: la limpieza está comprobada, pero el cierre definitivo del proceso sigue pendiente. Recomendamos dejarlo desactivado por ahora. Las pestañas fugaces se limpian por separado.", "clearOnExit", settings.clearOnExit));
    const search = el("form", "experience-section");
    search.append(el("div", "experience-subhead", "Buscar en este dispositivo"));
    search.append(el("p", "experience-copy", "Busca solo en marcadores e historial local del espacio seleccionado. La consulta no se envía a la web."));
    const query = field("Texto a buscar", "search", "");
    query.input.placeholder = "Título o dirección";
    const results = el("div", "experience-results");
    const searchButton = button("Buscar localmente", "experience-quiet-button");
    searchButton.type = "submit";
    search.append(query.wrap, searchButton, results);
    search.addEventListener("submit", async (event) => {
      event.preventDefault();
      const found = await act({ type: "search", query: query.input.value.trim() });
      results.replaceChildren();
      const rows = Array.isArray(found) ? found : found?.results || getFeatures().searchResults || [];
      const currentResults = panelRoot?.querySelector(".experience-results") || results;
      currentResults.replaceChildren();
      if (!rows.length) currentResults.append(el("div", "experience-empty", "No se encontraron coincidencias locales."));
      rows.forEach((result) => {
        const item = button("", "experience-result", () => bridge?.openUrl?.(result.url));
        item.append(el("strong", "", result.title || result.url), el("small", "", `${result.source || "Local"} · ${result.url || ""}`));
        currentResults.append(item);
      });
    });
    section.append(search);
    section.append(el("div", "experience-callout", "Los diagnósticos muestran configuración y contadores reales reportados por el navegador. No son una puntuación de anonimato ni una promesa de protección total."));
    root.append(section);
  }
  function toggleSetting(label, help, key, checked) {
    const wrapper = el("div", "experience-section");
    const control = el("label", "experience-check");
    const input = document.createElement("input"); input.type = "checkbox"; input.checked = Boolean(checked);
    input.dataset.draftKey = label;
    input.addEventListener("change", () => act({ type: "settings:update", patch: { [key]: input.checked } }));
    const text = el("span", "");
    text.append(el("strong", "", label), el("br"), document.createTextNode(help));
    control.append(input, text); wrapper.append(control);
    return wrapper;
  }
  function renderEditorPanel(root) {
    const section = el("div", "experience-section");
    section.append(el("h3", "", "Componer inicio"), el("p", "experience-copy", "Ordena tus piezas como te resulta natural. También puedes arrastrarlas directamente en el inicio."));
    const home = getHome();
    WIDGETS.forEach((key) => {
      const line = el("label", "experience-check");
      const checkbox = document.createElement("input"); checkbox.type = "checkbox";
      checkbox.checked = !home.hidden.includes(key) && (key !== "companion" || home.companion.enabled);
      checkbox.addEventListener("change", () => {
        if (key === "companion") {
          const companion = getHome().companion;
          saveHome({ hidden: getHome().hidden.filter(id => id !== key), companion: { ...companion, enabled: checkbox.checked, floating: checkbox.checked ? companion.floating : false } });
        }
        else setHomeWidgetVisibility(key, checkbox.checked);
      });
      line.append(checkbox, el("span", "", LABELS[key])); section.append(line);
    });
    const size = selectField("Tamaño", [["compact", "Compacto"], ["normal", "Cómodo"], ["large", "Amplio"]], home.size, (value) => saveHome({ size: value }));
    const corners = selectField("Esquinas", [["soft", "Suaves"], ["square", "Rectas"], ["round", "Redondas"]], home.corners, (value) => saveHome({ corners: value }));
    const opacity = field("Transparencia de las piezas", "range", home.transparency);
    opacity.input.min = "35"; opacity.input.max = "100"; opacity.input.step = "5";
    opacity.input.addEventListener("change", () => saveHome({ transparency: Number(opacity.input.value) }));
    section.append(size, corners, opacity.wrap);
    const ordered = el("div", "experience-list");
    const order = home.order.filter((key) => WIDGETS.includes(key));
    order.forEach((key) => {
      const row = el("div", "experience-row");
      row.append(el("div", "experience-row-copy", LABELS[key]));
      const controls = el("div", "experience-row-actions");
      controls.append(button("↑", "experience-quiet-button", () => moveWidget(key, -1)), button("↓", "experience-quiet-button", () => moveWidget(key, 1)));
      row.append(controls); ordered.append(row);
    });
    section.append(el("div", "experience-subhead", "Orden"), ordered);
    const companionHead = el("div", "experience-subhead", "Acompañante opcional");
    const kind = selectField("Figura", [["cat", "Gato"], ["robot", "Robot"]], home.companion.kind, (value) =>
      saveHome({ companion: { ...getHome().companion, kind: value } }));
    const name = field("Nombre", "text", home.companion.name, { maxLength: 40 });
    const color = field("Color", "color", safeColor(home.companion.color));
    const updateCompanion = () => saveHome({
      companion: {
        ...getHome().companion,
        name: name.input.value.slice(0, 40),
        color: safeColor(color.input.value),
        kind: kind.querySelector("select").value,
      },
    });
    name.input.addEventListener("change", updateCompanion);
    color.input.addEventListener("change", updateCompanion);
    section.append(companionHead, kind, name.wrap, color.wrap);
    section.append(toggleSetting("Sugerencias contextuales de Miso", "Cuando pasea por las pestañas, ofrece acciones según la dirección y tus marcadores, sin leer páginas ni vídeos. No se muestran en pestañas fugaces.", "companionSuggestions", getFeatures().settings.companionSuggestions));
    if (home.companion.secretUnlocked) {
      const orbit = el("div", "experience-section companion-orbit-setting");
      const toggleOrbit = button(home.companion.cosmic ? "Desactivar Modo Órbita" : "Activar Modo Órbita", "experience-button", () =>
        saveHome({ companion: { ...getHome().companion, cosmic: !getHome().companion.cosmic } }));
      toggleOrbit.setAttribute("aria-pressed", String(home.companion.cosmic));
      orbit.append(el("div", "experience-subhead", "Accesorio secreto"), el("p", "experience-copy", "Una órbita diminuta acompaña a Miso sin salir de tu navegador."), toggleOrbit);
      section.append(orbit);
    }
    const actions = el("div", "experience-inline");
    actions.append(button("Deshacer cambio", "experience-quiet-button", async () => { await act({ type: "home:undo" }); renderPanel(); }));
    actions.append(button("Restablecer inicio", "experience-quiet-button", async () => {
      if (window.confirm("¿Restablecer la composición del inicio?")) { await act({ type: "home:reset" }); renderPanel(); }
    }));
    const floatButton = button(home.companion.floating ? "Traer acompañante al inicio" : "Poner junto a mí", "experience-button", () => {
      const companion = getHome().companion;
      saveHome({ companion: { ...companion, enabled: true, floating: !companion.floating } });
    });
    section.append(floatButton, actions, el("div", "experience-callout", "El acompañante se queda en este dispositivo. Sus comentarios son locales; no lee las páginas ni necesita una cuenta."));
    root.append(section);
  }
  function selectField(label, options, value, onChange) {
    const wrap = el("label", "experience-field"); wrap.append(el("span", "", label));
    const select = document.createElement("select");
    options.forEach(([key, text]) => { const option = document.createElement("option"); option.value = key; option.textContent = text; select.append(option); });
    select.value = value;
    select.dataset.draftKey = label;
    select.addEventListener("change", () => onChange(select.value)); wrap.append(select);
    return wrap;
  }
  function render(state) {
    currentState = state || currentState;
    window.SlateCompanionSecret?.updateState(currentState);
    ensureToolbar();
    ensurePanel();
    renderHome();
    const aside = document.getElementById("side-panel");
    if (aside && !aside.hidden && !document.getElementById("experience-settings")?.hidden) renderPanel(activeSection);
  }
  window.SlateFeatures = { render, renderPanel };
})();
