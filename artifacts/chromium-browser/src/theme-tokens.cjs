(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SlateTheme = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const valid = (hex) => typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex);
  function rgb(hex) {
    if (!valid(hex)) throw new Error("Color no válido");
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  function luminance(hex) {
    const [r, g, b] = rgb(hex).map((n) => {
      const s = n / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  }
  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function mix(a, b, ratio) {
    const first = rgb(a), second = rgb(b);
    return "#" + first.map((n, i) => Math.round(n + (second[i] - n) * ratio).toString(16).padStart(2, "0")).join("");
  }
  function palette(hex) {
    const background = hex.toLowerCase();
    const ink = contrast(background, "#ffffff") >= contrast(background, "#000000") ? "#ffffff" : "#000000";
    let muted = ink;
    for (let amount = 0.6; amount <= 1.001; amount += 0.05) {
      const candidate = mix(background, ink, Math.min(1, amount));
      if (contrast(background, candidate) >= 4.5) { muted = candidate; break; }
    }
    return { background, ink, muted, quiet: muted, line: mix(background, ink, 0.3) };
  }
  return { palette, contrast, luminance };
});
