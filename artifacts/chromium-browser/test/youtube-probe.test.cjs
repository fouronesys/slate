const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseOptions, summarize, comparisonExitCode } = require("../scripts/youtube-probe-results.cjs");

test("YouTube probe accepts bounded observations and video IDs, not arbitrary URLs or flags", () => {
  assert.deepEqual(parseOptions([]), { seconds: 180, video: "M7lc1UVf-VE" });
  assert.deepEqual(parseOptions(["--seconds=600", "--video=M7lc1UVf-VE"]), { seconds: 600, video: "M7lc1UVf-VE" });
  assert.deepEqual(parseOptions(["--diagnose", "--seconds=20"]),
    { seconds: 20, video: "M7lc1UVf-VE", diagnose: true });
  for (const arg of ["--seconds=0", "--seconds=NaN", "--seconds=1801", "--seconds=20.5",
    "--video=https://example.com", "--no-sandbox", "--profile=/tmp/user"]) {
    assert.throws(() => parseOptions([arg]));
  }
});

const sample = (time, overrides = {}) => ({
  elapsed: time, currentTime: time, videoId: "M7lc1UVf-VE", playing: true,
  adShowing: false, ...overrides,
});

test("finite content progress is labelled an observation, not verified ad blocking", () => {
  assert.deepEqual(summarize([sample(1), sample(3), sample(5)]),
    { status: "playback-observed", reason: "content-advanced-not-proof-of-adblocking" });
});

test("no samples, a single timestamp, stalls, seeking or a stopped player cannot pass", () => {
  for (const samples of [[], [sample(5)], [sample(1), sample(3, { currentTime: 1 })],
    [sample(1), sample(3, { currentTime: 200 })],
    [sample(1), sample(3), sample(5, { playing: false })],
    [sample(1), sample(3, { videoId: "other" })],
    [sample(1), sample(3, { mediaError: 3 })]]) {
    assert.equal(summarize(samples).status, "inconclusive");
  }
});

test("challenge, consent, anti-adblock or an ad seen anywhere overrides playback", () => {
  for (const flag of ["botChallenge", "consentPage", "antiAdblock", "adShowing"]) {
    assert.equal(summarize([sample(1), sample(3, { [flag]: true }), sample(5)]).status, "inconclusive");
  }
});

test("comparison distinguishes crashes from inconclusive reports and never passes missing results", () => {
  const observed = { exitCode: 0, observation: { status: "playback-observed" } };
  assert.equal(comparisonExitCode([observed, observed]), 0);
  assert.equal(comparisonExitCode([observed, observed, observed], 3), 0);
  assert.equal(comparisonExitCode([observed, observed], 3), 2);
  assert.equal(comparisonExitCode([observed, { exitCode: 0 }]), 2);
  assert.equal(comparisonExitCode([observed, { exitCode: 2 }]), 2);
  assert.equal(comparisonExitCode([]), 2);
  for (const failure of [{ exitCode: 1 }, { exitCode: 139 }, { exitCode: null, signal: "SIGSEGV" },
    { exitCode: 0, reportedSignal: "SIGSEGV" },
    { exitCode: 0, timedOut: true }, { exitCode: null, spawnError: "spawn failed" }]) {
    assert.equal(comparisonExitCode([observed, failure]), 1);
  }
});
