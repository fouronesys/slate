"use strict";
const { runHook } = require("./vmp-client.cjs");
module.exports = context => runHook(context, {
  afterSign: true,
  mode: process.env.SLATE_VMP_MODE || "off",
  allowBinaryUpload: process.env.SLATE_VMP_ALLOW_BINARY_UPLOAD === "yes",
});
