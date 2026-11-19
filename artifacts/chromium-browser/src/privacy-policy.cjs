const { getDomain } = require("tldts");
const { searchUrl } = require("./search-engines.cjs");

const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "dclid", "msclkid", "yclid", "mc_cid", "mc_eid",
  "_ga", "_gl", "igshid", "gbraid", "wbraid",
]);

function hostnameOf(value) {
  try { return new URL(value).hostname; } catch { return ""; }
}

function isWebUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function cleanNavigation(value) {
  if (!isWebUrl(value)) return null;
  const url = new URL(value);
  const upgraded = url.protocol === "http:";
  url.protocol = "https:";
  let removed = 0;
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
      removed += 1;
    }
  }
  // Preserve untouched URLs exactly: reserializing queries can break signed URLs.
  return { url: upgraded || removed ? url.href : value, removed, upgraded };
}

function resolveAddress(input, searchEngine = "google") {
  if (typeof input !== "string" || input.length > 8192) return null;
  const value = input.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return cleanNavigation(value)?.url || null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  if (!/\s/.test(value) && value.includes(".")) {
    return cleanNavigation(`https://${value}`)?.url || null;
  }
  return searchUrl(value, searchEngine);
}

function siteOf(value) {
  const hostname = hostnameOf(value);
  return getDomain(hostname, { allowPrivateDomains: true }) || hostname;
}

function schemefulSite(value) {
  if (!isWebUrl(value)) return "";
  return `${new URL(value).protocol}//${siteOf(value)}`;
}

function isThirdParty(url, topUrl, resourceType) {
  if (resourceType === "mainFrame" || !isWebUrl(url)) return false;
  // Workers sometimes lack an attributable top frame. Do not send cookies
  // in that case; failing open here would permit cross-site tracking.
  if (!isWebUrl(topUrl)) return true;
  return schemefulSite(url) !== schemefulSite(topUrl);
}

function requestHeaders(headers, thirdParty) {
  const output = {};
  let cookieBlocked = false;
  for (const [key, value] of Object.entries(headers || {})) {
    const name = key.toLowerCase();
    if (name === "cookie" && thirdParty) { cookieBlocked = true; continue; }
    if (name === "dnt" || name === "sec-gpc") continue;
    output[key] = value;
  }
  output.DNT = "1";
  output["Sec-GPC"] = "1";
  return { headers: output, cookieBlocked };
}

function responseHeaders(headers, thirdParty) {
  const output = {};
  let cookieBlocked = false;
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === "set-cookie" && thirdParty) {
      cookieBlocked = true;
      continue;
    }
    output[key] = value;
  }
  return { headers: output, cookieBlocked };
}

module.exports = {
  hostnameOf, isWebUrl, cleanNavigation, resolveAddress, isThirdParty,
  requestHeaders, responseHeaders, schemefulSite,
};
