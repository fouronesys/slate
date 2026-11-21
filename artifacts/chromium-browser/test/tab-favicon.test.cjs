const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadFavicon, clearFavicon, updateFavicon, refreshFavicon, MAX_ICON_BYTES } = require("../src/tab-favicon.cjs");
const signal = () => new AbortController().signal;

test("favicon uses the supplied session, omits credentials and returns a local image", async () => {
  const icon = await loadFavicon(["https://example.test/icon.png"], async (url, options) => {
    assert.equal(url, "https://example.test/icon.png");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "manual");
    return new Response(Buffer.from("PNG"), { headers: { "content-type": "image/png" } });
  }, signal());
  assert.equal(icon, "data:image/png;base64,UE5H");
});

test("redirected icons retain privacy options and reject unsafe targets and downgrades", async () => {
  const seen = [];
  const icon = await loadFavicon(["https://site.test/favicon"], async (url, options) => {
    seen.push(url);
    assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer");
    return seen.length === 1
      ? new Response(null, { status: 302, headers: { location: "https://cdn.test/logo.png" } })
      : new Response("PNG", { headers: { "content-type": "image/png" } });
  }, signal());
  assert.equal(icon, "data:image/png;base64,UE5H");
  assert.deepEqual(seen, ["https://site.test/favicon", "https://cdn.test/logo.png"]);
  for (const location of ["file:///private/icon", "http://site.test/icon", "https://user:pass@site.test/icon"]) {
    let calls = 0;
    assert.equal(await loadFavicon(["https://site.test/icon"], async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location } });
    }, signal()), "");
    assert.equal(calls, 1);
  }
});

test("redirect loops are bounded and alternate candidates still load", async () => {
  let calls = 0;
  const icon = await loadFavicon(["https://site.test/loop", "data:image/png;base64,UE5H"], async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: "/loop" } });
  }, signal());
  assert.equal(calls, 4);
  assert.equal(icon, "data:image/png;base64,UE5H");
});

test("binary favicons without an image MIME type are recognized, but HTML is not", async () => {
  const ico = Buffer.from("000001000100", "hex");
  assert.equal(await loadFavicon(["https://site.test/favicon.ico"], async () =>
    new Response(ico, { headers: { "content-type": "application/octet-stream" } }), signal()),
  `data:image/x-icon;base64,${ico.toString("base64")}`);
  assert.equal(await loadFavicon(["https://site.test/favicon.ico"], async () =>
    new Response("<html>error</html>", { headers: { "content-type": "application/octet-stream" } }), signal()), "");
});

function tabFor(fetchIcon) {
  return { url: "https://site.test/page", view: { webContents: {
    isDestroyed: () => false, session: { fetch: fetchIcon },
  } } };
}

test("failed replacements preserve the working icon and remain retryable with identical URLs", async t => {
  let failed = false, calls = 0, notifications = 0;
  const tab = tabFor(async () => {
    calls++;
    return failed ? new Response(null, { status: 503 }) : new Response("PNG", {
      headers: { "content-type": "image/png" },
    });
  });
  t.after(() => clearFavicon(tab));
  const notify = () => notifications++;
  await updateFavicon(tab, ["https://site.test/old.png"], notify);
  failed = true;
  await updateFavicon(tab, ["https://site.test/new.png"], notify);
  assert.equal(tab.favicon, "data:image/png;base64,UE5H");
  assert.equal(tab.faviconKey, "");
  assert.equal(notifications, 1);
  const before = calls;
  failed = false;
  await updateFavicon(tab, ["https://site.test/new.png"], notify);
  assert.ok(calls > before);
  assert.equal(notifications, 2);
});

test("empty icon events and duplicate in-flight requests do not erase or restart icons", async t => {
  let release, calls = 0;
  const tab = tabFor(() => { calls++; return new Promise(resolve => { release = resolve; }); });
  t.after(() => clearFavicon(tab));
  const pending = updateFavicon(tab, ["https://site.test/icon.png"], () => {});
  await updateFavicon(tab, ["https://site.test/icon.png"], () => {});
  assert.equal(calls, 1);
  release(new Response("PNG", { headers: { "content-type": "image/png" } }));
  await pending;
  await updateFavicon(tab, [], () => assert.fail("Empty event must not change the icon"));
  assert.equal(tab.favicon, "data:image/png;base64,UE5H");
  assert.equal(calls, 1);
});

test("a page without a declared icon gets only its own conventional favicon", async t => {
  const urls = [];
  const tab = tabFor(async url => {
    urls.push(url);
    return new Response("PNG", { headers: { "content-type": "image/png" } });
  });
  t.after(() => clearFavicon(tab));
  tab.view.webContents.executeJavaScriptInIsolatedWorld = async () => [];
  await refreshFavicon(tab, () => {});
  assert.deepEqual(urls, ["https://site.test/favicon.ico"]);
});

test("a temporary failure gets one automatic retry without another page event", async t => {
  let calls = 0, complete;
  const completed = new Promise(resolve => { complete = resolve; });
  const timeout = setTimeout(() => complete(false), 4000);
  const tab = tabFor(async () => ++calls <= 2
    ? new Response(null, { status: 503 })
    : new Response("PNG", { headers: { "content-type": "image/png" } }));
  t.after(() => { clearTimeout(timeout); clearFavicon(tab); });
  await updateFavicon(tab, ["https://site.test/icon.png"], () => complete(true));
  assert.equal(await completed, true);
  assert.equal(calls, 3);
});

test("favicon rejects active schemes, HTML and oversized bodies; tries the next announced icon", async () => {
  let requests = 0;
  const result = await loadFavicon(["javascript:alert(1)", "https://example.test/no", "data:image/png;base64,UE5H"],
    async () => { requests++; return new Response("<html>", { headers: { "content-type": "text/html" } }); }, signal());
  assert.equal(result, "data:image/png;base64,UE5H");
  assert.equal(requests, 1);
  assert.equal(await loadFavicon(["https://example.test/huge"], async () =>
    new Response(Buffer.alloc(MAX_ICON_BYTES + 1), { headers: { "content-type": "image/png" } }), signal()), "");
  assert.equal(await loadFavicon(["file:///private/icon.png"], () => assert.fail("No file access"), signal()), "");
});

test("navigation aborts pending icons and prevents stale site identity", async () => {
  let release;
  const tab = { url: "https://first.test", view: { webContents: {
    isDestroyed: () => false,
    session: { fetch: () => new Promise(resolve => { release = resolve; }) },
  } } };
  let notifications = 0;
  const request = updateFavicon(tab, ["https://first.test/icon"], () => notifications++);
  tab.url = "https://second.test";
  clearFavicon(tab);
  release(new Response("old", { headers: { "content-type": "image/png" } }));
  await request;
  assert.equal(tab.favicon, "");
  assert.equal(notifications, 0);
});
