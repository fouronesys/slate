(() => {
  const byId = id => document.getElementById(id);
  const messages = {
    idle: "Comprueba si hay una versión nueva.",
    unsupported: "Disponible en Slate instalado desde el DMG firmado de macOS.",
    checking: "Buscando una versión publicada…",
    current: "Tienes la última versión publicada.",
    available: "Hay una nueva versión disponible.",
    downloading: "Descargando la actualización…",
    downloaded: "Descarga lista. macOS verificará la firma antes de instalar.",
    installing: "Preparando la instalación…",
  };
  let pending = false;
  let latest;
  function render(state) {
    latest = state;
    const update = state.appUpdates || {};
    byId("slate-version").textContent = update.version || "desarrollo";
    byId("automatic-updates").checked = state.browserPreferences?.automaticUpdates === true;
    byId("automatic-updates").disabled = !update.supported;
    byId("update-status").textContent = update.message || messages[update.status] || messages.idle;
    if (update.nextVersion && ["available", "downloading", "downloaded"].includes(update.status)) {
      byId("update-status").textContent += ` Versión ${update.nextVersion}.`;
    }
    const busy = pending || ["checking", "downloading", "installing"].includes(update.status);
    byId("check-app-update").disabled = !update.supported || busy || update.status === "downloaded";
    byId("download-app-update").hidden = update.status !== "available";
    byId("download-app-update").disabled = busy;
    byId("install-app-update").hidden = update.status !== "downloaded";
    byId("install-app-update").disabled = busy;
    byId("update-progress").hidden = update.status !== "downloading";
    byId("update-progress").value = update.percent || 0;
  }
  for (const [id, action] of [["check-app-update", "check"], ["download-app-update", "download"], ["install-app-update", "install"]]) {
    byId(id).addEventListener("click", async () => {
      if (pending) return;
      pending = true;
      if (latest) render(latest);
      try {
        const appUpdates = await window.brujula.appUpdateAction(action);
        latest = { ...latest, appUpdates };
      } catch {
        window.showToast?.("No se pudo realizar la actualización.");
      } finally {
        pending = false;
        if (latest) render(latest);
      }
    });
  }
  byId("automatic-updates").addEventListener("change", async event => {
    try { await window.brujula.setBrowserPreferences({ automaticUpdates: event.target.checked }); }
    catch { window.showToast?.("No se pudo guardar la preferencia de actualizaciones."); if (latest) render(latest); }
  });
  window.SlateUpdates = { render };
})();
