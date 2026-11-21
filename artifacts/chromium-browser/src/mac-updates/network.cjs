"use strict";
const https = require("node:https");
const fs = require("node:fs");
const { pipeline } = require("node:stream/promises");
const { Transform } = require("node:stream");
// No cookies, Authorization header, Electron session, analytics or background polling.
function allowed(url) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return false;
  if (u.hostname === "api.github.com") return u.pathname === "/repos/fouronesys/slate/releases/latest" && !u.search;
  if (u.hostname === "github.com") return u.pathname.startsWith("/fouronesys/slate/releases/download/") && !u.search;
  return ["release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(u.hostname);
}
function response(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5 || !allowed(url)) return reject(new Error("Destino de descarga no permitido."));
    const request = https.get(url, { headers: { "User-Agent": "Slate-Privacy-Updater", Accept: "application/json, application/octet-stream" } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        try { resolve(response(new URL(res.headers.location, url).href, redirects + 1)); } catch (e) { reject(e); }
      } else if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`GitHub no entregó el archivo (HTTP ${res.statusCode}). No se ha cambiado Slate.`));
      } else {
        res.setTimeout(30000, () => res.destroy(new Error("Descarga sin respuesta.")));
        resolve(res);
      }
    });
    request.setTimeout(30000, () => request.destroy(new Error("GitHub no responde.")));
    request.on("error", reject);
  });
}
async function json(url) {
  const res = await response(url);
  let size = 0, chunks = [];
  for await (const chunk of res) {
    size += chunk.length;
    if (size > 256 * 1024) { res.destroy(); throw new Error("Respuesta de GitHub demasiado grande."); }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function download(url, file, size) {
  const res = await response(url);
  let count = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      count += chunk.length;
      callback(count > size ? new Error("La descarga supera el tamaño firmado.") : null, chunk);
    },
  });
  const deadline = setTimeout(() => res.destroy(new Error("La descarga superó treinta minutos; puedes reintentarlo.")), 30 * 60 * 1000);
  try {
    await pipeline(res, meter, fs.createWriteStream(file, { flags: "wx", mode: 0o600 }));
    if (count !== size) throw new Error("Descarga incompleta.");
  } catch (e) { await fs.promises.rm(file, { force: true }); throw e; }
  finally { clearTimeout(deadline); }
}
module.exports = { allowed, json, download };
