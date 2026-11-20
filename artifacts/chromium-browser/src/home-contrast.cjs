/* Only samples the local HOME WALLPAPER, never a page, window or screen.
 * DOM text, focus, selection and handlers remain native. No IPC or network.
 */
(() => {
  "use strict";
  const colors = window.SlateContrastColors;
  const home = document.getElementById("home-screen");
  const video = document.getElementById("home-background-video");
  if (!home || !video || !colors) return;
  const root = document.documentElement;
  const sample = document.createElement("canvas");
  const sampler = sample.getContext("2d", { willReadFrequently: true, alpha: false });
  const paint = document.createElement("canvas");
  const painter = paint.getContext("2d");
  const pixel = document.createElement("canvas");
  pixel.width = pixel.height = 1;
  const parser = pixel.getContext("2d", { willReadFrequently: true });
  const poster = new Image();
  const targets = new Map(), colorCache = new Map();
  let timer = null, dirty = true, lastPoster = "", failed = false;
  const excluded = "svg,canvas,img,textarea,select,option,.slate-widget-edit-tools,[data-widget='companion']";
  function rgba(value) {
    if (colorCache.has(value)) return colorCache.get(value);
    parser.clearRect(0, 0, 1, 1);
    parser.fillStyle = value;
    parser.fillRect(0, 0, 1, 1);
    const result = Array.from(parser.getImageData(0, 0, 1, 1).data);
    colorCache.set(value, result);
    return result;
  }
  function active() {
    return !failed && !document.hidden && !home.classList.contains("is-hidden") &&
      root.dataset.contrast !== "alto" && !video.hidden &&
      ["slate", "video"].includes(root.dataset.backdrop);
  }
  function release(element, entry) {
    element.classList.remove(`lc-${entry.kind}`);
    element.style.removeProperty("--lc-image");
    element.style.removeProperty("--lc-caret");
    entry.image = "";
  }
  function refresh() {
    for (const [element, entry] of targets) release(element, entry);
    targets.clear();
    const candidates = new Map();
    // Prefer existing text boxes so ellipsis, wrapping and widget geometry stay
    // unchanged. Only mixed-content buttons need a lightweight inline wrapper.
    for (const widget of home.querySelectorAll(".slate-widget-body")) {
      if (widget.closest(excluded)) continue;
      const walker = document.createTreeWalker(widget, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        if (!node.textContent.trim() || node.parentElement.closest(excluded)) continue;
        let element = node.parentElement;
        if (element.children.length || element.matches(".bookmark-empty") || rgba(getComputedStyle(element).backgroundColor)[3]) {
          const span = document.createElement("span");
          span.dataset.lcWrapper = "true";
          node.replaceWith(span);
          span.append(node);
          element = span;
        }
        candidates.set(element, "text");
      }
      for (const input of widget.querySelectorAll(".home-search input")) candidates.set(input, "input");
      for (const field of widget.querySelectorAll(".home-search,.bookmark-empty")) candidates.set(field, "border");
      for (const icon of widget.querySelectorAll("svg")) {
        if (icon.closest(excluded.replace("svg,", ""))) continue;
        let wrapper = icon.parentElement;
        if (!wrapper.classList.contains("lc-icon-wrap")) {
          wrapper = document.createElement("span");
          wrapper.className = "lc-icon-wrap";
          const rect = icon.getBoundingClientRect();
          wrapper.style.width = `${rect.width}px`;
          wrapper.style.height = `${rect.height}px`;
          icon.replaceWith(wrapper);
          wrapper.append(icon);
          const clone = icon.cloneNode(true);
          clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          const originals = [icon, ...icon.querySelectorAll("*")];
          [clone, ...clone.querySelectorAll("*")].forEach((shape, i) => {
            const style = getComputedStyle(originals[i]);
            shape.style.fill = style.fill === "none" ? "none" : "white";
            shape.style.stroke = style.stroke === "none" ? "none" : "white";
            shape.style.strokeWidth = style.strokeWidth;
          });
          wrapper.style.setProperty("--lc-mask", `url("data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}")`);
        }
        candidates.set(wrapper, "icon");
      }
    }
    for (const [element, kind] of candidates) {
      const style = getComputedStyle(element);
      const layers = [];
      let parent = element;
      while (parent && parent !== home) {
        const color = rgba(getComputedStyle(parent).backgroundColor);
        if (color[3]) layers.unshift(color);
        parent = parent.parentElement;
      }
      const color = rgba(kind === "border" ? style.borderTopColor : style.color);
      targets.set(element, { kind, original: color.slice(0, 3), color,
        layers, font: style.font, image: "" });
    }
    dirty = false;
  }
  function source() {
    if (video.readyState >= 2 && video.hasAttribute("src")) return video;
    if (video.poster !== lastPoster) { lastPoster = video.poster; poster.src = lastPoster; }
    return poster.complete && poster.naturalWidth ? poster : null;
  }
  function frame() {
    const started = performance.now();
    timer = null;
    if (!active()) {
      delete root.dataset.localContrast;
      for (const [element, entry] of targets) release(element, entry);
      return;
    }
    try {
      const media = source();
      if (!media) { schedule(); return; }
      // Removing the former forced clock plate is scoped to this state.
      root.dataset.localContrast = "active";
      if (dirty || [...targets.keys()].some(element => !element.isConnected)) refresh();
      const viewport = video.getBoundingClientRect();
      if (!viewport.width || !viewport.height) { schedule(); return; }
      const scale = Math.min(1, 640 / Math.max(viewport.width, viewport.height));
      const sampleWidth = Math.max(1, Math.round(viewport.width * scale));
      const sampleHeight = Math.max(1, Math.round(viewport.height * scale));
      if (sample.width !== sampleWidth) sample.width = sampleWidth;
      if (sample.height !== sampleHeight) sample.height = sampleHeight;
      const crop = colors.cover(media.videoWidth || media.naturalWidth, media.videoHeight || media.naturalHeight,
        viewport.width, viewport.height);
      sampler.drawImage(media, crop.x, crop.y, crop.width, crop.height, 0, 0, sample.width, sample.height);
      const pixels = sampler.getImageData(0, 0, sample.width, sample.height).data;
      function backgroundAt(x, y, layers) {
        const sx = Math.max(0, Math.min(sample.width - 1, x));
        const sy = Math.max(0, Math.min(sample.height - 1, y));
        const offset = (sy * sample.width + sx) * 4;
        let bg = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
        for (const layer of layers) bg = colors.over(bg, layer);
        return bg;
      }
      // Read all geometry before writing paint-only properties.
      const boxes = [...targets].map(([element, entry]) => ({ element, entry, rect: element.getBoundingClientRect() }));
      for (const { element, entry, rect } of boxes) {
        if (!rect.width || !rect.height || rect.bottom < viewport.top || rect.top > viewport.bottom) continue;
        const left = Math.floor((rect.left - viewport.left) * sample.width / viewport.width);
        const top = Math.floor((rect.top - viewport.top) * sample.height / viewport.height);
        const width = Math.max(1, Math.min(320, Math.ceil(rect.width * sample.width / viewport.width)));
        const height = Math.max(1, Math.min(160, Math.ceil(rect.height * sample.height / viewport.height)));
        const minimum = entry.kind === "border" || entry.kind === "icon" ? 3 : 4.5;
        // Most labels already have good contrast. Keep their native paint and
        // avoid generating any texture for them, including a static clock.
        let needsRepair = false;
        scan: for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const bg = backgroundAt(left + x, top + y, entry.layers);
          const original = entry.color[3] === 255 ? entry.original : colors.over(bg, entry.color);
          if (colors.ratio(colors.luminance(bg), colors.luminance(original)) < minimum) {
            needsRepair = true;
            break scan;
          }
        }
        if (!needsRepair) { release(element, entry); continue; }
        paint.width = width; paint.height = height;
        const texture = painter.createImageData(width, height);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const sx = Math.max(0, Math.min(sample.width - 1,
            Math.floor((rect.left - viewport.left + x * rect.width / width) * sample.width / viewport.width)));
          const sy = Math.max(0, Math.min(sample.height - 1,
            Math.floor((rect.top - viewport.top + y * rect.height / height) * sample.height / viewport.height)));
          const bg = backgroundAt(sx, sy, entry.layers);
          const original = entry.color[3] === 255 ? entry.original : colors.over(bg, entry.color);
          const ink = colors.ink(bg, original, minimum);
          const i = (y * width + x) * 4;
          texture.data.set([...ink, 255], i);
        }
        painter.putImageData(texture, 0, 0);
        const image = `url("${paint.toDataURL("image/png")}")`;
        if (image !== entry.image) {
          element.style.setProperty("--lc-image", image);
          entry.image = image;
        }
        element.classList.add(`lc-${entry.kind}`);
        if (entry.kind === "input") {
          painter.font = entry.font;
          const prefix = element.value.slice(0, element.selectionStart || 0);
          const caretX = Math.max(0, Math.min(width - 1, Math.round(
            (painter.measureText(prefix).width - element.scrollLeft) * width / rect.width)));
          const offset = (Math.floor(height / 2) * width + caretX) * 4;
          element.style.setProperty("--lc-caret", `rgb(${Array.from(texture.data.slice(offset, offset + 3)).join(",")})`);
        }
      }
      root.dataset.localContrastFrames = String((Number(root.dataset.localContrastFrames) || 0) + 1);
      root.dataset.localContrastCostMs = (performance.now() - started).toFixed(1);
    } catch (error) {
      failed = true;
      delete root.dataset.localContrast;
      for (const [element, entry] of targets) release(element, entry);
      console.warn("El contraste local del fondo no está disponible; se conservó la presentación estándar.");
      window.dispatchEvent(new CustomEvent("slate-contrast-error"));
      return;
    }
    // Bound CPU work; stop completely off the home screen or when hidden.
    if (!video.paused) schedule();
  }
  function schedule() { if (!timer) timer = setTimeout(frame, 100); }
  function invalidate() { dirty = true; schedule(); }
  const observer = new MutationObserver(records => {
    if (records.some(record => record.type === "attributes"
      ? record.target === home || record.target.matches(".slate-home-grid,.slate-widget")
      : [...record.addedNodes, ...record.removedNodes].some(node =>
        node.nodeType === 3 ? !node.parentElement?.closest("[data-lc-wrapper]") :
          node.nodeType === 1 && !node.matches("[data-lc-wrapper],.lc-icon-wrap")))) invalidate();
  });
  observer.observe(home, { subtree: true, childList: true, attributes: true,
    attributeFilter: ["class", "style", "data-widget-background"] });
  new MutationObserver(invalidate).observe(root, { attributes: true,
    attributeFilter: ["data-theme", "data-contrast", "data-backdrop", "data-color-mode", "style"] });
  for (const event of ["loadeddata", "seeked", "play", "pause", "emptied"]) video.addEventListener(event, invalidate);
  video.addEventListener("emptied", () => { failed = false; });
  poster.addEventListener("load", invalidate);
  window.addEventListener("resize", invalidate);
  home.addEventListener("scroll", schedule, { passive: true });
  for (const event of ["input", "select", "keyup", "pointerup"]) home.addEventListener(event, schedule);
  for (const event of ["focusin", "focusout", "pointerover", "pointerout"]) home.addEventListener(event, invalidate);
  home.addEventListener("transitionend", invalidate);
  document.addEventListener("visibilitychange", invalidate);
  schedule();
})();
