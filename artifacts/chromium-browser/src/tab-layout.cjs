(function (root) {
  "use strict";
  const MIN_WIDTH = 80;
  const MAX_WIDTH = 225;
  const GAP = 3;
  function fitTabs(tabs, activeId, width, { vertical = false, previousStart = 0 } = {}) {
    if (!tabs.length) return { ids: [], start: 0, hidden: 0, tight: false };
    if (vertical) return { ids: tabs.map(tab => tab.id), start: 0, hidden: 0, tight: false };
    const available = Math.max(0, Number.isFinite(width) ? width : 0);
    const capacity = Math.min(tabs.length, Math.max(1, Math.floor((available + GAP) / (MIN_WIDTH + GAP))));
    const active = Math.max(0, tabs.findIndex(tab => tab.id === activeId));
    let start = Math.max(0, Math.min(Math.trunc(previousStart) || 0, tabs.length - capacity));
    if (active < start) start = active;
    else if (active >= start + capacity) start = active - capacity + 1;
    const ids = tabs.slice(start, start + capacity).map(tab => tab.id);
    return { ids, start, hidden: tabs.length - ids.length,
      tight: (available - GAP * (ids.length - 1)) / ids.length < 110 };
  }
  const api = { fitTabs, MIN_WIDTH, MAX_WIDTH, GAP };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SlateTabLayout = api;
})(typeof window !== "undefined" ? window : globalThis);
