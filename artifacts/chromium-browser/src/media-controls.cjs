function allowFullscreen(contents, permission, activeContents, requestingUrl, isMainFrame) {
  if (permission !== "fullscreen" || !contents || contents !== activeContents ||
      contents.isDestroyed() || isMainFrame !== true) return false;
  try {
    const top = new URL(contents.getURL());
    const frame = new URL(requestingUrl);
    return top.protocol === "https:" && frame.origin === top.origin;
  } catch {
    return false;
  }
}

function contentBounds(width, height, normalBounds, fullscreen) {
  return fullscreen ? {
    x: 0,
    y: 0,
    width: Math.max(1, width),
    height: Math.max(1, height),
  } : normalBounds;
}

// Runs only for an explicit browser command. No remote preload, network
// requests, canvas copying or new player/window is installed in the page.
async function videoCommand(command, index = 0) {
  if (command === "exit") {
    if (!document.pictureInPictureElement) return "no-video";
    await document.exitPictureInPicture();
    return "exited";
  }
  const videos = [];
  function scan(root) {
    videos.push(...root.querySelectorAll("video"));
    for (const element of root.querySelectorAll("*")) if (element.shadowRoot) scan(element.shadowRoot);
  }
  scan(document);
  if (command === "probe") return {
    pip: Boolean(document.pictureInPictureElement),
    supported: Boolean(document.pictureInPictureEnabled),
    videos: videos.map((video, index) => ({
      index, ready: video.readyState >= 2 && video.videoWidth > 0,
      playing: !video.paused && !video.ended,
      area: video.clientWidth * video.clientHeight,
      src: video.currentSrc || video.src,
    })).filter(video => video.ready),
  };
  const video = videos[index];
  if (!video || video.readyState < 2 || !video.videoWidth) return "no-video";
  if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) return "unsupported";
  const disabled = video.disablePictureInPicture;
  video.disablePictureInPicture = false;
  try {
    await video.requestPictureInPicture();
    if (disabled) video.addEventListener("leavepictureinpicture", () => {
      video.disablePictureInPicture = true;
    }, { once: true });
    return "entered";
  } catch (error) {
    video.disablePictureInPicture = disabled;
    return error.name === "NotAllowedError" || error.name === "SecurityError" ? "unsupported" : "incompatible";
  }
}
const scriptFor = (command, index) => `(${videoCommand.toString()})(${JSON.stringify(command)},${JSON.stringify(index || 0)})`;
async function togglePictureInPicture(contents, preferred = {}) {
  if (!contents || contents.isDestroyed()) throw new Error("No hay una pestaña disponible.");
  const frames = contents.mainFrame?.framesInSubtree || [contents];
  const probes = await Promise.all(frames.map(async frame => {
    let timer;
    try {
      const result = await Promise.race([
        frame.executeJavaScript(scriptFor("probe"), false),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), 1000); }),
      ]);
      return { frame, result };
    }
    catch { return null; } // A navigated/detached subframe must not block other videos.
    finally { clearTimeout(timer); }
  }));
  const existing = probes.find(probe => probe?.result?.pip);
  if (existing) return existing.frame.executeJavaScript(scriptFor("exit"), true);
  const candidates = probes.flatMap(probe => !probe?.result ? [] :
    probe.result.videos.map(video => ({ ...video, frame: probe.frame, supported: probe.result.supported })));
  candidates.sort((a, b) =>
    Number(b.frame === preferred.frame && (!preferred.src || b.src === preferred.src)) -
      Number(a.frame === preferred.frame && (!preferred.src || a.src === preferred.src)) ||
    Number(b.playing) - Number(a.playing) || b.area - a.area);
  const matching = candidates.filter(candidate => candidate.frame === preferred.frame && (!preferred.src || candidate.src === preferred.src));
  const selection = preferred.strict || matching.length ? matching : candidates;
  let blocked = false;
  for (const candidate of selection) {
    if (!candidate.supported) { blocked = true; continue; }
    let result;
    try { result = await candidate.frame.executeJavaScript(scriptFor("enter", candidate.index), true); }
    catch { continue; }
    if (result === "entered") return result;
    blocked ||= result === "unsupported" || result === "incompatible";
  }
  if (blocked) throw new Error("Este reproductor o su política de seguridad no permite PiP. No todos los vídeos protegidos son compatibles.");
  throw new Error("Primero reproduce un vídeo en esta pestaña. Los reproductores sin un vídeo HTML accesible no permiten PiP.");
}

module.exports = { allowFullscreen, contentBounds, togglePictureInPicture, videoCommand };
