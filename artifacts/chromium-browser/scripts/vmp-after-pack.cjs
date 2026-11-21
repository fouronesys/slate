"use strict";
const { runHook } = require("./vmp-client.cjs");
module.exports = context => {
  require("./check-packaged-runtime.cjs").checkPackagedRuntime(context);
  return runHook(context, {
    mode: process.env.SLATE_VMP_MODE || "off",
    allowBinaryUpload: process.env.SLATE_VMP_ALLOW_BINARY_UPLOAD === "yes",
  });
};
