"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { treeHash } = require("./verify.cjs");

async function exists(file) {
  try { return await fs.lstat(file); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
}
async function save(file, value) {
  const temp = `${file}.tmp`;
  const handle = await fs.open(temp, "w", 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(temp, file);
  const directory = await fs.open(path.dirname(file), "r");
  try { await directory.sync(); } finally { await directory.close(); }
}
async function safeDirectory(dir) {
  const stat = await fs.lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(dir) !== dir) throw new Error("Carpeta de actualización no segura.");
}
async function syncDirectory(dir) {
  const handle = await fs.open(dir, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}
async function durableRename(from, to) {
  await fs.rename(from, to);
  for (const dir of new Set([path.dirname(from), path.dirname(to)])) await syncDirectory(dir);
}
async function syncTree(root) {
  const stat = await fs.lstat(root);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) for (const name of await fs.readdir(root)) await syncTree(path.join(root, name));
  const handle = await fs.open(root, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}
function paths(plan) {
  return {
    target: "/Applications/Slate Privacy.app",
    stage: path.join(plan.work, "Slate Privacy.app"),
    previous: path.join(plan.work, "previous.app"),
    failed: path.join(plan.work, "failed.app"),
    snapshot: path.join(plan.root, "profile-before"),
    failedProfile: path.join(plan.root, "profile-after"),
    journal: path.join(plan.root, "transaction.json"),
    decision: path.join(plan.root, "decision.json"),
  };
}
async function validatePlan(plan, root) {
  if (plan.root !== root || !/^\.slate-update-[A-Za-z0-9]+$/.test(path.basename(plan.work)) ||
      path.dirname(plan.work) !== "/Applications" ||
      path.dirname(plan.profile) !== path.dirname(root) || plan.profile === root ||
      !/^[a-f0-9]{64}$/.test(plan.token || "") || !Number.isSafeInteger(plan.parentPid) ||
      plan.parentPid <= 1) throw new Error("Plan de recuperación no válido.");
  await safeDirectory(root);
  await safeDirectory("/Applications");
  await safeDirectory(plan.work);
  if (await exists(plan.profile)) await safeDirectory(plan.profile);
}
// No in-place edits of either bundle or live profile. The old app is retained
// until the user explicitly discards the recovery point.
async function install(plan, { ops, journal = value => save(paths(plan).journal, value), probe, locations = paths(plan) }) {
  const p = locations;
  await ops.assertStopped();
  await ops.validate(p.stage, plan.record);
  const current = await ops.inspect(p.target);
  if (current.version !== plan.current.version || current.build !== plan.current.build || current.teamId !== plan.current.teamId) throw new Error("La instalación cambió desde la preparación; no se reemplazará.");
  if (await exists(p.previous) || await exists(p.snapshot)) throw new Error("Ya existe una copia recuperable. No se sobrescribirá.");
  plan.phase = "snapshot";
  await journal(plan);
  await ops.copy(plan.profile, p.snapshot);
  plan.snapshotHash = await treeHash(plan.profile, { bundle: false });
  if (plan.snapshotHash !== await treeHash(p.snapshot, { bundle: false })) throw new Error("La copia del perfil está incompleta. No se ha reemplazado Slate.");
  await syncTree(p.snapshot);
  await syncDirectory(path.dirname(p.snapshot));
  await ops.assertStopped();
  plan.phase = "replacing";
  await journal(plan);
  await durableRename(p.target, p.previous);
  await durableRename(p.stage, p.target);
  await ops.validate(p.target, plan.record);
  plan.phase = "testing";
  await journal(plan); // Before launching any process that could migrate data.
  if (!await probe(plan)) throw new Error("La nueva versión no confirmó un arranque correcto o pediste volver.");
  plan.phase = "accepted";
  await journal(plan);
}
async function rollback(plan, { ops, journal = value => save(paths(plan).journal, value), locations = paths(plan) }) {
  const p = locations;
  await ops.assertStopped();
  async function restoreProfile() {
    const snapshotExists = await exists(p.snapshot);
    if (!snapshotExists) {
      if (await exists(plan.profile) && plan.snapshotHash &&
          await treeHash(plan.profile, { bundle: false }) === plan.snapshotHash) return;
      throw new Error("No se encuentra una copia verificable del perfil; se conserva todo para recuperación manual.");
    }
    if (await treeHash(p.snapshot, { bundle: false }) !== plan.snapshotHash) throw new Error("La copia de recuperación del perfil cambió; no se sobrescribirán datos.");
    if (await exists(plan.profile)) {
      if (await exists(p.failedProfile)) throw new Error("Ya hay un perfil posterior conservado; recuperación manual necesaria.");
      await durableRename(plan.profile, p.failedProfile);
    }
    await durableRename(p.snapshot, plan.profile);
  }
  // A crash may happen between either rename and its following journal write.
  // Existence of previous.app is authoritative; preserve every other copy.
  if (!await exists(p.previous)) {
    if (!await exists(p.target)) throw new Error(`No se encuentra la aplicación anterior. Conserva ${plan.work}.`);
    if (plan.phase === "restoring" && plan.restoreProfile) await restoreProfile();
    const current = await ops.inspect(p.target);
    if (current.version !== plan.current.version || current.build !== plan.current.build || current.teamId !== plan.current.teamId) throw new Error("La app anterior no está en su destino; se requiere recuperación manual.");
    plan.phase = "restored";
    await journal(plan);
    return;
  }
  const previous = await ops.inspect(p.previous);
  if (previous.version !== plan.current.version || previous.build !== plan.current.build || previous.teamId !== plan.current.teamId) throw new Error("La copia anterior no coincide con la referencia de recuperación.");
  const profileMayHaveChanged = plan.phase === "restoring" ? plan.restoreProfile : ["testing", "accepted"].includes(plan.phase);
  plan.restoreProfile = profileMayHaveChanged;
  plan.phase = "restoring";
  await journal(plan);
  if (profileMayHaveChanged) {
    await restoreProfile();
  }
  if (await exists(p.target)) {
    if (await exists(p.failed)) throw new Error("Ya hay una app fallida conservada; recuperación manual necesaria.");
    await durableRename(p.target, p.failed);
  }
  await durableRename(p.previous, p.target);
  await ops.inspect(p.target);
  plan.phase = "restored";
  await journal(plan);
}
module.exports = { exists, save, safeDirectory, paths, validatePlan, install, rollback };
