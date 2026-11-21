"use strict";
// Optional build-time tool. Never imported by the browser or its installer.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "..");
const CLIENT_DIR = path.join(ROOT, "release", "vmp-client");
const CLIENT_VERSION = "1.3.3";
const BOOTSTRAP = `import sys,runpy
sys.path.insert(0,sys.argv.pop(1))
module=sys.argv.pop(1)
offline=sys.argv.pop(1)=="offline"
def guard(event,args):
  if event in ("socket.connect","socket.getaddrinfo"):
    raise RuntimeError("Network disabled during local VMP verification")
if offline:
  sys.addaudithook(guard)
runpy.run_module(module,run_name="__main__")
`;

function clientEnvironment(base = process.env) {
  // Do not inherit overrides such as EVS_ANY_SKI, EVS_FORCE or an API redirect.
  return Object.fromEntries(Object.entries(base).filter(([key]) => !key.startsWith("EVS_")));
}

function bundlePath(input) {
  if (!input) throw new Error("Indica la ruta completa a Slate Privacy.app.");
  const app = fs.realpathSync(path.resolve(input));
  if (path.basename(app) !== "Slate Privacy.app" ||
      !fs.statSync(app).isDirectory() ||
      !fs.existsSync(path.join(app, "Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"))) {
    throw new Error("La ruta debe corresponder al paquete Slate Privacy.app, no a un DMG ni a una carpeta general.");
  }
  return app;
}

function createClient({ execute = spawnSync, python = process.platform === "win32" ? "python" : "python3",
  clientDir = CLIENT_DIR, resolveBundle = bundlePath } = {}) {
  function run(module, args, interactive = false) {
    const offline = module === "vmp" && !args.includes("sign-pkg");
    return execute(python, ["-c", BOOTSTRAP, clientDir, `castlabs_evs.${module}`, offline ? "offline" : "online", ...args], {
      cwd: ROOT, shell: false, timeout: interactive ? 600000 : 480000,
      maxBuffer: 1024 * 1024, encoding: "utf8",
      env: clientEnvironment(),
      stdio: interactive ? "inherit" : ["ignore", "pipe", "pipe"],
    });
  }
  function ready() {
    const result = run("vmp", ["--version"]);
    if (result.error || result.status !== 0 || !/\b1\.3\.3\b/.test(result.stdout || "")) {
      throw new Error(`No está disponible el cliente EVS ${CLIENT_VERSION}. Ejecuta «pnpm --filter @workspace/chromium-browser run video:setup» con Python 3 y pip instalados.`);
    }
  }
  function operation(command, app) {
    return run("vmp", ["--no-ask", command, "--streaming", "--min-days", "30",
      "--name-hint", "Slate Privacy", path.dirname(app)]);
  }
  function valid(result) {
    const output = String(result.stdout || "").replace(/\u001b\[[0-9;]*m/g, "");
    return !result.error && result.status === 0 &&
      /Signature is valid:/.test(output) && /\bstreaming\b/.test(output);
  }
  function failure(result) {
    const text = `${result.stdout || ""}\n${result.stderr || ""}`;
    if (/valid for development only/i.test(text)) return "el certificado es solo de desarrollo, no de producción";
    if (/expires in less than/i.test(text)) return "la firma está caducada o tiene menos de 30 días de vigencia";
    if (/not yet valid/i.test(text)) return "el certificado aún no es válido; comprueba también la fecha del equipo";
    if (/failed to read signature/i.test(text)) return "la firma no existe o no se puede leer";
    if (/failed to verify signature/i.test(text)) return "la firma no valida el binario actual";
    if (result.error || result.signal) return "la herramienta no pudo completar la comprobación";
    return "la herramienta no devolvió una firma de producción válida";
  }
  return {
    setup() {
      // Explicit command only; never installed from a packaging hook.
      const result = execute(python, ["-m", "pip", "install", "--upgrade", "--target", clientDir,
        `castlabs-evs==${CLIENT_VERSION}`], { cwd: ROOT, shell: false, stdio: "inherit", timeout: 600000 });
      if (result.error || result.status !== 0) throw new Error("No se pudo instalar EVS. Comprueba Python 3, pip y la conexión; no se creó ninguna cuenta.");
      ready();
    },
    account(action) {
      if (!["signup", "reauth"].includes(action)) throw new Error("Usa video:account signup o video:account reauth.");
      ready();
      const result = run("account", [action], true);
      if (result.error || result.status !== 0) throw new Error("El cliente oficial no completó el acceso a la cuenta. No compartas contraseñas ni tokens en el chat.");
    },
    verify(input) {
      const app = resolveBundle(input);
      ready();
      const result = operation("verify-pkg", app);
      if (!valid(result)) {
        // Do not dump the client's raw errors, URLs, tokens or account details.
        throw new Error(`Firma VMP de streaming no verificada: ${failure(result)}. Esto no diagnostica por sí solo Netflix.`);
      }
      return { app, verified: true, kind: "streaming", minDays: 30 };
    },
    sign(input, { allowBinaryUpload = false } = {}) {
      if (!allowBinaryUpload) throw new Error("Subida bloqueada: firmar requiere --vmp-sign y --allow-binary-upload al compilar.");
      const app = resolveBundle(input);
      ready();
      if (!valid(operation("verify-pkg", app))) {
        const result = operation("sign-pkg", app);
        if (result.error || result.status !== 0) {
          throw new Error("EVS no completó la firma. Comprueba tu conexión y autentícate localmente con video:account reauth. No se ha validado el paquete.");
        }
      }
      if (!valid(operation("verify-pkg", app))) throw new Error("La firma VMP no pasó la comprobación posterior. No distribuyas este paquete.");
      return { app, verified: true, kind: "streaming", minDays: 30 };
    },
  };
}

function buildEnvironment(options, base = process.env) {
  // Wrappers reset inherited flags: a previous signing build is not consent.
  return { ...base, SLATE_VMP_MODE: options.vmpMode || "off",
    SLATE_VMP_ALLOW_BINARY_UPLOAD: options.allowBinaryUpload ? "yes" : "no" };
}

async function runHook(context, { afterSign = false, mode = "off", allowBinaryUpload = false,
  client = createClient(), log = console.info } = {}) {
  if (!["off", "verify", "sign"].includes(mode)) throw new Error("Modo VMP no reconocido.");
  if (mode === "off") {
    log("VMP desactivada: no se comprueba ni solicita firma de producción; no se garantiza reproducción comercial.");
    return;
  }
  if (context.electronPlatformName !== "darwin") throw new Error("Este flujo VMP está preparado únicamente para los paquetes macOS de Slate.");
  if (mode === "sign" && !allowBinaryUpload) throw new Error("Subida del binario no autorizada; falta --allow-binary-upload.");
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (mode === "sign" && !afterSign) {
    log("VMP: se permite solicitar la firma y subir el binario del motor a Castlabs si no hay firma válida. No se envía el perfil del navegador.");
    client.sign(app, { allowBinaryUpload });
  } else {
    client.verify(app);
  }
  log(`VMP de streaming verificada ${afterSign ? "después de la firma Apple" : "antes de la firma Apple"}. No equivale a verificar Netflix/Disney+.`);
}

module.exports = { createClient, buildEnvironment, clientEnvironment, runHook, bundlePath, CLIENT_VERSION };
