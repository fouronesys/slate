# Actualizaciones verificables: Mac, distribución directa

## Decisión y límites

El titular eligió **GitHub Releases, `fouronesys/slate`, solo canal estable**.
No se ha creado una release, subido un binario, generado una clave privada,
firmado, notarizado ni instalado nada como parte de esta implementación.
No se añade `electron-updater`: el reemplazo controlado necesita conservar y
recuperar también el perfil, comprobar la promoción VMP y mantener el ECS actual.
No se modifica MAS, Windows, el motor ni el mínimo macOS 12.

**Estado de entrega:** implementación y pruebas de lógica disponibles; clave
pública sin configurar y aceptación nativa pendiente. No anunciar este flujo
como probado en Mac. La primera versión con este código y la clave pública
debe instalarse manualmente: las versiones anteriores no pueden adquirir un
actualizador que no contienen.

## Uso

En **Ajustes → General → Actualizaciones de Mac → Buscar actualización o recuperar
versión**:

1. Slate solicita permiso para consultar la última release estable.
2. Descarga un registro de promoción firmado para la arquitectura del proceso
   (`arm64` o `x64`; Rosetta conserva `x64`). Rechaza builds/versions iguales o
   anteriores, betas, otro repositorio/canal/Team ID, otro motor, falta de macOS
   12 o verificación VMP de producción insuficiente.
3. Ofrece **Aplazar** antes de descargar el DMG. Después de descargar también
   permite aplazar el reemplazo; queda preparado entre reinicios y se puede
   reanudar desde el mismo botón.
4. Verifica tamaño y SHA-256 firmados; evaluación Gatekeeper del DMG; identidad
   Developer ID Application, Team ID, hardened runtime, timestamp, ausencia de
   `get-task-allow`, firma estricta y evaluación Gatekeeper de la app. Monta solo lectura sin
   abrir Finder, compara hash de todo el bundle y del framework ECS con los
   aprobados y comprueba las arquitecturas del ejecutable y framework.
   El cliente usa herramientas incluidas en macOS y lee las cabeceras Mach-O
   directamente: no ejecuta `xcrun`, `stapler` ni `lipo`, ni solicita instalar
   Xcode/Command Line Tools. La validación explícita de tickets con `stapler`
   se mantiene solo en la promoción del responsable; el registro firmado está
   ligado a esos bytes finales. Gatekeeper puede necesitar conexión si no
   dispone de evidencia local suficiente: en caso de rechazo se bloquea,
   nunca se omite la evaluación.
5. Un ayudante local confirma que puede arrancar **antes** de cerrar Slate.
   Slate detiene la actividad de las páginas y vacía almacenamiento/cookies.
   El ayudante espera la salida real del proceso y rechaza helpers abiertos.
   No copia bases de datos en uso.
6. Conserva el perfil completo en una carpeta privada fuera de este, lo compara
   archivo a archivo y sustituye la app mediante renombrados en el mismo volumen.
   Mantiene nombre de app, Bundle ID, llavero y ruta de perfil existentes,
   incluida la ruta heredada de Brújula. No borra ni migra cookies por su cuenta.
   Las descargas ya guardadas no se tocan; las que estén en curso se interrumpen
   al cerrar el navegador, por lo que deben terminarse antes.
7. La nueva app muestra una confirmación al completar el arranque de su interfaz.
   Elegir volver, fallo de arranque o ausencia de confirmación en tres minutos
   provoca un intento de restaurar app **y** perfil anteriores. La copia del
   perfil posterior se conserva aparte, sin fusionarlo con uno más antiguo.
   Esta confirmación acredita arranque, no reproducción DRM ni estabilidad futura.
8. Tras confirmar, el mismo botón permite restaurar la versión previa o eliminar
   explícitamente las copias. No se permite otra actualización hasta resolver
   el punto de recuperación anterior. Si el ayudante se interrumpe y la app
   normal sigue presente, el próximo arranque bloquea la apertura del perfil
   hasta recuperar o cerrar. Si falta la app normal, usar el lanzador externo
   descrito a continuación: no depende de que exista esa app.

El reinicio de mantenimiento no ejecuta **borrar datos al salir**, para que no
elimine las cookies que se pretende conservar. La preferencia no cambia y vuelve
a aplicarse en salidas normales. Restaurar después de haber seguido navegando
devuelve el perfil al momento anterior a la actualización; los datos nuevos no
se pierden automáticamente, pero quedan en el perfil posterior sin aparecer en
la versión restaurada.

### Recuperar cuando Slate no aparece en Aplicaciones

Antes de iniciar el reemplazo se guardan y sincronizan en disco un lanzador
independiente **Recuperar Slate.command** y **RECUPERAR SLATE.txt**, tanto en
la carpeta de soporte `Slate Updates` como en la carpeta de la transacción
`/Applications/.slate-update-…`. El diálogo muestra la ruta exacta antes del
reinicio, incluida la reanudación de una descarga aplazada.

Para una interrupción entre mover la app anterior y colocar la nueva:

1. Si el ayudante sigue trabajando, dejarlo terminar. Si hay un navegador Slate
   abierto, cerrarlo completamente antes de recuperar.
2. En Finder → **Ir → Ir a la carpeta**, abrir
   `~/Library/Application Support/Slate Updates/` (o la ruta exacta que mostró
   el diálogo si la carpeta de soporte es distinta).
3. Abrir **Recuperar Slate.command**. Terminal ejecuta el ayudante copiado fuera
   de la app, usando el runtime ECS de `previous.app`. No necesita que exista
   `/Applications/Slate Privacy.app`, ni Node/Python/Xcode instalados aparte.
   El modo Node de ese runtime ya se comprobó antes de cerrar la app original.
4. El ayudante verifica la transacción y que no hay otro ayudante ni app/helpers
   abiertos; valida la copia anterior, restaura app/perfil según la fase
   persistida y vuelve a abrir Slate. No espera al PID antiguo del navegador,
   que podría haberse reutilizado después de reiniciar el Mac.
5. Ante un error, Terminal indica que la recuperación no está confirmada.
   Conservar todas las copias e instrucciones; no arrastrar la nueva app
   preparada encima de la anterior ni borrar el perfil manualmente.

El script no descarga, publica ni instala herramientas. No desactivar
Gatekeeper ni retirar cuarentena para abrirlo. Si Finder/Terminal impide su
ejecución en un Mac concreto, no marcar esa release como aprobada: guardar la
evidencia y resolverlo antes de distribuir. La prueba automatizada abre el
script real desde el estado sin app normal y recorre el ayudante y motor de
restauración con operaciones del sistema y runtime simulados; la ejecución
con ECS/Finder/Gatekeeper reales sigue en la matriz Mac.

### Privacidad y almacenamiento

No hay consulta de red al arrancar, temporizador, telemetría, cookies de navegador,
cabeceras de autenticación ni envío del perfil. Solo tras pulsar buscar se
contacta con la API pública de GitHub y, si se autoriza la descarga, sus
servidores de archivos. GitHub ve IP y solicitudes de red; no afirmar anonimato.
No se usan tokens ni repositorios privados en el cliente.

Las copias incluyen cookies y preferencias privadas, bajo la carpeta de soporte
del usuario `Slate Updates` con permisos 700. No se suben a la nube. El usuario
debe proteger también las copias de seguridad de su Mac; no se añade cifrado
propio. El llavero y FileVault siguen siendo responsabilidades del sistema.
Después de restaurar, el perfil posterior se conserva en `profile-after`.
La app anterior se conserva en `/Applications/.slate-update-…/previous.app`;
si se restauró, la app rechazada puede quedar en `failed.app`.
No borrar esas carpetas durante una recuperación. Permisos insuficientes,
falta de espacio o firmas erróneas bloquean la operación; no se solicitan
privilegios de administrador ni se desactiva Gatekeeper.

## Preparación del responsable, una vez

La confianza no se descarga de GitHub: una clave **pública Ed25519** debe formar
parte de la app inicial firmada y notarizada. El titular genera y guarda su clave
privada **fuera del proyecto**, con permisos 600, en su Mac o almacén de firma.
No introducirla en chat, repositorio, app, DMG ni informe de aceptación.

Con la clave pública PEM exportada, desde la raíz del proyecto:

```sh
pnpm --filter @workspace/chromium-browser run updates:mac:trust \
  --public-key /ruta/local/slate-updates-public.pem
```

Este comando solo incorpora la clave pública. Sin ella, el botón muestra un
bloqueo antes de consultar GitHub. No se proporciona una clave de prueba como
confianza de producción. No cambiar de clave de forma unilateral: se necesita
una entrega puente firmada con la clave anterior o reinstalación manual verificada.
Mantener copia segura de la clave y procedimiento de revocación del titular.

## Preparación y promoción de cada versión/arquitectura

1. Incrementar versión pública y `CFBundleVersion` (electron-builder usa la
   versión del paquete si no se define `buildVersion`). Ambas deben ser
   posteriores a las instaladas. Etiqueta `v<versión>`, sin sufijo beta.
2. Ejecutar `package:mac` con `--vmp-verify`, o con consentimiento separado de
   subida `--vmp-sign --allow-binary-upload`. Se mantienen la firma Apple por
   huella y el orden VMP antes de Apple. El empaquetador sigue usando
   `--publish never`; generar un DMG no lo promueve.
3. Completar firma Developer ID, notarización y tickets **finales** según
   [MAC-DIRECT-DISTRIBUTION.md](MAC-DIRECT-DISTRIBUTION.md). La app de referencia
   debe ser idéntica a la app incluida en el DMG final, con su ticket incorporado
   antes de sellar el DMG. No promover el DMG asistido como payload de actualización.
   Se conserva disponible como instalador independiente, al igual que el de arrastre.
4. Ejecutar la matriz manual inferior y guardar un informe JSON local, sin
   datos personales ni credenciales, con este contrato. No copiar “APROBADO”
   para una fila que no se haya probado:

```json
{
  "version": "0.2.0",
  "arch": "arm64",
  "sha256": "<SHA-256 real de 64 caracteres del DMG final probado>",
  "macOS12": "APROBADO",
  "macOSCurrent": "APROBADO",
  "stockMac": "APROBADO",
  "install": "APROBADO",
  "profile": "APROBADO",
  "recovery": "APROBADO",
  "recoveryLauncher": "APROBADO",
  "video": "APROBADO",
  "pip": "APROBADO",
  "quit": "APROBADO",
  "evidence": "Referencia local a los informes y resultados reales del Mac."
}
```

`stockMac` exige completar el flujo sin Xcode ni Command Line Tools instalados.
`recoveryLauncher` exige provocar en un equipo desechable el estado sin app normal
y recuperar desde Finder mediante el lanzador externo, no llamando a `rollback`
desde una consola de desarrollo.

5. Solo en Mac, después de la aceptación y con EVS ya preparado localmente:

```sh
pnpm --filter @workspace/chromium-browser run updates:mac:promote \
  --app "/ruta/final/Slate Privacy.app" \
  --dmg "/ruta/final/Slate-Privacy-0.2.0-arm64.dmg" \
  --arch arm64 \
  --key-file /ruta/fuera-del-proyecto/slate-updates-private.pem \
  --acceptance /ruta/local/aceptacion-arm64.json
```

La promoción comprueba la app, el paquete incorporado y su clave pública, el
motor fijado, macOS 12, las firmas/tickets, las arquitecturas y la igualdad del
payload montado. Ejecuta verificación EVS **local, sin red**, del origen y del
payload final: exige streaming/producción y al menos 30 días. Nunca solicita firma
VMP, crea cuentas o sube binarios. Solo entonces firma un registro JSON, ligado
a SHA-256 del DMG final, bundle completo, framework, versión/build y Team ID.
Se emite bajo `release/updates/` junto a una copia pública del informe.

El cliente no incluye EVS, Python, claves privadas ni credenciales. Verifica la
atestación Ed25519 y su correspondencia con el binario y firma Apple actuales.
Es una **atestación del responsable de la release sobre verificación VMP offline**,
no una nueva llamada EVS en el Mac del usuario ni una garantía de Netflix/Disney+.
Por prudencia vale 29 días desde la verificación; se exige al menos un día restante
al preparar/aplicar. Si vence, el responsable debe volver a verificar y promover
los mismos bytes finales, sustituyendo el registro firmado. La app instalada no
deja de funcionar por vencer ese registro.

6. Repetir para Intel (`--arch x64`) con su informe. Con autorización de
   publicación **separada y expresa**, el titular puede crear una release pública
   estable de `fouronesys/slate`, etiqueta `v<versión>`, y adjuntar:
   - `Slate-Privacy-<versión>-arm64.dmg`
   - `Slate-Privacy-<versión>-arm64.update.json`
   - los dos equivalentes `x64` si están aprobados.

Los comandos de esta implementación no crean tags/releases ni publican archivos.
Los informes no se descargan en el cliente ni necesitan publicarse.

## Matriz nativa adicional — toda NO PROBADO aquí

Ejecutar con perfiles desechables y cookies de prueba, en Intel y Apple Silicon,
macOS 12 y actual. Registrar versión/build/hash/máquina/resultado y evidencia
sin guardar cookies ni credenciales en los informes.

| Caso | Resultado exigido | Estado |
| --- | --- | --- |
| Primera entrega con confianza | Instalación manual, firma Developer ID, tickets, clave pública correcta, arranque sin consulta de GitHub | NO PROBADO |
| Buscar y aplazar | Consentimiento de red; estable únicamente; aplazar antes/después de descarga y reanudar después de cerrar | NO PROBADO |
| Red interrumpida o release incompleta | Error explícito sin cambiar app/perfil; se rechazan hash/firma/versión/build/canal/arquitectura ajenos | NO PROBADO |
| Apple y VMP | Rechazo de ad-hoc, Apple Development, Team ID ajeno, ticket ausente, debug entitlement, VMP de desarrollo/caducada o framework distinto | NO PROBADO |
| Perfil real | Conservar marcadores, cookies/sesiones, preferencias, espacios, llavero y ruta Brújula; SQLite sin copiar en uso | NO PROBADO |
| Reinicio de mantenimiento | No ejecuta borrar datos al salir; la siguiente salida normal sí respeta esa preferencia | NO PROBADO |
| Vídeo/PiP | Misma referencia antes y después; comprobar DRM por servicio por separado, sin declarar éxito sin reproducción | NO PROBADO |
| Fallo de arranque o no confirmar | Tras salida real del nuevo proceso restaura app/perfil; conserva perfil posterior separado | NO PROBADO |
| Corte entre renombrados, sin app normal | Desde Finder abrir el `.command` externo, recuperar `previous.app` y el perfil con el ayudante; luego abrir Slate normal sin perder copias | NO PROBADO |
| Mac de usuario sin Xcode/CLT | Buscar, descargar, validar Gatekeeper, verificar arquitectura, actualizar y recuperar sin invocar/instalar herramientas de desarrollo | NO PROBADO |
| Restauración aplazada | Aviso sobre datos nuevos; restaura referencia anterior y conserva los nuevos aparte | NO PROBADO |
| Recursos y cierre | Poco espacio, permisos, helpers activos, descarga en curso, Cancelar, Cmd-Q, desconexión y volumen montado: ningún éxito falso | NO PROBADO |
| Eliminar recuperación | Confirmación explícita; solo copias descartables, nunca perfil o app activos | NO PROBADO |

## Pruebas automatizadas disponibles

`pnpm --filter @workspace/chromium-browser run test:updates:mac` cubre firmas
Ed25519, identidad/canal/versión/arquitectura/macOS/motor/VMP, destinos de red,
bloqueo MAS/desarrollo/Linux, separación de herramientas cliente/publicador,
lectura Mach-O, lanzamiento externo de recuperación sin la app normal,
aceptación de promoción y transacciones con perfiles
de prueba (incluidos fallos y recuperación tras interrupción). Las operaciones
Apple se inyectan en estas pruebas: **no acreditan firmas, llavero, cookies
Chromium reales, fuses de Electron, DMG, arranque, VMP o recuperación en Mac**.
Un ayudante que no pueda usar el modo Node de ECS falla antes de cerrar Slate.
