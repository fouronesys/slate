// macOS must finish its native fullscreen transition before app.quit().
// No forced process exit, and no inference of success from a quit event.
function quitAfterFullscreen(window, quit, exitHtml, onError) {
  let finished = false;
  let timer;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    window?.removeListener("leave-full-screen", finish);
    quit();
  };
  if (!window || window.isDestroyed()) { finish(); return; }
  const fullscreen = window.isFullScreen();
  const simple = window.isSimpleFullScreen?.();
  exitHtml();
  if (!fullscreen && !simple) { setImmediate(finish); return; }
  window.once("leave-full-screen", finish);
  timer = setTimeout(() => {
    if (window.isDestroyed() || !window.isFullScreen() && !window.isSimpleFullScreen?.()) finish();
    else {
      window.removeListener("leave-full-screen", finish);
      finished = true;
      onError();
    }
  }, 2500);
  if (simple) {
    window.setSimpleFullScreen(false);
    if (!fullscreen && !window.isSimpleFullScreen()) setImmediate(finish);
  }
  if (fullscreen) window.setFullScreen(false);
}
module.exports = { quitAfterFullscreen };
