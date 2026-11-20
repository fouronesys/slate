let currentBackgroundVideoUrl = "";
let lastAppearanceKey = "";
let lastVideoLibraryKey = "";
let lastBackgroundState;
let lastBackgroundOnHome = false;
const backgroundMotion = matchMedia("(prefers-reduced-motion: reduce)");
window.addEventListener("slate-contrast-error", () => {
  showToast("No se pudo adaptar el contraste de este fondo. Se conserva la presentación estándar.");
});

function renderAppearance(nextState) {
  const preferences = nextState.appearance;
  const layout = nextState.layout;
  if (!preferences || !layout) return;
  const renderKey = JSON.stringify([preferences, layout, nextState.systemTheme, nextState.systemHighContrast,
    nextState.systemAccentColor, nextState.pageTheme, nextState.backgroundVideoFile, nextState.backgroundVideos]);
  if (renderKey === lastAppearanceKey) return;
  lastAppearanceKey = renderKey;
  const root = document.documentElement;
  root.style.setProperty("--ui-font", window.SlateFonts.stack(preferences.fontFamily));
  root.style.setProperty("--heading-font", window.SlateFonts.stack(preferences.headingFont));
  for (const select of document.querySelectorAll("[data-font-preference]")) {
    if (document.activeElement !== select) select.value = preferences[select.dataset.fontPreference];
  }
  for (const [key, value] of Object.entries(preferences)) root.dataset[key] = value;
  root.style.setProperty("--system-accent", nextState.systemAccentColor || "#63795e");
  root.style.setProperty("--custom-accent", preferences.customAccent);
  root.dataset.theme = preferences.theme === "sistema" ? nextState.systemTheme : preferences.theme;
  root.dataset.contrast = preferences.contrast === "sistema"
    ? nextState.systemHighContrast ? "alto" : "normal"
    : preferences.contrast;
  root.dataset.platform = nextState.platform;
  window.SlateCompanionTheme.apply(root, window.SlateCompanionTheme.palette(preferences, root.dataset.theme === "oscuro", root.dataset.contrast === "alto"));
  root.style.setProperty("--chrome-opacity", `${preferences.chromeOpacity ?? 45}%`);
  const opacitySlider = document.getElementById("chrome-opacity");
  if (document.activeElement !== opacitySlider) opacitySlider.value = preferences.chromeOpacity ?? 45;
  opacitySlider.disabled = root.dataset.contrast === "alto";
  document.getElementById("chrome-opacity-value").value = `${opacitySlider.value}%`;
  window.SlateTitlebar?.render(nextState);
  const webTheme = nextState.pageTheme || {};
  const siteButton = document.getElementById("page-theme-site");
  siteButton.disabled = !webTheme.host || preferences.pageTheme === "original";
  siteButton.textContent = !webTheme.host ? "Abre una página web" :
    webTheme.enabled ? "Usar diseño original en este sitio" : "Adaptar este sitio a Slate";
  siteButton.title = webTheme.host || "";
  const themeStatus = document.getElementById("page-theme-status");
  const statusText = { adapted: "Colores adaptados", original: "Diseño original", error: "No se pudo adaptar esta página; puedes usar su diseño original", pending: "Aplicando tema…" };
  themeStatus.textContent = webTheme.host
    ? `${webTheme.host} · ${statusText[webTheme.status] || "Diseño original"}${webTheme.ephemeral ? " · Cambio temporal en esta pestaña fugaz" : ""}`
    : "Las excepciones se guardan solo en este dispositivo.";
  const clearThemeExceptions = document.getElementById("page-theme-clear-exceptions");
  clearThemeExceptions.hidden = !webTheme.exceptionCount;
  clearThemeExceptions.textContent = `Restablecer excepciones (${webTheme.exceptionCount || 0})`;
  const dynamicAccent = preferences.accent === "sistema"
    ? nextState.systemAccentColor
    : preferences.accent === "personalizado" ? preferences.customAccent : "";
  if (dynamicAccent) root.style.setProperty("--dynamic-accent", dynamicAccent);
  else root.style.removeProperty("--dynamic-accent");
  const colors = {
    chrome: preferences.chromeColor,
    toolbar: preferences.toolbarColor,
    surface: preferences.surfaceColor,
    canvas: preferences.canvasColor,
    tab: preferences.tabColor,
  };
  const themeColors = {
    chrome: { bg: "--chrome", ink: "--chrome-ink", muted: "--chrome-muted", line: "--chrome-line", quiet: "--chrome-quiet" },
    toolbar: { bg: "--toolbar-bg", ink: "--toolbar-ink", muted: "--toolbar-muted", line: "--toolbar-line", quiet: "--toolbar-quiet" },
    surface: { bg: "--surface", ink: "--surface-ink", muted: "--surface-muted", line: "--surface-line", quiet: "--surface-quiet" },
    canvas: { bg: "--canvas", ink: "--canvas-ink", muted: "--canvas-muted", line: "--canvas-line", quiet: "--canvas-quiet" },
    tab: { bg: "--tab-bg", ink: "--tab-ink", muted: "--tab-muted", line: "--tab-line", quiet: "--tab-quiet" },
  };
  for (const [zone, properties] of Object.entries(themeColors)) {
    let palette = root.dataset.contrast !== "alto" && preferences.colorMode === "propio" && /^#[0-9a-f]{6}$/i.test(colors[zone] || "")
      ? window.SlateTheme?.palette(colors[zone])
      : null;
    if (zone === "canvas" && preferences.backdrop === "slate" && root.dataset.contrast !== "alto") {
      palette = window.SlateTheme?.palette(root.dataset.theme === "oscuro" ? "#25282a" : "#ebe5da");
    }
    for (const [part, suffix] of Object.entries(properties)) {
      const variable = `--user-${zone}-${part}`;
      if (palette && palette[{ bg: "background", ink: "ink", muted: "muted", line: "line", quiet: "quiet" }[part]]) {
        root.style.setProperty(variable, palette[{ bg: "background", ink: "ink", muted: "muted", line: "line", quiet: "quiet" }[part]]);
      } else {
        root.style.removeProperty(variable);
      }
    }
  }
  for (const button of document.querySelectorAll("[data-color-mode]")) {
    button.setAttribute("aria-pressed", String((preferences.colorMode || "tema") === button.dataset.colorMode));
  }
  document.querySelectorAll("[data-appearance-color]").forEach((picker) => {
    const key = picker.dataset.appearanceColor;
    if (document.activeElement !== picker && /^#[0-9a-f]{6}$/i.test(preferences[key] || "")) picker.value = preferences[key];
    picker.disabled = (preferences.colorMode || "tema") !== "propio";
  });
  for (const [key, value] of Object.entries({
    "--chrome-height": layout.chromeHeight,
    "--titlebar-height": layout.titlebarHeight,
    "--tabs-height": layout.tabsHeight,
    "--toolbar-height": layout.toolbarHeight,
    "--bookmarks-bar-height": layout.bookmarksBarHeight,
    "--sidebar-width": layout.sidebarWidth,
    "--panel-width": layout.panelWidth,
  })) root.style.setProperty(key, `${value}px`);
  document.getElementById("tabs-list").setAttribute("aria-orientation", preferences.tabStyle === "vertical" ? "vertical" : "horizontal");
  for (const button of document.querySelectorAll("[data-preference]")) {
    const selected = String(preferences[button.dataset.preference]) === button.dataset.value;
    button.setAttribute("aria-pressed", String(selected));
  }
  const colorPicker = document.getElementById("custom-accent");
  if (document.activeElement !== colorPicker) colorPicker.value = preferences.customAccent;
  const backgroundName = document.getElementById("background-video-name");
  backgroundName.textContent = nextState.backgroundVideoName || "Sin vídeo elegido";
  document.getElementById("clear-background-video").hidden = !nextState.backgroundVideoFile || preferences.backdrop !== "video";
  const library = document.getElementById("background-video-library");
  const libraryKey = JSON.stringify(nextState.backgroundVideos || []);
  if (libraryKey !== lastVideoLibraryKey) {
    lastVideoLibraryKey = libraryKey;
    library.replaceChildren(new Option("Elige un vídeo guardado", ""));
    for (const item of nextState.backgroundVideos || []) library.append(new Option(item.name, item.fileName));
  }
  if (document.activeElement !== library) library.value = preferences.backdrop === "video" ? nextState.backgroundVideoFile || "" : "";
}

for (const button of document.querySelectorAll("[data-color-mode]")) {
  button.addEventListener("click", async () => {
    try {
      await window.brujula.setAppearance({ colorMode: button.dataset.colorMode });
    } catch (error) {
      showToast(error.message || "No se pudo guardar el modo de color.");
    }
  });
}
for (const select of document.querySelectorAll("[data-font-preference]")) {
  select.addEventListener("change", async () => {
    try { await window.brujula.setAppearance({ [select.dataset.fontPreference]: select.value }); }
    catch (error) { showToast(error.message || "No se pudo guardar la tipografía."); }
  });
}
for (const picker of document.querySelectorAll("[data-appearance-color]")) {
  picker.addEventListener("change", async () => {
    try {
      await window.brujula.setAppearance({
        colorMode: "propio",
        [picker.dataset.appearanceColor]: picker.value,
      });
    } catch (error) {
      showToast(error.message || "No se pudo guardar el color.");
    }
  });
}

function syncBackgroundVideo(nextState, onHomePage) {
  lastBackgroundState = nextState;
  lastBackgroundOnHome = onHomePage;
  const video = document.getElementById("home-background-video");
  const enabled = ["video", "slate"].includes(nextState.appearance?.backdrop) && Boolean(nextState.backgroundVideoUrl);
  const still = backgroundMotion.matches && Boolean(nextState.backgroundVideoPoster);
  video.poster = enabled ? nextState.backgroundVideoPoster || "" : "";
  const nextUrl = enabled && !still ? nextState.backgroundVideoUrl : "";
  if (nextUrl !== currentBackgroundVideoUrl) {
    video.pause();
    if (nextUrl) {
      video.src = nextUrl;
      video.load();
    } else {
      video.removeAttribute("src");
      video.load();
    }
    currentBackgroundVideoUrl = nextUrl;
  }
  const highContrast = document.documentElement.dataset.contrast === "alto";
  video.hidden = !enabled || !onHomePage || highContrast;
  const scrim = document.getElementById("home-background-scrim");
  if (scrim) scrim.hidden = true;
  video.muted = true;
  video.volume = 0;
  if (enabled && onHomePage && !highContrast && !document.hidden && !backgroundMotion.matches) {
    if (video.paused) video.play().catch(error => {
      if (error.name !== "AbortError") showToast("No se pudo reproducir el formato de vídeo elegido.");
    });
  } else {
    video.pause();
  }
}
for (const [target, event] of [[backgroundMotion, "change"], [document, "visibilitychange"]]) {
  target.addEventListener(event, () => { if (lastBackgroundState) syncBackgroundVideo(lastBackgroundState, lastBackgroundOnHome); });
}

const chromeOpacity = document.getElementById("chrome-opacity");
for (const [id, action] of [
  ["page-theme-site", () => window.brujula.togglePageThemeSite()],
  ["page-theme-clear-exceptions", () => window.brujula.resetPageThemeSites()],
]) {
  document.getElementById(id).addEventListener("click", async () => {
    try { await action(); }
    catch (error) { showToast(error.message || "No se pudo cambiar el tema de la página."); }
  });
}
chromeOpacity.addEventListener("input", () => {
  document.documentElement.style.setProperty("--chrome-opacity", `${chromeOpacity.value}%`);
  document.getElementById("chrome-opacity-value").value = `${chromeOpacity.value}%`;
});
chromeOpacity.addEventListener("change", async () => {
  try {
    await window.brujula.setAppearance({ chromeOpacity: Number(chromeOpacity.value) });
  } catch (error) {
    showToast(error.message || "No se pudo guardar la opacidad.");
    renderAppearance(await window.brujula.getState());
  }
});

for (const button of document.querySelectorAll("[data-preference]")) {
  button.addEventListener("click", async () => {
    const { preference, value } = button.dataset;
    try {
      if (preference === "backdrop" && value === "video") {
        const state = await window.brujula.getState();
        const saved = state.backgroundVideoFile || state.backgroundVideos?.at(-1)?.fileName;
        const selected = saved ? await window.brujula.selectBackgroundVideo(saved) : await window.brujula.chooseBackgroundVideo();
        if (selected) showToast("Fondo de vídeo guardado y silenciado.");
        return;
      }
      const parsedValue = ["bookmarksBar", "autoHideTitlebar"].includes(preference) ? value === "true" : value;
      await window.brujula.setAppearance({ [preference]: parsedValue });
    } catch (error) {
      showToast(error.message || "No se pudo guardar la apariencia. Inténtalo de nuevo.");
    }
  });
}
document.getElementById("custom-accent").addEventListener("change", async (event) => {
  try {
    await window.brujula.setAppearance({ accent: "personalizado", customAccent: event.target.value });
  } catch {
    showToast("No se pudo guardar el color.");
  }
});
document.getElementById("choose-background-video").addEventListener("click", async () => {
  try {
    const selected = await window.brujula.chooseBackgroundVideo();
    if (selected) showToast("Fondo de vídeo guardado y silenciado.");
  } catch (error) {
    showToast(error.message || "No se pudo cargar el vídeo.");
  }
});
document.getElementById("background-video-library").addEventListener("change", async (event) => {
  if (!event.target.value) return;
  try { await window.brujula.selectBackgroundVideo(event.target.value); }
  catch (error) { showToast(error.message || "No se pudo elegir el fondo."); }
});
document.getElementById("clear-background-video").addEventListener("click", async () => {
  try {
    await window.brujula.clearBackgroundVideo();
    showToast("Fondo desactivado. El vídeo sigue en tu biblioteca.");
  } catch (error) {
    showToast(error.message || "No se pudo quitar el vídeo.");
  }
});
document.getElementById("home-background-video").addEventListener("error", () => {
  showToast("No se pudo reproducir el formato de vídeo elegido.");
});
document.getElementById("reset-appearance").addEventListener("click", async () => {
  try {
    await window.brujula.resetAppearance();
    showToast("Apariencia restablecida. Tus datos de navegación se conservan.");
  } catch {
    showToast("No se pudo restablecer la apariencia.");
  }
});
