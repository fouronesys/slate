# Distribución directa Mac: preparación y aceptación

Esta ruta conserva el navegador ECS/Chromium actual y macOS 12. **No implica
publicación, firma pública ni notarización ya realizadas.** Generar, firmar,
notarizar e instalar exige un Mac real y la autorización del titular.

## Identidades y entregas

| Entrega | Archivo (versión y arquitectura variables) | Acción del usuario |
| --- | --- | --- |
| DMG tradicional, estático | `release/Slate-Privacy-0.1.0-arm64.dmg` o `…-x64.dmg` | Arrastrar Slate Privacy a Aplicaciones. El fondo no se anima. |
| DMG asistido, app animada | `release/assisted-arm64/Slate-Privacy-Asistido-0.1.0-arm64.dmg` o `assisted-x64/…-x64.dmg` | Montar y abrir manualmente **Instalar Slate Privacy.app**. Pulsar Instalar; luego Abrir Slate Privacy. |
| Guía ilustrativa HTML | `release/guide/Slate-Privacy-guia.html` | Abrir para ver los pasos; no copia ni instala nada. |

Finder no inicia el asistente automáticamente. Ambas distribuciones contienen
el navegador completo; el asistente no lo descarga. La animación usa el Miso
aprobado sin activar el compañero del navegador ni guardar su preferencia.
Identidades actuales: navegador `com.brujula.browser`, asistente
`com.brujula.browser.installer`; no cambiarlas como parte de una firma.

## Lista de preparación, distinta de App Store Connect

1. **Referencia recuperable:** conservar la versión funcional en el Mac y una
   copia segura del perfil antes de probar reemplazos. Registrar versión, build,
   arquitectura, macOS y resultados de reproducción/PiP previos.
2. **Titular y certificados:** verificar Apple Developer y disponer localmente
   de **Developer ID Application** con su clave privada en el llavero. Se usa
   para firmar navegador, helpers, asistente y DMG. **Apple Development no sirve
   como identidad de distribución pública directa**, y Apple Distribution es
   para MAS. **Developer ID Installer** solo es pertinente si se crea un PKG,
   que esta entrega no genera. No comprar ni crear nada automáticamente.
3. **Producto y legal:** mantener Bundle IDs; decidir versión pública y build
   creciente, icono, licencias de motor/dependencias/CDM, avisos, política de
   privacidad y soporte. Preparar capturas Mac reales de ambas entregas. No
   anunciar compatibilidad con servicios que no se hayan reproducido realmente.
   Distribuir fuera de MAS no elimina obligaciones legales/exportación.
4. **Configuración local:** en un Mac con Node/pnpm, dependencias y herramientas
   Apple instaladas, ejecutar los dos `package:mac:*:check` indicados en README.
   Seleccionar localmente la identidad correcta del llavero. El hook conserva la
   **huella SHA-1 del certificado**, evitando volver al nombre con acentos; la
   huella no demuestra que el certificado sea Developer ID: inspeccionar su tipo,
   Team ID y vigencia. Un check de Linux no inspecciona el llavero.
5. **VMP antes de Apple:** por defecto está desactivado; para verificar una firma
   existente usar `--vmp-verify`. Solo si el titular autoriza subir el binario del
   motor a Castlabs para solicitar firma, usar **juntos** `--vmp-sign
   --allow-binary-upload`. No basta el consentimiento del CDM en el navegador.
   No se solicita cuenta, cliente ni firma automáticamente; un fallo bloquea la
   compilación en esos modos. No incluir cliente EVS, tokens ni claves en apps,
   DMG o repositorio. Verificar VMP no es comprobar un servicio comercial.
6. **Generación y firma Apple:** elegir arquitectura(s), mantener hardened
   runtime y entitlements revisados para ECS. Ambos comandos usan el hook por
   huella. El asistido crea primero el navegador y verifica su bundle, firma el
   asistente y vuelve a comprobar **el navegador copiado dentro del asistente**.
   En modo VMP activo vuelve a verificarlo sin volver a solicitar firma después
   de Apple. Si cualquiera falla, no distribuir. Una firma válida para desarrollo
   que pase `codesign` no convierte el resultado en una entrega pública.
7. **Notarización:** comprobar firma de todos los bundles con Developer ID
   Application, hardened runtime y sellado de contenido anidado; preparar los
   bundles finales antes de enviarlos. Confirmar timestamp seguro en las firmas y
   ausencia de `get-task-allow=true` en los entitlements de producción. Usar el
   flujo actual `notarytool` de Apple,
   revisar el informe completo hasta estado Accepted y adjuntar/validar tickets
   con `stapler`. Para funcionamiento offline, planificar el ticket de la app
   navegador antes de incorporarla al asistente y el del asistente antes del DMG
   final; si se vuelve a empaquetar o cambia cualquier contenido firmado, repetir
   las firmas/verificaciones/notarización afectadas. No alterar un payload sellado
   para adjuntar un ticket dentro del asistente ya firmado. No usar `--deep` para
   firmar como reparación automática. `codesign --deep` aquí es **verificación**.
8. **Aceptación:** aplicar la matriz siguiente y la matriz de recuperación de
   [VALIDATION.md](VALIDATION.md). Verificar navegador de origen, payload dentro
   del asistente, navegador instalado, asistente y ambos DMG finales. Calcular
   SHA-256 de cada DMG **después** de adjuntar tickets y conservar hashes junto
   con resultados e informes, sin credenciales.
9. **Entrega autorizada:** solo después de todos los resultados aprobados, el
   titular decide dónde alojar y distribuir cada archivo claramente nombrado.
   No requiere App Store Connect. No se ha realizado ningún envío en esta tarea.

Ejemplos de generación para el desarrollador, desde la raíz, **solo en Mac**:

```sh
# Verificación local de VMP existente; requiere cliente EVS preparado previamente.
pnpm --filter @workspace/chromium-browser run package:mac --arm64 --vmp-verify
pnpm --filter @workspace/chromium-browser run package:mac:assisted --arm64 --vmp-verify
# Omitir --arm64 genera arm64 y x64. Sustituir por --x64 para Intel.
# Sin --vmp-verify los comandos no acreditan una firma VMP de producción.
```

No se ejecutan ejemplos de creación de cuentas ni comandos de subida de binarios
en esta guía. Seguir el flujo oficial Apple con credenciales locales protegidas.

## Matriz manual de aceptación Mac (toda pendiente)

Registrar por fila: DMG/canal, versión/build, SHA-256 final, arquitectura, modelo,
macOS, fecha, responsable, firma/Team ID, resultado **APROBADO / FALLO / NO PROBADO**
y evidencia. Guardar informes sin datos personales. Repetir ambos canales en Intel
y Apple Silicon, macOS 12 donde sea compatible y macOS actual. No usar “aprobado”
para una fila no ejecutada. Errores/restauración solo en un equipo desechable.

| Caso | Resultado exigido | Estado aquí |
| --- | --- | --- |
| Finder y arranque | DMG tradicional estático normal/Retina; asistido requiere apertura manual; Miso correcto; sin autoejecución | NO PROBADO |
| Aislamiento | Sin Node/pnpm/red para copiar; navegador sin cliente EVS ni instalador; asistente con único payload y sin claves; compañero no activado | NO PROBADO en bundles Mac |
| Firmas antes de copiar | `codesign --verify --deep --strict --verbose=2` en navegador, asistente y payload; inspección `codesign -dv --verbose=4` y entitlements muestran identidad/Team ID esperados | NO PROBADO |
| VMP y sellado | Verificación local de VMP del navegador origen, dentro del asistente ya firmado e instalado; nunca firma VMP posterior a Apple | NO PROBADO |
| Primera instalación | Destino `/Applications/Slate Privacy.app`, archivos/modos/enlaces/ACL/xattrs/resource forks conservados y firma válida | NO PROBADO |
| Reemplazo | Rechazo no altera nada; aceptación conserva perfil, marcadores, cookies y preferencias; restauración ante fallo | NO PROBADO |
| Fallos y cancelación | Espacio/permisos/app abierta, cancelar y corte abrupto no destruyen la copia previa; recuperación explícita, no éxito falso | NO PROBADO |
| Apertura y salida | Abre navegador instalado, expulsar DMG y reabrir funciona; Cmd-Q termina realmente app/helpers/ditto según la fase | NO PROBADO |
| Gatekeeper normal | `spctl --assess --type execute --verbose=4` en apps instaladas y asistente; evaluación de imagen `spctl --assess --type open --context context:primary-signature --verbose=4 archivo.dmg` | NO PROBADO |
| Notarización | Resultado Accepted, `xcrun stapler validate` en apps/tickets previstos y DMG; primera apertura offline en Mac limpio con cuarentena normal | NO PROBADO |
| Vídeo de referencia | Repetir sitios/vídeos que funcionaban al usuario; inicio, audio, seek, pausa y reanudación, pantalla completa, PiP redimensionable y cierre; tras reemplazo y expulsar DMG | NO PROBADO |
| DRM real | Consentimiento inicialmente desactivado, activar/reiniciar/instalar CDM, EME y reproducción por servicio anotados por separado; sin cuentas o suscripciones de prueba, marcar servicio NO PROBADO | NO PROBADO |
| Datos del usuario | Descargas, importación/exportación, persistencia y cierre sin pérdida después de instalar/reemplazar | NO PROBADO |

No retirar cuarentena, desactivar Gatekeeper ni recurrir a excepciones para dar
por aprobadas estas filas. Una captura de Linux no acredita ninguna de ellas.

## Fuentes oficiales

- Apple, [Developer ID](https://developer.apple.com/developer-id/):
  certificado, hardened runtime, notarización y herramientas actuales.
- Apple, [Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution).
- Electron, [Mac App Store / certificados](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide).
- Castlabs, [EVS y orden de firmas](https://github.com/castlabs/electron-releases/wiki/EVS).

Viabilidad y lista independiente de tienda: [MAC-APP-STORE.md](MAC-APP-STORE.md).
