// Fetch only icons announced by the page, using that tab's own session.
// The chrome receives bounded data URLs, never a remote URL or a favicon service.
const MAX_ICON_BYTES = 128 * 1024;
const IMAGE_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml",
]);

async function loadFavicon(urls, fetchIcon, signal) {
  for (const url of [...new Set(Array.isArray(urls) ? urls : [])].slice(0, 3)) {
    if (signal.aborted) return "";
    if (typeof url !== "string") continue;
    if (url.startsWith("data:")) {
      const type = /^data:([^;,]+)/i.exec(url)?.[1]?.toLowerCase();
      if (IMAGE_TYPES.has(type) && url.length <= MAX_ICON_BYTES) return url;
      continue;
    }
    if (!/^https?:\/\//i.test(url)) continue;
    let reader;
    try {
      const response = await fetchIcon(url, {
        signal, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
      });
      const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (!response.ok || !IMAGE_TYPES.has(type) ||
          Number(response.headers.get("content-length")) > MAX_ICON_BYTES) {
        await response.body?.cancel();
        continue;
      }
      reader = response.body?.getReader();
      if (!reader) continue;
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_ICON_BYTES) throw new Error("Favicon too large");
        chunks.push(Buffer.from(value));
      }
      if (size) return `data:${type};base64,${Buffer.concat(chunks).toString("base64")}`;
    } catch {
      // Missing/blocked/malformed icons are optional; the tab keeps its fallback.
    } finally {
      await reader?.cancel().catch(() => {});
    }
  }
  return "";
}

function clearFavicon(tab) {
  tab.faviconController?.abort();
  tab.faviconController = null;
  tab.faviconKey = "";
  tab.favicon = "";
}

async function updateFavicon(tab, urls, notify) {
  const contents = tab.view.webContents;
  if (!tab.url || contents.isDestroyed()) return;
  const key = JSON.stringify(urls);
  if (key === tab.faviconKey) return;
  clearFavicon(tab);
  tab.faviconKey = key;
  const controller = new AbortController();
  tab.faviconController = controller;
  const page = tab.url;
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const icon = await loadFavicon(urls, (url, options) => contents.session.fetch(url, options), controller.signal);
    if (!controller.signal.aborted && !contents.isDestroyed() && tab.url === page) {
      tab.favicon = icon;
      notify();
    }
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { loadFavicon, clearFavicon, updateFavicon, MAX_ICON_BYTES };
