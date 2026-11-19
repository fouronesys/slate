"use strict";
const { randomUUID } = require("node:crypto");
const { eligibleQuery, cleanSuggestion } = require("./suggestion-policy.cjs");

const PROVIDERS = Object.freeze({
  google: { label: "Google", url: "https://suggestqueries.google.com/complete/search", key: "q",
    params: { client: "firefox", hl: "es", ie: "UTF-8", oe: "UTF-8" } },
  duckduckgo: { label: "DuckDuckGo", url: "https://duckduckgo.com/ac/", key: "q", params: { type: "list" } },
  bing: { label: "Bing", url: "https://www.bing.com/AS/Suggestions", key: "qry", params: { csr: "1" } },
  brave: { label: "Brave Search", url: "https://search.brave.com/api/suggest", key: "q", params: {} },
});

function suggestionUrl(engine, query) {
  if (!Object.hasOwn(PROVIDERS, engine) || !eligibleQuery(query)) throw new Error("Consulta de sugerencias no válida.");
  const provider = PROVIDERS[engine];
  const url = new URL(provider.url);
  url.search = new URLSearchParams({ ...provider.params, [provider.key]: query.trim() });
  if (engine === "bing") url.searchParams.set("cvid", randomUUID().replaceAll("-", "").toUpperCase());
  return url.href;
}

function parseSuggestions(engine, data) {
  const values = engine === "bing" && Array.isArray(data?.s) ? data.s.map(item => item?.q) : data?.[1];
  if (!Array.isArray(values)) throw new Error("Formato de sugerencias no válido.");
  return [...new Set(values.map(cleanSuggestion).filter(Boolean))].slice(0, 5);
}

async function boundedJson(response) {
  if (Number(response.headers.get("content-length")) > 65536) throw new Error("Respuesta demasiado grande.");
  if (!response.body) throw new Error("Respuesta vacía.");
  const reader = response.body.getReader();
  const parts = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) throw new Error("Respuesta demasiado grande.");
      parts.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); }
}

class SearchSuggestions {
  constructor({ fetch, timeoutMs = 2500 }) {
    this.fetch = fetch;
    this.timeoutMs = timeoutMs;
    this.controller = null;
  }
  cancel() {
    this.controller?.abort();
    this.controller = null;
  }
  async get({ query, engine, enabled, ephemeral }) {
    this.cancel();
    if (!enabled || ephemeral || !eligibleQuery(query)) return { status: "disabled", items: [] };
    if (!Object.hasOwn(PROVIDERS, engine)) return { status: "error", items: [], message: "Buscador no compatible." };
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const label = PROVIDERS[engine].label;
    try {
      const response = await this.fetch(suggestionUrl(engine, query), {
        method: "GET", credentials: "omit", cache: "no-store", redirect: "error",
        referrerPolicy: "no-referrer", headers: { Accept: "application/json" }, signal: controller.signal,
      });
      if (!response.ok || response.status === 204) throw new Error("Proveedor no disponible.");
      const items = parseSuggestions(engine, await boundedJson(response));
      if (controller.signal.aborted) return { status: "cancelled", items: [] };
      return { status: "ok", items, provider: label };
    } catch {
      if (this.controller !== controller) return { status: "cancelled", items: [] };
      return { status: "error", items: [], provider: label,
        message: `Sugerencias de ${label} no disponibles. Se mantienen las locales.` };
    } finally {
      clearTimeout(timer);
      if (this.controller === controller) this.controller = null;
    }
  }
}

module.exports = { SearchSuggestions, suggestionUrl, parseSuggestions, PROVIDERS };
