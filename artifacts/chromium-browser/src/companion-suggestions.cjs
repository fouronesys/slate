// Declarative, local rules. URL patterns indicate a kind of page, not its content.
// Examples are also fixtures: every rule must be reachable in the tests.
const rules = [];
function rule(key, action, label, text, when, example, meta = {}) {
  rules.push({ key, action, label, text, when, example, meta });
}
function page(key, host, pathname, text, example, action = "collect", label = "Guardar enlace") {
  rule(key, action, label, text, c => (host === null || host.test(c.url.hostname)) &&
    pathname.test(c.url.pathname) && (action === "bookmark" ? !c.saved : !c.collected), example);
}
const youtube = c => /^(www\.|m\.)?youtube\.com$/.test(c.url.hostname);
const video = c => (youtube(c) && ((c.url.pathname === "/watch" && c.url.searchParams.has("v")) ||
  /^\/shorts\/[^/]+/.test(c.url.pathname))) || (c.url.hostname === "youtu.be" && c.url.pathname.length > 1);
rule("youtube-video", "bookmark", "Guardar marcador", "¿Quieres guardar este vídeo para volver después?",
  c => video(c) && !c.saved, "https://www.youtube.com/watch?v=abc");
rule("youtube-focus", "focus", "Activar Enfoque", "¿Ocultamos recomendaciones y comentarios con Enfoque?",
  c => youtube(c) && video(c) && !c.settings.youtubeFocus, "https://www.youtube.com/watch?v=abc");
rule("youtube-playlist", "bookmark", "Guardar lista", "Esta dirección es una lista de YouTube. ¿La dejamos a mano?",
  c => youtube(c) && c.url.pathname === "/playlist" && c.url.searchParams.has("list") && !c.saved,
  "https://www.youtube.com/playlist?list=abc");
page("youtube-channel", /^(www\.|m\.)?youtube\.com$/, /^\/(@[^/]+|channel\/[^/]+)\/?$/, "¿Dejamos este canal en tus marcadores?", "https://www.youtube.com/@slate", "bookmark", "Guardar canal");
page("vimeo-video", /^(www\.)?vimeo\.com$/, /^\/\d+/, "¿Guardamos el enlace de este vídeo de Vimeo?", "https://vimeo.com/12345");
page("twitch-channel", /^(www\.)?twitch\.tv$/, /^\/[^/]+\/?$/, "¿Quieres volver a este canal de Twitch otro día?", "https://www.twitch.tv/slate", "bookmark", "Guardar canal");
page("twitch-clip", /^(clips\.twitch\.tv|www\.twitch\.tv)$/, /\/(clip\/)?[^/]+$/, "¿Añadimos este enlace de Twitch a Para después?", "https://clips.twitch.tv/example");
page("dailymotion-video", /^(www\.)?dailymotion\.com$/, /^\/video\//, "¿Conservamos el enlace de este vídeo?", "https://www.dailymotion.com/video/abc");
page("spotify-track", /^open\.spotify\.com$/, /^\/track\//, "¿Guardamos esta canción como enlace local?", "https://open.spotify.com/track/abc");
page("spotify-album", /^open\.spotify\.com$/, /^\/album\//, "¿Dejamos este álbum en tu colección local?", "https://open.spotify.com/album/abc");
page("spotify-playlist", /^open\.spotify\.com$/, /^\/playlist\//, "¿Guardamos el enlace de esta playlist?", "https://open.spotify.com/playlist/abc", "bookmark", "Guardar playlist");
page("soundcloud-track", /^(www\.)?soundcloud\.com$/, /^\/[^/]+\/[^/]+/, "¿Guardamos este enlace de SoundCloud para escucharlo después?", "https://soundcloud.com/artist/track");
page("bandcamp-album", /(^|\.)bandcamp\.com$/, /^\/album\//, "¿Añadimos este álbum de Bandcamp a Para después?", "https://artist.bandcamp.com/album/example");
page("podcast-episode", /^podcasts\.apple\.com$/, /\/podcast\//, "¿Guardamos este enlace de podcast?", "https://podcasts.apple.com/es/podcast/example/id123");
page("github-issue", /^github\.com$/, /^\/[^/]+\/[^/]+\/issues\/\d+/, "¿Quieres seguir esta incidencia más adelante?", "https://github.com/owner/repo/issues/12");
page("github-pull", /^github\.com$/, /^\/[^/]+\/[^/]+\/pull\/\d+/, "¿Dejamos esta propuesta de cambios en Para después?", "https://github.com/owner/repo/pull/12");
page("github-code", /^github\.com$/, /^\/[^/]+\/[^/]+\/blob\//, "¿Guardamos el enlace a este archivo de código?", "https://github.com/owner/repo/blob/main/app.js");
page("github-repo", /^github\.com$/, /^\/[^/]+\/[^/]+\/?$/, "¿Añadimos este repositorio a tus marcadores?", "https://github.com/owner/repo", "bookmark", "Guardar repositorio");
page("gitlab-issue", /^gitlab\.com$/, /\/-\/issues\/\d+/, "¿Conservamos el enlace de esta incidencia de GitLab?", "https://gitlab.com/owner/repo/-/issues/12");
page("stackoverflow-question", /(^|\.)stackoverflow\.com$/, /^\/questions\/\d+/, "¿Guardamos esta pregunta para consultarla después?", "https://stackoverflow.com/questions/123/example");
page("mdn-reference", /^developer\.mozilla\.org$/, /\/docs\//, "¿Dejamos esta referencia técnica a mano?", "https://developer.mozilla.org/es/docs/Web", "bookmark", "Guardar referencia");
page("npm-package", /^(www\.)?npmjs\.com$/, /^\/package\//, "¿Añadimos este paquete a Para después?", "https://www.npmjs.com/package/example");
page("wikipedia-article", /(^|\.)wikipedia\.org$/, /^\/wiki\/[^:]+$/, "¿Guardamos el enlace de este artículo de Wikipedia?", "https://es.wikipedia.org/wiki/Gato");
page("wikibooks-book", /(^|\.)wikibooks\.org$/, /^\/wiki\//, "¿Dejamos este libro de Wikibooks en tu colección?", "https://es.wikibooks.org/wiki/Ejemplo");
page("arxiv-paper", /^arxiv\.org$/, /^\/abs\//, "¿Guardamos la ficha de este artículo para leerla después?", "https://arxiv.org/abs/1234.5678");
page("doi-reference", /^doi\.org$/, /^\//, "¿Conservamos este enlace DOI como referencia?", "https://doi.org/10.1000/example");
page("coursera-course", /^(www\.)?coursera\.org$/, /^\/learn\//, "¿Dejamos este curso a mano para otra sesión?", "https://www.coursera.org/learn/example", "bookmark", "Guardar curso");
page("edx-course", /^(www\.)?edx\.org$/, /\/(learn|course)\//, "¿Guardamos el enlace de este curso de edX?", "https://www.edx.org/learn/example");
page("udemy-course", /^(www\.)?udemy\.com$/, /^\/course\//, "¿Añadimos este curso a Para después?", "https://www.udemy.com/course/example");
page("instructables-project", /^(www\.)?instructables\.com$/, /^\/[^/]+\/?$/, "¿Guardamos este proyecto para cuando quieras probarlo?", "https://www.instructables.com/example-project/");
page("recipe-page", null, /\/(recipes?|recetas?)\/[^/]+/i, "La dirección parece una receta. ¿Guardamos el enlace?", "https://example.com/recetas/pan");
page("etsy-listing", /^(www\.)?etsy\.com$/, /\/listing\/\d+/, "¿Guardamos este artículo de Etsy para compararlo después?", "https://www.etsy.com/listing/123/example");
page("ebay-item", /^(www\.)?ebay\.(com|es|co\.uk)$/, /^\/itm\//, "¿Dejamos este artículo en Para después, sin comprar nada?", "https://www.ebay.com/itm/123");
page("amazon-product", /^(www\.)?amazon\.(com|es|com\.mx|co\.uk)$/, /\/(dp|gp\/product)\//, "¿Guardamos este producto para compararlo con calma?", "https://www.amazon.com/dp/ABC");
page("ikea-product", /^(www\.)?ikea\.com$/, /\/p\//, "¿Añadimos este mueble a tu colección de enlaces?", "https://www.ikea.com/es/es/p/example-123/");
page("steam-game", /^store\.steampowered\.com$/, /^\/app\/\d+/, "¿Guardamos este juego como enlace para otro día?", "https://store.steampowered.com/app/123/example/");
page("itch-game", /(^|\.)itch\.io$/, /^\/[^/]+/, "¿Añadimos este juego de itch.io a Para después?", "https://creator.itch.io/game");
page("goodreads-book", /^(www\.)?goodreads\.com$/, /^\/book\/show\//, "¿Conservamos esta ficha de libro?", "https://www.goodreads.com/book/show/123");
page("openlibrary-book", /^openlibrary\.org$/, /^\/(works|books)\//, "¿Guardamos este libro de Open Library?", "https://openlibrary.org/works/OL123W");
page("imdb-title", /^(www\.)?imdb\.com$/, /^\/title\/tt\d+/, "¿Dejamos esta película o serie en Para después?", "https://www.imdb.com/title/tt12345/");
page("maps-place", /^(www\.)?google\.(com|es)$/, /^\/maps\/place\//, "¿Guardamos el enlace de este lugar? Solo si tú lo decides.", "https://www.google.com/maps/place/example");
page("maps-route", /^(www\.)?google\.(com|es)$/, /^\/maps\/dir\//, "¿Quieres conservar esta ruta como enlace local?", "https://www.google.com/maps/dir/example/destination");
page("openstreetmap", /^(www\.)?openstreetmap\.org$/, /^\/(node|way|relation)\/\d+/, "¿Dejamos este punto de OpenStreetMap a mano?", "https://www.openstreetmap.org/node/123");
page("figma-design", /^(www\.)?figma\.com$/, /^\/(design|file)\//, "¿Guardamos el enlace de este diseño sin copiar su contenido?", "https://www.figma.com/design/abc/example");
page("canva-design", /^(www\.)?canva\.com$/, /^\/design\//, "¿Añadimos este diseño a Para después?", "https://www.canva.com/design/abc/view");
page("google-document", /^docs\.google\.com$/, /^\/document\/d\//, "¿Dejamos este documento en tus marcadores locales?", "https://docs.google.com/document/d/abc/edit", "bookmark", "Guardar documento");
page("google-sheet", /^docs\.google\.com$/, /^\/spreadsheets\/d\//, "¿Guardamos un acceso a esta hoja de cálculo?", "https://docs.google.com/spreadsheets/d/abc/edit", "bookmark", "Guardar hoja");
page("google-slides", /^docs\.google\.com$/, /^\/presentation\/d\//, "¿Dejamos esta presentación a mano?", "https://docs.google.com/presentation/d/abc/edit", "bookmark", "Guardar presentación");
page("notion-page", /(^|\.)notion\.(so|site)$/, /^\/[^/]+/, "¿Guardamos el enlace de esta página de Notion?", "https://example.notion.site/page");
page("trello-board", /^trello\.com$/, /^\/b\//, "¿Dejamos este tablero en tus marcadores?", "https://trello.com/b/abc/example", "bookmark", "Guardar tablero");
page("pdf-bookmark", null, /\.pdf$/i, "Esta dirección termina en PDF. ¿Guardamos el enlace?", "https://example.com/manual.pdf", "bookmark", "Guardar PDF");
rule("pdf-zoom", "zoom-in", "Ampliar PDF", "¿Quieres ampliar este PDF un poco?",
  c => /\.pdf$/i.test(c.url.pathname) && c.meta.zoom <= 1, "https://example.com/manual.pdf", { zoom: 1 });
rule("zoom-large", "reset-zoom", "Restablecer zoom", "El zoom está por encima del 125 %. ¿Volvemos al tamaño normal?",
  c => c.meta.zoom > 1.25, "https://example.com", { zoom: 1.5 });
rule("zoom-small", "reset-zoom", "Restablecer zoom", "El zoom está por debajo del 80 %. ¿Volvemos al tamaño normal?",
  c => c.meta.zoom < .8, "https://example.com", { zoom: .67 });
rule("audio-playing", "mute", "Silenciar pestaña", "Esta pestaña está emitiendo sonido. ¿La silenciamos?",
  c => c.meta.audible && !c.meta.muted, "https://example.com", { audible: true });
rule("audio-muted", "unmute", "Restaurar sonido", "Esta pestaña está silenciada. ¿Quieres devolverle el sonido?",
  c => c.meta.muted, "https://example.com", { muted: true });
rule("many-tabs", "collect", "Guardar para después", "Hay al menos ocho pestañas abiertas en este espacio. ¿Guardamos esta para retomarla después?",
  c => c.meta.tabCount >= 8 && !c.collected, "https://example.com", { tabCount: 8 });
rule("duplicate-tab", "switch-duplicate", "Ir a la otra pestaña", "Esta misma dirección ya está abierta en otra pestaña. ¿Vamos a ella sin cerrar ninguna?",
  c => Boolean(c.meta.duplicateId), "https://example.com", { duplicateId: 2 });
rule("revisited-page", "bookmark", "Guardar marcador", "Esta dirección aparece varias veces en tu historial local. ¿La dejamos a mano?",
  c => c.meta.visits >= 3 && !c.saved, "https://example.com", { visits: 3 });
rule("anchored-link", "copy-link", "Copiar enlace", "Este enlace apunta a una sección concreta. ¿Lo copiamos con esa referencia?",
  c => c.url.hash.length > 1, "https://example.com/guide#chapter");
rule("search-private", "ephemeral", "Abrir como fugaz", "La dirección es una página de resultados. ¿La abres en una pestaña fugaz con sesión separada?",
  c => /^(www\.)?(google\.com|google\.es|bing\.com|duckduckgo\.com|search\.brave\.com)$/.test(c.url.hostname) &&
    c.url.searchParams.has("q"), "https://www.google.com/search?q=example");
rule("saved-page", "copy-link", "Copiar enlace", "Esta página ya está en tus marcadores. ¿Quieres copiar el enlace?",
  c => c.saved, "https://example.com", { saved: true });
rule("unsaved-page", "bookmark", "Guardar marcador", "¿Guardamos esta página para encontrarla después?",
  c => !c.saved, "https://example.com");
module.exports = { SUGGESTION_RULES: rules };
