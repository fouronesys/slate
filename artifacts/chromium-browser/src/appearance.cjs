const DEFAULT_APPEARANCE = Object.freeze({
  theme: "sistema",
  fontFamily: "system",
  headingFont: "system",
  pageTheme: "seguir",
  accent: "salvia",
  backdrop: "papel",
  density: "cómoda",
  tabStyle: "superior",
  contrast: "normal",
  logoPosition: "izquierda",
  newTabPosition: "final",
  bookmarksBar: false,
  autoHideTitlebar: false,
  chromeOpacity: 45,
  customAccent: "#63795e",
  colorMode: "tema",
  chromeColor: "#191a1d",
  toolbarColor: "#242528",
  surfaceColor: "#2b2c30",
  canvasColor: "#202124",
  tabColor: "#35363a",
});

const OPTIONS = Object.freeze({
  fontFamily: Object.keys(require("./font-options.cjs").stacks),
  headingFont: Object.keys(require("./font-options.cjs").stacks),
  theme: ["claro", "oscuro", "sistema"],
  pageTheme: ["seguir", "original"],
  accent: ["salvia", "oliva", "arcilla", "sistema", "personalizado"],
  backdrop: ["papel", "niebla", "lienzo", "video"],
  density: ["cómoda", "compacta"],
  tabStyle: ["superior", "vertical"],
  contrast: ["normal", "alto", "sistema"],
  logoPosition: ["izquierda", "centro"],
  newTabPosition: ["inicio", "final"],
  colorMode: ["tema", "propio"],
});

const HEX_COLOR = /^#[\da-f]{6}$/i;
const COLOR_KEYS = ["customAccent", "chromeColor", "toolbarColor", "surfaceColor", "canvasColor", "tabColor"];

function normalizeAppearance(value) {
  const normalized = Object.fromEntries(Object.entries(OPTIONS).map(([key, allowed]) => [
    key, allowed.includes(value?.[key]) ? value[key] : DEFAULT_APPEARANCE[key],
  ]));
  normalized.bookmarksBar = value?.bookmarksBar === true;
  normalized.autoHideTitlebar = value?.autoHideTitlebar === true;
  normalized.chromeOpacity = Number.isInteger(value?.chromeOpacity) && value.chromeOpacity >= 10 && value.chromeOpacity <= 100
    ? value.chromeOpacity : DEFAULT_APPEARANCE.chromeOpacity;
  for (const key of COLOR_KEYS) {
    normalized[key] = typeof value?.[key] === "string" && HEX_COLOR.test(value[key])
      ? value[key].toLowerCase() : DEFAULT_APPEARANCE[key];
  }
  return normalized;
}

function updateAppearance(current, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch) ||
      Object.entries(patch).some(([key, value]) => {
        if (Object.hasOwn(OPTIONS, key)) return !OPTIONS[key].includes(value);
        if (["bookmarksBar", "autoHideTitlebar"].includes(key)) return typeof value !== "boolean";
        if (key === "chromeOpacity") return !Number.isInteger(value) || value < 10 || value > 100;
        if (COLOR_KEYS.includes(key)) return typeof value !== "string" || !HEX_COLOR.test(value);
        return true;
      })) {
    throw new Error("Preferencia de apariencia no válida");
  }
  return normalizeAppearance({ ...current, ...patch });
}

function getLayout(preferences, panelOpen, width, height, hasBookmarks = false, titlebarRevealed = false) {
  const compact = preferences.density === "compacta";
  const vertical = preferences.tabStyle === "vertical";
  const tabsHeight = vertical ? 0 : compact ? 35 : 43;
  const toolbarHeight = compact ? 42 : 48;
  const bookmarksBarHeight = preferences.bookmarksBar && hasBookmarks ? 31 : 0;
  const titlebarHeight = preferences.autoHideTitlebar && !titlebarRevealed ? 6 : 43;
  const chromeHeight = titlebarHeight + tabsHeight + toolbarHeight + bookmarksBarHeight;
  const sidebarWidth = vertical ? (width < 1100 ? 176 : 208) : 0;
  const panelWidth = panelOpen ? Math.min(394, Math.max(280, width - sidebarWidth - 260)) : 0;
  return {
    chromeHeight, titlebarHeight, tabsHeight, toolbarHeight, bookmarksBarHeight, sidebarWidth, panelWidth,
    bounds: {
      x: sidebarWidth,
      y: chromeHeight,
      width: Math.max(1, width - sidebarWidth - panelWidth),
      height: Math.max(1, height - chromeHeight),
    },
  };
}

function resolveTheme(preferences, systemDark) {
  return preferences.theme === "sistema" ? (systemDark ? "oscuro" : "claro") : preferences.theme;
}

module.exports = { DEFAULT_APPEARANCE, OPTIONS, COLOR_KEYS, normalizeAppearance, updateAppearance, getLayout, resolveTheme };
