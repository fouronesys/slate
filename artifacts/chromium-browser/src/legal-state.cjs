const documents = require("./legal-documents.cjs");
function legalSnapshot(value) {
  const accepted = value?.version === documents.version && value?.terms === true &&
    value?.privacy === true && value?.adult === true &&
    typeof value?.acceptedAt === "string" && Number.isFinite(Date.parse(value.acceptedAt));
  return { accepted: Boolean(accepted), version: documents.version, acceptedAt: accepted ? value.acceptedAt : null };
}
function acceptLegal(input, persist, now = () => new Date().toISOString()) {
  if (input?.version !== documents.version || input?.terms !== true ||
      input?.privacy !== true || input?.adult !== true) {
    throw new Error("Debes aceptar los términos, reconocer la política de privacidad y declarar la responsabilidad adulta.");
  }
  const record = { version: documents.version, terms: true, privacy: true, adult: true, acceptedAt: now() };
  if (!persist(record)) throw new Error("No se pudo guardar la aceptación local. No se ha habilitado la navegación.");
  return record;
}
module.exports = { legalSnapshot, acceptLegal };
