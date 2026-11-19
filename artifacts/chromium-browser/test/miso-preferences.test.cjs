const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { DEFAULT_APPEARANCE, normalizeAppearance, updateAppearance } = require("../src/appearance.cjs");
const { palette } = require("../src/companion-theme.cjs");
const { contrast } = require("../src/theme-tokens.cjs");
const { quitAfterFullscreen } = require("../src/quit-fullscreen.cjs");
test("local font selections are allowlisted with system defaults", () => {
  assert.equal(normalizeAppearance({}).fontFamily, "system");
  assert.equal(normalizeAppearance({}).headingFont, "system");
  for (const font of ["system","sans","editorial","mono","georgia","avenir","palatino"]) {
    assert.equal(updateAppearance(DEFAULT_APPEARANCE,{fontFamily:font,headingFont:font}).fontFamily,font);
  }
  assert.throws(()=>updateAppearance(DEFAULT_APPEARANCE,{fontFamily:"url(https://fonts.invalid)"}));
});
test("Miso follows theme, arbitrary saved colors and high contrast with readable controls", () => {
  const light=palette(DEFAULT_APPEARANCE,false,false),dark=palette(DEFAULT_APPEARANCE,true,false);
  assert.notEqual(light.background,dark.background);
  for (const color of ["#f7e5de","#153223","#537ba6"]) {
    const p=palette({...DEFAULT_APPEARANCE,colorMode:"propio",canvasColor:color},true,false);
    assert.equal(p.background,color);assert.ok(contrast(p.background,p.ink)>=4.5);
  }
  assert.equal(palette(DEFAULT_APPEARANCE,true,true).background,"#000000");
  assert.equal(palette(DEFAULT_APPEARANCE,false,true).background,"#ffffff");
});
test("quit waits for native fullscreen exit rather than quitting during the transition", async () => {
  const win=new EventEmitter();let full=true,quit=false,htmlExited=false;
  Object.assign(win,{isDestroyed:()=>false,isFullScreen:()=>full,isSimpleFullScreen:()=>false,setFullScreen:value=>full=value});
  quitAfterFullscreen(win,()=>quit=true,()=>htmlExited=true,()=>assert.fail("unexpected fullscreen error"));
  assert.equal(htmlExited,true);assert.equal(full,false);assert.equal(quit,false);
  win.emit("leave-full-screen");assert.equal(quit,true);
  let ordinaryQuit=false;
  quitAfterFullscreen(win,()=>ordinaryQuit=true,()=>{},()=>assert.fail());
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ordinaryQuit,true);
  let simple=true,simpleQuit=false;
  win.isSimpleFullScreen=()=>simple;
  win.setSimpleFullScreen=value=>simple=value;
  quitAfterFullscreen(win,()=>simpleQuit=true,()=>{},()=>assert.fail());
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(simpleQuit,true);
});
