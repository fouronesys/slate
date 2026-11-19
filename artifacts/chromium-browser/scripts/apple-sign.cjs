// Keep the certificate fingerprint selected by electron-builder. Its default
// doSign path substitutes the display name, which can be misencoded by codesign.
async function signWithFingerprint(options, sign) {
  if (!/^[a-f0-9]{40}$/i.test(options.identity || "")) {
    throw new Error("La firma Apple requiere la huella de un certificado válido; no se omitirá la firma.");
  }
  if (!sign) {
    const builderDir = require("node:path").dirname(require.resolve("electron-builder"));
    ({ sign } = require(require.resolve("app-builder-lib/out/codeSign/macCodeSign.js", {
      paths: [builderDir],
    })));
  }
  return sign({ ...options });
}

module.exports = (options) => signWithFingerprint(options);
module.exports.signWithFingerprint = signWithFingerprint;
