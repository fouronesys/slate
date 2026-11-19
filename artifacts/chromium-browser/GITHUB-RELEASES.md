# Entregas y actualizaciones desde GitHub

Repositorio: **https://github.com/fouronesys/slate**.

Se publica una exportación limpia del navegador, no el historial de Replit,
los registros de las pruebas personales, los perfiles ni las credenciales.
El workspace exportado conserva la estructura `artifacts/chromium-browser`
y su propio lockfile. No incluye el servidor API ni el sandbox ajenos al navegador.

## Qué se automatiza

- Cada push/PR ejecuta comprobaciones sin secretos ni firma.
- **Preparar versión Mac arm64** es exclusivamente manual, desde Actions.
  Solicita una versión exacta y autorización para **esa compilación**.
- La ejecución autorizada compila DMG y ZIP para arm64, solicita VMP solo si
  la firma existente no valida con al menos 30 días, firma con Developer ID,
  notariza la app y el DMG, adjunta sus tickets y comprueba ambos.
- Se extrae el ZIP para verificar el payload. Los hashes se calculan después
  del sellado final. El ZIP es necesario para Squirrel.Mac/electron-updater;
  el DMG de arrastre se conserva para la primera instalación.
- El resultado se guarda en un **borrador de Release**, nunca se publica
  automáticamente. No se reemplazan entregas del mismo número.

No se ha ejecutado todavía esta cadena en GitHub ni se ha probado una actualización
real entre dos versiones firmadas. No tratar las pruebas de lógica como evidencia
de que GitHub, Apple, Castlabs o Squirrel ya hayan completado esa entrega.
Intel y el instalador asistido siguen **NO PROBADOS** en este flujo.
Los runners macOS pueden consumir minutos facturables según la cuenta de GitHub.

## Configuración inicial, una sola vez

En el repositorio, abre **Settings → Environments** y configura `slate-signing`.
Restringe las entregas a `main` y, si tu plan lo permite, añade revisión obligatoria
por el titular. Protege también `main`; no ejecutes código de terceros con secretos.

En **Settings → Secrets and variables → Actions** (o en el entorno anterior),
crea estos secretos **directamente en GitHub**, nunca como archivos del repo,
variables públicas, mensajes, capturas o adjuntos:

| Nombre | Contenido |
| --- | --- |
| `CSC_LINK` | Exportación `.p12` en base64 de **Developer ID Application**, incluida su clave privada. No Apple Development ni Apple Distribution. |
| `CSC_KEY_PASSWORD` | Contraseña de esa exportación `.p12`. |
| `APPLE_ID` | Cuenta Apple del titular autorizada para notarizar. |
| `APPLE_APP_SPECIFIC_PASSWORD` | Contraseña específica de app para notarización. |
| `APPLE_TEAM_ID` | Identificador del equipo Apple correcto. |
| `EVS_ACCOUNT_NAME` | Nombre de la cuenta existente de Castlabs EVS. |
| `EVS_PASSWD` | Contraseña de esa cuenta. No se crea una cuenta nueva. |

El certificado se exporta desde **Acceso a Llaveros → Mis certificados**,
seleccionando Developer ID Application con su clave privada. Se importa solo
en el runner efímero mediante electron-builder. No es necesario revocar ni
recrear el certificado del Mac.

`GITHUB_TOKEN` lo proporciona GitHub para crear el borrador. **No se incluye
ningún token GitHub en Slate**; el actualizador solo consume entregas públicas.
La autenticación VMP usa el cliente oficial en el runner. No se cachea su
configuración de cuenta ni se incluye en el navegador. No se fuerzan firmas
cuando una firma existente es válida.

## Crear una versión

1. Incrementa `version` en `artifacts/chromium-browser/package.json` y actualiza
   el lockfile (`pnpm install --lockfile-only`). Sube los cambios y espera que
   **Comprobar Slate** termine correctamente.
2. Abre **Actions → Preparar versión Mac arm64 → Run workflow**, rama `main`.
3. Introduce exactamente esa versión, sin `v`, y autoriza las subidas
   de esa compilación a Castlabs y Apple. Sin esa autorización no se compila.
4. Revisa el borrador en Releases y sus archivos:
   `Slate-Privacy-<versión>-arm64.dmg`, `.zip`, `latest-mac.yml`,
   los blockmaps disponibles y `SHA256SUMS.txt`.
5. Prueba el DMG y la actualización en un Mac con copia recuperable de la app
   y el perfil. Conserva la versión anterior y no cambies los binarios después
   de verificarlos. **Publicar el borrador es una autorización separada**.
6. Solo después de esas comprobaciones, el titular puede publicar la Release.
   No editar ni sustituir activos de una versión ya distribuida: emitir otra.

Un certificado o contraseña expirados, un acuerdo Apple pendiente o una
indisponibilidad de Castlabs/Apple harán fallar la entrega explícitamente.
No se sustituye por un artefacto sin firma ni se desactiva Gatekeeper.

## En el navegador

**Configuración → General → Actualizaciones de Slate**:

- Buscar versiones publicadas manualmente.
- Activar opcionalmente comprobación al iniciar y cada seis horas. Por
  privacidad está desactivada inicialmente y no se activa al aceptar los términos.
- Elegir descargar y, después, reiniciar para instalar.

GitHub y sus servidores de descarga reciben la IP y metadatos técnicos. No
reciben el historial ni cookies de los sitios visitados. electron-updater usa
su propia sesión en memoria, comprueba SHA-512 y entrega el ZIP a Squirrel.Mac,
que exige una app firmada compatible con la identidad de la app instalada.
No se ejecuta JavaScript remoto ni se sustituye `app.asar` por separado.
No hay degradaciones ni versiones preliminares automáticas.

La app en modo desarrollo no consulta la red de actualización. La primera
versión que incorpora este actualizador debe instalarse manualmente desde
un DMG firmado/notarizado. Las versiones antiguas no lo adquieren por sí solas.
Las preferencias y la identidad del perfil se conservan; si está activado
borrar datos al salir, el reinicio respeta esa elección. Se bloquea instalar
mientras haya descargas activas y se avisa de guardar el trabajo abierto.

## Matriz pendiente antes de anunciar actualizaciones operativas

Con copias recuperables y un perfil de prueba:

- Instalar versión firmada A y publicar una versión firmada B superior.
- Buscar B, descargar, cancelar reinicio y confirmar que A sigue utilizable.
- Reiniciar/instalar B; verificar Developer ID, Gatekeeper, VMP y preferencias.
- Repetir con borrar al salir, sin borrar marcadores ni preferencias.
- Fallos de red, ZIP alterado, firma diferente y versión inferior: no instalar.
- Validar restauración de A y perfil; no degradar perfiles reales a ciegas.

Hasta completar esta matriz, el actualizador está **implementado, no validado
en distribución real**. Los borradores no aparecen en el canal público.
