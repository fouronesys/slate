"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "release", "guide", "Slate-Privacy-guia.html");

function buildGuide() {
  const template = fs.readFileSync(path.join(root, "installer/ui.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "installer/ui.css"), "utf8");
  const js = fs.readFileSync(path.join(root, "installer/ui.js"), "utf8");
  // Consume the existing approved cat verbatim, without loading browser behavior
  // or editing assets maintained by the main conversation.
  const companion = fs.readFileSync(path.join(root, "src/companion-ui.cjs"), "utf8");
  const cat = companion.match(/: `(<svg class="companion-figure cat-figure"[\s\S]*?<\/svg>)`;/)?.[1];
  if (!cat || cat.includes("${")) throw new Error("No se pudo extraer a Miso. Revisa la integración con el arte definitivo; no se sustituye por otro personaje.");
  const data = (file, mime) => `data:${mime};base64,${fs.readFileSync(path.join(root, file)).toString("base64")}`;
  const tokens = {
    __MISO_SVG__: cat,
    __ICON_DATA__: data("src/assets/icon.png", "image/png"),
    __SANS_DATA__: data("src/assets/fonts/dm-sans.ttf", "font/ttf"),
    __SERIF_DATA__: data("src/assets/fonts/fraunces.ttf", "font/ttf"),
  };
  const expand = (text) => text.replace(/__(?:MISO_SVG|ICON_DATA|SANS_DATA|SERIF_DATA)__/g, (key) => tokens[key]);
  const finalCSS = expand(css), finalJS = expand(js);
  const digest = (text) => crypto.createHash("sha256").update(text).digest("base64");
  const policy = `default-src 'none'; script-src 'sha256-${digest(finalJS)}'; style-src 'sha256-${digest(finalCSS)}'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'`;
  let html = expand(template).replace("__CSS__", () => finalCSS).replace("__JS__", () => finalJS);
  html = html.replace("<head>", `<head>\n<meta http-equiv="Content-Security-Policy" content="${policy}">`);
  for (const license of ["dmsans-OFL.txt", "fraunces-OFL.txt"]) {
    const text = fs.readFileSync(path.join(root, "src/assets/fonts", license), "utf8").replaceAll("--", "—");
    html += `\n<!-- Embedded font license: ${license}\n${text}\n-->\n`;
  }
  if (/__[A-Z_]+__/.test(html)) throw new Error("Quedan recursos pendientes en la guía.");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, html);
  console.info(`Guía local generada: ${output}. Demostración, no instala aplicaciones.`);
  return { output, html, mascotHash: digest(cat) };
}
if (require.main === module) buildGuide();
module.exports = { buildGuide };
