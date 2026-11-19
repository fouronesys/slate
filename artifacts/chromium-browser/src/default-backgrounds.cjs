"use strict";
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function defaultBackground({ backdrop, theme }, systemDark, directory) {
  if (backdrop !== "slate") return null;
  const dark = theme === "sistema" ? systemDark : theme === "oscuro";
  const prefix = dark ? "slate-dark-1080" : "slate-light-1080";
  return {
    url: pathToFileURL(path.join(directory, `${prefix}.mp4`)).href,
    poster: pathToFileURL(path.join(directory, `${prefix}.jpg`)).href,
    name: dark ? "Slate · Logo plateado · 1080p" : "Slate · Logo grafito · 1080p",
    builtin: true,
  };
}
module.exports = { defaultBackground };
