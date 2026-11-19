function parseOptions(args) {
  const options = { seconds: 180, video: "M7lc1UVf-VE" };
  for (const arg of args) {
    if (arg === "--diagnose") {
      options.diagnose = true;
    } else if (arg.startsWith("--seconds=")) {
      const seconds = Number(arg.slice("--seconds=".length));
      if (!Number.isInteger(seconds) || seconds < 20 || seconds > 1800) {
        throw new Error("--seconds debe ser un entero entre 20 y 1800.");
      }
      options.seconds = seconds;
    } else if (arg.startsWith("--video=")) {
      const video = arg.slice("--video=".length);
      if (!/^[A-Za-z0-9_-]{11}$/.test(video)) throw new Error("--video debe ser un identificador de vídeo de YouTube.");
      options.video = video;
    } else {
      throw new Error(`Opción no reconocida: ${arg}`);
    }
  }
  return options;
}

function summarize(samples) {
  if (samples.some((sample) => sample.botChallenge)) return { status: "inconclusive", reason: "bot-challenge" };
  if (samples.some((sample) => sample.consentPage)) return { status: "inconclusive", reason: "consent-required" };
  if (samples.some((sample) => sample.antiAdblock)) return { status: "inconclusive", reason: "anti-adblock" };
  if (samples.some((sample) => sample.adShowing)) return { status: "inconclusive", reason: "ad-observed" };
  // A single currentTime > 0 may be an advert, a seek, or a stalled player.
  const advanced = samples.some((sample, i) => {
    const previous = samples[i - 1];
    return previous && sample.playing && previous.playing &&
      sample.videoId && sample.videoId === previous.videoId &&
      sample.currentTime > previous.currentTime + 0.5 &&
      sample.currentTime - previous.currentTime <= sample.elapsed - previous.elapsed + 2;
  });
  const last = samples.at(-1);
  return advanced && last?.playing && !last?.mediaError
    ? { status: "playback-observed", reason: "content-advanced-not-proof-of-adblocking" }
    : { status: "inconclusive", reason: "content-not-advancing" };
}

function comparisonExitCode(runs, expectedCount = 2) {
  if (runs.some((run) => run.signal || run.reportedSignal || run.timedOut || run.spawnError ||
    (run.exitCode !== 0 && run.exitCode !== 2))) return 1;
  return runs.length === expectedCount &&
    runs.every((run) => run.exitCode === 0 && run.observation?.status === "playback-observed") ? 0 : 2;
}

module.exports = { parseOptions, summarize, comparisonExitCode };
