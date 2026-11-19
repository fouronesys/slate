(() => {
  "use strict";
  const list = document.getElementById("tabs-list");
  const button = document.getElementById("all-tabs");
  const count = document.getElementById("all-tabs-count");
  const starts = new Map();
  let state = { tabs: [] };
  let scheduled = 0;

  function fit() {
    const workspace = state.features?.workspaceId || "personal";
    const vertical = document.documentElement.dataset.tabStyle === "vertical";
    const layout = window.SlateTabLayout.fitTabs(state.tabs, state.activeTabId, list.clientWidth,
      { vertical, previousStart: starts.get(workspace) || 0 });
    if (!vertical) starts.set(workspace, layout.start);
    const visible = new Set(layout.ids);
    for (const item of list.children) {
      item.hidden = !visible.has(Number(item.dataset.tabId));
    }
    list.classList.toggle("tabs-tight", layout.tight);
    if (!vertical && list.scrollLeft) list.scrollLeft = 0;
    count.textContent = String(state.tabs.length);
    button.hidden = state.tabs.length < 2;
    const label = `Todas las pestañas: ${state.tabs.length} abiertas` +
      (layout.hidden ? `, ${layout.hidden} en la lista` : "");
    button.title = label;
    button.setAttribute("aria-label", label);
  }

  function scheduleFit() {
    if (scheduled) return;
    scheduled = requestAnimationFrame(() => { scheduled = 0; fit(); });
  }
  new ResizeObserver(scheduleFit).observe(list);
  window.addEventListener("resize", scheduleFit);
  button.addEventListener("click", async () => {
    if (button.getAttribute("aria-expanded") === "true") return;
    button.setAttribute("aria-expanded", "true");
    try { await window.brujula.showTabsMenu(); }
    catch { window.showToast?.("No se pudo abrir la lista de pestañas."); }
    finally { button.setAttribute("aria-expanded", "false"); }
  });
  window.SlateTabsUI = { update(next) { state = next; fit(); } };
})();
