const { test } = require("node:test");
const assert = require("node:assert/strict");
const { allowFullscreen, contentBounds, togglePictureInPicture } = require("../src/media-controls.cjs");
const { DEFAULT_APPEARANCE, getLayout } = require("../src/appearance.cjs");
const contents = { isDestroyed: () => false, getURL: () => "https://www.youtube.com/watch?v=test" };

test("fullscreen is limited to the active HTTPS tab's main frame", () => {
  assert.equal(allowFullscreen(contents, "fullscreen", contents, "https://www.youtube.com/watch?v=test", true), true);
  for (const [wc, active, url, main] of [
    [contents, {}, "https://www.youtube.com", true],
    [contents, contents, "https://evil.test", true],
    [contents, contents, "https://www.youtube.com", false],
    [contents, contents, "https://www.youtube.com", undefined],
    [contents, contents, "invalid", true],
    [null, contents, "https://www.youtube.com", true],
    [{ ...contents, isDestroyed: () => true }, contents, "https://www.youtube.com", true],
  ]) assert.equal(allowFullscreen(wc, "fullscreen", active, url, main), false);
  const insecure = { ...contents, getURL: () => "http://example.com" };
  assert.equal(allowFullscreen(insecure, "fullscreen", insecure, "http://example.com", true), false);
});

test("video presentation never grants camera, microphone or unrelated permissions", () => {
  for (const permission of ["media", "display-capture", "geolocation", "notifications",
    "automatic-fullscreen", "openExternal", "unknown", "storage-access"]) {
    assert.equal(allowFullscreen(contents, permission, contents, contents.getURL(), true), false);
  }
});

test("fullscreen fills the view and leaving restores toolbar and panel bounds", () => {
  for (const density of ["cómoda", "compacta"]) {
    for (const tabStyle of ["superior", "vertical"]) {
      for (const panelOpen of [true, false]) {
        const normal = getLayout({ ...DEFAULT_APPEARANCE, density, tabStyle }, panelOpen, 1320, 860).bounds;
        assert.deepEqual(contentBounds(1320, 860, normal, true), { x: 0, y: 0, width: 1320, height: 860 });
        assert.deepEqual(contentBounds(1320, 860, normal, false), normal);
      }
    }
  }
});

test("PiP probes without user activation and reports explicit failure paths", async () => {
  await assert.rejects(togglePictureInPicture(null), /No hay/);
  for (const [videos, supported, message] of [[[], true, /Primero reproduce/], [[{index:0}], false, /no permite/]]) {
    await assert.rejects(togglePictureInPicture({
      isDestroyed: () => false,
      async executeJavaScript(_code, userGesture) { assert.equal(userGesture, false); return {videos,supported}; },
    }), message);
  }
  for (const result of ["entered", "exited"]) {
    assert.equal(await togglePictureInPicture({
      isDestroyed: () => false, executeJavaScript: async code =>
        code.endsWith('("probe",0)') ? {pip:result==="exited",supported:true,videos:[{index:0}]} : result,
    }), result);
  }
});
test("PiP searches child frames and honors the context-menu frame before largest video", async () => {
  const calls=[];
  const frame=(name,area)=>({executeJavaScript:async(code,gesture)=>{
    assert.equal(gesture,!code.endsWith('("probe",0)'));
    if(code.endsWith('("probe",0)'))return {supported:true,videos:[{index:0,playing:true,area,src:name}]};
    calls.push(name);return "entered";
  }});
  const top=frame("main",2000),child=frame("embed",200);
  const contents={isDestroyed:()=>false,mainFrame:{framesInSubtree:[top,child]}};
  assert.equal(await togglePictureInPicture(contents,{frame:child,src:"embed"}),"entered");
  assert.deepEqual(calls,["embed"]);
  calls.length=0;
  top.executeJavaScript=async()=>{throw new Error("detached");};
  assert.equal(await togglePictureInPicture(contents),"entered");
  assert.deepEqual(calls,["embed"]);
  const blocked={executeJavaScript:async()=>({supported:false,videos:[{index:0,src:"blocked"}]})};
  contents.mainFrame.framesInSubtree=[child,blocked];
  await assert.rejects(togglePictureInPicture(contents,{frame:blocked,strict:true}),/no permite/);
});
