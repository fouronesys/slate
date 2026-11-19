const { test } = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_APPEARANCE, normalizeAppearance, updateAppearance, getLayout } = require("../src/appearance.cjs");

test("stored appearance is normalized without accepting arbitrary styling or files", () => {
  for (const value of [null, undefined, {}, [], "broken"]) assert.deepEqual(normalizeAppearance(value), DEFAULT_APPEARANCE);
  assert.deepEqual(normalizeAppearance({ theme: "oscuro", accent: "url(file:///etc/passwd)", extra: true }), {
    ...DEFAULT_APPEARANCE, theme: "oscuro",
  });
});

test("preference patches preserve other choices and reject invalid input", () => {
  assert.deepEqual(updateAppearance(DEFAULT_APPEARANCE, { accent: "arcilla" }), { ...DEFAULT_APPEARANCE, accent: "arcilla" });
  assert.deepEqual(updateAppearance(DEFAULT_APPEARANCE, { accent: "personalizado", customAccent: "#12aBcD" }), {
    ...DEFAULT_APPEARANCE, accent: "personalizado", customAccent: "#12abcd",
  });
  assert.deepEqual(updateAppearance(DEFAULT_APPEARANCE, { bookmarksBar: true }), { ...DEFAULT_APPEARANCE, bookmarksBar: true });
  for (const patch of [null, [], "claro", { theme: "arbitrary" }, { html: "<script>" }, { constructor: "x" }]) {
    assert.throws(() => updateAppearance(DEFAULT_APPEARANCE, patch), /no válida/);
  }
  for (const customAccent of ["red", "url(file:///etc/passwd)", "#12345g"]) {
    assert.throws(() => updateAppearance(DEFAULT_APPEARANCE, { customAccent }), /no válida/);
  }
  assert.equal(DEFAULT_APPEARANCE.accent, "salvia");
});

test("native view geometry matches top and vertical tabs in both densities", () => {
  for (const width of [760, 800, 1024, 1320, 1440]) {
    for (const density of ["cómoda", "compacta"]) {
      for (const tabStyle of ["superior", "vertical"]) {
        for (const panelOpen of [false, true]) {
          const layout = getLayout({ ...DEFAULT_APPEARANCE, density, tabStyle }, panelOpen, width, 600);
          const bounds = layout.bounds;
          assert.equal(bounds.y, 43 + layout.tabsHeight + layout.toolbarHeight + layout.bookmarksBarHeight);
          assert.equal(bounds.x, layout.sidebarWidth);
          assert.equal(bounds.x + bounds.width + layout.panelWidth, width);
          assert.equal(bounds.y + bounds.height, 600);
          assert.ok(bounds.width >= 260);
          assert.equal(Boolean(layout.sidebarWidth), tabStyle === "vertical");
          assert.equal(Boolean(layout.tabsHeight), tabStyle === "superior");
          assert.equal(Boolean(layout.panelWidth), panelOpen);
        }
      }
    }
  }
});

test("bookmark bar adds native content clearance only when bookmarks are visible", () => {
  const preferences = { ...DEFAULT_APPEARANCE, bookmarksBar: true };
  const hidden = getLayout(preferences, false, 1320, 860, false);
  const visible = getLayout(preferences, false, 1320, 860, true);
  assert.equal(hidden.bookmarksBarHeight, 0);
  assert.equal(visible.bookmarksBarHeight, 31);
  assert.equal(visible.bounds.y - hidden.bounds.y, 31);
});

test("automatic titlebar saves only its preference and preserves tabs, panels and native content geometry", () => {
  assert.equal(normalizeAppearance({}).autoHideTitlebar, false);
  assert.equal(updateAppearance(DEFAULT_APPEARANCE, { autoHideTitlebar: true }).autoHideTitlebar, true);
  assert.throws(() => updateAppearance(DEFAULT_APPEARANCE, { autoHideTitlebar: "true" }), /no válida/);
  for (const tabStyle of ["superior", "vertical"]) for (const density of ["cómoda", "compacta"]) {
    const prefs = { ...DEFAULT_APPEARANCE, tabStyle, density, autoHideTitlebar: true, bookmarksBar: true };
    const hidden = getLayout(prefs, true, 1320, 860, true);
    const shown = getLayout(prefs, true, 1320, 860, true, true);
    assert.equal(hidden.titlebarHeight, 6);
    assert.equal(shown.titlebarHeight, 43);
    assert.equal(shown.chromeHeight - hidden.chromeHeight, 37);
    assert.equal(hidden.bounds.height - shown.bounds.height, 37);
    assert.equal(hidden.tabsHeight, shown.tabsHeight);
    assert.equal(hidden.toolbarHeight, shown.toolbarHeight);
    assert.equal(hidden.panelWidth, shown.panelWidth);
    assert.equal(hidden.bounds.y + hidden.bounds.height, 860);
  }
});
