"use strict";
function windowFrame(platform, material = false) {
  if (platform === "darwin") return {
    titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 17 },
    vibrancy: material ? "under-window" : undefined, visualEffectState: "followWindow",
  };
  // Native caption retains minimize/maximize/close, system menu, resizing and
  // Windows 11 snap affordances. It is outside getContentSize()/Miso bounds.
  return { frame: true, titleBarStyle: "default", autoHideMenuBar: true };
}
function desktopTitle(platform, tab) {
  return platform === "win32" && tab?.url ? `${tab.title || "Nueva pestaña"} — Slate Privacy` : "Slate Privacy";
}
module.exports = { windowFrame, desktopTitle };
