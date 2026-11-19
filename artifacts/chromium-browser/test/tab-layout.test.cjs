const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fitTabs, MIN_WIDTH, GAP } = require("../src/tab-layout.cjs");
const { tabMenuEntries } = require("../src/tabs-menu.cjs");
const tabs = count => Array.from({ length: count }, (_, index) => ({ id: index + 1 }));

test("horizontal tabs fit a single row and keep the active tab visible even in large sets", () => {
  for (const count of [1, 3, 12, 14, 100, 1000]) {
    const entries = tabs(count);
    for (const width of [0, 20, 79, 80, 180, 410, 720, 1320]) {
      for (const activeId of [1, Math.ceil(count / 2), count]) {
        const result = fitTabs(entries, activeId, width);
        assert.ok(result.ids.includes(activeId));
        assert.equal(result.hidden + result.ids.length, count);
        assert.ok(result.ids.length >= 1);
        if (width >= MIN_WIDTH) assert.ok(result.ids.length * MIN_WIDTH + GAP * (result.ids.length - 1) <= width);
        assert.equal(new Set(result.ids).size, result.ids.length);
        assert.equal(entries.length, count, "layout never closes a tab");
      }
    }
  }
});

test("the visible range stays stable while switching within it, then shifts only as needed", () => {
  const entries = tabs(20);
  assert.equal(fitTabs(entries, 8, 410, { previousStart: 6 }).start, 6);
  assert.equal(fitTabs(entries, 6, 410, { previousStart: 6 }).start, 5);
  const end = fitTabs(entries, 20, 410, { previousStart: 0 });
  assert.equal(end.ids.at(-1), 20);
  assert.equal(fitTabs(entries, 1, 410, { previousStart: 16 }).start, 0);
});

test("resizing, closing and empty or vertical layouts preserve valid visible entries", () => {
  assert.deepEqual(fitTabs([], null, 800), { ids: [], start: 0, hidden: 0, tight: false });
  const entries = tabs(12);
  assert.equal(fitTabs(entries, 12, 800).tight, true);
  assert.equal(fitTabs(entries, 12, 1600).hidden, 0);
  assert.equal(fitTabs(entries, 12, 1600).tight, false);
  const closed = fitTabs(entries.slice(0, 3), 3, 410, { previousStart: 10 });
  assert.deepEqual(closed.ids, [1, 2, 3]);
  assert.deepEqual(fitTabs(entries, 12, 180, { vertical: true }).ids, entries.map(tab => tab.id));
});

test("the native list includes all and only current-workspace tabs, marks the active one and labels ephemeral tabs", () => {
  const entries = [
    { id: 1, workspaceId: "personal", title: "Una\npágina" },
    { id: 2, workspaceId: "trabajo", title: "No revelar" },
    { id: 3, workspaceId: "personal", title: "Vídeo", ephemeral: true },
  ];
  let workspace = "personal";
  const live = new Set([1, 2, 3]);
  const activated = [];
  const menu = tabMenuEntries(entries, 3, "personal", {
    isCurrent: (id, scope) => scope === workspace && live.has(id),
    activate: id => activated.push(id),
  });
  assert.deepEqual(menu.map(item => item.label), ["Una página", "Fugaz · Vídeo"]);
  assert.deepEqual(menu.map(item => item.checked), [false, true]);
  menu[0].click();
  assert.deepEqual(activated, [1]);
  live.delete(1);
  menu[0].click();
  workspace = "trabajo";
  menu[1].click();
  assert.deepEqual(activated, [1], "stale menus cannot activate closed tabs or tabs in another workspace");
});
