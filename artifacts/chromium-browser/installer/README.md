# DMG estático, asistente animado y guía de Slate Privacy

- [Distribución directa: pasos, firmas y matriz Mac](MAC-DIRECT-DISTRIBUTION.md).
- [Mac App Store: viabilidad, bloqueos y decisión NO-GO actual](MAC-APP-STORE.md).

Se conserva el motor y el comportamiento de reproducción/PiP actuales. No se
prepara otra edición ni se cambia a WebKit sin decisión explícita del usuario.

## Tres cosas distintas

1. **Guía HTML**: `pnpm --filter @workspace/chromium-browser run guide:build` produce
   `release/guide/Slate-Privacy-guia.html`. Se puede abrir sin conexión, incluso
   fuera de macOS. Es una demostración con pasos, pausa, repetición y movimiento
   reducido; **no instala nada**. Incluye imágenes, tipografías y sus licencias,
   estilos y código dentro del mismo archivo. No necesita servidor.
2. **DMG tradicional**: `pnpm --filter @workspace/chromium-browser run package:mac`.
   Conserva el fondo estático normal/Retina y el arrastre de Slate a Aplicaciones.
3. **DMG asistido**: en un Mac, ejecutar
   `pnpm --filter @workspace/chromium-browser run package:mac:assisted`.
   Genera `release/assisted-arm64/Slate-Privacy-Asistido-0.1.0-arm64.dmg` y
   `release/assisted-x64/Slate-Privacy-Asistido-0.1.0-x64.dmg`.
   Para una sola arquitectura, añadir `--arm64` o `--x64`.

Los comandos de generación son para desarrolladores con Node/pnpm y dependencias
instaladas. **El usuario final no necesita terminal ni herramientas de desarrollo**:
monta el DMG asistido y abre explícitamente **Instalar Slate Privacy.app**. Pulsa
**Instalar Slate**, confirma el reemplazo si corresponde y espera la comprobación.
Al terminar, **Abrir Slate Privacy** abre `/Applications/Slate Privacy.app`;
después puede cerrar el asistente y expulsar el volumen.

Finder no reproduce la animación del fondo ni abre el asistente automáticamente.
No se sustituye el DMG tradicional por el asistido. El navegador incluido ya
contiene todos sus archivos: no se descarga durante la instalación. Esto no
cambia las actualizaciones de filtros de privacidad que realiza el navegador
cuando el usuario lo abre.

## Mascota, animación y aislamiento

Se reutiliza **el Miso aprobado, gatito negro sencillo**, que ya existe en
`src/companion-ui.cjs`. No se editan ese archivo, sus estilos ni su arte desde
este trabajo. El generador extrae literalmente su SVG y falla expresamente si
cambia el contrato, en lugar de inventar otra mascota. Las transformaciones de
saludo, desplazamiento y celebración viven exclusivamente en `ui.css`.
Si el chat principal cambia el arte, regenerar y revisar la guía antes de
empaquetar; no hay una copia del personaje que mantener en paralelo.

La misma interfaz local se incrusta en la app instaladora. Sin el puente nativo
es una demostración; dentro del instalador sus estados proceden exclusivamente
de operaciones reales. La pausa afecta al movimiento, no a la copia ni a los
mensajes. El movimiento reducido sigue al sistema hasta una elección manual.
Tab, Enter/Espacio y los controles nativos permiten usarla con teclado.

El instalador tiene otra entrada, otra identidad
(`com.brujula.browser.installer`) y su propio directorio de datos. No carga el
arranque del navegador, no cambia `com.brujula.browser`, no toca su perfil ni
activa o guarda preferencias del acompañante. El navegador sigue excluyendo
`installer/` y `release/` de su lista de archivos; el asistente se empaqueta
desde un proyecto temporal independiente sin dependencias de ejecución npm.
El payload contiene únicamente el bundle del navegador, no otro instalador.

El renderizador está aislado, con sandbox, sin Node y sin rutas proporcionadas
por la página. El puente solo admite consultar estado, instalar, cancelar,
cerrar y abrir el destino fijo. Se valida el emisor y su frame principal.
Se rechazan ventanas, navegación, permisos y solicitudes de red. La política
de contenido solo permite los scripts/estilos locales por su hash y los recursos
embebidos. No hay telemetría ni porcentajes de avance inventados.

## Copia, cancelación y recuperación

- Solo macOS; origen fijo en `Contents/Resources/payload/Slate Privacy.app` y
  destino fijo `/Applications/Slate Privacy.app`.
- Se comprueba el identificador, tipo y ejecutable del bundle y su firma con
  `codesign --verify --deep --strict`. Un payload sin firma válida se rechaza.
  Esta verificación no equivale a notarización ni acredita por sí sola un
  certificado Developer ID.
- Se rechazan enlaces que salgan del bundle, un destino simbólico y una carpeta
  Aplicaciones que no sea la carpeta física esperada.
- Se comprueba espacio libre y se detectan procesos de Slate antes de copiar y
  antes del cambio final. La detección no puede impedir que alguien inicie otra
  copia justo después de esa comprobación: no abras Slate durante la instalación.
- `ditto --rsrc --extattr --acl` copia a una carpeta aleatoria del mismo volumen,
  con modo 0700, conservando los enlaces y metadatos necesarios. Se comparan todos
  los archivos (SHA-256), enlaces y permisos, y se vuelve a verificar la firma.
- No hay reemplazo sin un diálogo nativo de confirmación. Se vuelve a comprobar
  que el destino no haya cambiado desde la preparación.
- La preparación, copia y verificación se pueden cancelar. Se termina el proceso
  de copia antes de eliminar el temporal. La aplicación anterior no se mueve en
  esas fases. Cerrar la ventana espera esa cancelación.
- La finalización usa renombrados en el mismo volumen, conservando el bundle
  anterior hasta comprobar el destino final. Durante ese breve paso no se acepta
  cancelar/cerrar. Ante fallo se restaura el anterior. No se afirma que dos
  renombrados sean un intercambio atómico frente a cortes de corriente.
- Si falla la restauración, **nunca se elimina la copia anterior**. Se informa de
  la ruta de recuperación. Un nuevo intento detecta una recuperación pendiente
  y no la oculta bajo otra instalación.
- Tras un cierre forzado/corte durante el cambio final, puede quedar
  `/Applications/.slate-install-…/previous.app`. En Finder, usar
  **Ir → Ir a la carpeta** con la ruta indicada. Conservar esa copia y, si falta
  Slate en Aplicaciones, moverla allí y renombrarla `Slate Privacy.app`. Si hay
  dos copias, conservar ambas hasta verificar cuál se quiere mantener. Los
  temporales sin copia anterior de una interrupción se pueden retirar con Finder
  una vez cerrado el asistente. No borrar una carpeta de recuperación a ciegas.

No se piden contraseñas desde la interfaz ni se eleva privilegio alguno. Si no hay
permisos, el asistente muestra el error y permite cerrar o reintentar. El DMG
tradicional puede servir como alternativa gestionada por Finder/administrador;
no garantiza eludir las restricciones de la máquina. No se retira cuarentena,
no se desactiva Gatekeeper ni se hacen cambios en los datos del usuario.

## Firma y notarización: requisito de una entrega pública

La obtención/configuración de certificados no forma parte de esta entrega. La
generación asistida requiere que el navegador empaquetado pase `codesign`; falla
antes de crear un DMG engañoso si no lo hace. Electron Builder usa la configuración
de firma disponible en el equipo de generación. El payload se comprueba también
después de la fase de firma del asistente.

Ambas configuraciones usan el hook `apple-sign.cjs` para conservar la huella del
certificado elegido hasta el firmador real. El asistente utiliza rutas absolutas
porque se genera desde otro proyecto temporal, y mantiene hardened runtime y
entitlements explícitos. Esto no selecciona ni crea un certificado Developer ID.
Los checks de configuración no inspeccionan certificados, no ejecutan `codesign`
ni validan una firma VMP de un binario.

Los modos opcionales `--vmp-verify` y `--vmp-sign --allow-binary-upload` se aplican
a ambos comandos. VMP se verifica/solicita antes de Apple y solo se verifica
después; el asistido vuelve a comprobar Apple y, en modo VMP activo, VMP del
navegador ya copiado dentro del asistente. Por defecto VMP está desactivada y no
se acredita reproducción comercial. Firmar VMP puede subir el binario completo
del motor a Castlabs, no solo su huella; no se hace por activar el CDM.

Antes de distribuir, configurar Developer ID, hardened runtime y los
entitlements adecuados para Electron, firmar el navegador y el asistente
incluyendo su contenido anidado, notarizar y adjuntar el ticket según el proceso
de Apple. Verificar ambos bundles y la distribución final con `codesign`,
`spctl` y `stapler`, y probar en un Mac limpio con Gatekeeper/quarantine normales.
Una firma ad hoc útil para desarrollo **no** es una entrega pública aprobada.
No se ha publicado, firmado con Developer ID ni notarizado nada desde Linux.

## Comprobaciones

Desde la raíz del proyecto:

```sh
pnpm --filter @workspace/chromium-browser run typecheck
pnpm --filter @workspace/chromium-browser run check:installer
pnpm --filter @workspace/chromium-browser test
pnpm --filter @workspace/chromium-browser run package:mac:check
pnpm --filter @workspace/chromium-browser run package:mac:assisted:check
pnpm --filter @workspace/chromium-browser run test:installer:ui
pnpm --filter @workspace/chromium-browser run test:installer:shell
```

`package:mac:assisted:check` valida la configuración y genera la guía, pero no
genera ni prueba un DMG. Las pruebas del motor usan directorios temporales y una
interfaz de operaciones inyectada: no escriben en `/Applications`, no prueban
`ditto` ni falsifican que se haya conservado una firma real. La prueba de interfaz
compara estados de presentación con un puente simulado, claramente etiquetado en
las capturas; la prueba de shell usa el main/preload real y verifica en Linux que
se rechaza instalar y abrir una copia no verificada.

Resultados y límites observados: [VALIDATION.md](VALIDATION.md).
