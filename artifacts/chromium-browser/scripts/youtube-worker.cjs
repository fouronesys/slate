// Invoked by probe-youtube.cjs in a separate Electron process per trial.
// No personal profile, account, debugging port or certificate bypass is used.
const { app, BrowserWindow, session } = require("electron");
const { Protection } = require("../src/protection.cjs");
const { summarize } = require("./youtube-probe-results.cjs");
const { loadYouTube } = require("./youtube-navigation.cjs");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const seconds = Number(option("seconds"));
const videoId = option("video");
const profile = option("profile");
const mode = option("mode");
const blocking = mode !== "off";

// Diagnostic trial only. Never changes a user's stored protection preferences.
class NetworkOnlyProtection extends Protection {
  install(engine) {
    engine.config.loadCosmeticFilters = false;
    super.install(engine);
  }
}

async function main() {
  if (!profile || !/^[A-Za-z0-9_-]{11}$/.test(videoId) || !Number.isInteger(seconds) ||
      seconds < 20 || seconds > 1800 || !["on", "off", "network"].includes(mode)) {
    throw new Error("Ejecuta node scripts/probe-youtube.cjs, no el proceso auxiliar.");
  }
  app.setPath("userData", profile);
  await app.whenReady();
  const browsing = session.fromPartition("youtube-probe");
  browsing.setUserAgent(app.userAgentFallback.replace(/\sElectron\/[\d.]+/g, "").replace(/\s@workspace\/chromium-browser\/[\d.]+/g, ""));
  browsing.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  const ProtectionClass = mode === "network" ? NetworkOnlyProtection : Protection;
  const protection = blocking ? new ProtectionClass(browsing, profile, () => {}) : null;
  if (protection) {
    await protection.start();
    if (!protection.ready) throw new Error("Filter engine unavailable");
  }
  const win = new BrowserWindow({
    show: true,
    webPreferences: {
      session: browsing, sandbox: true, contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("YOUTUBE_RENDERER_EXIT", JSON.stringify(details));
    app.exit(1);
  });
  app.on("child-process-gone", (_event, details) => {
    console.error("YOUTUBE_CHILD_EXIT", JSON.stringify(details));
  });
  const samples = [];
  let navigationError = null;
  let navigation = null;
  console.info("YOUTUBE_STAGE", JSON.stringify({ mode, stage: "before-navigation", versions: process.versions }));
  try {
    navigation = await loadYouTube(win.webContents, `https://www.youtube.com/watch?v=${videoId}`);
    const started = Date.now();
    while (Date.now() - started < seconds * 1000) {
      const sample = await win.webContents.executeJavaScript(`(() => {
        const video = document.querySelector('video');
        const player = document.querySelector('#movie_player');
        const text = document.body.innerText;
        // The player can appear after navigation finishes. Request playback
        // without muting, skipping, seeking or reloading the page.
        if (video?.paused && !video.ended) video.play().catch(() => {});
        return {
          hasPlayer: Boolean(player), hasVideo: Boolean(video),
          playing: Boolean(video && !video.paused && !video.ended && video.readyState >= 2),
          currentTime: video?.currentTime || 0,
          mediaError: video?.error?.code || null,
          videoId: player?.getVideoData?.()?.video_id || null,
          adShowing: Boolean(document.querySelector('.html5-video-player.ad-showing, .html5-video-player.ad-interrupting')),
          botChallenge: /confirm you.re not a bot|confirma que no eres un robot|unusual traffic|sign in to confirm/i.test(text),
          consentPage: location.hostname === 'consent.youtube.com' || Boolean(document.querySelector('form[action*="consent.youtube.com"]')),
          antiAdblock: /ad blockers violate|ad blockers are not allowed|bloqueadores de anuncios.*no.*permitidos/i.test(text)
        };
      })()`, true);
      sample.elapsed = (Date.now() - started) / 1000;
      // Do not count an advert or an unrelated video as target content.
      if (sample.videoId !== videoId) sample.playing = false;
      samples.push(sample);
      if (sample.botChallenge || sample.consentPage || sample.antiAdblock) break;
      await delay(2000);
    }
  } catch (error) {
    navigationError = error.message;
  }
  const result = {
    ...summarize(samples),
    ...(navigationError ? { status: "inconclusive", reason: "navigation-or-evaluation-error", navigationError } : {}),
    mode, blocking, cosmeticFiltering: mode === "on", platform: process.platform, versions: process.versions,
    navigation,
    sandboxRequested: true,
    noSandboxSwitch: app.commandLine.hasSwitch("no-sandbox"),
    counts: protection?.counts(win.webContents.id) || { blocked: 0 },
    scriptWarning: protection?.scriptWarning || null,
    samples,
  };
  console.info("YOUTUBE_RESULT", JSON.stringify(result));
  win.destroy();
  app.exit(result.status === "playback-observed" ? 0 : 2);
}

main().catch((error) => {
  console.error(error.message);
  app.exit(1);
});
