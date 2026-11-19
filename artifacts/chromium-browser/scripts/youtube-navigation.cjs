// loadURL may reject ERR_ABORTED when YouTube starts a replacement navigation.
// That is not proof of a failed page OR a successful load: wait for a committed,
// finished target page, retaining the deadline and real navigation failures.
function isExpectedPage(value, target) {
  try {
    const url = new URL(value);
    const expected = new URL(target);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (url.hostname === "consent.youtube.com") return true;
    return url.hostname === expected.hostname && url.pathname === "/watch" &&
      url.searchParams.get("v") === expected.searchParams.get("v");
  } catch {
    return false;
  }
}

function loadYouTube(contents, target, timeout = 45000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let aborted = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      contents.removeListener("did-finish-load", onLoaded);
      contents.removeListener("did-fail-load", onFailed);
      contents.removeListener("destroyed", onDestroyed);
      if (error) reject(error);
      else resolve({ url: contents.getURL(), replacementNavigation: aborted });
    };
    const onLoaded = () => {
      if (settled) return;
      const url = contents.getURL();
      if (!url || url === "about:blank") return;
      if (!isExpectedPage(url, target)) {
        finish(new Error("YouTube finished on an unexpected page."));
      } else if (!contents.isLoadingMainFrame()) {
        finish();
      }
    };
    const onFailed = (_event, code, description, _url, isMainFrame) => {
      if (settled || !isMainFrame) return;
      if (code === -3) aborted = true;
      else finish(new Error(`YouTube navigation failed: ${description} (${code})`));
    };
    const onDestroyed = () => finish(new Error("YouTube window was closed before navigation finished."));
    const timer = setTimeout(() => {
      finish(new Error(aborted
        ? "YouTube replacement navigation did not finish before the deadline."
        : "YouTube navigation did not finish before the deadline."));
    }, timeout);
    contents.on("did-finish-load", onLoaded);
    contents.on("did-fail-load", onFailed);
    contents.on("destroyed", onDestroyed);
    try {
      Promise.resolve(contents.loadURL(target)).then(onLoaded, (error) => {
        if (settled) return;
        if (error.code === "ERR_ABORTED" || error.errno === -3) aborted = true;
        else finish(error);
      });
    } catch (error) {
      finish(error);
    }
  });
}

module.exports = { loadYouTube, isExpectedPage };
