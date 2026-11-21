"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createNativeOps } = require("./native.cjs");
const { verifyRecord } = require("./verify.cjs");
const { save, paths, validatePlan, install, rollback, exists } = require("./transaction.cjs");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { if (e.code === "ESRCH") return false; throw e; } }
async function waitForExit(pid, milliseconds) {
  const end = Date.now() + milliseconds;
  while (alive(pid)) {
    if (Date.now() > end) throw new Error("Slate no terminó de cerrarse; no se reemplazará.");
    await sleep(250);
  }
}
function launch(plan, testing) {
  const env = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: require("node:os").homedir() };
  if (testing) env.SLATE_UPDATE_TOKEN = plan.token;
  const child = spawn(path.join(paths(plan).target, "Contents/MacOS/Slate Privacy"), [], { env, detached: true, stdio: "ignore" });
  // Handle launch failures without unhandled events; probe treats them as failure.
  child.on("error", () => {});
  return child;
}
async function probe(plan, ops) {
  const child = launch(plan, true);
  const end = Date.now() + 180000;
  let accepted = false;
  while (child.exitCode === null && !child.signalCode && child.pid && Date.now() < end) {
    if (await exists(paths(plan).decision)) {
      const result = JSON.parse(await fs.readFile(paths(plan).decision, "utf8"));
      if (result.token === plan.token) { accepted = result.accept === true; break; }
    }
    await sleep(500);
  }
  if (accepted) { child.unref(); return true; }
  // Stop only the process we launched, then ensure all Chromium helpers exited.
  if (child.pid && child.exitCode === null && !child.signalCode) {
    child.kill("SIGTERM");
    try { await waitForExit(child.pid, 15000); }
    catch { child.kill("SIGKILL"); await waitForExit(child.pid, 10000); }
  }
  await ops.assertStopped();
  return false;
}
async function main(root, action, { platform = process.platform, ops = createNativeOps(), validate = validatePlan, start = launch, locations } = {}) {
  if (platform !== "darwin" || !["install", "rollback", "recover"].includes(action)) throw new Error("Ayudante solo para distribución directa de Mac.");
  const file = path.join(root, "transaction.json");
  const plan = JSON.parse(await fs.readFile(file, "utf8"));
  await validate(plan, root);
  if (plan.helperPid && alive(plan.helperPid)) throw new Error("Hay otra recuperación activa. No se iniciará una segunda.");
  if (action === "install") {
    plan.record = verifyRecord(plan.envelope, require("./policy.json"), {
      current: plan.current, arch: process.arch, macOS: await ops.macOS(),
      engine: plan.engine,
    });
  }
  plan.helperPid = process.pid;
  await save(file, plan);
  process.send?.("ready");
  process.disconnect?.();
  let failure;
  try {
    // The independently opened recovery launcher has no browser parent to wait
    // for. assertStopped in rollback still blocks every live browser/helper.
    if (action !== "recover") await waitForExit(plan.parentPid, 90000);
    if (action === "install") {
      try { await install(plan, { ops, probe: value => probe(value, ops) }); }
      catch (error) {
        plan.error = error.message;
        await save(file, plan);
        await rollback(plan, { ops, locations });
        start(plan, false).unref();
      }
    } else {
      await rollback(plan, { ops, locations });
      start(plan, false).unref();
      console.info("Slate se ha recuperado. Se conservan las copias y se abre la versión anterior.");
    }
  } catch (error) {
    plan.error = error.message;
    await save(file, plan);
    failure = error;
  } finally {
    delete plan.helperPid;
    await save(file, plan);
  }
  if (failure) throw failure;
}
if (require.main === module) main(process.argv[2], process.argv[3]).catch(error => {
  console.error(`No se pudo completar la recuperación/actualización: ${error.message}\nConserva las copias. No se ha confirmado una recuperación correcta.`);
  process.exitCode = 1;
});
module.exports = { main, waitForExit };
