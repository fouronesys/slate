"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { paths } = require("./transaction.cjs");
const NAME = "Recuperar Slate.command";
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
function recoveryScript(plan) {
  const p = paths(plan);
  // The launcher is outside both application bundles. It reuses the trusted
  // previous ECS runtime in Node mode, even when the normal app does not exist.
  return `#!/bin/sh
set -eu
printf '%s\\n' 'Recuperación de Slate. Cierra cualquier Slate abierto antes de continuar.'
previous=${quote(path.join(p.previous, "Contents/MacOS/Slate Privacy"))}
current=${quote(path.join(p.target, "Contents/MacOS/Slate Privacy"))}
if [ -x "$previous" ]; then
  runtime="$previous"
elif [ -x "$current" ]; then
  runtime="$current"
else
  printf '%s\\n' 'No se encuentra un runtime de recuperación. No borres ni muevas las copias; consulta RECUPERAR SLATE.txt.'
  exit 1
fi
unset NODE_OPTIONS NODE_PATH ELECTRON_RUN_AS_NODE SLATE_UPDATE_TOKEN
export ELECTRON_RUN_AS_NODE=1
exec "$runtime" ${quote(path.join(plan.root, "helper/helper.cjs"))} ${quote(plan.root)} recover
`;
}
async function writeRecoveryEntry(plan) {
  const instructions = `RECUPERAR SLATE SIN ABRIR LA APP NORMAL

Si Slate no aparece en Aplicaciones o no abre después de actualizar:
1. Si hay una actualización todavía trabajando, espera a que termine.
2. Cierra Slate y sus helpers. No mates un ayudante que siga copiando.
3. En Finder elige Ir > Ir a la carpeta e introduce:
${plan.root}
4. Abre «${NAME}». Terminal ejecutará una recuperación local sin Node,
   Python, Xcode ni herramientas de desarrollo instaladas por separado.
5. El ayudante comprueba que Slate está cerrado, verifica la app anterior,
   restaura el perfil cuando corresponde y abre la versión recuperada.
   Si aparece un error, conserva TODAS estas carpetas y solicita ayuda.

El lanzador usa la copia anterior, aunque /Applications/Slate Privacy.app
no exista. No es necesario renombrar o modificar manualmente ninguna app.
No elimina cookies, marcadores ni preferencias de las copias conservadas.
Los datos posteriores pueden quedar separados en profile-after.
No desactives Gatekeeper ni retires cuarentena para abrir ningún archivo.

Carpeta de la transacción: ${plan.work}
Copia anterior: ${paths(plan).previous}
Perfil original: ${plan.profile}
Guarda estas instrucciones antes de iniciar el reemplazo.
`;
  for (const dir of [plan.root, plan.work]) {
    for (const [name, data, mode] of [[NAME, recoveryScript(plan), 0o700], ["RECUPERAR SLATE.txt", instructions, 0o600]]) {
      const file = await fs.open(path.join(dir, name), "w", mode);
      try { await file.writeFile(data); await file.sync(); } finally { await file.close(); }
    }
    await fs.chmod(path.join(dir, NAME), 0o700);
    const directory = await fs.open(dir, "r");
    try { await directory.sync(); } finally { await directory.close(); }
  }
}
module.exports = { NAME, recoveryScript, writeRecoveryEntry };
