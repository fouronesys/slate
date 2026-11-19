const SEARCH_ENGINES = Object.freeze({
  google: "https://www.google.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
  bing: "https://www.bing.com/search?q=",
  brave: "https://search.brave.com/search?q=",
});
const isSearchEngine = value => typeof value === "string" && Object.hasOwn(SEARCH_ENGINES, value);
function searchUrl(query, engine = "google") {
  if (!isSearchEngine(engine)) throw new Error("Buscador no válido.");
  return SEARCH_ENGINES[engine] + encodeURIComponent(query);
}
module.exports = { isSearchEngine, searchUrl };
