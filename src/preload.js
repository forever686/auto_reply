const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("assistantApi", {
  query(payload) {
    return ipcRenderer.invoke("assistant:query", payload);
  },
  getDefaultCommand(agentType) {
    return ipcRenderer.invoke("assistant:get-default-command", agentType);
  },
  testReplyConnection(replySettings) {
    return ipcRenderer.invoke("assistant:test-reply-connection", replySettings);
  },
  openExternal(url) {
    return ipcRenderer.invoke("assistant:open-external", url);
  },
  onQueryProgress(callback) {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("assistant:query-progress", listener);
    return () => ipcRenderer.removeListener("assistant:query-progress", listener);
  },
  copyText(text) {
    return ipcRenderer.invoke("assistant:copy-text", text);
  }
});
