const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SearchSuggestions, suggestionUrl, parseSuggestions } = require("../src/search-suggestions.cjs");
const { eligibleQuery } = require("../src/suggestion-policy.cjs");
const json = (value, init) => new Response(JSON.stringify(value), init);

test("online queries require consent and never run in ephemeral tabs or for URL/credential patterns", async () => {
  const service = new SearchSuggestions({ fetch: () => assert.fail("must not fetch") });
  for (const input of [
    { query: "youtube", enabled: false }, { query: "youtube", enabled: true, ephemeral: true },
    ...["x", "https://example.com/private", "localhost:3000", "a@b.com", "192.168.1.1",
      "/private/file", "C:\\secret", "token mytoken", "password abc", "secret123",
      "a".repeat(41), "a".repeat(101), "abc\nprivate"].map(query => ({ query, enabled: true })),
  ]) {
    assert.equal((await service.get({ engine: "google", ...input })).status, "disabled", JSON.stringify(input));
  }
  for (const query of ["you", "youtube music", "cómo dibujar", "¿qué es la luna?"]) {
    assert.equal(eligibleQuery(query), true, query);
  }
});

test("each selected provider has its own fixed HTTPS endpoint and expected response shape", () => {
  for (const [engine, hostname, key] of [
    ["google", "suggestqueries.google.com", "q"], ["duckduckgo", "duckduckgo.com", "q"],
    ["bing", "www.bing.com", "qry"], ["brave", "search.brave.com", "q"],
  ]) {
    const url = new URL(suggestionUrl(engine, "café con leche"));
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, hostname);
    assert.equal(url.searchParams.get(key), "café con leche");
  }
  assert.throws(() => suggestionUrl("__proto__", "youtube"));
  assert.deepEqual(parseSuggestions("bing", { s: [{ q: "\ue000you\ue001tube" }] }), ["youtube"]);
  assert.deepEqual(parseSuggestions("google", ["you", ["youtube", "youtube", null, "", "a\u0000b", "x".repeat(201)]]), ["youtube"]);
  assert.throws(() => parseSuggestions("brave", {}));
});

test("requests omit credentials, caches and referrers and use only the selected provider", async () => {
  const requests = [];
  const service = new SearchSuggestions({ fetch: async (url, options) => {
    requests.push({ url, options });
    return json(["you", ["youtube music"]]);
  } });
  const result = await service.get({ query: "you", engine: "duckduckgo", enabled: true });
  assert.deepEqual(result, { status: "ok", items: ["youtube music"], provider: "DuckDuckGo" });
  assert.equal(requests.length, 1);
  const { options } = requests[0];
  for (const [key, value] of Object.entries({
    credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
  })) assert.equal(options[key], value);
  assert.deepEqual(options.headers, { Accept: "application/json" });
});

test("errors, malformed data and oversized responses report unavailability without another provider", async () => {
  for (const makeResponse of [
    () => new Response(null, { status: 429 }), () => new Response(null, { status: 204 }),
    () => json({ html: "unexpected" }), () => new Response("not json"),
    () => json([], { headers: { "content-length": "65537" } }),
    () => new Response("x".repeat(65537)),
  ]) {
    let calls = 0;
    const service = new SearchSuggestions({ fetch: async () => { calls++; return makeResponse(); } });
    const result = await service.get({ query: "you", engine: "brave", enabled: true });
    assert.equal(result.status, "error");
    assert.match(result.message, /Brave Search/);
    assert.deepEqual(result.items, []);
    assert.equal(calls, 1);
  }
});

test("cancel, a newer query, disabling suggestions and timeouts abort outstanding requests", async () => {
  const calls = [];
  const service = new SearchSuggestions({ fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
    calls.push(signal);
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }), timeoutMs: 15 });
  const first = service.get({ query: "you", engine: "google", enabled: true });
  const second = service.get({ query: "youtube", engine: "google", enabled: true });
  assert.equal((await first).status, "cancelled");
  assert.equal(calls[0].aborted, true);
  const disabled = service.get({ query: "youtube", engine: "google", enabled: false });
  assert.equal((await second).status, "cancelled");
  assert.equal((await disabled).status, "disabled");
  const timeout = await service.get({ query: "youtube", engine: "google", enabled: true });
  assert.equal(timeout.status, "error");
  assert.equal(calls.at(-1).aborted, true);
});
