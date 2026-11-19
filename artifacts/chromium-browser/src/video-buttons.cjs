// This function runs in the page with NO Electron bridge, Node, network,
// extracted frames or alternate player. The click is the user gesture for PiP.
function installVideoButtons(enabled = true) {
  const key = "__slateLocalVideoButtons";
  const previous = globalThis[key];
  if (previous) {
    if (!enabled) { previous.dispose(); delete globalThis[key]; }
    return;
  }
  if (!enabled || !document.documentElement) return;
  const entries = new Map();
  const observers = [];
  const roots = new WeakSet();
  let frame = 0;
  let disposed = false;
  let pointer = null;
  let hideTimer = 0;
  const idleDelay = 1600;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  function schedule() {
    if (!frame && !disposed) frame = requestAnimationFrame(update);
  }
  function update() {
    frame = 0;
    clearTimeout(hideTimer);
    let nextHide = Infinity;
    const now = Date.now();
    for (const [video, entry] of entries) {
      if (!video.isConnected) {
        resize?.unobserve(video);
        entry.dispose();
        entries.delete(video);
        continue;
      }
      const rect = video.getBoundingClientRect();
      const visible = !document.hidden && video.readyState >= 2 && video.videoWidth > 0 &&
        rect.width >= 80 && rect.height >= 55 &&
        rect.bottom > 45 && rect.top < innerHeight - 8 && rect.right > 40 && rect.left < innerWidth - 8 &&
        getComputedStyle(video).visibility !== "hidden";
      entry.host.hidden = !visible;
      entry.host.style.display = visible ? "block" : "none";
      if (!visible) continue;
      const owner = document.fullscreenElement && document.fullscreenElement.tagName !== "VIDEO"
        ? document.fullscreenElement : document.documentElement;
      if (entry.host.parentElement !== owner) owner.append(entry.host);
      const left = Math.max(4, Math.min(innerWidth - 38, rect.left + (rect.width - 34) / 2));
      const top = Math.max(4, rect.top + 8);
      entry.host.style.left = `${left}px`;
      entry.host.style.top = `${top}px`;
      const hovered = pointer && pointer.x >= rect.left && pointer.x <= rect.right &&
        pointer.y >= rect.top && pointer.y <= rect.bottom;
      const overButton = hovered && pointer.x >= left && pointer.x <= left + 34 &&
        pointer.y >= top && pointer.y <= top + 24;
      const keyboardFocus = entry.button.matches(":focus-visible") && document.hasFocus();
      const remaining = pointer ? idleDelay - (now - pointer.at) : 0;
      const shown = Boolean(keyboardFocus || (hovered && (remaining > 0 || overButton)));
      entry.host.style.opacity = shown ? "1" : "0";
      entry.host.style.transform = shown ? "translateY(0)" : "translateY(-3px)";
      // An invisible button must never block the page or the player's controls.
      entry.host.style.pointerEvents = entry.button.style.pointerEvents = shown ? "auto" : "none";
      entry.button.style.background = overButton || keyboardFocus ? "rgba(20,22,27,.86)" : "rgba(20,22,27,.58)";
      entry.button.style.outline = keyboardFocus ? "2px solid #fff" : "none";
      const active = document.pictureInPictureElement === video;
      const failed = entry.errorUntil > now;
      entry.button.title = failed ? "Este reproductor no permite abrir el video en PiP."
        : active ? "Volver al video" : "Abrir video en imagen en imagen";
      entry.button.setAttribute("aria-label", entry.button.title);
      entry.button.setAttribute("aria-pressed", String(active));
      entry.button.style.color = failed ? "#ffd1d1" : "#fff";
      entry.badge.setAttribute("x", active ? "4" : "12");
      if (shown && hovered && !overButton && !keyboardFocus) nextHide = Math.min(nextHide, remaining);
    }
    if (Number.isFinite(nextHide)) hideTimer = setTimeout(schedule, Math.max(16, nextHide));
  }
  function add(video) {
    if (entries.has(video)) return;
    const host = document.createElement("span");
    host.setAttribute("data-slate-pip", "");
    host.hidden = true;
    Object.assign(host.style, {
      position: "fixed", zIndex: "2147483647", width: "34px", height: "24px",
      display: "none", pointerEvents: "none", lineHeight: "normal", opacity: "0",
      transform: "translateY(-3px)",
      transition: reducedMotion ? "none" : "opacity 160ms ease, transform 160ms ease",
    });
    // Inline property assignments work without relaxing the page's CSP.
    const shadow = host.attachShadow({ mode: "closed" });
    const button = document.createElement("button");
    button.type = "button";
    button.title = "Abrir video en imagen en imagen";
    button.setAttribute("aria-label", button.title);
    Object.assign(button.style, {
      all: "initial", boxSizing: "border-box", display: "flex",
      alignItems: "center", justifyContent: "center", width: "34px", height: "24px",
      borderRadius: "6px", border: "1px solid rgba(255,255,255,.2)",
      background: "rgba(20,22,27,.58)", color: "#fff", pointerEvents: "none",
      backdropFilter: "blur(8px)", cursor: "pointer", boxShadow: "0 1px 5px rgba(0,0,0,.18)",
      outlineOffset: "3px",
    });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 22 18");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "15");
    svg.setAttribute("aria-hidden", "true");
    svg.style.pointerEvents = "none";
    const outline = document.createElementNS(svg.namespaceURI, "rect");
    for (const [name, value] of Object.entries({ x: "1.5", y: "2", width: "19", height: "14", rx: "2",
      fill: "none", stroke: "currentColor", "stroke-width": "1.4" })) outline.setAttribute(name, value);
    const badge = document.createElementNS(svg.namespaceURI, "rect");
    for (const [name, value] of Object.entries({ x: "12", y: "9", width: "6", height: "4.5", rx: ".6",
      fill: "currentColor" })) badge.setAttribute(name, value);
    svg.append(outline, badge);
    button.append(svg);
    const onLeave = () => {
      if (entry.restoreDisabled) video.disablePictureInPicture = true;
      entry.restoreDisabled = false;
      schedule();
    };
    const videoEvents = [["loadeddata", schedule], ["emptied", schedule],
      ["enterpictureinpicture", schedule], ["leavepictureinpicture", onLeave]];
    const entry = { host, button, badge, errorUntil: 0, restoreDisabled: false, dispose() {
      for (const [name, listener] of videoEvents) video.removeEventListener(name, listener);
      if (entry.restoreDisabled) video.disablePictureInPicture = true;
      host.remove();
    } };
    for (const [name, listener] of videoEvents) video.addEventListener(name, listener);
    entries.set(video, entry);
    shadow.append(button);
    document.documentElement.append(host);
    resize?.observe(video);
    button.addEventListener("focus", schedule);
    button.addEventListener("blur", schedule);
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      if (!event.isTrusted) return;
      const disabled = video.disablePictureInPicture;
      try {
        if (document.pictureInPictureElement === video) {
          await document.exitPictureInPicture();
        } else {
          if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) {
            throw new Error("Este reproductor no permite PiP");
          }
          video.disablePictureInPicture = false;
          await video.requestPictureInPicture();
          entry.restoreDisabled = disabled;
        }
        entry.errorUntil = 0;
      } catch {
        video.disablePictureInPicture = disabled;
        entry.errorUntil = Date.now() + 3500;
      }
      schedule();
    });
  }
  function scan(root) {
    if (!root?.querySelectorAll) return;
    if (root.nodeType === 1 && root.matches("video")) add(root);
    for (const video of root.querySelectorAll("video")) add(video);
    if (!roots.has(root)) {
      roots.add(root);
      const observer = new MutationObserver(records => {
        for (const record of records) for (const added of record.addedNodes) {
          if (added.nodeType === 1 && !added.hasAttribute("data-slate-pip")) scanAdded(added);
        }
        schedule();
      });
      observer.observe(root, { childList: true, subtree: true });
      observers.push(observer);
    }
    for (const element of root.querySelectorAll("*")) if (element.shadowRoot) scan(element.shadowRoot);
  }
  function scanAdded(root) {
    // Observe a document/shadow root once, not every new DOM subtree.
    if (root.matches("video")) add(root);
    for (const video of root.querySelectorAll("video")) add(video);
    if (root.shadowRoot) scan(root.shadowRoot);
    for (const element of root.querySelectorAll("*")) if (element.shadowRoot) scan(element.shadowRoot);
  }
  function moved(event) { pointer = { x: event.clientX, y: event.clientY, at: Date.now() }; schedule(); }
  function conceal() { pointer = null; schedule(); }
  function exited(event) { if (!event.relatedTarget) conceal(); }
  function dispose() {
    disposed = true;
    cancelAnimationFrame(frame);
    clearTimeout(hideTimer);
    resize?.disconnect();
    for (const observer of observers) observer.disconnect();
    for (const [name, listener, capture] of listeners) document.removeEventListener(name, listener, capture);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("blur", conceal);
    for (const entry of entries.values()) entry.dispose();
    entries.clear();
  }
  const listeners = [
    ["scroll", schedule, true], ["loadeddata", schedule, true], ["emptied", schedule, true],
    ["fullscreenchange", schedule, true], ["pointermove", moved, true],
    ["pointerout", exited, true], ["visibilitychange", conceal, true],
  ];
  for (const [name, listener, capture] of listeners) document.addEventListener(name, listener, capture);
  window.addEventListener("resize", schedule);
  window.addEventListener("blur", conceal);
  globalThis[key] = { dispose };
  scan(document);
  schedule();
}

async function syncVideoButtons(contents, enabled) {
  if (!contents || contents.isDestroyed()) return;
  const frames = contents.mainFrame?.framesInSubtree || [];
  await Promise.all(frames.map(frame => {
    try {
      const embeddedBlank = frame !== contents.mainFrame && /^about:(blank|srcdoc)$/.test(frame.url) &&
        /^https?:/.test(contents.mainFrame.url);
      if (!/^https?:/.test(frame.url) && !embeddedBlank) return;
      return frame.executeJavaScript(`(${installVideoButtons.toString()})(${enabled === true})`, false).catch(() => {});
    } catch { return undefined; } // Frames may detach during a navigation.
  }));
}
module.exports = { installVideoButtons, syncVideoButtons };
