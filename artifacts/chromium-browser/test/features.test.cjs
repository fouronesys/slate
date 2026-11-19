const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { FeatureStore, DEFAULT_HOME, homePatch, searchLibrary } = require("../src/features.cjs");
const { ExpiringPermissions } = require("../src/permissions.cjs");

function store(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "slate-features-"));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  return { value: new FeatureStore(directory), directory };
}
test("collections retain local text, notes, moves and changes after restart", (t) => {
  const { value, directory } = store(t);
  const collection = value.action({ type: "collection:add", name: "Vacaciones" });
  const note = value.action({ type: "item:add", kind: "text", collectionId: collection.id, text: "<b>texto literal</b>" });
  value.action({ type: "item:update", id: note.id, title: "Viaje", notes: "Leer", collectionId: "inbox" });
  value.action({ type: "collection:rename", id: collection.id, name: "Viaje" });
  const restored = new FeatureStore(directory);
  assert.equal(restored.data.items[0].text, "<b>texto literal</b>");
  assert.equal(restored.data.items[0].notes, "Leer");
  assert.equal(restored.data.items[0].collectionId, "inbox");
  restored.action({ type: "collection:delete", id: collection.id });
  assert.equal(restored.data.items.length, 1);
  restored.action({ type: "item:delete", id: note.id });
  assert.equal(restored.data.items.length, 0);
});
test("collection deletion is scoped and unknown actions cannot mutate saved data", (t) => {
  const { value } = store(t);
  value.action({ type: "item:add", kind: "link", collectionId: "inbox", title: "Example", url: "https://example.com" });
  const before = value.snapshot();
  assert.throws(() => value.action({ type: "item:add", kind: "link", collectionId: "inbox", url: "javascript:alert(1)" }));
  assert.throws(() => value.action({ type: "item:add", kind: "link", collectionId: "inbox", url: "https://user:pass@example.com" }));
  assert.throws(() => value.action({ type: "item:add", kind: "image", collectionId: "inbox", image: "data:image/svg+xml;base64,AA==" }));
  assert.throws(() => value.action({ type: "item:update", id: "missing", title: "hello" }));
  assert.throws(() => value.action({ type: "workspace:switch", id: "../../profile" }));
  assert.throws(() => value.action({ type: "settings:update", patch: { clearOnExit: "yes" } }));
  assert.deepEqual(value.data, before);
  value.action({ type: "collection:delete", id: "inbox" });
  assert.equal(value.data.items.length, 0);
});
test("home editor validates values, supports undo and never resets collections", (t) => {
  const { value, directory } = store(t);
  value.action({ type: "home:update", patch: { order: [...DEFAULT_HOME.order].reverse(),
    hidden: ["clock"], companion: { enabled: true, kind: "robot", name: "Pip", color: "#123456" } } });
  value.action({ type: "home:update", patch: { transparency: 60, corners: "square" } });
  value.action({ type: "home:undo" });
  assert.equal(value.data.home.transparency, 90);
  assert.equal(value.data.home.companion.name, "Pip");
  const restored = new FeatureStore(directory);
  assert.deepEqual(restored.data.home, value.data.home);
  value.action({ type: "home:reset" });
  assert.deepEqual(value.data.home, DEFAULT_HOME);
  assert.equal(value.data.collections.length, 1);
  for (const patch of [{ order: ["search"] }, { hidden: ["unknown"] }, { transparency: NaN },
    { corners: "evil" }, { companion: { enabled: true, kind: "cat", name: "Cat", color: "red;}" } }]) {
    assert.throws(() => homePatch(DEFAULT_HOME, patch));
  }
});
test("malformed feature file fails visibly without replacing original", (t) => {
  const { directory } = store(t);
  const file = path.join(directory, "features.json");
  fs.writeFileSync(file, "{bad data");
  assert.throws(() => new FeatureStore(directory));
  assert.equal(fs.readFileSync(file, "utf8"), "{bad data");
});
test("local search is case insensitive, deduplicated and scans older history", () => {
  const history = Array.from({ length: 100 }, (_, i) => ({ title: `Viaje ${i}`, url: `https://example.com/${i}` }));
  const results = searchLibrary("VIAJE 90", [], history);
  assert.equal(results.length, 1);
  assert.equal(results[0].source, "Historial");
  assert.equal(searchLibrary("viaje", history, history).length, 100);
  assert.deepEqual(searchLibrary(" ", [], history), []);
});
function permissions() {
  const session = {
    setPermissionRequestHandler(fn) { this.request = fn; },
    setPermissionCheckHandler(fn) { this.check = fn; },
  };
  const permissions = new ExpiringPermissions(() => {}, () => false);
  permissions.bind(session);
  let url = "https://example.com/path";
  const contents = { id: 1, session, isDestroyed: () => false, getURL: () => url };
  return { permissions, session, contents, setUrl(value) { url = value; } };
}
test("permissions default deny dangerous and cross-origin requests", () => {
  const { session, contents, permissions: policy } = permissions();
  for (const [permission, url] of [["storage-access", "https://example.com"],
    ["media", "https://other.test"], ["geolocation", "http://example.com"]]) {
    let allowed;
    session.request(contents, permission, (value) => { allowed = value; }, { requestingUrl: url });
    assert.equal(allowed, false);
  }
  assert.equal(policy.pending.size, 0);
});
test("once permission does not create durable grant and tab grants expire on origin change", () => {
  const { session, contents, permissions: policy, setUrl } = permissions();
  let allowed;
  session.request(contents, "media", (value) => { allowed = value; });
  const id = [...policy.pending.keys()][0];
  policy.respond(id, "once");
  assert.equal(allowed, true);
  assert.equal(policy.grants.size, 0);
  session.request(contents, "media", (value) => { allowed = value; });
  policy.respond([...policy.pending.keys()][0], "tab");
  assert.equal(session.check(contents, "media", "https://example.com"), true);
  policy.forget(1, "https://different.test");
  setUrl("https://different.test");
  assert.equal(session.check(contents, "media", "https://example.com"), false);
  assert.equal(policy.grants.size, 0);
});
test("session grants cannot cross isolated sessions and pending requests are denied on close", () => {
  const { session, contents, permissions: policy } = permissions();
  session.request(contents, "geolocation", () => {});
  policy.respond([...policy.pending.keys()][0], "session");
  assert.equal(policy.granted({ ...contents, id: 2 }, "geolocation", "https://example.com"), true);
  assert.equal(policy.granted({ ...contents, session: {} }, "geolocation", "https://example.com"), false);
  policy.forgetSession(session);
  assert.equal(policy.grants.size, 0);
  let allowed;
  session.request(contents, "media", (value) => { allowed = value; });
  policy.forget(contents.id);
  assert.equal(allowed, false);
  assert.equal(policy.pending.size, 0);
});
