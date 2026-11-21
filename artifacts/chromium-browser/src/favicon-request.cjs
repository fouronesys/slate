// Native transport injected by main. No Electron import in pure favicon logic.
const { Readable } = require("node:stream");

function createFaviconFetcher(requestFactory, session) {
  return (url, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Favicon aborted"));
    let settled = false;
    const request = requestFactory({
      url, session, redirect: "manual", credentials: "omit",
      useSessionCookies: false, referrerPolicy: "no-referrer",
    });
    const cleanup = () => signal.removeEventListener("abort", abort);
    const fail = error => { if (!settled) { settled = true; reject(error); } };
    const abort = () => {
      fail(new Error("Favicon aborted"));
      request.abort();
      cleanup();
    };
    signal.addEventListener("abort", abort, { once: true });
    request.once("error", error => { fail(error); cleanup(); });
    request.once("close", cleanup);
    request.on("redirect", (status, _method, location) => {
      // Electron's fetch(manual) rejects rather than exposing the Location.
      // Expose it to the bounded, validated redirect loop instead.
      if (settled) return;
      settled = true;
      resolve(new Response(null, { status, headers: { location } }));
      cleanup();
      request.abort();
    });
    request.once("response", response => {
      if (settled) return;
      try {
        const headers = new Headers();
        for (const name of ["content-type", "content-length"]) {
          const value = response.headers[name];
          if (value) headers.set(name, Array.isArray(value) ? value[0] : value);
        }
        const body = Readable.toWeb(response);
        response.once("aborted", () => response.destroy(new Error("Favicon aborted")));
        settled = true;
        resolve({ status: response.statusCode, ok: response.statusCode >= 200 && response.statusCode < 300, headers, body });
      } catch (error) {
        fail(error);
        request.abort();
        cleanup();
      }
    });
    request.end();
  });
}

module.exports = { createFaviconFetcher };
