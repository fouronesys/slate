"use strict";
const { createClient } = require("./vmp-client.cjs");

function main(args = process.argv.slice(2), client = createClient()) {
  const [command, ...rest] = args.filter(arg => arg !== "--");
  if (command === "setup" && rest.length === 0) {
    console.info("Se descargará el cliente oficial de firma desde PyPI. No se creará una cuenta ni se solicitará una firma.");
    client.setup();
    console.info("Cliente instalado solo para compilación, en release/vmp-client (fuera del paquete del navegador).");
  } else if (command === "account" && rest.length === 1) {
    client.account(rest[0]);
  } else if (command === "verify" && rest.length === 1) {
    client.verify(rest[0]);
    console.info("Firma VMP de producción para streaming verificada localmente (mínimo 30 días). No comprueba reproducción ni licencias de Netflix/Disney+.");
  } else {
    throw new Error("Uso: video:setup | video:account signup/reauth | video:verify «/ruta/Slate Privacy.app». La firma solo se solicita al compilar con autorización explícita.");
  }
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main };
