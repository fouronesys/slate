(() => {
  "use strict";

  const categories = [
    { id: "navigation", label: "Navegación", description: "General y vídeos", sections: ["general", "videos"] },
    { id: "appearance", label: "Apariencia e inicio", description: "Tema, fondo y widgets", sections: ["appearance", "home"] },
    { id: "privacy", label: "Privacidad", description: "Protección y permisos del sitio", sections: ["privacy", "feature-privacy"] },
    { id: "library", label: "Biblioteca", description: "Marcadores, historial, descargas, colecciones y espacios", sections: ["bookmarks", "history", "downloads", "collections", "workspaces"] },
    { id: "information", label: "Información", description: "Comandos y documentos legales", sections: ["commands", "legal"] },
  ];

  const sectionLabels = {
    general: "General", videos: "Vídeos", appearance: "Apariencia", privacy: "Protección",
    bookmarks: "Marcadores", history: "Historial", downloads: "Descargas",
    collections: "Colecciones", workspaces: "Espacios", "feature-privacy": "Permisos del sitio",
    home: "Inicio y widgets", commands: "Comandos", legal: "Documentos legales",
  };

  const entries = [
    { section: "general", target: "#default-zoom", label: "Zoom predeterminado", terms: "zoom tamaño escala página acercar alejar" },
    { section: "general", target: "#background-tabs", label: "Pestañas en segundo plano", terms: "pestaña abrir enlaces nueva background" },
    { section: "general", target: "#search-engine", label: "Buscador predeterminado", terms: "buscador búsqueda google duckduckgo bing brave" },
    { section: "general", target: "#online-suggestions", label: "Sugerencias de búsqueda en línea", terms: "sugerencias privacidad búsqueda internet enviar texto" },
    { section: "general", target: "#automatic-updates", label: "Actualizaciones automáticas", terms: "actualizaciones actualizaciones automáticas actualizar versiones github" },
    { section: "general", target: "#check-app-update", label: "Buscar actualizaciones", terms: "actualizaciones comprobar buscar nueva versión" },
    { section: "videos", target: "#pip-button-enabled", label: "Botón de imagen en imagen", terms: "pip picture in picture imagen en imagen vídeo video flotante" },
    { section: "appearance", target: '[data-preference="theme"][data-value="claro"]', label: "Tema claro, oscuro o sistema", terms: "tema claro oscuro sistema apariencia" },
    { section: "appearance", target: "#custom-accent", label: "Color de acento personalizado", terms: "color acento personalizado propio" },
    { section: "appearance", target: "#video-backdrop-option", label: "Fondo de inicio", terms: "fondo fondos inicio papel niebla lienzo video vídeo wallpaper" },
    { section: "appearance", target: '[data-preference="contrast"][data-value="alto"]', label: "Contraste alto", terms: "contraste alto accesibilidad legibilidad" },
    { section: "appearance", target: '[data-preference="density"][data-value="cómoda"]', label: "Densidad de la interfaz", terms: "densidad cómoda compacta espaciado" },
    { section: "appearance", target: '[data-preference="pageTheme"][data-value="seguir"]', label: "Tema de las páginas", terms: "tema páginas seguir original adaptar fondos excepciones" },
    { section: "appearance", target: '[data-font-preference="fontFamily"]', label: "Fuente de la interfaz", terms: "fuente letra tipografía interfaz controles" },
    { section: "appearance", target: '[data-font-preference="headingFont"]', label: "Fuente de los títulos", terms: "fuente letra tipografía títulos inicio paneles" },
    { section: "appearance", target: '[data-preference="tabStyle"][data-value="superior"]', label: "Posición de las pestañas", terms: "pestañas arriba vertical lateral" },
    { section: "appearance", target: '[data-preference="newTabPosition"][data-value="final"]', label: "Posición del botón nueva pestaña", terms: "botón nueva pestaña antes después mas +" },
    { section: "appearance", target: '[data-preference="bookmarksBar"][data-value="true"]', label: "Barra de marcadores", terms: "barra marcadores mostrar ocultar favoritos" },
    { section: "appearance", target: '[data-preference="autoHideTitlebar"][data-value="true"]', label: "Ocultar la barra del logo", terms: "ocultar automáticamente barra título logo nombre" },
    { section: "appearance", target: "#chrome-opacity", label: "Transparencia de las barras", terms: "transparencia barras opacidad cristal" },
    { section: "appearance", target: "#chrome-color", label: "Colores de la ventana", terms: "colores ventana marco pestañas barra superficies personalizados" },
    { section: "appearance", target: "#background-video-library", label: "Vídeos de fondo guardados", terms: "vídeos fondo importados guardados biblioteca" },
    { section: "privacy", target: "#site-protection-toggle", label: "Protección de este sitio", terms: "protección escudo anuncios rastreadores sitio bloquear" },
    { section: "privacy", target: "#remember-history", label: "Guardar historial de navegación", terms: "historial guardar recordar navegación privacidad" },
    { section: "privacy", target: "#protected-video-enabled", label: "Vídeo protegido", terms: "widevine vídeo protegido componente instalación actualización" },
    { section: "feature-privacy", target: "#experience-settings", label: "Permisos del sitio", terms: "permisos sitio cámara micrófono ubicación notificaciones" },
    { section: "home", target: "#experience-settings", label: "Widgets de inicio", terms: "inicio widgets página principal organizar" },
    { section: "bookmarks", target: "#panel-items", label: "Marcadores guardados", terms: "marcadores favoritos biblioteca" },
    { section: "history", target: "#panel-items", label: "Historial de navegación", terms: "historial visitas páginas" },
    { section: "downloads", target: "#panel-items", label: "Descargas", terms: "descargas archivos biblioteca" },
    { section: "collections", target: "#experience-settings", label: "Colecciones", terms: "colecciones guardar organizar" },
    { section: "workspaces", target: "#experience-settings", label: "Espacios", terms: "espacios grupos pestañas" },
    { section: "commands", target: "#browser-commands", label: "Comandos del navegador", terms: "comandos atajos teclado acciones" },
    { section: "legal", target: "#legal-document", label: "Documentos legales", terms: "legal términos privacidad documentos" },
  ];

  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
  const categoryForSection = section => categories.find(category => category.sections.includes(section));
  const search = query => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return entries.filter(entry => {
      const haystack = normalize(`${entry.label} ${entry.terms} ${sectionLabels[entry.section] || ""}`);
      return words.every(word => haystack.includes(word));
    });
  };

  const api = { categories, sectionLabels, entries, categoryForSection, search };
  if (typeof window !== "undefined") window.SlateSettingsNavigation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
