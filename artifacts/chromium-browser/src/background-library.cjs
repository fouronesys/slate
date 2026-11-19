const fs = require("node:fs");
const path = require("node:path");
const VALID_FILE = /^[\da-f-]{36}\.(mp4|webm|mov)$/;
function normalizeLibrary(saved, directory, legacyFile) {
  const entries = Array.isArray(saved) ? saved : [];
  const seen = new Set();
  const result = [];
  for (const entry of [...entries, ...(legacyFile ? [{ fileName: legacyFile, name: "Vídeo guardado" }] : [])]) {
    if (!entry || !VALID_FILE.test(entry.fileName) || seen.has(entry.fileName)) continue;
    if (!fs.existsSync(path.join(directory, entry.fileName))) continue;
    seen.add(entry.fileName);
    result.push({ fileName: entry.fileName, name: typeof entry.name === "string" ? entry.name.slice(0, 120) : "Vídeo guardado" });
  }
  return result;
}
module.exports = { VALID_FILE, normalizeLibrary };
