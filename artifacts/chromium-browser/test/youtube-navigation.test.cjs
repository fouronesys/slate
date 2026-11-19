const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { loadYouTube, isExpectedPage } = require("../scripts/youtube-navigation.cjs");
const target = "https://www.youtube.com/watch?v=M7lc1UVf-VE";

function page(load) {
  const contents = new EventEmitter();
  contents.url = "about:blank";
  contents.getURL = () => contents.url;
  contents.isLoadingMainFrame = () => false;
  contents.loadURL = () => load(contents);
  return contents;
}

function assertClean(contents) {
  for (const event of ["did-finish-load", "did-fail-load", "destroyed"]) {
    assert.equal(contents.listenerCount(event), 0);
  }
}

test("replacement navigation accepts extra YouTube parameters but not another video or origin", () => {
  assert.equal(isExpectedPage(`${target}&themeRefresh=1`, target), true);
  assert.equal(isExpectedPage("https://consent.youtube.com/m", target), true);
  for (const url of ["about:blank", target.replace("https:", "http:"),
    target.replace("M7lc1UVf-VE", "other"), target.replace("www.youtube.com", "www.youtube.com.evil.test"),
    "https://www.youtube.com/signin", "https://user:password@www.youtube.com/watch?v=M7lc1UVf-VE"]) {
    assert.equal(isExpectedPage(url, target), false);
  }
});

test("ERR_ABORTED waits for a finished replacement page rather than failing or passing immediately", async () => {
  const contents = page(() => Promise.reject(Object.assign(new Error("aborted"), { code: "ERR_ABORTED" })));
  let resolved = false;
  const pending = loadYouTube(contents, target).then((result) => { resolved = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false);
  contents.url = `${target}&themeRefresh=1`;
  contents.emit("did-finish-load");
  assert.deepEqual(await pending, { url: contents.url, replacementNavigation: true });
  assertClean(contents);
});

test("an aborted load without a finished replacement times out, even if its URL matches", async () => {
  const contents = page((wc) => {
    wc.url = target;
    return Promise.reject(Object.assign(new Error("aborted"), { errno: -3 }));
  });
  await assert.rejects(loadYouTube(contents, target, 10), /replacement navigation did not finish/);
  assertClean(contents);
});

test("ordinary finished navigation succeeds and removes listeners", async () => {
  const contents = page((wc) => { wc.url = target; return Promise.resolve(); });
  assert.deepEqual(await loadYouTube(contents, target), { url: target, replacementNavigation: false });
  assertClean(contents);
});

test("real load errors and unexpected destinations remain failures", async () => {
  const failed = page(() => Promise.reject(new Error("ERR_CERT_AUTHORITY_INVALID")));
  await assert.rejects(loadYouTube(failed, target), /ERR_CERT_AUTHORITY_INVALID/);
  assertClean(failed);
  const redirected = page((wc) => { wc.url = "https://example.com/"; return Promise.resolve(); });
  await assert.rejects(loadYouTube(redirected, target), /unexpected page/);
  assertClean(redirected);
});

test("subframe failures are ignored, main-frame errors and closed windows are not", async () => {
  const contents = page(() => new Promise(() => {}));
  const pending = loadYouTube(contents, target);
  contents.emit("did-fail-load", {}, -105, "ERR_NAME_NOT_RESOLVED", "", false);
  contents.emit("did-fail-load", {}, -3, "ERR_ABORTED", target, true);
  contents.url = `${target}&themeRefresh=1`;
  contents.emit("did-finish-load");
  assert.equal((await pending).replacementNavigation, true);
  assertClean(contents);

  for (const event of ["did-fail-load", "destroyed"]) {
    const failed = page(() => new Promise(() => {}));
    const result = loadYouTube(failed, target);
    if (event === "destroyed") failed.emit(event);
    else failed.emit(event, {}, -105, "ERR_NAME_NOT_RESOLVED", target, true);
    await assert.rejects(result, /closed|ERR_NAME_NOT_RESOLVED/);
    assertClean(failed);
  }
});
