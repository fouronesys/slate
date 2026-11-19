const { isWebUrl } = require("./privacy-policy.cjs");
const { searchUrl } = require("./search-engines.cjs");

function downloadableImage(url, pageUrl) {
  if (isWebUrl(url) || /^data:image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon|svg\+xml)[;,]/i.test(url || "")) return true;
  try {
    return new URL(url).protocol === "blob:" && new URL(url).origin === new URL(pageUrl).origin;
  } catch { return false; }
}

function buildContextMenu(tab, params, actions) {
  const contents = tab.view.webContents;
  const entries = [];
  const selected = (params.selectionText || "").trim();
  const link = isWebUrl(params.linkURL);
  const image = params.mediaType === "image";
  const media = ["video", "audio"].includes(params.mediaType);
  const edit = params.editFlags || {};
  const run = fn => () => {
    if (contents.isDestroyed() || !actions.isCurrent()) return;
    try {
      Promise.resolve(fn()).catch(error => actions.notice(error.message || "No se pudo completar la acción."));
    } catch (error) { actions.notice(error.message || "No se pudo completar la acción."); }
  };
  const item = (id, label, fn, enabled = true) => ({ id, label, enabled, click: run(fn) });
  const group = items => {
    if (!items.length) return;
    if (entries.length) entries.push({ type: "separator" });
    entries.push(...items);
  };

  if (params.linkURL) {
    const links = [];
    if (link) {
      links.push(item("link-new-tab", "Abrir enlace en una pestaña nueva", () => actions.openTab(params.linkURL, tab.ephemeral)));
      if (!tab.ephemeral) links.push(item("link-private-tab", "Abrir enlace en pestaña fugaz", () => actions.openTab(params.linkURL, true)));
      links.push(item("link-download", "Descargar enlace", () => contents.downloadURL(params.linkURL)));
    }
    links.push(item("link-copy", "Copiar dirección del enlace", () => actions.clipboard.writeText(params.linkURL)));
    group(links);
  }

  if (image) {
    const images = [
      item("image-download", "Descargar imagen", () => contents.downloadURL(params.srcURL),
        downloadableImage(params.srcURL, params.frameURL || tab.url)),
      item("image-copy", "Copiar imagen", () => contents.copyImageAt(params.x, params.y), params.hasImageContents !== false),
      item("image-copy-url", "Copiar dirección de la imagen", () => actions.clipboard.writeText(params.srcURL || ""), Boolean(params.srcURL)),
    ];
    if (isWebUrl(params.srcURL)) images.push(
      item("image-new-tab", "Abrir imagen en una pestaña nueva", () => actions.openTab(params.srcURL, tab.ephemeral)));
    group(images);
  }

  if (params.isEditable) {
    group([
      item("edit-undo", "Deshacer", () => contents.undo(), Boolean(edit.canUndo)),
      item("edit-redo", "Rehacer", () => contents.redo(), Boolean(edit.canRedo)),
    ]);
    group([
      item("edit-cut", "Cortar", () => contents.cut(), Boolean(edit.canCut)),
      item("edit-copy", "Copiar", () => contents.copy(), Boolean(edit.canCopy)),
      item("edit-paste", "Pegar", () => contents.paste(), Boolean(edit.canPaste)),
      item("edit-paste-plain", "Pegar sin formato", () => contents.pasteAndMatchStyle(), Boolean(edit.canPaste)),
      item("edit-select-all", "Seleccionar todo", () => contents.selectAll(), Boolean(edit.canSelectAll)),
    ]);
  } else if (selected) {
    group([item("selection-copy", "Copiar", () => contents.copy())]);
  }
  // Searching is an explicit user action and always uses the configured engine.
  if (selected && params.inputFieldType !== "password") {
    const excerpt = selected.replace(/\s+/g, " ").slice(0, 45);
    group([item("selection-search", `Buscar «${excerpt}${selected.length > 45 ? "…" : ""}»`,
      () => actions.openTab(searchUrl(selected.slice(0, 8192), actions.searchEngine), tab.ephemeral))]);
  }

  if (media && params.srcURL) {
    group([
      item("media-copy-url", "Copiar dirección del contenido multimedia", () => actions.clipboard.writeText(params.srcURL)),
      ...(isWebUrl(params.srcURL) && params.mediaFlags?.canSave ? [
        item("media-download", "Descargar archivo multimedia", () => contents.downloadURL(params.srcURL)),
      ] : []),
    ]);
  }
  if (!params.linkURL && !image && !media && !params.isEditable && !selected) {
    group([
      item("page-back", "Atrás", () => contents.navigationHistory.goBack(), contents.navigationHistory.canGoBack()),
      item("page-forward", "Adelante", () => contents.navigationHistory.goForward(), contents.navigationHistory.canGoForward()),
      item("page-reload", "Recargar", () => contents.reload()),
    ]);
    group([
      item("page-copy-url", "Copiar dirección de la página", () => actions.clipboard.writeText(tab.url)),
      item("page-select-all", "Seleccionar todo", () => contents.selectAll()),
      {
        id: "page-zoom", label: "Zoom", submenu: [
          item("zoom-in", "Acercar", () => contents.setZoomFactor(Math.min(3, contents.getZoomFactor() + 0.1))),
          item("zoom-out", "Alejar", () => contents.setZoomFactor(Math.max(0.5, contents.getZoomFactor() - 0.1))),
          item("zoom-reset", "Tamaño real (100 %)", () => contents.setZoomFactor(1)),
        ],
      },
      item("page-print", "Imprimir…", () => contents.print({ silent: false }, (success, reason) => {
        if (!success && reason && !/cancel/i.test(reason)) actions.notice(`No se pudo imprimir: ${reason}`);
      })),
    ]);
  }

  if (params.inputFieldType !== "password" && (selected || params.linkURL || image || isWebUrl(tab.url))) {
    group([item("collection-save", "Guardar en la bandeja", () => actions.saveCollection(params))]);
  }
  group([item("inspect-element", "Inspeccionar elemento", () => {
    contents.openDevTools({ mode: "detach" });
    contents.inspectElement(params.x, params.y);
  })]);
  return entries;
}

module.exports = { buildContextMenu, downloadableImage };
