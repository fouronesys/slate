const { contextBridge, ipcRenderer } = require("electron");
function subscribe(channel, callback) {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld("slatePet", {
  getState: () => ipcRenderer.invoke("companion:get-state"),
  action: (action) => ipcRenderer.invoke("companion:action", action),
  onState: (callback) => subscribe("companion:state", callback),
  onCursor: (callback) => subscribe("companion:cursor", callback),
  onMotion: (callback) => subscribe("companion:motion", callback),
  setReducedMotion: (value) => ipcRenderer.invoke("companion:reduced-motion", value),
});
