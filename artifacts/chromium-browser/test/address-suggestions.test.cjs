const { test } = require("node:test");
const assert = require("node:assert/strict");
const { suggest, completionFor, historyEntry, reserveSpace } = require("../src/address-suggestions.cjs");

const entry = (url, visitCount = 1, title = "Página", visitedAt = "2026-11-18T08:00:00Z") =>
  ({ url, visitCount, title, visitedAt });

test("frequent links rank before recent ones and legacy history remains usable", () => {
  const history = [entry("https://recent.test", 1), entry("https://frequent.test", 8, "Frecuente", "2026-01-01"),
    { url: "https://legacy.test", title: "Anterior" }];
  assert.deepEqual(suggest("", { history, knownSites: false }).map(item => item.url),
    ["https://frequent.test/", "https://recent.test/", "https://legacy.test/"]);
});

test("URL prefix ranks before title matches and matching is case insensitive", () => {
  const history = [entry("https://other.test", 100, "YouTube"),
    entry("https://www.youtube.com/watch?v=1", 2)];
  assert.equal(suggest("You", { history })[0].url, "https://www.youtube.com/watch?v=1");
});

test("deduplicates bookmarks and history, keeps visit frequency, and limits results", () => {
  const history = Array.from({ length: 12 }, (_, n) => entry(`https://site${n}.test`, n + 1));
  const result = suggest("", { history, bookmarks: [{ url: "https://site11.test", title: "Guardado" }] });
  assert.equal(result.length, 6);
  assert.equal(result[0].source, "Marcador");
  assert.equal(result[0].count, 12);
  assert.equal(result.filter(item => item.url === "https://site11.test/").length, 1);
});

test("never suggests credential URLs, executable schemes, local files or other workspaces", () => {
  const history = ["javascript:alert(1)", "file:///private/key", "data:text/html,secret",
    "https://user:password@example.test/", "ftp://example.test"].map(url => entry(url));
  assert.deepEqual(suggest("", { history, knownSites: false }), []);
  assert.deepEqual(suggest("other-workspace", { history: [entry("https://current.test")] }), []);
  assert.deepEqual(suggest("private", { history: [entry("https://private.test")], ephemeral: true }), []);
});

test("known sites suggest and complete YouTube on a fresh profile, without fabricating personal history", () => {
  const results = suggest("you");
  assert.equal(results[0].url, "https://www.youtube.com/");
  assert.equal(results[0].source, "Sitio conocido");
  assert.equal(completionFor("you", results[0].url), "youtube.com/");
  assert.equal(suggest("gmail")[0].url, "https://mail.google.com/");
  const personal = suggest("you", { history: [entry("https://www.youtube.com/", 7)] });
  assert.equal(personal.filter(item => item.url === results[0].url).length, 1);
  assert.equal(personal[0].source, "Historial");
  assert.equal(personal[0].count, 7);
  const privateResults = suggest("you", { history: [entry("https://private.test")], ephemeral: true });
  assert.equal(privateResults[0].source, "Sitio conocido");
});

test("completes only URL prefixes and handles schemes, www, paths and whitespace", () => {
  const url = "https://www.example.test/article";
  assert.equal(completionFor("exa", url), "example.test/article");
  assert.equal(completionFor("www.exa", url), "www.example.test/article");
  assert.equal(completionFor("https://www.ex", url), url);
  assert.equal(completionFor("example.test/ar", url), "example.test/article");
  assert.equal(completionFor("some words", url), null);
  assert.equal(completionFor("article", url), null);
  assert.equal(completionFor("ja", "javascript:alert(1)"), null);
  assert.equal(completionFor("", url), null);
});

test("visits persist without changing the old history entry and count legacy entries", () => {
  const tab = { title: "Nueva", url: "https://example.test" };
  const old = entry(tab.url, 7);
  assert.equal(historyEntry(tab, old).visitCount, 8);
  assert.equal(old.visitCount, 7);
  assert.equal(historyEntry(tab, { url: tab.url }).visitCount, 2);
  assert.equal(historyEntry(tab).visitCount, 1);
  assert.equal(historyEntry(tab, { visitCount: Infinity }).visitCount, 2);
});

test("native content reserves space for suggestions and restores original bounds", () => {
  const bounds = { x: 0, y: 130, width: 1200, height: 700 };
  assert.deepEqual(reserveSpace(bounds, 200), { x: 0, y: 330, width: 1200, height: 500 });
  assert.deepEqual(reserveSpace(bounds, 0), bounds);
  assert.equal(reserveSpace(bounds, 99999).height, 260);
  assert.equal(reserveSpace({ ...bounds, height: 100 }, 200).height, 80);
});
