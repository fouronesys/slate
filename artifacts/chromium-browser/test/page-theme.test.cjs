const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_APPEARANCE, normalizeAppearance, updateAppearance } = require("../src/appearance.cjs");
const { pageHost, normalizeThemeExceptions, themePlan, PageTheme, WORLD_ID } = require("../src/page-theme.cjs");
test("page theme defaults on and validates stored preferences", () => {
  assert.equal(normalizeAppearance({}).pageTheme, "seguir");
  assert.equal(updateAppearance(DEFAULT_APPEARANCE, { pageTheme: "original" }).pageTheme, "original");
  assert.throws(() => updateAppearance(DEFAULT_APPEARANCE, { pageTheme: "invert-all" }));
  const exceptions = normalizeThemeExceptions(["example.com", "example.com", "other.test", "../file", "https://bad.test", "evil.test/path", 3]);
  assert.deepEqual([...exceptions], ["example.com", "other.test"]);
  assert.equal(pageHost("file:///tmp/local"), "");
  assert.equal(pageHost("https://user:password@example.com"), "");
});
test("theme follows Slate and exceptions are hostname scoped, not protection scoped", () => {
  const tab = { url: "https://example.com/page" };
  const exceptions = new Set(["example.com"]);
  assert.equal(themePlan(tab, DEFAULT_APPEARANCE, true, new Set()).scheme, "oscuro");
  assert.equal(themePlan(tab, { ...DEFAULT_APPEARANCE, theme: "claro" }, true, new Set()).scheme, "claro");
  assert.equal(themePlan(tab, DEFAULT_APPEARANCE, false, exceptions).enabled, false);
  assert.equal(themePlan({ url: "https://sub.example.com" }, DEFAULT_APPEARANCE, false, exceptions).enabled, true);
  assert.equal(themePlan({ ...tab, pageThemeOverride: true }, DEFAULT_APPEARANCE, false, exceptions).enabled, true);
  assert.equal(themePlan(tab, { ...DEFAULT_APPEARANCE, pageTheme: "original" }, false, new Set()).enabled, false);
  assert.equal(themePlan({ url: "" }, DEFAULT_APPEARANCE, false, new Set()).enabled, false);
});
test("queued theme updates discard stale work and use an isolated, unprivileged world", async () => {
  const calls = [];
  const contents = { id: 1, isDestroyed: () => false,
    executeJavaScriptInIsolatedWorld: async (world, scripts) => { calls.push({ world, code: scripts[0].code }); return { enabled: false }; } };
  const tab = { url: "https://example.com", view: { webContents: contents } };
  const engine = new PageTheme();
  const plan = { enabled: false, scheme: "oscuro" };
  const first = engine.apply(tab, plan);
  const latest = engine.apply(tab, { ...plan, scheme: "claro" });
  await Promise.all([first, latest]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].world, WORLD_ID);
  assert.match(calls[0].code, /location.href/);
  assert.match(calls[0].code, /disable/);
  assert.equal(engine.status(tab), "original");
  await engine.apply(tab, { ...plan, scheme: "claro" });
  assert.equal(calls.length, 1);
  engine.invalidate(contents);
  await engine.apply(tab, { ...plan, scheme: "claro" });
  assert.equal(calls.length, 2);
  engine.forget(contents);
});
