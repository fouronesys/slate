"use strict";
const { runWindowsHook } = require("./windows-vmp.cjs");
module.exports = context => runWindowsHook(context, {
  mode: process.env.SLATE_VMP_MODE || "off",
  allowBinaryUpload: process.env.SLATE_VMP_ALLOW_BINARY_UPLOAD === "yes",
});
