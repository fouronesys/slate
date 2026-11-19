# Viabilidad de Slate Privacy en la Mac App Store

Informe documental para la distribución Mac. **No es una aprobación de Apple ni
una edición MAS implementada.** Fuentes oficiales consultadas al preparar este
informe; volver a comprobar las políticas antes de cualquier envío.

## Decisión y condición de continuidad

**NO-GO para enviar el binario actual a la Mac App Store.** Mantener la edición
directa ECS/Chromium, macOS 12 y las dos entregas DMG. No cambiar motor, retirar
DRM, migrar perfiles ni modificar reproducción/PiP como consecuencia de esta
auditoría. La reproducción y PiP que el usuario confirmó en su Mac son una
referencia de regresión, no evidencia de una futura edición MAS.

No basta cambiar `target: dmg` por `mas`. Antes de implementar otra edición:
resolver por escrito con Apple la política aplicable a este navegador Mac;
confirmar con Castlabs la disponibilidad/licencia de un motor MAS compatible y
de su DRM; presentar al usuario diferencias, pérdidas funcionales y coste de
mantenimiento; obtener su decisión explícita. **No hay consentimiento registrado
para sustituir el motor.** Si un bloqueo exige WebKit o perder reproducción,
detenerse y preguntar, no ejecutar una conversión.

## Auditoría de bloqueos

| Área | Requisito / hallazgo | Estado y evidencia necesaria |
| --- | --- | --- |
| Política de navegadores | La regla 2.5.6 habla de WebKit y remite a autorizaciones de motores alternativos. La página enlazada de Apple describe iOS/iPadOS en la UE; no acredita un permiso macOS para Slate. | **Bloqueo de política no resuelto.** No concluir ni “Chromium siempre admitido” ni “prohibido en todo Mac” a partir de esos permisos móviles. Solicitar aclaración de Apple para esta app/plataforma antes de invertir en MAS. |
| Motor MAS | Electron exige su variante MAS: el binario `darwin` estándar no funciona simplemente añadiendo App Sandbox. Actualmente se empaqueta ECS `43.8.6+wvcus`, no una variante MAS validada. | **Bloqueo técnico.** Confirmar existencia y soporte de una variante MAS ECS con CDM/VMP y mínimo macOS 12. No sustituirla automáticamente por Electron estándar, que no acredita las mismas funciones DRM. |
| Dos sandbox distintos | `sandbox: true` de los renderizadores Chromium no es `com.apple.security.app-sandbox`. El plist actual habilita JIT y carga de biblioteca CDM, pero no App Sandbox. | **No compatible tal cual.** Una edición separada necesitaría perfiles de aprovisionamiento y entitlements de app/helpers, herencia, grupo y Team ID; pruebas del aislamiento real y del motor. No desactivar el sandbox Chromium para “arreglar” MAS. |
| Componente DRM descargado | `protected-video.cjs` permite, con consentimiento, que ECS descargue/actualice una biblioteca ejecutable Widevine. 2.4.5(iv) y 2.5.2 restringen descargar/instalar código que añade o cambia funcionalidad. | **Bloqueo de revisión y licencias.** El consentimiento no es una excepción a la política. Obtener respuesta de Apple y del proveedor sobre una solución admitida; tampoco asumir que se puede redistribuir el CDM dentro del bundle. |
| Validación de bibliotecas | La edición directa usa `disable-library-validation` para el CDM de otro firmante. | **Compatibilidad MAS no demostrada.** Revisar entitlements y restricciones del motor MAS y del componente con los proveedores; no trasladar excepciones del hardened runtime como autorización MAS. |
| APIs y helpers | MAS exige APIs públicas (2.5.1) y un paquete autocontenido. Electron documenta `autoUpdater` y `crashReporter` deshabilitados en MAS, además de límites de captura, accesibilidad y DNS. | **Auditoría binaria pendiente.** Revisar motor, bibliotecas nativas y helpers reales con herramientas de Apple, no solo JavaScript. Probar PiP/ventanas auxiliares, permisos de cámara/micrófono y cierre de procesos. No afirmar ausencia de APIs privadas a partir de esta lectura. |
| Archivos y perfil | El navegador escribe en `userData`, mantiene una ruta de migración del perfil antiguo y usa Descargas; también importa archivos elegidos por diálogo. | **Adaptación pendiente.** Contenedor MAS, permisos de red saliente, selección de archivos de lectura/escritura y security-scoped bookmarks para persistencia cuando corresponda. Probar apertura, guardado, importación, reinicio y acceso denegado sin leer perfiles externos automáticamente. Migración solo con consentimiento, copia y recuperación. |
| Instalador asistido | Copia un bundle a `/Applications`; su objetivo es instalar otra app. | **No es el producto a enviar a MAS.** La tienda instala/actualiza el navegador; no subir el DMG ni el asistente como atajo. Mantener ambos exclusivamente en el canal directo. |
| Actualizaciones y licencia propia | 2.4.5(ii), (vi) y (vii) exigen entrega autocontenida con tecnologías de Apple, prohíben mecanismos propios de licencia/copia de la app y reservan actualizaciones a la tienda. | **Revisión pendiente.** No reutilizar el asistente ni un actualizador directo. Revisar cualquier pantalla legal de lanzamiento y distinguir licencias/DRM del contenido de una licencia que bloquee el propio navegador; no retirar avisos legales necesarios ni DRM sin análisis y consentimiento. |
| Seguridad y versión mínima | Mantener macOS 12 exige verificar el ciclo de soporte del proveedor; MAS puede añadir requisitos de SDK/herramientas al enviar. | **Pendiente antes de una edición MAS.** Confirmar soporte de seguridad, SDK y sistemas admitidos sin elevar silenciosamente el mínimo. |
| Privacidad y derechos | Apple exige declaración de datos y terceros, política pública y derechos sobre contenido y componentes. | **Preparación pendiente.** Auditar conexiones de filtros/CDM/buscadores y SDK, licencias ECS/Electron/Chromium, Ghostery, fuentes y arte; revisar requisitos de privacy manifests/APIs de motivo requerido. “Sin telemetría propia” no justifica marcar “no recopila datos” sin auditoría. |

La firma Apple, el estado CDM instalado, EME disponible, VMP válido y reproducción
de un servicio son comprobaciones distintas. Ni una aprobación MAS hipotética
ni la notarización garantizan Netflix, Disney+ o PiP en todas las páginas.

## Lista separada: App Store Connect (solo si se resuelven los bloqueos)

No ejecutar altas, compras, creación de certificados ni envíos desde este informe.

1. **Decisión:** obtener las aclaraciones anteriores y consentimiento del usuario
   para una edición separada con diferencias conocidas. Conservar la edición
   funcional directa y una copia recuperable del perfil.
2. **Cuenta e identificador:** el titular verifica membresía Apple Developer,
   contratos y permisos en App Store Connect; registra un App ID explícito y
   habilita solo capacidades justificadas. Decidir si se conserva
   `com.brujula.browser` o se separa la identidad para coexistencia; no cambiar el
   identificador actual ni el contenedor/perfil sin aprobar una migración.
3. **Certificados y perfiles:** Apple Development con perfil de desarrollo y
   dispositivos registrados para probar MAS; Apple Distribution para presentar
   la app. Si se entrega un PKG para la tienda, usar el certificado de instalador
   MAS correspondiente (Mac Installer Distribution / nombre heredado 3rd Party
   Mac Developer Installer). Developer ID Application es para fuera de la tienda.
   Guardar claves en el llavero local, nunca en Git ni en payloads.
4. **Edición MAS:** motor MAS compatible confirmado, configuración independiente,
   App Sandbox en app/helpers, grupos, Team ID y perfiles correctos. Inventariar
   APIs, bibliotecas y permisos. Resolver legal/técnicamente el CDM antes de
   probarlo; no descargar código a escondidas ni quitar DRM para pasar revisión.
5. **Ficha:** crear registro macOS con nombre, Bundle ID y SKU; preparar versión
   comercial y número de compilación creciente, categoría, clasificación por edad,
   territorios/precio, icono, capturas Mac reales de esa compilación, descripción,
   URL de soporte y privacidad, copyright y contacto de revisión. No usar una
   captura de la guía simulada como prueba de instalación/reproducción.
6. **Privacidad y legal:** inventario de datos y terceros, etiquetas de privacidad
   comprobadas, licencias/avisos accesibles, manifiestos exigibles y evaluación de
   cifrado/exportación en App Store Connect (Chromium usa TLS/criptografía; no
   declarar una exención automáticamente).
7. **Firma y pruebas:** mantener huellas al firmar; aplicar VMP antes de Apple
   solo si el proveedor confirma un flujo MAS compatible; comprobar la firma
   resultante sin modificarla. Probar la variante de desarrollo en Mac autorizados
   y, cuando proceda, TestFlight. Repetir la matriz de instalación, contenedor,
   reemplazo/actualización de tienda, descargas, permisos, vídeo y PiP. Un
   paquete de distribución MAS previo a la tienda no se prueba como un DMG normal.
8. **Envío y revisión:** empaquetar según el flujo MAS admitido por las herramientas
   actuales, validar y subir con Transporter únicamente con autorización del
   titular; revisar procesamiento, asociar build, resolver export compliance,
   proporcionar instrucciones para revisar DRM y enviar a revisión manual.
   Explicar componentes y permisos sin prometer aprobación. No presentar la
   notarización directa como sustituto de la revisión de la tienda.

## Fuentes

- Apple, [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
  2.4.5, 2.5.1, 2.5.2, 2.5.6 y 5.1.
- Apple, [Alternative browser engines](https://developer.apple.com/support/alternative-browser-engines/):
  su ámbito documentado es móvil, no una autorización MAS para este proyecto.
- Electron, [Mac App Store submission guide](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide):
  variante MAS, certificados, entitlements, APIs y limitaciones.
- Apple, [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/).
- Apple, [Export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/).
- Castlabs, [EVS](https://github.com/castlabs/electron-releases/wiki/EVS):
  orden VMP/Apple, producción frente a desarrollo; no acredita compatibilidad MAS.

Ruta directa alternativa: [MAC-DIRECT-DISTRIBUTION.md](MAC-DIRECT-DISTRIBUTION.md).
