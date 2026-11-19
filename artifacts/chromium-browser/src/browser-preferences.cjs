const DEFAULT_BROWSER_PREFERENCES = Object.freeze({
  pipButton: true,
  defaultZoom: 100,
  backgroundTabs: false,
  onlineSuggestions: false,
  automaticUpdates: false,
});
const ZOOM_LEVELS = Object.freeze([75, 90, 100, 110, 125, 150, 175, 200]);
function normalizePreferences(value) {
  return {
    pipButton: value?.pipButton !== false,
    defaultZoom: ZOOM_LEVELS.includes(value?.defaultZoom) ? value.defaultZoom : 100,
    backgroundTabs: value?.backgroundTabs === true,
    onlineSuggestions: value?.onlineSuggestions === true,
    automaticUpdates: value?.automaticUpdates === true,
  };
}
function updatePreferences(current, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch) ||
      Object.entries(patch).some(([key, value]) =>
        key === "defaultZoom" ? !ZOOM_LEVELS.includes(value) :
          ["pipButton", "backgroundTabs", "onlineSuggestions", "automaticUpdates"].includes(key) ? typeof value !== "boolean" : true)) {
    throw new Error("Configuración del navegador no válida.");
  }
  return normalizePreferences({ ...current, ...patch });
}
module.exports = { DEFAULT_BROWSER_PREFERENCES, ZOOM_LEVELS, normalizePreferences, updatePreferences };
