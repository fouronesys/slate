# Slate Privacy

Navegador de escritorio personalizable basado en Electron for Content Security.

Código: `artifacts/chromium-browser`. Node 24 y pnpm 10.26.1.

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/chromium-browser test
pnpm --filter @workspace/chromium-browser run dev
```

## Actualizaciones y entregas

Lee [GITHUB-RELEASES.md](artifacts/chromium-browser/GITHUB-RELEASES.md).
Las firmas no desaparecen: se automatizan en una entrega autorizada. Ningún push publica binarios.
La primera instalación del actualizador es manual; después se consulta GitHub Releases desde General.

## Estado de validación

Pruebas de lógica e interfaz verificadas en desarrollo. La nueva cadena de GitHub, su DMG
y la actualización firmada entre dos versiones necesitan validación real en un Mac.
Intel y el asistente no están cubiertos por la entrega arm64 inicial.

Los componentes de terceros conservan sus licencias. Un repositorio público no
otorga por sí solo una licencia sobre la marca, los recursos o el código propio.
