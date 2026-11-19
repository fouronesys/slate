const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadFavicon, clearFavicon, updateFavicon, MAX_ICON_BYTES } = require("../src/tab-favicon.cjs");
const signal = () => new AbortController().signal;

test("favicon uses the supplied session, omits credentials and returns a local image", async () => {
  const icon = await loadFavicon(["https://example.test/icon.png"], async (url, options) => {
    assert.equal(url, "https://example.test/icon.png");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    return new Response(Buffer.from("PNG"), { headers: { "content-type": "image/png" } });
  }, signal());
  assert.equal(icon, "data:image/png;base64,UE5H");
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
