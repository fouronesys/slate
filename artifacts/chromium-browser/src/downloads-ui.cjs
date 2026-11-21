(() => {
  "use strict";
  const bridge = window.brujula;
  const trigger = document.getElementById("downloads-toggle");
  let state = {};
  let flight = null;
  let panelRoot = null;
  let panelWorkspace = null;
  const rows = new Map();
  const node = (tag, text, className) => {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
  };
  const bytes = value => {
    if (value < 1024) return `${value} B`;
    if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1048576).toFixed(1)} MB`;
  };
  const action = (label, id, type) => {
    const button = node("button", label, "download-action");
    button.type = "button";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try { await bridge.downloadAction(id, type); }
      catch (error) { window.showToast?.(error.message || "No se pudo completar la acción."); }
      finally { button.disabled = false; }
    });
    return button;
  };
  function renderPanel(parent, downloads = {}) {
    delete parent.dataset.libraryMode;
    if (!panelRoot || panelRoot.parentNode !== parent || panelWorkspace !== state.features?.workspaceId) {
      panelRoot = node("div", undefined, "downloads-center");
      panelWorkspace = state.features?.workspaceId;
      rows.clear();
      const intro = node("p", "Los archivos se guardan en la carpeta Descargas del equipo. No se abren automáticamente.", "download-copy");
      const folder = node("p", downloads.directory || "", "download-folder");
      panelRoot.append(intro, folder, action("Abrir carpeta Descargas", "", "folder"),
        node("p", "Esta lista es temporal y se vacía al cerrar Slate. Los archivos descargados permanecen en tu equipo.", "download-copy"),
        node("p", "Todavía no hay descargas en este espacio.", "download-empty download-copy"));
      parent.replaceChildren(panelRoot);
    }
    const entries = downloads.entries || [];
    panelRoot.querySelector(".download-empty").hidden = entries.length > 0;
    const ids = new Set(entries.map(e => e.id));
    for (const [id, row] of rows) if (!ids.has(id)) { row.remove(); rows.delete(id); }
    for (const entry of entries) {
      let row = rows.get(entry.id);
      if (!row) {
        row = node("article", undefined, "download-row");
        row.dataset.downloadId = entry.id;
        row.append(node("strong", entry.name, "download-name"), node("span", "", "download-copy"),
          node("progress"), node("div", undefined, "download-actions"));
        rows.set(entry.id, row);
        const firstRow = panelRoot.querySelector(".download-row");
        panelRoot.insertBefore(row, firstRow);
      }
      const status = entry.state === "completed" ? "Completada" : entry.state === "cancelled" ? "Cancelada" :
        entry.state === "interrupted" ? "Interrumpida" : entry.paused ? "En pausa" : "Descargando…";
      row.querySelector(".download-copy").textContent = `${status} · ${bytes(entry.received)}${entry.total > 0 ? ` / ${bytes(entry.total)}` : ""}${entry.ephemeral ? " · Pestaña fugaz" : ""}`;
      const progress = row.querySelector("progress");
      progress.hidden = !["progressing", "interrupted"].includes(entry.state);
      progress.max = 100;
      if (entry.total > 0) progress.value = Math.min(100, entry.received / entry.total * 100);
      else progress.removeAttribute("value");
      progress.setAttribute("aria-label", `Progreso de ${entry.name}`);
      const controls = row.querySelector(".download-actions");
      const controlsKey = `${entry.state}:${entry.paused}:${entry.resumable}:${entry.active}`;
      if (row.dataset.controlsKey === controlsKey) continue;
      row.dataset.controlsKey = controlsKey;
      controls.replaceChildren();
      if (entry.state === "completed") controls.append(action(state.platform === "darwin" ? "Mostrar en Finder" : state.platform === "win32" ? "Mostrar en el Explorador" : "Mostrar en carpeta", entry.id, "show"));
      if (entry.active && entry.state === "progressing" && !entry.paused) controls.append(action("Pausar", entry.id, "pause"));
      if (entry.resumable && (entry.paused || entry.state === "interrupted")) controls.append(action(entry.paused ? "Continuar" : "Reintentar", entry.id, "resume"));
      if (entry.active) controls.append(action("Cancelar", entry.id, "cancel"));
    }
  }
  function deliver() {
    // No queue or per-frame layout work; a burst gets one short animation.
    if (flight || document.hidden || state.features?.home?.companion?.enabled === false) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    trigger.animate([{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }], { duration: 240 });
    const rect = trigger.getBoundingClientRect();
    if (!rect.width || !window.SlateCompanion?.catMarkup) return;
    const courier = node("div", undefined, "miso-download-courier");
    courier.setAttribute("aria-hidden", "true");
    // Only trusted, local artwork. No filename, URL, or downloaded content is inserted as markup.
    courier.innerHTML = window.SlateCompanion.catMarkup();
    courier.append(node("span", "↓", "miso-download-file"));
    const end = Math.min(innerWidth - 44, rect.left - 10);
    const start = Math.max(12, end - 230);
    courier.style.left = `${start}px`;
    courier.style.top = `${Math.max(0, rect.top + rect.height / 2 - 19)}px`;
    document.body.append(courier);
    const run = courier.animate([
      { transform: "translate3d(0,0,0) scale(.8)", opacity: 0 },
      { transform: "translate3d(12px,-2px,0) scale(1)", opacity: 1, offset: .12 },
      { transform: `translate3d(${(end - start) * .55}px,-3px,0) scale(1)`, opacity: 1, offset: .58 },
      { transform: `translate3d(${end - start}px,0,0) scale(.4)`, opacity: 0 },
    ], { duration: 720, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
    flight = run;
    const clean = () => { courier.remove(); if (flight === run) flight = null; };
    run.finished.then(clean, clean);
  }
  bridge.onDownloadStarted(deliver);
  window.SlateDownloads = {
    renderPanel,
    render(next) {
      state = next;
      const count = next.downloads?.active || 0;
      const badge = document.getElementById("downloads-count");
      badge.hidden = !count;
      badge.textContent = String(count);
      trigger.dataset.activeDownloads = String(count);
      trigger.setAttribute("aria-label", count ? `Mostrar descargas: ${count} en curso` : "Mostrar descargas");
      trigger.title = count ? `Descargas: ${count} en curso` : "Descargas";
    },
  };
})();
