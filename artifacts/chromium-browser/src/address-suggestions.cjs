(function (root) {
  "use strict";

  // Bundled recommendations, not a claim about this person's browsing history.
  const KNOWN_SITES = Object.freeze([
    ["YouTube", "https://www.youtube.com/"], ["Google", "https://www.google.com/"],
    ["Wikipedia", "https://es.wikipedia.org/"], ["Gmail", "https://mail.google.com/"],
    ["WhatsApp", "https://web.whatsapp.com/"], ["Amazon", "https://www.amazon.com/"],
    ["Instagram", "https://www.instagram.com/"], ["Facebook", "https://www.facebook.com/"],
    ["Netflix", "https://www.netflix.com/"], ["Disney+", "https://www.disneyplus.com/"],
    ["Spotify", "https://open.spotify.com/"], ["Reddit", "https://www.reddit.com/"],
    ["GitHub", "https://github.com/"], ["ChatGPT", "https://chatgpt.com/"],
    ["Outlook", "https://outlook.live.com/"], ["Apple", "https://www.apple.com/"],
    ["Microsoft", "https://www.microsoft.com/"], ["Bing", "https://www.bing.com/"],
    ["DuckDuckGo", "https://duckduckgo.com/"], ["Brave Search", "https://search.brave.com/"],
  ].map(([title, url]) => Object.freeze({ title, url })));

  function webAddress(value) {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url : null;
    } catch { return null; }
  }

  function visits(value) {
    return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 1000000) : 1;
  }

  function historyEntry(tab, previous, now = new Date().toISOString()) {
    return { title: tab.title, url: tab.url, visitedAt: now,
      visitCount: Math.min(1000000, (previous ? visits(previous.visitCount) : 0) + 1) };
  }

  function completionFor(query, url) {
    if (!query || /\s/.test(query) || !webAddress(url)) return null;
    const candidates = [url, url.replace(/^https?:\/\//i, ""), url.replace(/^https?:\/\/www\./i, "")];
    return candidates.find(value => value.length > query.length &&
      value.toLowerCase().startsWith(query.toLowerCase())) || null;
  }

  function suggest(query, { history = [], bookmarks = [], ephemeral = false, knownSites = true } = {}) {
    const text = String(query || "").trim().toLowerCase().slice(0, 2048);
    const entries = new Map();
    for (const [source, items] of [
      ["Historial", ephemeral ? [] : history], ["Marcador", ephemeral ? [] : bookmarks],
      ["Sitio conocido", knownSites ? KNOWN_SITES : []],
    ]) {
      for (const item of items) {
        const parsed = webAddress(item.url);
        if (!parsed) continue;
        const key = parsed.href;
        const old = entries.get(key);
        if (old && source === "Sitio conocido") continue;
        const date = Date.parse(item.visitedAt);
        entries.set(key, {
          url: key, title: String(item.title || old?.title || parsed.hostname).slice(0, 200),
          source: source === "Marcador" || old?.source === "Marcador" ? "Marcador" : source,
          count: Math.max(old?.count || 0, source === "Historial" ? visits(item.visitCount) : 0),
          recent: Math.max(old?.recent || 0, Number.isFinite(date) ? date : 0),
        });
      }
    }
    return [...entries.values()].map(item => {
      const url = item.url.toLowerCase();
      const prefix = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
      const match = text && (url.startsWith(text) || prefix.startsWith(text) ||
        url.replace(/^https?:\/\//, "").startsWith(text));
      return { ...item, prefix: Boolean(match) };
    }).filter(item => !text || item.url.toLowerCase().includes(text) ||
      item.title.toLowerCase().includes(text))
      .sort((a, b) => Number(b.prefix) - Number(a.prefix) || b.count - a.count ||
        b.recent - a.recent || Number(b.source === "Marcador") - Number(a.source === "Marcador") ||
        a.url.localeCompare(b.url))
      .slice(0, 6);
  }

  // Native web content sits above the HTML chrome. Reserve space so that the
  // local suggestion list stays visible and clickable on an already-open page.
  function reserveSpace(bounds, requested) {
    const extra = Math.max(0, Math.min(440, Number(requested) || 0, Math.max(0, bounds.height - 80)));
    return { ...bounds, y: bounds.y + Math.ceil(extra), height: bounds.height - Math.ceil(extra) };
  }

  const api = { suggest, completionFor, historyEntry, reserveSpace, KNOWN_SITES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SlateAddressSuggestions = api;
})(typeof window !== "undefined" ? window : globalThis);
