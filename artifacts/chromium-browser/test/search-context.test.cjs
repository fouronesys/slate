const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { FeatureStore } = require("../src/features.cjs");
const { resolveAddress } = require("../src/privacy-policy.cjs");
const { contextSuggestion } = require("../src/companion-context.cjs");
test("search providers encode queries and preserve direct navigation", () => {
  for (const [engine, host] of [["google", "www.google.com"], ["duckduckgo", "duckduckgo.com"],
    ["bing", "www.bing.com"], ["brave", "search.brave.com"]]) {
    const url = new URL(resolveAddress("gato & café", engine));
    assert.equal(url.hostname, host);
    assert.equal(url.searchParams.get("q"), "gato & café");
    assert.equal(resolveAddress("example.com", engine), "https://example.com");
  }
  assert.throws(() => resolveAddress("query", "__proto__"));
});
test("settings migrate old profiles, validate and persist the chosen engine", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "slate-search-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new FeatureStore(directory);
  assert.equal(store.data.settings.searchEngine, "google");
  assert.equal(store.data.settings.companionSuggestions, true);
  store.action({ type: "settings:update", patch: { searchEngine: "brave", companionSuggestions: false } });
  assert.equal(new FeatureStore(directory).data.settings.searchEngine, "brave");
  assert.equal(new FeatureStore(directory).data.settings.companionSuggestions, false);
  for (const searchEngine of ["fake", "__proto__", null, true, "https://evil.test"]) {
    assert.throws(() => store.action({ type: "settings:update", patch: { searchEngine } }));
  }
  const legacy = store.snapshot();
  delete legacy.settings.searchEngine;
  delete legacy.settings.companionSuggestions;
  fs.writeFileSync(store.file, JSON.stringify(legacy));
  const upgraded = new FeatureStore(directory);
  assert.equal(upgraded.data.settings.searchEngine, "google");
  assert.equal(upgraded.data.settings.youtubeMute, false);
});
test("Miso suggests actions using URL metadata, without leaking it to the pet", () => {
  const settings = { companionSuggestions: true, youtubeFocus: false };
  const tab = { id: 3, url: "https://www.youtube.com/watch?v=abc" };
  const suggestion = contextSuggestion(tab, [], settings);
  assert.equal(suggestion.action, "bookmark");
  assert.match(suggestion.text, /vídeo/);
  assert.equal(Object.hasOwn(suggestion, "url"), false);
  assert.equal(Object.hasOwn(suggestion, "title"), false);
  assert.notEqual(contextSuggestion({ ...tab, id: 4 }, [], settings).id, suggestion.id);
  assert.notEqual(contextSuggestion({ ...tab, url: tab.url + "d" }, [], settings).id, suggestion.id);
  const bookmarks = [{ url: tab.url }];
  assert.equal(contextSuggestion(tab, bookmarks, settings).action, "focus");
  assert.equal(contextSuggestion(tab, bookmarks, { ...settings, youtubeFocus: true }).action, "copy-link");
  for (const url of ["https://youtu.be/abc", "https://m.youtube.com/shorts/abc"]) {
    assert.match(contextSuggestion({ ...tab, url }, [], settings).text, /vídeo/);
  }
  assert.doesNotMatch(contextSuggestion({ ...tab, url: "https://youtube.com.evil.test/watch?v=x" }, [], settings).text, /vídeo/);
  assert.equal(contextSuggestion({ ...tab, ephemeral: true }, [], settings), null);
  assert.equal(contextSuggestion(tab, [], { ...settings, companionSuggestions: false }), null);
  for (const url of ["", "file:///tmp/private", "https://user:pass@example.com"]) {
    assert.equal(contextSuggestion({ ...tab, url }, [], settings), null);
  }
});
const { SUGGESTION_RULES } = require("../src/companion-suggestions.cjs");
test("at least 50 distinct, reachable contextual suggestions have working action types", () => {
  assert.ok(SUGGESTION_RULES.length >= 50);
  assert.equal(new Set(SUGGESTION_RULES.map(rule => rule.key)).size, SUGGESTION_RULES.length);
  const actions = new Set(["bookmark", "collect", "focus", "zoom-in", "reset-zoom", "mute", "unmute", "switch-duplicate", "copy-link", "ephemeral"]);
  for (const rule of SUGGESTION_RULES) {
    const tab = { id: 1, url: rule.example };
    const settings = { companionSuggestions: true, youtubeFocus: false };
    const bookmarks = rule.meta.saved ? [{ url: tab.url }] : [];
    const dismissed = new Set();
    let found;
    for (let i = 0; i <= SUGGESTION_RULES.length; i++) {
      found = contextSuggestion(tab, bookmarks, settings, rule.meta, dismissed);
      if (!found || found.key === rule.key) break;
      dismissed.add(found.id);
    }
    assert.equal(found?.key, rule.key, `rule must be reachable: ${rule.key}`);
    assert.ok(actions.has(found.action), `supported action: ${rule.key}`);
    assert.ok(found.label.length > 0);
  }
});
test("dismissals, missing collections and disabled suggestions are respected", () => {
  const tab = { id: 1, url: "https://open.spotify.com/track/abc" };
  const settings = { companionSuggestions: true };
  const first = contextSuggestion(tab, [], settings);
  const next = contextSuggestion(tab, [], settings, {}, new Set([first.id]));
  assert.notEqual(next?.key, first.key);
  assert.notEqual(contextSuggestion(tab, [], settings, { canCollect: false })?.action, "collect");
  assert.equal(contextSuggestion(tab, [], { companionSuggestions: false }), null);
});
