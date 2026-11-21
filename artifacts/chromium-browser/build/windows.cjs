"use strict";
// Loaded explicitly with --config: never inherit the Mac build hooks or DMG.
const { build } = require("../package.json");
const authenticode = process.env.SLATE_WINDOWS_AUTHENTICODE === "yes";
module.exports = {
  extends: null,
  appId: build.appId,
  productName: build.productName,
  electronVersion: build.electronVersion,
  electronDownload: { ...build.electronDownload },
  files: [...build.files],
  icon: build.icon,
  directories: { output: "release/windows" },
  publish: null,
  forceCodeSigning: authenticode,
  afterSign: require.resolve("../scripts/windows-vmp-after-sign.cjs"),
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    executableName: "Slate Privacy",
    artifactName: "Slate-Privacy-${version}-windows-${arch}-setup.${ext}",
    requestedExecutionLevel: "asInvoker",
    // Keep resource editing (icon, name) even for explicitly unsigned builds.
    signExecutable: authenticode,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    selectPerMachineByDefault: false,
    packElevateHelper: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: false,
    createStartMenuShortcut: true,
    shortcutName: "Slate Privacy",
    runAfterFinish: false,
    include: "build/windows-installer.nsh",
  },
};
