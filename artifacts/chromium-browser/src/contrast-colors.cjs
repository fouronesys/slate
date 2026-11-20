/* Pure local colour operations. No Electron, files, screen capture or network. */
(function (scope) {
  "use strict";
  const linear = Array.from({ length: 256 }, (_, i) => {
    const value = i / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  function luminance(rgb) {
    return .2126 * linear[rgb[0]] + .7152 * linear[rgb[1]] + .0722 * linear[rgb[2]];
  }
  function ratio(a, b) { return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }
  function ink(background, original, minimum = 4.5) {
    const bg = luminance(background);
    if (ratio(bg, luminance(original)) >= minimum) return original;
    const negative = background.map(value => 255 - value);
    if (ratio(bg, luminance(negative)) >= minimum) return negative;
    return ratio(bg, 1) >= ratio(bg, 0) ? [255, 255, 255] : [0, 0, 0];
  }
  function over(background, foreground) {
    const alpha = foreground[3] / 255;
    return background.map((value, i) => Math.round(value * (1 - alpha) + foreground[i] * alpha));
  }
  function cover(sw, sh, dw, dh) {
    const scale = Math.max(dw / sw, dh / sh);
    const width = dw / scale, height = dh / scale;
    return { x: (sw - width) / 2, y: (sh - height) / 2, width, height };
  }
  const api = { luminance, ratio, ink, over, cover };
  if (typeof module === "object" && module.exports) module.exports = api;
  else scope.SlateContrastColors = api;
})(typeof window === "object" ? window : globalThis);
