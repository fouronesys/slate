(function (root) {
  "use strict";
  // This intentionally errs on the side of withholding a query. It cannot
  // identify every secret: the setting explains that partial text is sent.
  function eligibleQuery(value) {
    if (typeof value !== "string") return false;
    const text = value.trim();
    return text.length >= 2 && text.length <= 100 &&
      !/[\u0000-\u001f\u007f]/.test(text) &&
      /^[\p{L}\p{M}\p{N}\s'’¿?¡!+-]+$/u.test(text) &&
      !/\b(?:password|passwd|contrase(?:ñ|n)a|token|secret|api[- ]?key|bearer)(?:\b|\d)/i.test(text) &&
      !/\b[a-f0-9]{20,}\b/i.test(text) && !/\S{40,}/.test(text);
  }
  function cleanSuggestion(value) {
    if (typeof value !== "string") return null;
    const text = value.replace(/[\ue000\ue001]/g, "").trim();
    return text.length > 0 && text.length <= 200 && !/[\u0000-\u001f\u007f]/.test(text) ? text : null;
  }
  const api = { eligibleQuery, cleanSuggestion };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SlateSuggestionPolicy = api;
})(typeof window !== "undefined" ? window : globalThis);
