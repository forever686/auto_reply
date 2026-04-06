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
  copyText(text) {
    return ipcRenderer.invoke("assistant:copy-text", text);
  }
});
