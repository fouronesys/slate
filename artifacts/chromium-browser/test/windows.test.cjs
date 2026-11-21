const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { parseOptions, windowsEnvironment, checkConfiguration } = require("../scripts/package-windows.cjs");
const { windowsClient, runWindowsHook, executablePath } = require("../scripts/windows-vmp.cjs");
const { safeName, unusedPath } = require("../src/downloads.cjs");
const { windowFrame, desktopTitle } = require("../src/desktop-platform.cjs");

test("Windows defaults unsigned, x64 only, never inherits signing consent", () => {
  const defaults = parseOptions([]);
  assert.deepEqual(defaults, { check: false, vmpMode: "off", allowBinaryUpload: false, authenticode: false });
  assert.equal(parseOptions(["--authenticode", "--x64", "--vmp-verify"]).authenticode, true);
  for (const args of [["--arm64"], ["--vmp-sign"], ["--allow-binary-upload"], ["--publish"],
    ["--vmp-sign", "--allow-binary-upload", "--vmp-verify"]]) assert.throws(() => parseOptions(args));
  const env = windowsEnvironment(defaults, { SLATE_WINDOWS_AUTHENTICODE: "yes", SLATE_VMP_MODE: "sign",
    SLATE_VMP_ALLOW_BINARY_UPLOAD: "yes" });
  assert.equal(env.SLATE_WINDOWS_AUTHENTICODE, "no");
  assert.equal(env.SLATE_VMP_MODE, "off");
  assert.equal(env.SLATE_VMP_ALLOW_BINARY_UPLOAD, "no");
});
test("effective Windows config is isolated, retains identity/data, and resolves the published ECS URL", async () => {
  const { config, url } = await checkConfiguration();
  assert.equal(config.appId, require("../package.json").build.appId);
  assert.equal(config.mac, undefined); assert.equal(config.dmg, undefined); assert.equal(config.afterPack, undefined);
  assert.equal(config.win.signExecutable, false);
  assert.equal(config.forceCodeSigning, false);
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  assert.equal(config.nsis.perMachine, false);
  assert.equal(config.nsis.runAfterFinish, false);
  assert.equal(config.directories.output, "release/windows");
  assert.equal(typeof require(config.afterSign), "function");
  assert.match(url, /^https:\/\/github.com\/castlabs\/electron-releases\/releases\/download\/v43\.8\.6\+wvcus\/electron-v43\.8\.6\+wvcus-win32-x64\.zip$/);
  const guard = fs.readFileSync(path.resolve(__dirname, "../build/windows-installer.nsh"), "utf8");
  assert.match(guard, /AtLeastWin10/); assert.match(guard, /IsNativeARM64/);
  const result = spawnSync(process.execPath, ["-e", `const c=require('./build/windows.cjs');process.exit(c.forceCodeSigning && c.win.signExecutable ? 0 : 1)`],
    { cwd: path.resolve(__dirname, ".."), env: windowsEnvironment({ authenticode: true }) });
  assert.equal(result.status, 0);
});
test("Windows keeps native caption outside content, Mac keeps inset traffic lights and vibrancy", () => {
  const win = windowFrame("win32", true);
  assert.equal(win.frame, true); assert.equal(win.titleBarStyle, "default");
  assert.equal(win.trafficLightPosition, undefined); assert.equal(win.vibrancy, undefined);
  const mac = windowFrame("darwin", true);
  assert.equal(mac.titleBarStyle, "hiddenInset"); assert.equal(mac.vibrancy, "under-window");
  assert.deepEqual(mac.trafficLightPosition, { x: 16, y: 17 });
  assert.equal(desktopTitle("win32", { url: "https://example.test", title: "Documento" }), "Documento — Slate Privacy");
  assert.equal(desktopTitle("win32", { url: "" }), "Slate Privacy");
  assert.equal(desktopTitle("darwin", { url: "https://example.test", title: "Documento" }), "Slate Privacy");
});
test("Windows download names handle devices, trailing dots and case-insensitive active collisions", t => {
  for (const name of ["CON", "con.txt", "LPT1.pdf", "com9", "NUL.", "AUX ", "COM¹.txt"]) assert.ok(safeName(name).startsWith("_"));
  assert.equal(safeName("informe.txt. "), "informe.txt");
  assert.equal(safeName("... "), "archivo");
  assert.equal(safeName("C:\\fuera\\Vídeo?.mp4"), "Vídeo_.mp4");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slate-win-names-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(unusedPath(dir, "foto.jpg", new Set([path.join(dir, "FOTO.JPG")]), "win32"), path.join(dir, "foto (1).jpg"));
  assert.equal(unusedPath(dir, "foto.jpg", new Set([path.join(dir, "FOTO.JPG")]), "darwin"), path.join(dir, "foto.jpg"));
});
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slate-win-vmp-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const exe = path.join(dir, "Slate Privacy.exe");
  fs.mkdirSync(path.join(dir, "resources")); fs.writeFileSync(path.join(dir, "resources/app.asar"), "fixture");
  fs.writeFileSync(exe, "MZ-not-a-real-executable");
  return { dir, exe };
}
test("Windows VMP targets only the packaged EXE, offline and never the Mac framework", t => {
  const { dir, exe } = fixture(t), calls = [];
  const client = windowsClient({ execute: (python, args, options) => {
    calls.push({ python, args, options });
    return { status: 0, stdout: args.includes("--version") ? "vmp.py 1.3.3" : "Signature is valid: streaming" };
  } });
  assert.equal(client.verify(exe).verified, true);
  const call = calls.at(-1);
  assert.ok(call.args.includes("offline"));
  assert.deepEqual(call.args.slice(-8), ["--no-ask", "verify-pkg", "--streaming", "--min-days", "30", "--name-hint", "Slate Privacy", dir]);
  assert.equal(call.options.shell, false);
  assert.throws(() => executablePath(dir), /ruta debe/);
  assert.throws(() => client.sign(exe), /Subida bloqueada/);
  fs.unlinkSync(path.join(dir, "resources/app.asar"));
  assert.throws(() => client.verify(exe), /ruta debe/);
});
test("Windows post-sign hook is separate and requires explicit upload consent", async () => {
  const calls = [], client = { sign: (...args) => calls.push(["sign", ...args]), verify: exe => calls.push(["verify", exe]) };
  const context = { electronPlatformName: "win32", appOutDir: "/build/win-unpacked" };
  await runWindowsHook(context, { client, log: () => {} });
  assert.deepEqual(calls, []);
  await assert.rejects(runWindowsHook(context, { mode: "sign", client }), /no autorizada/);
  await assert.rejects(runWindowsHook({ ...context, electronPlatformName: "darwin" }, { mode: "verify", client }), /solo admite Windows/);
  await runWindowsHook(context, { mode: "sign", allowBinaryUpload: true, client, log: () => {} });
  await runWindowsHook(context, { mode: "verify", client, log: () => {} });
  assert.deepEqual(calls, [
    ["sign", path.join(context.appOutDir, "Slate Privacy.exe"), { allowBinaryUpload: true }],
    ["verify", path.join(context.appOutDir, "Slate Privacy.exe")],
  ]);
  await assert.rejects(runWindowsHook(context, { mode: "verify", client: { verify: () => { throw new Error("invalid"); } } }), /invalid/);
});
