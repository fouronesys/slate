# Menú unificado, PiP visible y primer inicio

## Panel de ajustes compacto

El panel reserva como máximo 360 px de la ventana (antes 560), respetando el
mínimo de espacio de navegación y las pestañas verticales. El índice conserva
sus cinco categorías; dentro de una categoría, los accesos de sección se sitúan
encima del contenido para no dividir el ancho disponible en dos columnas.
La búsqueda local, la ubicación, el regreso a categorías, el foco y la posición
de lectura por sección se conservan. Protección y Descargas siguen visibles
en la barra superior.

## Menú de clic derecho

El menú nativo cambia según el elemento:

- Imágenes: descargar, copiar la imagen o su dirección y abrirla en otra pestaña.
  Las descargas HTTP(S), `data:` y `blob:` del mismo origen pasan por el centro
  de Descargas existente; no se abren automáticamente ni reemplazan archivos.
- Enlaces: abrir en otra pestaña, abrir en una pestaña fugaz, descargar y copiar
  la dirección. Una pestaña fugaz no abre enlaces en un contexto persistente.
- Texto: copiar y buscar la selección con el buscador elegido. No se ofrece
  búsqueda ni guardado en la bandeja para campos de contraseña.
- Campos editables: deshacer, rehacer, cortar, copiar, pegar, pegar sin formato
  y seleccionar todo, según las capacidades que indique Chromium.
- Fondo de página: atrás, adelante, recargar, copiar dirección, seleccionar todo,
  zoom e imprimir mediante el diálogo del sistema.
- Inspeccionar elemento abre las herramientas de desarrollo del contenido web,
  no las de la interfaz privilegiada del navegador. La bandeja se conserva.
  PiP se activa con el pequeño icono sobre el video, no desde el clic derecho.

La descarga de contenido multimedia solo se ofrece para URLs HTTP(S) cuando
Chromium permite guardarlo; no descarga ni evita protecciones DRM o streaming.
El menú no usa proveedores externos para procesar imágenes o selecciones.
Una búsqueda seleccionada por el usuario sí abre el buscador configurado.

Comprobación nativa con perfil y descargas temporales:
`pnpm --filter @workspace/chromium-browser exec bash ./scripts/preview.sh scripts/verify-context-menu.cjs`.
Verifica clics derechos reales, descargas de imagen HTTP(S)/data/blob, su registro,
copiado, pegado, zoom, apertura de enlaces y el inspector. No envía trabajos de
impresión ni valida impresoras físicas.

El icono de tres líneas de la barra de navegación abre Configuración. Integra
General, Videos, Apariencia, Protección, Marcadores, Historial, Descargas,
Colecciones, Espacios, Permisos, Inicio/widgets, Comandos y Documentos legales.
Protección y Descargas conservan además sus botones visibles en la barra superior.
Abren directamente su sección del mismo panel; el contador de descargas y la
animación de entrega de Miso usan el botón de Descargas, no el de Configuración.
Los comandos muestran solo los atajos implementados; también pueden ejecutarse
con botones. Los accesos antiguos se conservan ocultos para compatibilidad
interna, no como menús visibles separados.

En General se elige el buscador, zoom predeterminado y si los enlaces que
solicitan otra pestaña se abren en segundo plano. Esa opción no suspende
pestañas. Videos permite ocultar el botón PiP. Las preferencias se guardan
localmente y el nuevo valor de zoom se aplica a pestañas abiertas y nuevas
navegaciones. Los perfiles nuevos usan la tipografía del sistema en interfaz y
títulos; no se sustituyen las fuentes elegidas previamente.

El botón PiP es un icono propio de 34 × 24 px, sin texto permanente, centrado
en la parte superior del video HTML accesible. Se inspira en la interacción
de [Video Popout de Opera GX](https://www.opera.com/gx/features/video-popout):
aparece al pasar el cursor y se desvanece al salir o tras 1,6 s de inactividad.
Mientras se apunta al icono o tiene foco de teclado permanece accesible. Cuando
está invisible no intercepta clics; respeta la preferencia de movimiento reducido.
Funciona mediante un clic directo, sin
puente privilegiado en páginas remotas, transmisiones alternativas ni copiar
fotogramas. Se atienden marcos HTTPS/HTTP, videos dinámicos y shadow roots
abiertos; los árboles cerrados, reproductores no HTML y políticas que deniegan
PiP no tienen compatibilidad garantizada. La ventana PiP conserva la
presentación nativa, sin controles adicionales de Slate a su alrededor.

El primer inicio muestra términos y privacidad locales para Four One Solutions
en República Dominicana. Son **borradores informativos pendientes de revisión
jurídica**, no garantías de cobertura legal. Se declara gratuidad, mínimo de
6 años y aceptación por una persona adulta o padre/madre/tutor para menores,
sin pedir nombre ni fecha de nacimiento y sin verificar edad o tutela.
No es un modo infantil ni un filtro de contenidos.

La aceptación requiere tres confirmaciones sin marcar previamente y se guarda
con versión y fecha en el perfil, sin enviarse a un servidor. Si falla el
guardado o cambia la versión documental, no se habilita la navegación. También
se muestra una vez a perfiles existentes sin aceptación de esta versión;
no borra sus datos. La actualización de listas empieza después de aceptar.
El permiso opcional existente para Widevine es independiente de esa aceptación.
Los documentos siguen accesibles desde Configuración. La pantalla obligatoria
de términos debe revisarse para una eventual edición Mac App Store; esta
entrega no afirma ser apta para esa tienda.

Comprobaciones:

```bash
pnpm --filter @workspace/chromium-browser run check:settings
pnpm --filter @workspace/chromium-browser test
pnpm --filter @workspace/chromium-browser run test:settings
```

La prueba nativa usa un perfil temporal, un motor de filtros mínimo de prueba
y páginas HTTPS servidas por un protocolo local sin red. Comprueba el bloqueo
previo a aceptar, persistencia, menú, documentos, preferencias, clic real sobre
el botón PiP y detección de videos dinámicos y marcos de otro origen. No prueba
Netflix/Disney+ ni sustituye instalación y validación de la nueva versión en Mac.
Los scripts nativos anteriores con perfiles nuevos requieren aceptar primero
los términos antes de intentar navegar o descargar filtros; no deben saltarse
ese paso en el producto.

# Slate Privacy

Slate Privacy (antes Brújula) es una app de escritorio basada en Chromium (Electron), diseñada inicialmente para macOS, con preparación de una primera versión Windows x64. Incluye navegación web con pestañas, búsqueda, marcadores e historial local.

## Windows x64

La [guía Windows](docs/WINDOWS.md) contiene requisitos (Windows 10 o posterior),
compilación NSIS separada de Mac, adaptación nativa, conservación de datos,
firma Authenticode, VMP opcional específica de Windows y matriz de pruebas.
`pnpm --filter @workspace/chromium-browser run package:windows:check` valida
la configuración sin compilar ni firmar. La compilación real requiere Windows
x64. **No se ha generado ni validado un instalador Windows en este entorno Linux**;
las pruebas de reproducción Mac no acreditan reproducción Windows y una firma
válida no elimina automáticamente las advertencias de SmartScreen.

## Plan para Android, iPhone e iPad

La [propuesta de arquitectura móvil](docs/arquitectura-movil.md) compara Chromium
mantenido y GeckoView en Android, propone WebKit para distribución general en
iPhone/iPad y detalla límites, matriz de funciones, costes orientativos y pruebas
en dispositivos. Es planificación pendiente de aprobación del motor y del alcance:
no hay apps móviles implementadas ni se promete paridad de escritorio o DRM/PiP
sin pruebas. El plan no modifica este navegador.

## Descargas y Miso mensajero

El botón de **Descargas**, al extremo derecho de la barra de navegación, abre un centro lateral que sigue disponible sobre páginas web. A partir de esta versión los archivos se guardan automáticamente en la carpeta **Descargas del sistema** (`app.getPath("downloads")`); el centro muestra la ruta exacta y permite abrir esa carpeta. Antes no había un gestor propio ni una ruta impuesta por Slate: Electron seguía su diálogo de guardado habitual.

Las descargas muestran progreso, tamaño, pausa/continuación cuando corresponde, cancelación y **Mostrar en Finder** en Mac. No se ejecutan archivos automáticamente. Si un nombre ya existe o lo está usando otra descarga, se añade un número para no sustituirlo. Reanudar depende del servidor y puede reiniciar la transferencia si este no permite continuar.

La lista está limitada a entradas recientes y vive solo durante la ejecución de Slate; se conserva al recargar la interfaz y cambiar de espacio, pero no tras cerrar la app. Cada espacio muestra sus propias entradas; todos guardan en la misma carpeta del sistema. Las descargas deliberadas de pestañas fugaces también crean archivos permanentes, marcados como tales en el centro. Cerrar Slate no borra los archivos completados.

Al iniciarse una descarga, Miso lleva un icono de archivo hacia el botón durante **720 ms**, sin sonido y sin leer el archivo ni la página. Se reutiliza su ilustración local, sin activar el compañero flotante. El efecto se limita a la barra para que no quede detrás de las páginas nativas y no intercepta clics. Se omite si Miso está desactivado o se solicita **Reducir movimiento**; una ráfaga de descargas no crea una cola de animaciones.

`bash scripts/preview.sh scripts/verify-downloads.cjs` comprueba con Electron real una descarga HTTPS local, progreso, pausa/continuación/cancelación, colisiones de nombres, contenido del archivo, acceso a la carpeta, aislamiento entre espacios, recarga de la interfaz y movimiento reducido simulado. Usa un perfil y carpeta de descargas desechables; necesita `openssl` y acepta únicamente el certificado del servidor local en el proceso de prueba. La prueba intercepta los comandos de abrir Finder/carpeta: confirma que reciben la ruta correcta, no la integración visual real de Finder. Guarda `generated-artifacts/slate-descargas-miso.png`; solo para esa captura ralentiza la animación de prueba. La velocidad normal sigue siendo 720 ms. No sustituye la validación en macOS.

## Buscadores y sugerencias de Miso

En **Mi espacio → Privacidad → Buscador predeterminado** puedes elegir Google (predeterminado), DuckDuckGo, Bing o Brave Search. La elección se guarda y se utiliza tanto en el inicio como en la barra de direcciones. Las consultas se envían al proveedor elegido; elegir Google no significa que las búsquedas sean anónimas.

Miso dispone de **63 reglas contextuales locales**. Cada sugerencia incluye un botón de acción en su globo y **Ahora no**. Hay contextos para vídeos, listas y canales, música, documentación, cursos, proyectos, libros, compras, mapas, documentos, PDF, sonido, zoom, pestañas duplicadas, historial y resultados de búsqueda. Los botones pueden guardar un marcador o un enlace en la primera colección disponible, activar Enfoque de YouTube, copiar un enlace, silenciar/restaurar sonido, ampliar/restablecer zoom, cambiar a una pestaña duplicada sin cerrar ninguna o abrir resultados en una pestaña fugaz.

Para ver sugerencias sobre páginas, activa Miso y pulsa **Pasear**. Se pueden desactivar desde **Mi espacio → Inicio → Sugerencias contextuales de Miso**. Se utiliza la dirección de la pestaña y datos que el propio navegador ya conoce (marcadores, colecciones, sonido, zoom y pestañas), no el contenido de las páginas, vídeos, formularios ni conversaciones. Los tipos de página se reconocen por su dirección: no se afirma haber visto o entendido el contenido. No hay modelos remotos, servicios de análisis ni peticiones adicionales para generar sugerencias.

Las pestañas fugaces no generan sugerencias. Guardar, copiar y abrir otra pestaña requieren pulsar el botón; Miso no ejecuta esas acciones automáticamente. Tras aceptar o descartar hay un minuto de pausa para ese contexto; las sugerencias descartadas no se repiten en esa pestaña/dirección durante la sesión (memoria temporal limitada). Cada acción se revalida contra la pestaña activa para impedir que un botón antiguo afecte a otra página.

La comprobación `bash scripts/preview.sh scripts/verify-context-search.cjs` utiliza un perfil temporal y páginas de prueba **sin acceso a los sitios reales**. Comprueba los cuatro buscadores, los botones nativos, guardado de marcadores/colecciones, Enfoque, copia, descarte, desactivación y rechazo de acciones obsoletas. Las pruebas unitarias comprueban que las 63 reglas son alcanzables y tienen acciones admitidas. Esto no equivale a comprobar los servicios externos ni el material nativo de macOS.

## Personalización

### Reproducción protegida local

Slate utiliza **Electron for Content Security 43.8.6+wvcus**, con la versión y el origen fijados en el paquete y el archivo de dependencias. Se eligió una rama estable mantenida que conserva el mínimo existente de macOS 12; Electron 44 y posteriores requieren macOS 13. El cambio conserva el identificador de la app y no sustituye, borra ni importa el perfil personal.

En **Protección → Vídeo protegido · componente local**, activa **Permitir instalación, actualizaciones y contenido protegido**. Cierra y vuelve a abrir Slate cuando el estado lo indique: la versión utilizada del motor crea una promesa de inicialización por proceso y no puede reutilizar la inicialización deshabilitada para instalar el componente en esa misma ejecución. El inicio normal no espera a la descarga.

La instalación y las actualizaciones están desactivadas hasta que actives la opción. Se utiliza el actualizador oficial de Widevine y el componente se ejecuta localmente; los vídeos no se envían a servidores de Slate ni a un servicio intermediario. La plataforma conserva su comunicación normal con su servidor de licencias. Al desactivar la opción se impiden futuras descargas y permisos nuevos: una operación iniciada puede terminar y un componente ya cargado puede seguir activo hasta cerrar el navegador.

**Instalado no significa plataforma compatible.** El botón **Comprobar en esta pestaña** comprueba si el motor reconoce Widevine; no verifica reproducción, resolución, licencias ni aceptación por Netflix, Disney+ u otro proveedor. En Linux, la primera instalación puede requerir otro reinicio por las diferencias del sandbox del CDM.

Los permisos nuevos se limitan a contenido protegido del origen principal HTTPS, tras activar la opción. No habilitan cámara, micrófono, cookies de terceros ni acceso a almacenamiento sin partición. El puente de la interfaz continúa ausente de las páginas remotas.

#### Empaquetado y límite de distribución

Los dos empaquetadores Mac usan la distribución ECS fijada, no una descarga accidental de Electron estándar. Se mantienen DMG separados para Apple Silicon e Intel. Para cargar la biblioteca Widevine firmada por otro proveedor, la configuración de firma macOS incluye la excepción de validación de bibliotecas requerida por ECS; **no desactiva el sandbox de Chromium ni la seguridad web**, pero sí es un cambio explícito en las condiciones de carga de bibliotecas de la app.

Las versiones ECS se suministran con firma VMP de desarrollo. **Un servicio comercial puede rechazar una aplicación sin la firma VMP de producción adecuada aunque reconozca Widevine.** La firma VMP debe preceder a la firma de código de Apple en macOS. La firma/notarización Apple y VMP son cosas distintas. No se copian CDM de Chrome ni se falsifican certificados. Por defecto no se solicita ninguna firma remota.

#### Verificación local y firma VMP opcional

Estas herramientas son solo de compilación: no se incluyen en el navegador ni en el asistente. Requieren Python 3 con pip en tu Mac; se recomienda Python 3.12 o posterior. El cliente oficial `castlabs-evs` se fija a la versión 1.3.3.

1. **Preparar el cliente:** este comando descarga paquetes desde PyPI a `release/vmp-client`, no instala en el Python del sistema, no crea cuentas y no solicita una firma:

   ```bash
   pnpm --filter @workspace/chromium-browser run video:setup
   ```

2. **Comprobar la app instalada sin firmarla ni subirla:**

   ```bash
   pnpm --filter @workspace/chromium-browser run video:verify "/Applications/Slate Privacy.app"
   ```

   Indica la ruta de la `.app`, no el DMG ni toda la carpeta Aplicaciones. El cliente recibe únicamente esa app como objetivo. La verificación bloquea conexiones de red en su proceso Python y exige firma de streaming válida con al menos 30 días de vigencia. Certificados de desarrollo, errores del cliente y resultados vacíos no se consideran válidos. No se muestran errores brutos que puedan contener información privada.

3. **Solo si decides utilizar el servicio de firma:** EVS requiere una cuenta, aunque la firma de versiones oficiales ECS es gratuita según su documentación. Puedes crearla o acceder a ella interactivamente desde tu Mac:

   ```bash
   pnpm --filter @workspace/chromium-browser run video:account signup
   # Si ya tienes cuenta, usa en su lugar:
   pnpm --filter @workspace/chromium-browser run video:account reauth
   ```

   La cuenta y sus credenciales las gestiona el cliente oficial localmente; no se pasan como argumentos ni se incluyen en el proyecto, el ZIP o la app. No compartas contraseñas, tokens ni archivos de autenticación en el chat. Si caduca la sesión, vuelve a autenticarte localmente.

4. **Compilar con firma, autorizando expresamente la subida del binario del motor:**

   ```bash
   pnpm --filter @workspace/chromium-browser run package:mac --vmp-sign --allow-binary-upload
   ```

   **El cliente puede subir el binario de Electron Framework a Castlabs para firmarlo; no se envía solo su huella.** No se envían el perfil, los marcadores, las pestañas ni los vídeos. No es un intermediario de reproducción. El proceso reutiliza una firma válida si ya existe y nunca fuerza nuevas solicitudes rutinariamente. Sin las dos opciones juntas se rechaza el modo de firma.

   El hook `afterPack` firma y verifica **antes** de la firma Apple; `afterSign` solo verifica, nunca vuelve a firmar ni subir después de Apple. Si el cliente falla, la autenticación no está preparada o la firma posterior no pasa, el empaquetado falla: no se presenta como compatible.

   Los mismos indicadores funcionan con `package:mac:assisted`; solo se firma el navegador contenido, no el asistente que no reproduce vídeo. El asistente comprueba de nuevo el paquete del navegador antes de incorporarlo.

También existe el modo `--vmp-verify`, que permite compilar solo si la firma de producción existente pasa la comprobación, sin solicitar otra. `--check` valida configuración sin ejecutar hooks, descargar el cliente, autenticar ni firmar, incluso si se incluyen opciones VMP. Los scripts de empaquetado restablecen los indicadores heredados de una compilación anterior: una ejecución normal sigue sin autorizar subidas.

Para firmar utiliza estos scripts, no el comando directo antiguo `exec electron-builder`: los scripts pasan explícitamente el modo a los hooks. Los hooks de una invocación directa permanecen desactivados salvo configuración explícita del entorno. Las opciones de identidad y notarización Apple siguen siendo independientes y no se configuran aquí.

Después de generar e instalar, vuelve a ejecutar `video:verify` sobre la app instalada. **Una firma válida no prueba reproducción ni aceptación por Netflix/Disney+**: hace falta probar reproducción real en Mac. La preparación y los tests de automatización de este repositorio no equivalen a haber solicitado una firma o haber probado esos servicios.

Referencias: [ECS](https://github.com/castlabs/electron-releases), [requisitos de empaquetado](https://github.com/castlabs/electron-releases/wiki/FAQ#packaging), [VMP](https://github.com/castlabs/electron-releases/wiki/VMP). Tener el código preparado no equivale a haber generado ni probado un DMG en Mac.

#### Comprobación nativa

`scripts/verify-protected-video.cjs` crea un perfil desechable con datos guardados, comprueba que se conservan y activa la opción desde la interfaz. Imprime la ruta del perfil temporal para una segunda ejecución con `--resume=RUTA`, que verifica el estado del componente y la disponibilidad real de la API de Widevine tras reiniciar.

La opción adicional `--demo`, con un perfil de prueba ya preparado, intenta reproducir contenido cifrado de demostración público en el laboratorio UAT de Castlabs y comprobar avance temporal, fotogramas decodificados y PiP. Usa Internet y puede fallar por el entorno o la red: un fallo no cuenta como reproducción verificada. No utiliza cuentas personales ni valida Netflix o Disney+.

### Vídeo flotante (PiP)

Con un vídeo cargado, pulsa **⌘⇧P** en macOS (**Ctrl+Mayús+P** en Linux) o usa **clic derecho → Vídeo en ventana flotante (PiP)**. Repite el atajo para devolverlo a su pestaña. No se añaden botones a la barra ni alrededor del reproductor.

Se usa la ventana PiP nativa de Chromium: puedes moverla y redimensionarla desde sus bordes. Se conserva el reproductor original, sin duplicar el vídeo, copiarlo a un canvas ni abrir otra página. El sistema puede mostrar sus controles nativos al pasar el cursor; Slate no los modifica ni promete ocultarlos.

La búsqueda incluye vídeos HTML normales, reproductores en iframes de otros dominios y componentes con Shadow DOM abierto. Se prioriza el vídeo en reproducción; el menú contextual prioriza el reproductor del marco elegido. Una política de seguridad del sitio, DRM no compatible o un reproductor sin un elemento de vídeo accesible pueden impedir PiP. No se desactivan esas protecciones. La comprobación de los marcos no les concede activación de usuario; solo la orden de presentación al marco seleccionado la recibe.

`scripts/verify-pip-videos.cjs` utiliza vídeos generados y páginas HTTPS locales con un perfil desechable. Comprueba el atajo, vídeos normales, Shadow DOM abierto, iframes de otro origen, selección de marco, restauración del atributo del sitio, políticas bloqueadas y ausencia de botones/puentes nuevos en las páginas. En Linux también redimensiona la ventana PiP real mediante X11 y verifica el evento `resize`; no sustituye una comprobación visual de macOS.

### Fuentes, Miso y cierre de paneles

En **Personalizar → Tipografía** se elige de forma independiente la fuente de la interfaz/controles y la de los títulos del inicio/paneles. Hay siete opciones: DM Sans, Sistema, Fraunces, IBM Plex Mono, Georgia, Avenir Next y Palatino. Las tres fuentes incluidas y las del sistema se usan localmente; no se consulta ningún proveedor de fuentes. Las que no estén instaladas usan la alternativa indicada. La selección se guarda, se aplica también a Miso y no modifica la tipografía de los sitios web.

Los controles y globos de Miso siguen la paleta del navegador, incluidos los colores propios del inicio y el modo de alto contraste. La vista flotante recibe la misma paleta que el inicio; no conserva un fondo verde independiente. La escena sigue siendo transparente. El gato conserva la silueta aprobada e incorpora detalles discretos de orejas/pelaje, inclinación de cabeza al seguir el cursor, saludo con una pata, reacción al clic y gestos de curiosidad, estiramiento y somnolencia. Se respetan Reducir movimiento y la pausa del paseo.

Un clic fuera de la barra lateral derecha la cierra. Los clics dentro no la cierran; los botones que abren otros paneles mantienen su comportamiento. En páginas nativas se observa el evento del navegador, sin inyectar código en el sitio, y se deja pasar el clic original sin devolver el foco a la barra.

Al cerrar la última pestaña **total del navegador**, se sale de pantalla completa HTML y se espera a que finalice la transición de pantalla completa de la ventana antes de solicitar la salida. Las pestañas abiertas en otros espacios siguen contando: no se cierran de forma silenciosa al cerrar la última visible de un espacio. Si la transición no termina, aparece un error en lugar de forzar el proceso. La opción experimental de borrar al salir mantiene su advertencia previa y no se considera corregida por este cambio.

Comprobaciones locales:

```sh
pnpm --filter @workspace/chromium-browser exec bash scripts/preview.sh scripts/verify-miso-preferences.cjs
timeout 30s pnpm --filter @workspace/chromium-browser exec bash scripts/preview.sh scripts/verify-miso-preferences.cjs --quit-native
timeout 30s pnpm --filter @workspace/chromium-browser exec bash scripts/preview.sh scripts/verify-miso-preferences.cjs --quit-html
```

Las dos últimas deben terminar naturalmente con código 0, no solo emitir un evento de salida. El modo HTML usa la API real de pantalla completa y el atajo de cerrar pestaña. La ejecución Linux no verifica la animación de Spaces, el menú nativo ni la transición de pantalla completa de macOS. La comprobación principal cubre colores de controles en inicio/flotante, colores propios, alto contraste, selección y restauración de fuentes, gesto de saludo y clic exterior que conserva el clic/foco del sitio. Usa perfil y páginas locales desechables.

### Tema de las páginas web

**Personalizar → Tema de las páginas → Seguir a Slate** está activado por defecto. Fondos, texto y controles de las páginas HTML se adaptan al modo claro u oscuro con Dark Reader, ejecutado localmente en un mundo JavaScript aislado y sin acceso a Node, a la interfaz de Slate ni a los datos de Miso. Los sitios que usan `prefers-color-scheme` reciben también la preferencia de Slate. **Sistema** vuelve a la preferencia del sistema operativo; esto no cambia el tema de macOS.

No se aplica una inversión global, no se cambian fuentes ni geometría y se desactiva el análisis/modificación de imágenes de fondo. Las fotos, vídeos, lienzos y fondos gráficos no se recolorean. Los valores de formularios no se cambian al alternar el tema. La adaptación observa estilos y cambios del documento para calcular colores **en el dispositivo**; no envía el contenido a ningún servicio ni habilita el análisis de páginas para Miso.

En ese mismo panel, **Usar diseño original en este sitio** permite crear una excepción por nombre de servidor. La elección afecta a las pestañas normales abiertas del mismo servidor y se conserva entre aperturas; no cambia el bloqueador ni sus excepciones. **Adaptar este sitio a Slate** revierte la elección y **Restablecer excepciones** borra la lista de excepciones de tema. En una pestaña fugaz, el botón de sitio solo cambia esa pestaña, sin guardar la decisión.

**Límites:** no puede garantizarse compatibilidad con todos los sitios. Las restricciones CSP estrictas pueden bloquear la adaptación; el panel muestra el error y el sitio conserva su diseño. Los marcos incrustados y los documentos que no son HTML, como PDF o imágenes, no se fuerzan. No se hacen descargas adicionales para sortear restricciones de hojas de estilo de otros servidores; esas partes pueden conservar colores originales. La variante clara es conservadora: un sitio con colores oscuros propios y fijos puede conservar algunas zonas oscuras para no romper sus contrastes. Usa la excepción por sitio si algún elemento se ve mal.

La verificación `bash scripts/preview.sh scripts/verify-page-theme.cjs` usa un perfil temporal y páginas locales, sin acceso a los sitios reales: comprueba tema claro/oscuro, preferencia de sistema, cambios dinámicos, exclusión y restauración por sitio, recarga, conservación de valores de formularios, geometría y píxeles de imagen/vídeo/lienzo/fondo gráfico, aislamiento JavaScript y el caso CSP bloqueado. Las capturas Linux no sustituyen una comprobación en Mac.

La apariencia predeterminada usa grises neutrales: fondo gris claro en modo claro y grafito en modo oscuro. La franja superior (marca, pestañas y navegación) combina fondos semitransparentes con desenfoque sin atenuar el texto. En macOS se activa además el material nativo `under-window`; el efecto real sobre el escritorio debe comprobarse en un Mac. El alto contraste mantiene fondos opacos y desactiva el material. Los colores propios guardados se conservan.

**Personalizar → Transparencia de las barras** permite cambiar la opacidad del fondo de las barras entre 10 % y 100 % (45 % por defecto), sin atenuar textos ni botones. Se guarda entre aperturas. Alto contraste conserva la elección, pero aplica fondos opacos mientras está activo. El vídeo del inicio se muestra sin el velo de color que antes lo oscurecía.

Tres clics en el logo activan el **Modo Órbita** y muestran a Miso flotando, también desde otra pestaña. Si ya estaba desbloqueado, otros tres clics alternan el modo, en vez de limitarse a mostrar un aviso. Cerrar la última pestaña del navegador sale de la aplicación; cerrar una pestaña adicional no lo hace. Los espacios que conservan otras pestañas no se cierran silenciosamente.

La salida normal se comprobó observando la terminación del proceso desde fuera. La opción **experimental** de limpiar datos al salir conserva una limitación conocida: en Linux puede emitir la señal de salida sin terminar realmente el proceso. Se recomienda mantenerla desactivada; esta corrección no da esa ruta por resuelta. La comprobación nativa específica está en `scripts/verify-browser-chrome.cjs`; `--clear-on-exit` reproduce esa ruta con un perfil temporal.

En **Personalizar → Barra del logo y nombre → Ocultar automáticamente** se puede recoger solo la primera franja. Quedan visibles las pestañas y la navegación; acercar el cursor a los primeros 6 píxeles del borde superior muestra el logo y el nombre. Se oculta de nuevo al salir (con una breve espera para evitar parpadeos). También se puede mostrar con Tab sobre el borde y cerrar con Escape. La elección se conserva al reiniciar, pero el estado momentáneamente mostrado no se guarda. En macOS los controles de ventana se muestran con esa franja; su comportamiento instalado sigue pendiente de validación en un Mac.

Abre **Personalizar** en la barra de herramientas para elegir tema claro/oscuro/sistema, acentos salvia/oliva/arcilla/sistema o un color propio, contraste normal/alto/sistema, fondos papel/niebla/lienzo o un vídeo local, densidad, pestañas, ubicación del logo y del botón de pestaña, y visibilidad de la barra de marcadores. Los fondos de vídeo se copian al perfil local, tienen un límite de 120 MB y siempre se reproducen silenciados; no se envían a ningún servicio. Los cambios se guardan en `appearance.json` y se recuperan al abrir la aplicación. Restablecer apariencia no elimina marcadores, sesiones, historial, filtros ni el vídeo elegido; se puede quitar por separado desde Personalizar.

Las fuentes DM Sans, Fraunces e IBM Plex Mono y el símbolo se incluyen en la aplicación: no se consultan servicios de fuentes durante el uso. Sus licencias OFL están en `src/assets/fonts/`. El cambio de marca conserva el identificador de aplicación y la API interna; en macOS se reutiliza el perfil anterior de Brújula cuando no hay un perfil nuevo con datos guardados. No se cambió el motor ni se añadieron garantías de bloqueo de YouTube.

Los perfiles nuevos usan **Sistema** por defecto y siguen los cambios claro/oscuro del sistema en vivo. Se respetan las selecciones explícitas de perfiles anteriores: para volver al seguimiento automático, elegir **Personalizar → Apariencia → Sistema**. En **Colores de toda la ventana → Propios** se pueden cambiar de forma independiente la barra superior y pestañas, barra de navegación, paneles, inicio y pestaña activa. El texto se ajusta automáticamente para mantener contraste; el modo de alto contraste tiene prioridad sobre los colores propios. Esto personaliza la interfaz del navegador, no fuerza cambios de estilo en las páginas web.

### Inicio por zonas, widgets ocultables y vídeos guardados

Pulsa **Editar widgets** en el inicio. Cada pieza tiene una cabecera separada de su contenido con un asa de arrastre, un selector de zona y **× para ocultarla**. Hay nueve anclajes: arriba/centro/abajo, a izquierda/centro/derecha. Las flechas del teclado, con el widget o su asa enfocados, cambian de zona. Al estrechar el área disponible se usa una columna y se permite desplazamiento, sin tapar otros widgets. Las posiciones antiguas se interpretan como el anclaje más cercano; no se borran los datos guardados.

Durante el arrastre se mueve solo la pieza elegida, que puede pasar por encima de otra sin que el resto se aparte continuamente. Soltarla sobre otra intercambia sus zonas/orden; al soltar sobre un espacio libre se ancla a esa zona y se apilan las piezas sin superposición. **Añadir widgets** permite recuperar cualquier widget oculto, incluida la búsqueda y los marcadores. Ocultar una pieza no borra sus marcadores, colecciones ni datos.

El reloj parte de una esquina superior y los widgets no tienen fondo por defecto. **Fondos: no/sí** controla las superficies. El acompañante conserva los botones Mostrar/Ocultar y los ajustes detallados siguen en **Mi espacio → Inicio**.

En **Personalizar → Fondo de inicio**, **Importar vídeo** conserva una copia privada dentro del perfil. La biblioteca admite hasta 20 vídeos de 120 MB por archivo. Elegir otro fondo o pulsar **Quitar del inicio** no borra las importaciones. El selector **Tus vídeos guardados** permite reutilizarlas sin buscar el archivo original, aunque este se haya movido o eliminado. El botón de tipo **Vídeo** reutiliza un vídeo guardado antes de abrir el selector de archivos. El fondo cubre el área visible, permanece silenciado y se pausa fuera del inicio o en alto contraste.

Cada espacio conserva su composición del inicio. Personal mantiene el diseño existente; Trabajo empieza sin Juegos; Compras empieza sin Juegos ni Reloj y destaca Colecciones. Cambiar de espacio actualiza el nombre visible y recupera su última pestaña activa durante esa ejecución. Los colores generales y la biblioteca de vídeos siguen siendo comunes. Las pestañas no se restauran entre ejecuciones.

### Respuesta y comprobaciones locales

Las notificaciones de estado se agrupan por cuadro y no vuelven a transferir toda la biblioteca de guardados en cada cambio del contador de bloqueo. La interfaz no reconstruye pestañas/marcadores ni reaplica estilos cuando no han cambiado. El movimiento del widget no ejecuta el buscador radial de colisiones ni guarda en disco hasta soltar. La ventana se muestra después de aplicar su primera configuración guardada, sin mostrar antes un diseño predeterminado.

El bloqueo y la adaptación de páginas siguen activos. No se garantiza un tiempo de carga para sitios externos: red, scripts de cada sitio y tamaño de su contenido siguen influyendo. Para comprobar los cambios con Electron real y un perfil desechable, sin sitios externos:

```sh
export SLATE_TEST_PROFILE="$(mktemp -d /tmp/slate-home-check-XXXXXX)"
pnpm --filter @workspace/chromium-browser exec bash scripts/preview.sh scripts/verify-home-responsiveness.cjs
SLATE_TEST_PHASE=restart pnpm --filter @workspace/chromium-browser exec bash scripts/preview.sh scripts/verify-home-responsiveness.cjs
```

Comprueba arrastre nativo sobre otro widget, anclajes, ocultar/restaurar, espacios y pestaña activa, botón de nueva pestaña en una barra llena, navegación local con protección, importación de dos vídeos, eliminación de los originales, reutilización y restauración tras reiniciar. Requiere `ffmpeg` con `libvpx` para generar los vídeos de prueba. Registra también un lote de 200 cambios de contador, que no debe volver a escribir los estilos de la raíz. Guarda una captura en `generated-artifacts/`. Los tiempos registrados son mediciones locales de Linux, no una comparación antes/después ni una medición de rendimiento en Mac.

## Mi espacio

El botón **Mi espacio** reúne las nuevas herramientas:

- **Guardados:** colecciones locales de enlaces, textos e imágenes, con títulos y notas editables y movimiento entre colecciones. Se puede guardar la pestaña activa, arrastrar enlaces/texto o usar **Guardar en la bandeja** desde el menú contextual de una página. Las imágenes se copian al perfil como PNG/JPEG/WebP de hasta 2 MB; no cargan imágenes remotas al consultar la bandeja. Eliminar una colección pide confirmación y elimina sus elementos. Las colecciones son comunes a los espacios y no se cifran en disco.
- **Espacios:** Personal conserva las cookies, marcadores e historial anteriores; Trabajo, Compras y los espacios nuevos usan particiones Chromium, marcadores e historiales independientes. Las pestañas abiertas se mantienen al cambiar de espacio durante la ejecución; no se restauran automáticamente tras cerrar la app.
- **Pestañas fugaces:** partición exclusivamente en memoria y distinta para cada pestaña. No escriben historial ni se pueden reabrir desde “pestaña cerrada”. Se limpian cookies y caché al cerrarlas. Un marcador o elemento guardado deliberadamente desde una pestaña fugaz sí permanece.
- **Privacidad:** decisiones de cámara/micrófono, ubicación y notificaciones por solicitud, pestaña o sesión de Slate, y revocación. Las solicitudes sin respuesta se deniegan a los 60 segundos. Los permisos de pestaña vencen al cambiar de origen o cerrar la pestaña. Revocar impide nuevas solicitudes; una captura ya iniciada puede requerir cerrar la pestaña para detenerla. macOS también debe autorizar los dispositivos; los flujos nativos de consentimiento requieren validación en Mac.
- **Enfoque de YouTube:** oculta recomendaciones del inicio, secciones de Shorts, comentarios y recomendaciones laterales. El silencio opcional se aplica a toda la pestaña de YouTube mediante Electron. Son controles independientes del bloqueador de anuncios; el sitio puede cambiar su estructura.
- **Búsqueda local:** consulta los marcadores y hasta 300 entradas del historial del espacio seleccionado, sin enviar la consulta a una web. El historial sigue desactivado de forma predeterminada.
- **Cierre seguro:** confirma antes de cerrar; la limpieza de cookies, caché e historial de todos los espacios al salir es opcional, requiere confirmación al activarla y no elimina colecciones, marcadores ni personalización. **Experimental:** las comprobaciones nativas confirman el borrado, pero la prueba adicional de terminación del proceso no finaliza en Linux incluso tras `will-quit`. Dejar esta opción desactivada hasta resolverlo. Un cierre forzado del proceso no permite garantizar esa limpieza.
- **Inicio:** editor visual con reordenación por arrastre y botones accesibles, widgets visibles/ocultos, tamaño, esquinas, opacidad, deshacer (hasta 30 cambios durante la ejecución) y restablecer solo el diseño. Las preferencias persisten en `features.json`.
- **Compañero opcional:** gato o robot con nombre y color propios, una animación al saludarlo y respeto por movimiento reducido. Solo aparece en el inicio, sin cuidados, rachas ni avisos.
- **Minirrecreos locales:** parejas de memoria con 12 cartas y dibujo libre con color, grosor y borrado. No requieren conexión. Las partidas y los dibujos no se guardan al cerrar la app.

## Ejecutar en desarrollo

En macOS, instala Node.js 22.12 o posterior y pnpm, clona este proyecto y ejecuta desde la raíz:

```sh
pnpm install
pnpm --filter @workspace/chromium-browser run dev
```

En la vista de escritorio de Replit, usa `pnpm --filter @workspace/chromium-browser run dev:preview`. Ese comando desactiva el sandbox para el entorno de vista previa; `dev` y los paquetes de macOS conservan el sandbox.

## Crear instaladores para Mac

### Nuevas interacciones del inicio

- **Editar widgets → Listo:** muestra tiradores visibles. Arrastra el tirador para mover cada widget; sus flechas permiten cambiar el orden. Al enfocar el widget o su tirador, las flechas del teclado lo desplazan y Mayús aumenta el paso. Las posiciones se guardan.
- **Miso:** personaje 2D con reacciones al clic, mirada al cursor, parpadeo, movimiento y comentarios/sugerencias locales espontáneos. Se conserva la elección gato/robot, nombre y color. Respeta movimiento reducido.
- **Pasear**, en los controles de Miso, lo lleva como acompañante flotante entre pestañas. Da paseos cortos y autónomos, alternados con descansos, sin necesitar que muevas el cursor. **Pausa/Seguir** detiene o reanuda sus paseos; **Inicio/Traer aquí** lo devuelve al inicio; **Cerrar** lo desactiva. Se detiene al acercar el cursor a sus controles para poder pulsarlos. Permanece dentro de la zona de página, sin cubrir la navegación ni aparecer sobre vídeo a pantalla completa. Al minimizar o perder el foco, suspende sus paseos; también respeta la preferencia del sistema de movimiento reducido.
- **Barra automática:** espera 2,4 segundos tras retirar el cursor antes de ocultarse.
- **Sorpresa del logo:** tres clics desbloquean el Modo Órbita. Su efecto se conserva y se puede apagar con el nuevo control de Miso.

El acompañante no lee páginas, títulos ni historial y sus comentarios no usan servicios externos. Su vista flotante no recibe la interfaz privilegiada del navegador, tiene una interfaz propia limitada y bloquea conexiones externas. La superposición ocupa una pequeña zona de la página; se puede pausar, devolver al inicio u ocultar.

Miso se presenta sin tarjeta ni panel de color detrás del personaje, tanto en el inicio como en su vista flotante, incluso si los demás widgets usan fondos. El gato tiene una ilustración felina de estilo anime y globos de diálogo independientes adaptados a los temas claro, oscuro y de alto contraste. Sus controles también son independientes. La transparencia del PNG de prueba se comprueba sobre la captura de su propia vista nativa; los visores que no muestran el canal alfa pueden visualizar las zonas transparentes en negro.

La figura es compacta (aproximadamente 90 píxeles de alto), con pasos animados y cambio de orientación que no gira el texto. Su diseño es un gatito negro sencillo, de cabeza grande y ojos blancos expresivos, inspirado en la referencia elegida por el usuario, en lugar del gato gris detallado anterior. El dibujo vectorial es propio; la imagen de stock de referencia no forma parte de la aplicación ni del ZIP.

La prueba `test:personalization` comprueba arrastre real con ratón, persistencia, comentarios espontáneos, seguimiento nativo, cambio de pestañas y el secreto. Para comprobar específicamente el tirador enfocado por teclado y capturar la vista nativa del personaje: `pnpm --filter @workspace/chromium-browser exec bash scripts/preview.sh scripts/verify-companion-ui.cjs`. El efecto nativo de superposición y el comportamiento con Spaces/pantalla completa de macOS siguen pendientes de validar en un Mac.

### Generar la distribución

También hay una **guía HTML local con Miso** y una **distribución asistida
independiente** que se abre manualmente y copia la aplicación de verdad. El DMG
tradicional de abajo se conserva sin cambios. Consulta
[guía e instalador asistido](installer/README.md) para generarlos, sus garantías
de copia/cancelación y los [límites de validación en Linux](installer/VALIDATION.md).

Ejecuta en un Mac:

```sh
pnpm --filter @workspace/chromium-browser run package:mac
```

El comando crea instaladores DMG para Apple Silicon e Intel en `artifacts/chromium-browser/release/`:

- `Slate-Privacy-0.1.0-arm64.dmg` (chip Apple).
- `Slate-Privacy-0.1.0-x64.dmg` (Intel).

El DMG usa un fondo propio de Slate, preparado para pantallas Retina, y dos iconos reales de Finder: la aplicación y un acceso a Aplicaciones. Para instalar, se abre el DMG y se arrastra Slate Privacy a Aplicaciones. Después se expulsa el disco y se abre la copia instalada. No hay terminal, Node.js ni pnpm para el usuario que instala.

El comando anterior es **para quien genera la distribución desde el código fuente**: requiere macOS, Node.js, pnpm y las dependencias del proyecto instaladas. No es un instalador para el usuario final. Para generar solo una arquitectura, añadir `--arm64` o `--x64`.

Comprobación de configuración y fondo sin crear un DMG (funciona también en Linux):

```sh
pnpm --filter @workspace/chromium-browser run package:mac:check
```

La ilustración editable y el PNG están en `installer/`. Se puede regenerar el fondo y una vista previa con `bash artifacts/chromium-browser/installer/render-artwork.sh` desde la raíz (requiere ImageMagick solo para editar el diseño; no para crear el DMG con el PNG incluido).

**Escala del instalador:** `background.png` mide 720×480 a 72 ppp; `background@2x.png`, 1440×960 a 144 ppp. Deben distribuirse juntos. electron-builder los combina en un TIFF de doble resolución en macOS. No se debe usar únicamente la imagen Retina como fondo base: el generador toma su tamaño en píxeles como tamaño de ventana, aunque Finder dibuje el fondo a la mitad, dejando espacio blanco. La comprobación de empaquetado rechaza ese desajuste y los iconos fuera de la ventana. Para comprobar una compilación nueva, expulsar primero el volumen anterior y abrir el DMG recién generado; el ZIP del proyecto por sí solo no modifica un DMG existente.

**Estado de validación:** el diseño y la configuración se comprobaron en Linux; la creación, el montaje, la colocación de los iconos y la instalación del DMG final requieren una prueba real en macOS. No se entrega un DMG generado desde Linux. La firma y notarización de Apple requieren una cuenta de desarrollador y se configuran por separado; este diseño no elimina las advertencias de Gatekeeper. No se deben desactivar las protecciones del sistema para instalar.

## Seguridad y datos

Las páginas abiertas se ejecutan en vistas aisladas, sin acceso a Node.js, y no pueden usar los controles de la interfaz. La app bloquea permisos del sitio por defecto, salvo pantalla completa para el marco principal de la pestaña HTTPS activa. Cámara/micrófono, ubicación y notificaciones requieren una decisión explícita y temporal en Mi espacio; captura de pantalla, acceso a almacenamiento sin partición y otros permisos siguen denegados. Usa HTTPS sin regresar silenciosamente a HTTP y restringe WebRTC con `disable_non_proxied_udp` (no equivale a ocultar tu IP).

### Pantalla completa y ventana flotante

- El botón de pantalla completa del reproductor puede activar el modo HTML de pantalla completa. El vídeo ocupa toda la ventana, sin reservar espacio para la barra ni el panel lateral. Al salir se restaura la distribución normal.
- Para abrir o cerrar el vídeo en una ventana flotante **PiP**, usa **⌘⇧P en Mac** o **Ctrl+Mayúsculas+P**. También está disponible “Vídeo en ventana flotante (PiP)” en el menú contextual del vídeo; en YouTube puede hacer falta pulsar el botón derecho dos veces para pasar del menú del sitio al menú nativo.
- PiP actúa sobre el vídeo reproducible de la pestaña activa, sin dar a la página acceso al equipo. Si no hay vídeo listo o la página prohíbe la API, aparece un aviso en lugar de fallar silenciosamente. No requiere permitir cámara ni micrófono.

### Escudo de privacidad

- Motor [Ghostery Adblocker](https://github.com/ghostery/adblocker), con listas EasyList, EasyPrivacy, Peter Lowe y reglas de uBlock Origin. Incluye bloqueo de red, filtros cosméticos y scriptlets, necesarios para páginas complejas como YouTube.
- Los filtros y recursos se descargan por HTTPS desde los activos oficiales de Ghostery en GitHub. Se actualizan al iniciar si han caducado y cada 6 horas con la app abierta; también se pueden actualizar desde el escudo.
- La última versión válida queda en `adblock-engine.bin` en los datos locales de la app. Sin caché válida ni conexión para descargar, se bloquea la navegación en lugar de mostrar protección inexistente. Si falla una actualización, se conserva la versión anterior y se avisa.
- Chromium bloquea cookies de terceros de forma nativa, incluida su lectura/escritura con `document.cookie`. Además se retiran las cabeceras `Cookie`/`Set-Cookie` de terceros y de solicitudes sin sitio atribuible. Se distinguen sitios por esquema y dominio registrable con sufijos privados (dos usuarios distintos de `github.io` no son el mismo sitio).
- Se activa explícitamente la partición nativa de almacenamiento por sitio superior, caché HTTP/código y conexiones. No se crean perfiles por pestaña ni se reemplaza el perfil existente: las sesiones de primera parte se mantienen. Se deniegan los permisos de Storage Access que podrían dar acceso sin partición. Algunos accesos integrados pueden no funcionar; abre el proveedor como página principal. No hay una excepción que desactive silenciosamente el aislamiento al pausar el bloqueo de anuncios.
- Se envían las preferencias GPC y Do Not Track; su cumplimiento depende del sitio.
- Se eliminan parámetros de seguimiento conocidos de la navegación, conservando los parámetros normales de los vídeos. DuckDuckGo sustituye a Google como buscador predeterminado.
- El historial no se guarda de forma predeterminada. Si existía historial anterior, no se elimina al desactivar su guardado. Los marcadores se conservan localmente.
- El escudo muestra contadores reales por pestaña (solicitudes bloqueadas, cabeceras de cookies retiradas y enlaces limpiados), fecha de filtros y excepciones por sitio. Una excepción solo pausa el filtrado de anuncios/rastreadores, no HTTPS ni la política de cookies.
- “Borrar datos de navegación” solicita confirmación, cierra las pestañas y borra cookies, almacenamiento de sitios, caché e historial. Cierra las sesiones; conserva marcadores y filtros. No se envía historial ni telemetría propia a un servidor.

### Límites importantes frente a Brave

Esta versión **no equivale a Brave** ni ofrece anonimato. No incorpora la aleatorización avanzada de huella digital de Brave (canvas, audio, WebGL, fuentes, etc.) ni todo el endurecimiento de su distribución de Chromium. Hay aislamiento nativo comprobado para los mecanismos indicados abajo, no una certificación de partición integral de todas las APIs. Los sitios y los proveedores de filtros pueden ver tu IP; no hay VPN ni Tor. En Linux/Replit la vista previa desactiva el sandbox por una restricción del entorno, de modo que no debe usarse como entorno de navegación sensible; el arranque normal de macOS no usa esa excepción.

En YouTube se activan los filtros de red y scriptlets disponibles en las listas mantenidas; **no se garantiza bloquear todos los anuncios**, evitar la detección antibloqueo ni mantener la reproducción ante cambios del sitio. Las pruebas comprueban la presencia de reglas de YouTube y el funcionamiento del motor, no certifican reproducción sin publicidad en sesiones reales. La firma, instalación y comprobación final en macOS siguen pendientes.

**Diagnóstico y corrección del cierre (2026-11-14):** una prueba manual en macOS confirmó carga repetida sin reproducción y cierre con `SIGSEGV` en Electron 41.10.7. El informe de macOS se simbolizó con los símbolos oficiales de esa versión y arquitectura, verificando que coincidía el UUID del módulo. La traza real pasa por `URLLoaderClientProxy::OnReceiveRedirect`, `ContinueToBeforeRedirect` y `HandleBeforeRequestRedirect`: coincide con el [fallo de Electron al redirigir preflights CORS](https://github.com/electron/electron/issues/52592). Los nombres aproximados de funciones del informe original no bastaban para identificarlo.

La protección ahora transforma **solo los resultados de redirección de solicitudes `OPTIONS`** en cancelación. No desactiva scriptlets, no permite las solicitudes publicitarias y no elimina el sandbox. Los demás `OPTIONS` y las redirecciones normales siguen funcionando. Una prueba local determinista reprodujo `SIGSEGV` antes del cambio y pasó después, comprobando también CORS permitido y redirecciones GET. La comparación posterior con YouTube no mostró cierres en ninguno de los tres modos, pero aquí agotó el plazo de carga sin establecer reproducción. Tras aplicar la corrección en su Mac, el usuario confirmó: “funciona perfecta la reproducción sin anuncios”. Esa observación manual confirma el caso probado, no que todos los vídeos, anuncios intermedios o futuras sesiones estén cubiertos. Los modos de pantalla completa y PiP se verificaron con Electron real y vídeo sintético en Linux; su comportamiento específico en macOS sigue pendiente de confirmación.

### Cobertura nativa y evaluación del motor

Se evaluaron las defensas de Chromium que expone Electron y la [protección de huella de Brave](https://github.com/brave/brave-browser/wiki/Fingerprinting-Protections). Brave incorpora modificaciones del motor que cambian resultados por sitio y sesión; **instalar una dependencia o cambiar el agente de usuario no las incorpora a Electron**. Una base Brave requeriría portar la interfaz a su navegador o mantener una compilación propia de Chromium con sus parches, compilaciones para ambas arquitecturas Mac, actualizaciones de seguridad y nuevas pruebas de compatibilidad. No se ha sustituido el motor sin aprobar ese cambio de arquitectura.

| Superficie | Política aplicada | Evidencia / límite |
| --- | --- | --- |
| Canvas y OffscreenCanvas | APIs nativas sin suplantación ni ruido artificial | La prueba confirma lectura de canvas; **la huella sigue accesible**. No se ha certificado OffscreenCanvas. Bloquear toda lectura rompería exportaciones y algunos desafíos de acceso. |
| Audio / OfflineAudioContext | Se conserva el cálculo nativo y el audio de páginas | La prueba renderiza audio y lee muestras; **la huella sigue accesible**. No se desactiva el audio para aparentar protección. |
| WebGL / GPU | No se alteran parámetros ni resultados | **Sin defensa de huella avanzada**. En la vista previa sin GPU no se consigue contexto WebGL; esto no demuestra protección en Mac. WebGPU tampoco se certifica. |
| Fuentes | `FontAccess` desactivado nativamente en las vistas remotas y permisos denegados | La enumeración `queryLocalFonts` no está disponible; medidas de texto y sondeo de fuentes por CSS siguen siendo posibles. |
| Cookies de terceros | `ForceThirdPartyCookieBlockingEnabled`, más filtro de cabeceras | La prueba intenta leer una cookie de primera parte y escribir una cookie desde un iframe de otro sitio: ambos accesos se deniegan. Las cookies de primera parte permanecen. |
| Almacenamiento | `ThirdPartyStoragePartitioning` | Dos sitios HTTPS distintos incrustan el mismo origen: localStorage, IndexedDB, CacheStorage y OPFS no comparten valores. Service workers no comparten registros. Se conserva el estado al recargar el mismo sitio. |
| Comunicación entre contextos | Partición nativa | BroadcastChannel y SharedWorker no comunican esos iframes de sitios diferentes. Se verifica también un control positivo de comunicación dentro del mismo sitio. |
| Caché y conexiones | `SplitCacheByNetworkIsolationKey`, `SplitCodeCacheByNetworkIsolationKey`, `PartitionConnectionsByNetworkIsolationKey` | Se verifica aislamiento de entradas de caché HTTP. La caché de código y la reutilización de sockets están configuradas, pero no medidas por esta prueba. |
| Acceso sin partición | Permisos de almacenamiento denegados | La solicitud Storage Access del iframe falla. Pausar el bloqueo no concede permisos. |

Las opciones se aplican **antes de `app.ready`**. Aceptar una opción de Chromium no prueba su efecto: las comprobaciones de comportamiento deben ejecutarse tras cualquier actualización de Electron. Fuente de nombres y valores predeterminados: [`net/base/features.cc` de Chromium](https://github.com/chromium/chromium/blob/145.0.7632.6/net/base/features.cc). La [documentación de partición de Chromium](https://privacysandbox.google.com/cookies/storage-partitioning) describe el modelo; no debe confundirse con la partición de sesiones de Electron.

El escudo muestra por separado aislamiento y cobertura de huella, incluso cuando no hay filtros de anuncios disponibles. Sus etiquetas describen la política configurada, **no una medición en vivo de anonimato**. El aislamiento no impide identificación por IP, cuentas iniciadas, redirecciones de seguimiento ni scripts de terceros ejecutados en el contexto de primera parte. Los datos antiguos no se borran automáticamente; el usuario puede usar el borrado confirmado para empezar sin estado previo.

**Pendiente para el objetivo original:** defender canvas, audio, WebGL y fuentes CSS con garantías comparables a Brave requiere un motor con defensas nativas adicionales y validación en Mac. Esta implementación cierra accesos de rastreo por almacenamiento y hace comprobables los límites, pero **no completa por sí sola el objetivo de privacidad comparable a Brave**.

**Alcance aceptado:** se conserva Electron con estos límites explícitos. No se incluye una migración de motor ni se presenta el aislamiento implementado como protección avanzada de huella digital.

En YouTube se activan los filtros de red y scriptlets disponibles en las listas mantenidas; **no se garantiza bloquear todos los anuncios**, evitar la detección antibloqueo ni mantener la reproducción ante cambios del sitio. Las pruebas comprueban la presencia de reglas de YouTube y el funcionamiento del motor, no certifican reproducción sin publicidad en sesiones reales. La firma, instalación y comprobación final en macOS siguen pendientes.

## Comprobar la protección

```sh
pnpm --filter @workspace/chromium-browser run typecheck
pnpm --filter @workspace/chromium-browser test
pnpm --filter @workspace/chromium-browser run test:privacy
pnpm --filter @workspace/chromium-browser run test:native-privacy
pnpm --filter @workspace/chromium-browser run test:preflight
pnpm --filter @workspace/chromium-browser run test:media
```

`test:privacy` usa la app Electron real con un perfil temporal: descarga listas, comprueba reglas y scriptlets de YouTube, solicita un recurso publicitario para verificar su cancelación, revisa el aislamiento y los controles del escudo, y verifica tanto cancelar como confirmar el borrado. Nunca borra el perfil habitual. Requiere una sesión gráfica Linux/Replit y conexión para descargar filtros.

`test:native-privacy` prueba la aplicación real **sin conexión externa** con reglas mínimas de prueba, perfil desechable, servidor HTTPS local y certificado temporal (necesita `openssl`). Comprueba la matriz de almacenamiento anterior, el acceso JavaScript a cookies, una sesión local de primera parte tras recarga, rechazo de Storage Access, las APIs de huella expuestas, reproducción HTML con un WAV generado y borrado de datos particionados. Guarda una captura del escudo en `generated-artifacts/brujula-native-privacy.png`. El certificado solo se acepta para los tres dominios locales de prueba en ese proceso; no se desactiva la validación TLS de la aplicación normal. No valida OAuth real, DRM, vídeo YouTube ni GPU/macOS.

En macOS el lanzador no aplica las excepciones Linux (`--no-sandbox`, `--disable-gpu`, `--disable-dev-shm-usage`).

`test:preflight` usa Electron real, dos servidores de bucle local y un perfil desechable. Comprueba que un filtro que pide redirigir un `OPTIONS` provoca una cancelación segura y no un cierre nativo; además conserva los preflights permitidos, el POST correspondiente, las redirecciones GET y sus contadores. No accede a YouTube ni usa cuentas. No demuestra bloqueo de anuncios durante vídeos.

`test:media` abre la app real con un perfil temporal, usa `https://example.com` como origen seguro e inserta un vídeo sintético generado con canvas (sin cámara). Comprueba pantalla completa, restauración de barra/panel, entrada/salida de PiP mediante el atajo real, aislamiento de la interfaz y denegación de ubicación. Guarda una captura de la vista del vídeo en `generated-artifacts/brujula-video-fullscreen.png`. No usa una cuenta ni sustituye la validación de reproducción real en macOS.

### Comparar YouTube con y sin bloqueo

En un Mac, desde la raíz del proyecto, sin iniciar sesión en YouTube:

```sh
pnpm --filter @workspace/chromium-browser run test:youtube
# Para otro vídeo y una observación de diez minutos por cada modo:
pnpm --filter @workspace/chromium-browser run test:youtube --video=M7lc1UVf-VE --seconds=600
# Diagnóstico del cierre: añade un control con filtrado de red sin scriptlets.
pnpm --filter @workspace/chromium-browser run test:youtube --seconds=20 --diagnose
```

El comando se ejecuta con **Node**, no pasando `probe-youtube.cjs` a Electron. El proceso coordinador abre dos procesos Electron consecutivos: primero sin protección y después con la protección real. Cada uno tiene un perfil desechable distinto y no usa cuentas personales. Los perfiles se eliminan al finalizar la comparación, incluso si un proceso Electron falla. No introduzcas credenciales en las ventanas de prueba. La prueba sin bloqueo es un control diagnóstico, no un modo nuevo del navegador.

Si YouTube sustituye una navegación y Electron devuelve `ERR_ABORTED (-3)`, la prueba espera hasta 45 segundos a que termine una carga del mismo vídeo (o de la página de consentimiento). No considera el error una prueba de reproducción ni lo ignora sin comprobar la página final. Otros errores de carga, destinos inesperados y vencimientos siguen produciendo un resultado inconcluso. Esto corrige la interrupción prematura de la prueba original; no demuestra que YouTube sea compatible ni que la publicidad esté bloqueada.

Se guardan `generated-artifacts/youtube/comparison.json`, `off.log` y `on.log` (se sobrescriben en cada ejecución, fuera de Git). El informe incluye plataforma, arquitectura, versiones, errores de renderizador, señales de cierre, estado de sandbox, contadores y muestras cada dos segundos. Las muestras distinguen avance del vídeo solicitado, anuncios visibles, comprobación de robot, consentimiento y algunos mensajes antibloqueo. La prueba no resuelve comprobaciones de robot ni acepta consentimiento automáticamente.

Con `--diagnose` se ejecutan tres perfiles desechables: sin protección, solo filtrado de red y protección completa. El ensayo adicional guarda `network.log`. No altera las preferencias ni el perfil habitual y **no desactiva scriptlets en el navegador normal**. En Linux el lanzador de Electron puede transformar `SIGSEGV` en código de salida 1: el informe conserva esa señal como `reportedSignal` cuando aparece en su registro, sin confundirla con la señal recibida por el coordinador.

Si se cierra en un Mac, abrir `~/Library/Logs/DiagnosticReports` desde Finder → Ir → Ir a la carpeta y localizar el informe `Electron…ips` (o `.crash`) correspondiente al cierre. Compartir solo las secciones del fallo si el informe contiene información personal; no compartir perfiles de navegación ni volcados de memoria.

Códigos de salida: **0** indica que se observó avanzar contenido en ambas pruebas; **1**, cierre inesperado, error de arranque o límite de tiempo; **2**, resultado inconcluso, por ejemplo comprobación de robot, consentimiento, anuncio observado o vídeo detenido. La observación dura 180 segundos por modo de forma predeterminada (`--seconds=20` a `1800`); termina antes si encuentra una barrera de acceso.

**Ni siquiera el código 0 certifica bloqueo de anuncios.** Puede no haberse ofrecido ningún anuncio, y las muestras pueden perder anuncios breves. Antes de dar por cumplido el requisito, se necesitan ejecuciones en macOS con varios vídeos que ofrezcan publicidad en el control sin bloqueo, verificar el inicio y los cortes publicitarios durante reproducción prolongada con protección, y comprobar que el contenido sigue avanzando sin errores ni avisos antibloqueo. Conservar los informes y las observaciones de cada caso, sin datos de cuentas personales. Una comprobación de robot en ambos modos no permite atribuir el fallo al bloqueador ni establecer compatibilidad.

Ghostery Adblocker está bajo MPL-2.0; las suscripciones conservan las licencias de sus respectivos mantenedores.
