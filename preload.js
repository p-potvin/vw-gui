/* ==========================================================================
   vw-gui :: preload
   The only bridge between the renderer and the main process. Nothing here
   exposes raw fs, child_process or ipcRenderer — only named operations.
   ========================================================================== */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vwg", {
  // Registry
  loadRegistry: () => ipcRenderer.invoke("registry:load"),
  writeRegistry: (payload) => ipcRenderer.invoke("registry:write", payload),
  parseParams: (payload) => ipcRenderer.invoke("script:parseParams", payload),
  importScript: (payload) => ipcRenderer.invoke("script:import", payload),
  deleteScript: (payload) => ipcRenderer.invoke("script:delete", payload),

  // Execution
  startJob: (payload) => ipcRenderer.invoke("job:start", payload),
  stopJob: (payload) => ipcRenderer.invoke("job:stop", payload),
  jobBuffer: (payload) => ipcRenderer.invoke("job:buffer", payload),
  onJobOutput: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("job:output", handler);
    return () => ipcRenderer.removeListener("job:output", handler);
  },
  onJobExit: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("job:exit", handler);
    return () => ipcRenderer.removeListener("job:exit", handler);
  },

  // Destructive gate
  isAdmin: () => ipcRenderer.invoke("system:isAdmin"),
  agentEnv: () => ipcRenderer.invoke("system:agentEnv"),

  // Dialogs & shell
  pickFolder: (payload) => ipcRenderer.invoke("dialog:pickFolder", payload || {}),
  pickFile: (payload) => ipcRenderer.invoke("dialog:pickFile", payload || {}),
  openPath: (payload) => ipcRenderer.invoke("shell:openPath", payload),
  showInFolder: (payload) => ipcRenderer.invoke("shell:showInFolder", payload),

  // Store
  listHistory: () => ipcRenderer.invoke("history:list"),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  getPrefs: () => ipcRenderer.invoke("prefs:get"),
  setPrefs: (prefs) => ipcRenderer.invoke("prefs:set", prefs),

  // Window chrome
  win: {
    minimize: () => ipcRenderer.invoke("win:minimize"),
    maximize: () => ipcRenderer.invoke("win:maximize"),
    close: () => ipcRenderer.invoke("win:close"),
  },
});
