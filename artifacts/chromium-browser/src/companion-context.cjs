const { createHash } = require("node:crypto");
const { SUGGESTION_RULES } = require("./companion-suggestions.cjs");
function contextSuggestion(tab, bookmarks, settings, meta = {}, dismissed = new Set()) {
  if (!tab || tab.ephemeral || !settings.companionSuggestions) return null;
  let url;
  try { url = new URL(tab.url); } catch { return null; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
  const context = {
    url, settings, meta,
    saved: bookmarks.some(entry => entry.url === tab.url),
    collected: Boolean(meta.collected),
  };
  for (const rule of SUGGESTION_RULES) {
    if (rule.action === "collect" && meta.canCollect === false) continue;
    if (!rule.when(context)) continue;
    const id = createHash("sha256").update(`${tab.id}:${tab.url}:${rule.key}`).digest("hex");
    if (dismissed.has(id)) continue;
    return { id, key: rule.key, action: rule.action, label: rule.label, text: rule.text };
  }
  return null;
}
module.exports = { contextSuggestion };
