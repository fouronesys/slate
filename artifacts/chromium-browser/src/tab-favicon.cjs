// Fetch page icons or its own conventional favicon, using that tab's session.
// The chrome receives bounded data URLs, never a remote URL or a favicon service.
const MAX_ICON_BYTES = 128 * 1024;
const MAX_ICON_CANDIDATES = 6;
const REQUEST_TIMEOUT = 2500;
const IMAGE_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "image/x-icon", "image/vnd.microsoft.icon", "image/ico", "image/icon", "image/svg+xml",
]);

function safeIconUrl(value, previous) {
  try {
    const url = new URL(value, previous);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        (previous && new URL(previous).protocol === "https:" && url.protocol !== "https:")) return "";
    url.hash = "";
    return url.href;
  } catch { return ""; }
}

function candidates(urls, page) {
  const valid = [...new Set(urls.filter(url => typeof url === "string")
    .map(url => url.startsWith("data:") ? url : safeIconUrl(url, page)).filter(Boolean))].slice(0, MAX_ICON_CANDIDATES - 1);
  const fallback = safeIconUrl("/favicon.ico", page);
  if (fallback && !valid.includes(fallback)) valid.push(fallback);
  return valid;
}

function binaryImageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.length >= 6 && bytes.readUInt32LE(0) === 0x00010000) return "image/x-icon";
  return "";
}

async function loadFavicon(urls, fetchIcon, signal) {
  for (const url of [...new Set(Array.isArray(urls) ? urls : [])].slice(0, MAX_ICON_CANDIDATES)) {
    if (signal.aborted) return "";
    if (typeof url !== "string") continue;
    if (url.startsWith("data:")) {
      const type = /^data:([^;,]+)/i.exec(url)?.[1]?.toLowerCase();
      if (IMAGE_TYPES.has(type) && url.length <= MAX_ICON_BYTES) return url;
      continue;
    }
    if (!safeIconUrl(url)) continue;
    let reader;
    const request = new AbortController();
    const abort = () => request.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, REQUEST_TIMEOUT);
    try {
      let current = url, response;
      for (let hop = 0; hop <= 3; hop++) {
        if (signal.aborted || request.signal.aborted) throw new Error("Favicon aborted");
        response = await fetchIcon(current, {
          signal: request.signal, credentials: "omit", redirect: "manual", referrerPolicy: "no-referrer",
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        await response.body?.cancel();
        const next = location && safeIconUrl(location, current);
        if (!next || hop === 3) throw new Error("Unsafe favicon redirect");
        current = next;
      }
      const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      const needsDetection = !type || type === "application/octet-stream" || type === "binary/octet-stream";
      if (!response.ok || (!IMAGE_TYPES.has(type) && !needsDetection) ||
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
      const bytes = Buffer.concat(chunks);
      const imageType = needsDetection ? binaryImageType(bytes) : type;
      if (size && imageType && !request.signal.aborted && !signal.aborted)
        return `data:${imageType};base64,${bytes.toString("base64")}`;
    } catch {
      // Missing/blocked/malformed icons are optional; the tab keeps its fallback.
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      await reader?.cancel().catch(() => {});
    }
  }
  return "";
}

function clearFavicon(tab) {
  clearTimeout(tab.faviconRetryTimer);
  tab.faviconRetryTimer = null;
  tab.faviconController?.abort();
  tab.faviconController = null;
  tab.faviconKey = "";
  tab.favicon = "";
}

async function updateFavicon(tab, urls, notify, allowRetry = true) {
  const contents = tab.view.webContents;
  if (!tab.url || contents.isDestroyed() || !Array.isArray(urls) || !urls.length) return;
  const icons = candidates(urls, tab.url);
  const key = JSON.stringify(icons);
  if (key === tab.faviconKey) return;
  clearTimeout(tab.faviconRetryTimer);
  tab.faviconRetryTimer = null;
  tab.faviconController?.abort();
  tab.faviconKey = key;
  const controller = new AbortController();
  tab.faviconController = controller;
  const page = tab.url;
  // Give later alternatives a chance even when earlier candidates time out.
  const timer = setTimeout(() => controller.abort(), MAX_ICON_CANDIDATES * REQUEST_TIMEOUT + 1000);
  let received = false;
  try {
    const icon = await loadFavicon(icons, tab.fetchFavicon ||
      ((url, options) => contents.session.fetch(url, options)), controller.signal);
    if (!controller.signal.aborted && tab.faviconController === controller &&
        !contents.isDestroyed() && tab.url === page) {
      if (icon) {
        received = true;
        tab.favicon = icon;
        notify();
      }
    }
  } finally {
    clearTimeout(timer);
    if (tab.faviconController === controller) {
      tab.faviconController = null;
      // Only successful requests are cached. A failure must remain retryable.
      if (!received) {
        tab.faviconKey = "";
        if (allowRetry && !contents.isDestroyed() && tab.url === page) {
          tab.faviconRetryTimer = setTimeout(() => {
            tab.faviconRetryTimer = null;
            if (!contents.isDestroyed() && tab.url === page) void updateFavicon(tab, urls, notify, false);
          }, 800);
          tab.faviconRetryTimer.unref?.();
        }
      }
    }
  }
}

async function refreshFavicon(tab, notify) {
  const contents = tab.view.webContents, page = tab.url;
  if (!safeIconUrl(page) || contents.isDestroyed()) return;
  try {
    const urls = await contents.executeJavaScriptInIsolatedWorld(999, [{
      code: 'Array.from(document.querySelectorAll(\'link[rel~="icon"]\')).slice(0,20).map(link=>link.href)',
    }]);
    if (contents.isDestroyed() || tab.url !== page) return;
    await updateFavicon(tab, Array.isArray(urls) && urls.length ? urls : [new URL("/favicon.ico", page).href], notify);
  } catch {
    // A document may disappear during navigation; never revive its old icon.
  }
}

module.exports = { loadFavicon, clearFavicon, updateFavicon, refreshFavicon, MAX_ICON_BYTES };
