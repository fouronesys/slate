"use strict";
// Deliberate clean export: never publish workspace history or private test logs.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../..");
const destination = path.join(root, "generated-artifacts", "slate-github");
const browser = "artifacts/chromium-browser";
const extensions = new Set([".cjs", ".js", ".css", ".html", ".svg", ".png", ".plist", ".json", ".md", ".sh", ".yml", ".yaml", ".ttf", ".woff", ".woff2", ".txt"]);
function main() {
  if (fs.existsSync(destination)) throw new Error("La exportación ya existe. Usa un destino limpio.");
  function copy(relative) {
    const source = path.join(root, relative);
    const target = path.join(destination, relative);
    const stat = fs.lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) throw new Error(`Archivo de exportación no permitido: ${relative}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  function tree(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("No se exportan enlaces simbólicos.");
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) tree(name);
      else if (extensions.has(path.extname(entry.name)) && entry.name !== "VALIDATION.md") copy(name);
    }
  }
  for (const dir of ["src", "scripts", "test", "build", "installer"]) tree(`${browser}/${dir}`);
  for (const name of ["package.json", "README.md", "GITHUB-RELEASES.md"]) copy(`${browser}/${name}`);
  tree(".github/workflows");
  copy(".npmrc");
  fs.writeFileSync(path.join(destination, "package.json"), JSON.stringify({
    name: "slate-workspace", private: true, version: "0.0.0", packageManager: "pnpm@10.26.1",
    scripts: { test: "pnpm --filter @workspace/chromium-browser test" },
  }, null, 2) + "\n");
  fs.writeFileSync(path.join(destination, "pnpm-workspace.yaml"), [
    "packages:", "  - artifacts/chromium-browser", "minimumReleaseAge: 1440",
    "autoInstallPeers: false", "onlyBuiltDependencies:", "  - electron",
    "overrides:", "  js-yaml: '4.3.2'", "",
  ].join("\n"));
  fs.writeFileSync(path.join(destination, ".gitignore"), [
    "node_modules/", "release/", "release-github/", "generated-artifacts/", ".DS_Store", "*.log",
    ".env", ".env.*", "*.p12", "*.pfx", "*.pem", "*.key", "*.mobileprovision", "",
  ].join("\n"));
  fs.writeFileSync(path.join(destination, "README.md"), [
    "# Slate Privacy", "", "Navegador de escritorio personalizable basado en Electron for Content Security.",
    "", "Código: `artifacts/chromium-browser`. Node 24 y pnpm 10.26.1.",
    "", "```sh", "pnpm install --frozen-lockfile",
    "pnpm --filter @workspace/chromium-browser test",
    "pnpm --filter @workspace/chromium-browser run dev", "```", "",
    "## Actualizaciones y entregas",
    "", "Lee [GITHUB-RELEASES.md](artifacts/chromium-browser/GITHUB-RELEASES.md).",
    "Las firmas no desaparecen: se automatizan en una entrega autorizada. Ningún push publica binarios.",
    "La primera instalación del actualizador es manual; después se consulta GitHub Releases desde General.",
    "", "## Estado de validación",
    "", "Pruebas de lógica e interfaz verificadas en desarrollo. La entrega arm64 0.1.1 de GitHub",
    "se compiló firmada y notarizada; su instalación fue confirmada por el usuario.",
    "La actualización firmada entre dos versiones aún necesita validación real en un Mac.",
    "Intel y el asistente no están cubiertos por la entrega arm64 inicial.",
    "", "Los componentes de terceros conservan sus licencias. Un repositorio público no",
    "otorga por sí solo una licencia sobre la marca, los recursos o el código propio.", "",
  ].join("\n"));
  console.info(`Exportación limpia preparada en ${destination}. Genera y comprueba su lockfile antes de subir.`);
}
if (require.main === module) main();
module.exports = { main };
