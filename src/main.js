const path = require("node:path");
const { app, BrowserWindow, clipboard, ipcMain } = require("electron");
const { queryAssistant } = require("./query/orchestrator");
const { testReplyProviderConnection } = require("./query/reply-generator");
const { getCommandPreview } = require("./query/providers");

function createWindow() {
  const win = new BrowserWindow({
    width: 460,
    height: 860,
    minWidth: 420,
    minHeight: 760,
    title: "Customer Support Assistant",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("assistant:query", async (_event, payload) => {
  return queryAssistant(payload);
});

ipcMain.handle("assistant:get-default-command", (_event, agentType) => {
  return getCommandPreview(agentType);
});

ipcMain.handle("assistant:test-reply-connection", (_event, replySettings) => {
  return testReplyProviderConnection(replySettings);
});

ipcMain.handle("assistant:copy-text", (_event, text) => {
  clipboard.writeText(String(text || ""));
  return { success: true };
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
