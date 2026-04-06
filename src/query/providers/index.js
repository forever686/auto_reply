const openclawClient = require("./openclaw-client");
const feishuCliClient = require("./feishu-cli-client");

function getProvider(agentType) {
  if (String(agentType || "").trim() === "feishu") {
    return feishuCliClient;
  }

  return openclawClient;
}

function runProvider(payload) {
  const provider = getProvider(payload?.agentType);
  if (provider.runFeishuCli) {
    return provider.runFeishuCli(payload);
  }

  return provider.runOpenClaw(payload);
}

function getCommandPreview(agentType) {
  const provider = getProvider(agentType);
  return provider.getCommandPreview(agentType);
}

function getPromptPreview(payload) {
  const provider = getProvider(payload?.agentType);
  return provider.getPromptPreview(payload);
}

module.exports = {
  runProvider,
  getCommandPreview,
  getPromptPreview
};
