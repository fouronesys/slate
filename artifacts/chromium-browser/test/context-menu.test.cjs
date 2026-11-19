const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildContextMenu, downloadableImage } = require("../src/context-menu.cjs");

function fixture(params = {}, overrides = {}) {
  const calls = [];
  const contents = {
    isDestroyed: () => false,
    downloadURL: url => calls.push(["download", url]),
    copyImageAt: (...coords) => calls.push(["copy-image", ...coords]),
    openDevTools: options => calls.push(["devtools", options]),
    inspectElement: (...coords) => calls.push(["inspect", ...coords]),
    navigationHistory: { canGoBack: () => false, canGoForward: () => true, goForward: () => calls.push(["forward"]) },
    getZoomFactor: () => 1,
    setZoomFactor: zoom => calls.push(["zoom", zoom]),
    copy: () => calls.push(["copy"]), paste: () => calls.push(["paste"]),
    ...overrides,
  };
  const tab = { url: "https://page.test/article", ephemeral: false, view: { webContents: contents } };
  const actions = {
    isCurrent: () => true,
    clipboard: { writeText: text => calls.push(["clipboard", text]) },
    openTab: (...args) => calls.push(["open", ...args]),
    notice: message => calls.push(["error", message]),
    searchEngine: "duckduckgo",
    saveCollection: () => calls.push(["collection"]),
  };
  const menu = buildContextMenu(tab, { x: 17, y: 30, ...params }, actions);
  const get = id => menu.find(item => item.id === id);
  return { calls, tab, actions, menu, get };
}

test("image menu downloads through the current webContents and copies the actual image", () => {
  const { get, calls } = fixture({ mediaType: "image", srcURL: "https://cdn.test/photo.png", hasImageContents: true });
  get("image-download").click();
  get("image-copy").click();
  get("image-copy-url").click();
  get("inspect-element").click();
  assert.deepEqual(calls, [
    ["download", "https://cdn.test/photo.png"], ["copy-image", 17, 30],
    ["clipboard", "https://cdn.test/photo.png"], ["devtools", { mode: "detach" }], ["inspect", 17, 30],
  ]);
  assert.equal(get("page-reload"), undefined);
});

test("linked images keep both groups and preserve ephemeral isolation", () => {
  const { tab, actions, calls } = fixture();
  tab.ephemeral = true;
  const menu = buildContextMenu(tab, { linkURL: "https://link.test", mediaType: "image", srcURL: "https://image.test/a.png" }, actions);
  menu.find(item => item.id === "link-new-tab").click();
  menu.find(item => item.id === "image-new-tab").click();
  assert.equal(menu.some(item => item.id === "link-private-tab"), false);
  assert.deepEqual(calls, [["open", "https://link.test", true], ["open", "https://image.test/a.png", true]]);
});

test("unsafe links cannot open or download, but may be copied as text", () => {
  const { get } = fixture({ linkURL: "javascript:alert(1)" });
  assert.equal(get("link-new-tab"), undefined);
  assert.equal(get("link-download"), undefined);
  assert.ok(get("link-copy"));
  assert.equal(downloadableImage("file:///private/data", "https://page.test"), false);
  assert.equal(downloadableImage("data:text/html,<script>", "https://page.test"), false);
  assert.equal(downloadableImage("blob:https://other.test/a", "https://page.test"), false);
  assert.equal(downloadableImage("blob:https://page.test/a", "https://page.test"), true);
});

test("editing commands respect native flags; password selections are never offered to search", () => {
  const { get } = fixture({ isEditable: true, inputFieldType: "password", selectionText: "secret",
    editFlags: { canPaste: true, canCopy: false, canUndo: false } });
  assert.equal(get("edit-paste").enabled, true);
  assert.equal(get("edit-copy").enabled, false);
  assert.equal(get("edit-undo").enabled, false);
  assert.equal(get("selection-search"), undefined);
  assert.equal(get("collection-save"), undefined);
});

test("selected text uses the configured search engine even when it looks like a URL", () => {
  const { get, calls } = fixture({ selectionText: "example.com" });
  get("selection-search").click();
  assert.deepEqual(calls, [["open", "https://duckduckgo.com/?q=example.com", false]]);
});

test("page menu exposes real navigation, zoom, print and inspection without empty separators", () => {
  const { get, menu } = fixture();
  assert.equal(get("page-back").enabled, false);
  assert.equal(get("page-forward").enabled, true);
  assert.ok(get("page-print"));
  assert.equal(get("page-zoom").submenu.length, 3);
  assert.ok(get("inspect-element"));
  assert.notEqual(menu[0].type, "separator");
  assert.notEqual(menu.at(-1).type, "separator");
  assert.equal(menu.some((item, i) => item.type === "separator" && menu[i + 1]?.type === "separator"), false);
});

test("media download respects the native save permission and never promises a protected stream download", () => {
  const blocked = fixture({ mediaType: "video", srcURL: "blob:https://page.test/stream", mediaFlags: { canSave: false } });
  assert.equal(blocked.get("media-download"), undefined);
  assert.equal(blocked.get("video-pip"), undefined);
  const direct = fixture({ mediaType: "audio", srcURL: "https://page.test/track.mp3", mediaFlags: { canSave: true } });
  assert.ok(direct.get("media-download"));
});

test("PiP uses the video overlay, not the right-click menu", () => {
  for (const params of [{}, { mediaType: "video", srcURL: "https://page.test/movie.mp4" }]) {
    assert.equal(fixture(params).menu.some(item => /PiP|imagen en imagen/i.test(item.label || "")), false);
  }
});

test("stale menus cannot act on closed or inactive tabs; errors are reported", async () => {
  const { tab, actions, calls } = fixture();
  const menu = buildContextMenu(tab, { mediaType: "image", srcURL: "https://page.test/a.png" }, actions);
  actions.isCurrent = () => false;
  menu.find(item => item.id === "image-download").click();
  assert.deepEqual(calls, []);
  actions.isCurrent = () => true;
  tab.view.webContents.downloadURL = () => { throw new Error("Sin permisos"); };
  menu.find(item => item.id === "image-download").click();
  assert.deepEqual(calls, [["error", "Sin permisos"]]);
});
