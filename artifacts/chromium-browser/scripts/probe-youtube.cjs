// Run with Node, not Electron: a native crash must not kill the comparison.
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { parseOptions, comparisonExitCode } = require("./youtube-probe-results.cjs");

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const output = path.resolve(__dirname, "../../../generated-artifacts/youtube");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "brujula-youtube-"));
  const runs = [];
  await fs.mkdir(output, { recursive: true });
  const modes = options.diagnose ? ["off", "network", "on"] : ["off", "on"];
  try {
    for (const mode of modes) {
      const profile = path.join(root, mode);
      await fs.mkdir(profile);
      const args = [
        path.join(__dirname, "youtube-worker.cjs"), `--mode=${mode}`,
        `--seconds=${options.seconds}`, `--video=${options.video}`, `--profile=${profile}`,
      ];
      // The preview exceptions belong only to Linux/Replit, never macOS.
      const command = process.platform === "linux" ? "bash" : require("electron");
      const childArgs = process.platform === "linux"
        ? [path.join(__dirname, "preview.sh"), ...args] : args;
      console.info(`YouTube: ${mode === "off" ? "sin bloqueo" : mode === "network" ? "solo filtrado de red" : "protección completa"} (${options.seconds}s).`);
      const run = await new Promise((resolve) => {
        const env = { ...process.env };
        delete env.NODE_OPTIONS;
        delete env.ELECTRON_RUN_AS_NODE;
        const child = spawn(command, childArgs, { cwd: path.resolve(__dirname, ".."), env });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let spawnError = null;
        // Bound memory even if Chromium logs continuously.
        child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-2_000_000); });
        child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-2_000_000); });
        child.on("error", (error) => { spawnError = error.message; });
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, (options.seconds + 90) * 1000);
        child.on("close", (exitCode, signal) => {
          clearTimeout(timer);
          const line = stdout.split("\n").find((value) => value.startsWith("YOUTUBE_RESULT "));
          let observation = null;
          try { observation = JSON.parse(line?.slice("YOUTUBE_RESULT ".length)); } catch { /* missing/crashed report */ }
          const reportedSignal = stderr.match(/exited with signal (SIG[A-Z]+)/)?.[1] || null;
          resolve({ mode, exitCode, signal, reportedSignal, timedOut, spawnError, observation, stdout, stderr });
        });
      });
      await fs.writeFile(path.join(output, `${mode}.log`), run.stdout + "\n" + run.stderr);
      delete run.stdout;
      delete run.stderr;
      runs.push(run);
      console.info(JSON.stringify(run));
    }
    const report = {
      recordedAt: new Date().toISOString(),
      platform: process.platform, arch: process.arch,
      options, runs,
      // Even a successful observation cannot certify mid-roll suppression.
      macPlaybackObserved: process.platform === "darwin" && comparisonExitCode(runs, modes.length) === 0 &&
        runs.every((run) => run.observation.sandboxRequested && !run.observation.noSandboxSwitch),
      adBlockingVerified: false,
      limitation: "A finite observation is not proof of pre-roll or mid-roll ad suppression.",
    };
    await fs.writeFile(path.join(output, "comparison.json"), JSON.stringify(report, null, 2));
    console.info(`Informe: ${path.join(output, "comparison.json")}`);
    console.info("La tarea sigue pendiente de comprobar anuncios antes y durante vídeos reales en macOS.");
    // 0 = playback observed in both trials, NOT proof of effective adblocking.
    // 1 = crash/setup failure; 2 = challenge/consent/no advancing content.
    process.exitCode = comparisonExitCode(runs, modes.length);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
