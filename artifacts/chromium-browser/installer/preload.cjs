"use strict";
const { contextBridge, ipcRenderer } = require("electron");
const call = (name) => () => ipcRenderer.invoke(`installer:${name}`);
contextBridge.exposeInMainWorld("slateInstaller", Object.freeze({
  getState: call("getState"), install: call("install"), cancel: call("cancel"),
  open: call("open"), close: call("close"),
  onState(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("installer:state", listener);
    return () => ipcRenderer.removeListener("installer:state", listener);
  },
}));
