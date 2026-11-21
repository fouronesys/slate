const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");
const { createFaviconFetcher } = require("../src/favicon-request.cjs");

test("native favicon transport exposes redirects without following or sending credentials", async () => {
  const session = {};
  let aborted = false;
  const fetch = createFaviconFetcher(options => {
    assert.equal(options.session, session);
    assert.equal(options.credentials, "omit");
    assert.equal(options.useSessionCookies, false);
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.redirect, "manual");
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => request.emit("redirect", 302, "GET", "https://cdn.test/icon"));
    request.abort = () => { aborted = true; request.emit("error", new Error("Redirect was cancelled")); request.emit("close"); };
    return request;
  }, session);
  const response = await fetch("https://site.test/icon", { signal: new AbortController().signal });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://cdn.test/icon");
  assert.equal(aborted, true);
});

test("native icon responses are streamed, not buffered before the size limit", async () => {
  const fetch = createFaviconFetcher(() => {
    const request = new EventEmitter();
    const response = Readable.from([Buffer.from("PNG")]);
    response.statusCode = 200;
    response.headers = { "content-type": ["image/png"], "content-length": ["3"] };
    response.on("end", () => request.emit("close"));
    request.end = () => queueMicrotask(() => request.emit("response", response));
    request.abort = () => { response.destroy(); request.emit("close"); };
    return request;
  }, {});
  const response = await fetch("https://site.test/icon", { signal: new AbortController().signal });
  assert.equal(response.ok, true);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(await new Response(response.body).text(), "PNG");
});

test("cancellation aborts the native request", async () => {
  let aborted = false;
  const controller = new AbortController();
  const fetch = createFaviconFetcher(() => {
    const request = new EventEmitter();
    request.end = () => {};
    request.abort = () => { aborted = true; request.emit("close"); };
    return request;
  }, {});
  const pending = fetch("https://site.test/icon", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /aborted/);
  assert.equal(aborted, true);
});
