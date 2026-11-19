const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveAddress, cleanNavigation, isThirdParty, requestHeaders, responseHeaders,
} = require("../src/privacy-policy.cjs");
const { Protection } = require("../src/protection.cjs");

test("navigation uses HTTPS, removes known trackers and preserves video parameters", () => {
  assert.equal(
    resolveAddress("http://www.youtube.com/watch?v=abc&list=123&utm_source=share&fbclid=42"),
    "https://www.youtube.com/watch?v=abc&list=123",
  );
  assert.equal(resolveAddress("example.com"), "https://example.com");
  assert.equal(resolveAddress("privacidad web"), "https://www.google.com/search?q=privacidad%20web");
  const signed = "https://example.com/video?token=a%20b&signature=x%2Fy";
  assert.equal(cleanNavigation(signed).url, signed);
});

test("privileged schemes and embedded credentials are rejected", () => {
  for (const input of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,hi", "https://user:pass@example.com"]) {
    assert.equal(resolveAddress(input), null);
  }
});

test("third-party cookies use the public suffix list, including private domains", () => {
  assert.equal(isThirdParty("https://cdn.example.co.uk/a", "https://www.example.co.uk", "script"), false);
  assert.equal(isThirdParty("https://evil.co.uk/a", "https://example.co.uk", "script"), true);
  assert.equal(isThirdParty("https://one.github.io/a", "https://two.github.io", "script"), true);
  assert.equal(isThirdParty("https://other.test/a", "https://example.com", "mainFrame"), false);
  assert.equal(isThirdParty("https://other.test/a", "", "xhr"), true);
});

test("cookies are removed case-insensitively; GPC/DNT cannot be overridden", () => {
  const result = requestHeaders({ cOoKiE: "id=secret", dNt: "0", "sec-gpc": "0", Accept: "*/*" }, true);
  assert.deepEqual(result.headers, { Accept: "*/*", DNT: "1", "Sec-GPC": "1" });
  assert.equal(result.cookieBlocked, true);
  assert.equal(requestHeaders({ Cookie: "session=firstparty" }, false).headers.Cookie, "session=firstparty");
});

test("Set-Cookie filtering preserves CSP and other security headers", () => {
  const original = { "sEt-CoOkIe": ["id=tracker"], "Content-Security-Policy": ["default-src 'self'"] };
  const result = responseHeaders(original, true);
  assert.deepEqual(result.headers, { "Content-Security-Policy": ["default-src 'self'"] });
  assert.deepEqual(responseHeaders(original, false).headers, original);
  assert.equal(original["sEt-CoOkIe"][0], "id=tracker");
});

function setup() {
  const hooks = {};
  const fakeSession = {
    webRequest: Object.fromEntries(
      ["onBeforeRequest", "onBeforeSendHeaders", "onHeadersReceived"].map((key) => [
        key, (_filter, listener) => { hooks[key] = listener; },
      ]),
    ),
  };
  const protection = new Protection(fakeSession, "/tmp/unused", () => {});
  protection.topUrl = () => "https://example.com";
  const run = (name, details) => {
    let result;
    let calls = 0;
    hooks[name]({ webContentsId: 4, ...details }, (value) => { result = value; calls += 1; });
    assert.equal(calls, 1);
    return result;
  };
  return { protection, run };
}

test("navigation fails closed until an engine is loaded", () => {
  const { run } = setup();
  assert.equal(run("onBeforeRequest", { url: "https://example.com", resourceType: "mainFrame" }).cancel, true);
});

test("network pipeline composes adblocking, counters and first-party context", () => {
  const { protection, run } = setup();
  protection.engine = {
    onBeforeRequest(details, callback) {
      assert.equal(details.referrer, "https://example.com");
      callback({ cancel: true });
    },
  };
  assert.equal(run("onBeforeRequest", { url: "https://ads.test/a", resourceType: "script" }).cancel, true);
  assert.equal(protection.counts(4).blocked, 1);
});

test("OPTIONS filter redirects fail closed without entering Electron's crashing native redirect path", () => {
  const { protection, run } = setup();
  const original = { redirectURL: "data:application/javascript,void%200" };
  protection.engine = { onBeforeRequest(_details, callback) { callback(original); } };
  assert.deepEqual(run("onBeforeRequest", {
    url: "https://ads.test/a", method: "OPTIONS", resourceType: "xhr",
  }), { cancel: true });
  assert.deepEqual(original, { redirectURL: "data:application/javascript,void%200" });
  assert.equal(protection.counts(4).blocked, 1);
  for (const method of ["GET", "POST"]) {
    assert.deepEqual(run("onBeforeRequest", {
      url: "https://ads.test/a", method, resourceType: "xhr",
    }), original, `${method} redirects must not be disabled`);
  }
});

test("unmatched OPTIONS requests remain allowed and existing cancellations remain blocked", () => {
  const { protection, run } = setup();
  protection.engine = { onBeforeRequest(_details, callback) { callback({}); } };
  const details = { url: "https://api.test/a", method: "OPTIONS", resourceType: "xhr" };
  assert.deepEqual(run("onBeforeRequest", details), {});
  assert.equal(protection.counts(4).blocked, 0);
  protection.engine.onBeforeRequest = (_details, callback) => callback({ cancel: true });
  assert.deepEqual(run("onBeforeRequest", details), { cancel: true });
  assert.equal(protection.counts(4).blocked, 1);
});

test("HTTPS/clean-link redirects also cannot redirect OPTIONS", () => {
  const { protection, run } = setup();
  protection.engine = {};
  assert.deepEqual(run("onBeforeRequest", {
    url: "http://example.com/?utm_source=test", method: "OPTIONS", resourceType: "mainFrame",
  }), { cancel: true });
});

test("site exceptions pause ads only, never cookie protections", () => {
  const { protection, run } = setup();
  protection.engine = { onBeforeRequest() { assert.fail("exception must bypass adblock"); } };
  protection.exceptions.add("example.com");
  assert.deepEqual(run("onBeforeRequest", { url: "https://ads.test/a", resourceType: "script" }), {});
  const headers = run("onBeforeSendHeaders", {
    url: "https://ads.test/a", resourceType: "xhr", requestHeaders: { Cookie: "id=x" },
  });
  assert.equal(headers.requestHeaders.Cookie, undefined);
  assert.equal(headers.requestHeaders["Sec-GPC"], "1");
});

test("header pipeline retains engine CSP and strips third-party cookie writes", () => {
  const { protection, run } = setup();
  protection.engine = {
    onHeadersReceived(details, callback) {
      callback({ responseHeaders: { ...details.responseHeaders, "content-security-policy": ["script-src 'self'"] } });
    },
  };
  const output = run("onHeadersReceived", {
    url: "https://ads.test/a", resourceType: "xhr", responseHeaders: { "Set-Cookie": ["id=x"] },
  });
  assert.equal(output.responseHeaders["Set-Cookie"], undefined);
  assert.deepEqual(output.responseHeaders["content-security-policy"], ["script-src 'self'"]);
  assert.equal(protection.counts(4).cookieHeaders, 1);
});

test("HTTPS upgrading cannot be disabled via site exceptions", () => {
  const { protection, run } = setup();
  protection.engine = {};
  protection.exceptions.add("example.com");
  const result = run("onBeforeRequest", {
    url: "http://example.com/?utm_source=test&x=1", resourceType: "mainFrame",
  });
  assert.equal(result.redirectURL, "https://example.com/?x=1");
  assert.equal(protection.counts(4).cleanedLinks, 1);
});
