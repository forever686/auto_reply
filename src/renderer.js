const form = document.getElementById("query-form");
const submitButton = document.getElementById("submitButton");
const status = document.getElementById("status");
const resultPanel = document.getElementById("resultPanel");
const agentTypeInput = document.getElementById("agentType");
const agentCommandInput = document.getElementById("agentCommand");
const agentHint = document.getElementById("agentHint");
const commandPreviewElement = document.getElementById("commandPreview");
const requestPreviewElement = document.getElementById("requestPreview");
const promptPreviewElement = document.getElementById("promptPreview");
const rawOutputElement = document.getElementById("rawOutput");
const agentNameElement = document.getElementById("agentName");
const runStatusElement = document.getElementById("runStatus");
const copyReplyButton = document.getElementById("copyReplyButton");
const replyZhTextElement = document.getElementById("replyZhText");
const replyEnTextElement = document.getElementById("replyEnText");
const replyProviderInput = document.getElementById("replyProvider");
const tenantOnlyInput = document.getElementById("tenantOnly");
const replyModelInput = document.getElementById("replyModel");
const replyBaseUrlInput = document.getElementById("replyBaseUrl");
const replyApiKeyInput = document.getElementById("replyApiKey");
const replyApiKeyField = document.getElementById("replyApiKeyField");
const replyRulesPathInput = document.getElementById("replyRulesPath");
const testReplyConnectionButton = document.getElementById("testReplyConnectionButton");
const replyConnectionStatus = document.getElementById("replyConnectionStatus");
const openHelpButton = document.getElementById("openHelpButton");
const closeHelpButton = document.getElementById("closeHelpButton");
const helpPanel = document.getElementById("helpPanel");
const helpBackdrop = document.getElementById("helpBackdrop");
const openSettingsButton = document.getElementById("openSettingsButton");
const closeSettingsButton = document.getElementById("closeSettingsButton");
const settingsPanel = document.getElementById("settingsPanel");
const settingsBackdrop = document.getElementById("settingsBackdrop");
const progressSteps = document.getElementById("progressSteps");
const docLink = document.getElementById("docLink");
const docImagePanel = document.getElementById("docImagePanel");
const docImagePreview = document.getElementById("docImagePreview");

const REPLY_SETTINGS_STORAGE_KEY = "reply-settings";
const SEARCH_SETTINGS_STORAGE_KEY = "search-settings";

const agentHints = {
  feishu:
    "Search uses deterministic Feishu CLI mode. The app directly queries Feishu documents instead of relying on an agent to decide how to search."
};

let copyReplyResetTimer = null;

function loadReplySettings() {
  try {
    return JSON.parse(window.localStorage.getItem(REPLY_SETTINGS_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveReplySettings(replySettings) {
  window.localStorage.setItem(REPLY_SETTINGS_STORAGE_KEY, JSON.stringify(replySettings));
}

function loadSearchSettings() {
  try {
    return JSON.parse(window.localStorage.getItem(SEARCH_SETTINGS_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSearchSettings(searchSettings) {
  window.localStorage.setItem(SEARCH_SETTINGS_STORAGE_KEY, JSON.stringify(searchSettings));
}

function setStatus(kind, message) {
  status.className = `status ${kind}`;
  status.textContent = message;
}

function setInlineStatus(element, kind, message) {
  element.className = `inline-status ${kind}`;
  element.textContent = message;
}

function setProgressStep(step) {
  const order = ["prepare", "retrieve", "reply"];
  const currentIndex = order.indexOf(step);

  progressSteps.classList.toggle("hidden", !step || step === "idle");
  progressSteps.dataset.state = step || "idle";

  for (const item of progressSteps.querySelectorAll("[data-progress-step]")) {
    const itemStep = item.dataset.progressStep;
    const itemIndex = order.indexOf(itemStep);
    const isActive = itemStep === step;
    const isComplete = step === "complete" || (currentIndex > itemIndex && currentIndex !== -1);

    item.classList.toggle("active", isActive);
    item.classList.toggle("complete", isComplete);
    item.removeAttribute("aria-current");

    if (isActive) {
      item.setAttribute("aria-current", "step");
    }
  }
}

function setSettingsOpen(open) {
  settingsPanel.classList.toggle("hidden", !open);
  settingsBackdrop.classList.toggle("hidden", !open);
  settingsPanel.setAttribute("aria-hidden", open ? "false" : "true");

  if (open) {
    closeSettingsButton.focus();
  } else {
    openSettingsButton.focus();
  }
}

function setHelpOpen(open) {
  helpPanel.classList.toggle("hidden", !open);
  helpBackdrop.classList.toggle("hidden", !open);
  helpPanel.setAttribute("aria-hidden", open ? "false" : "true");

  if (open) {
    closeHelpButton.focus();
  } else {
    openHelpButton.focus();
  }
}

function setCopyReplyButtonState(state) {
  const labels = {
    idle: "⧉",
    success: "✓",
    error: "!"
  };

  copyReplyButton.textContent = labels[state] || labels.idle;
  copyReplyButton.dataset.state = state;
}

function syncCopyReplyButton(replyText) {
  const text = String(replyText || "").trim();
  copyReplyButton.disabled = !text || text === "-";
  if (copyReplyResetTimer) {
    clearTimeout(copyReplyResetTimer);
    copyReplyResetTimer = null;
  }
  setCopyReplyButtonState("idle");
}

function buildCopyReplyText(result) {
  const replyZh = String(result?.reply_zh || "").trim();
  const replyEn = String(result?.reply_en || "").trim();
  const sections = [];

  if (replyZh) {
    sections.push(`中文回复\n${replyZh}`);
  }

  if (replyEn) {
    sections.push(`English Reply\n${replyEn}`);
  }

  return sections.join("\n\n").trim();
}

function localizeAgentType(agentType) {
  const map = {
    feishu: "Feishu CLI"
  };

  return map[agentType] || agentType || "-";
}

function localizeProblemType(problemType) {
  const map = {
    missing_manual: "Missing manual",
    installation_help: "Installation / usage help",
    missing_parts: "Missing parts",
    delivery_delay: "Delivery delay",
    refund_request: "Refund / return",
    warranty_question: "Warranty question",
    specification_question: "Specification question",
    other: "Other"
  };

  return map[problemType] || problemType || "Unknown";
}

function isImageFileType(fileType) {
  return ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(
    String(fileType || "").trim().toLowerCase()
  );
}

async function openExternalUrl(url) {
  const target = String(url || "").trim();
  if (!target) {
    return;
  }

  try {
    await window.assistantApi.openExternal(target);
  } catch {
    setStatus("error", "Unable to open the link in the default browser.");
  }
}

function buildSourceListItem(source) {
  const li = document.createElement("li");

  if (typeof source === "string") {
    li.textContent = source;
    return li;
  }

  const sourceLink = document.createElement("a");
  sourceLink.className = "source-link";
  sourceLink.textContent = source.title || source.id || "source";

  const sourceType = document.createElement("span");
  sourceType.className = "source-type";
  sourceType.textContent = ` (${source.type || "unknown"})`;
  sourceLink.appendChild(sourceType);

  const sourceMeta = document.createElement("p");
  sourceMeta.className = "source-meta";
  sourceMeta.textContent = source.url || "-";

  if (source.url) {
    sourceLink.href = source.url;
    sourceLink.addEventListener("click", async (event) => {
      event.preventDefault();
      await openExternalUrl(source.url);
    });
  }

  li.appendChild(sourceLink);
  li.appendChild(sourceMeta);
  return li;
}

async function refreshCommandPreview() {
  try {
    const preview = await window.assistantApi.getDefaultCommand("feishu");
    commandPreviewElement.textContent = preview || "-";
  } catch {
    commandPreviewElement.textContent = "-";
  }
}

function syncAgentUi() {
  agentTypeInput.value = "feishu";
  agentCommandInput.value = "";
  agentHint.textContent = agentHints.feishu;
}

function syncReplyModelUi() {
  const provider = replyProviderInput.value;
  const saved = loadReplySettings();

  if (provider === "template") {
    replyBaseUrlInput.value = "";
    replyModelInput.value = "";
    replyApiKeyField.classList.add("hidden");
    replyApiKeyInput.value = "";
    setInlineStatus(
      replyConnectionStatus,
      "idle",
      "Template mode does not require connection testing."
    );
    return;
  }

  if (provider === "ollama") {
    replyBaseUrlInput.value = saved.ollamaBaseUrl || "http://127.0.0.1:11434";
    replyModelInput.value = saved.ollamaModel || "qwen2.5:7b";
    replyApiKeyField.classList.add("hidden");
    replyApiKeyInput.value = "";
    setInlineStatus(replyConnectionStatus, "idle", "You can test the Ollama connection before querying.");
    return;
  }

  replyBaseUrlInput.value = saved.openaiCompatibleBaseUrl || "https://api.openai.com/v1";
  replyModelInput.value = saved.openaiCompatibleModel || "gpt-4o-mini";
  replyApiKeyField.classList.remove("hidden");
  setInlineStatus(
    replyConnectionStatus,
    "idle",
    "You can test the model connection before querying."
  );
}

function getCurrentReplySettings() {
  return {
    provider: replyProviderInput.value,
    model: replyModelInput.value.trim(),
    baseUrl: replyBaseUrlInput.value.trim(),
    apiKey: replyApiKeyInput.value.trim(),
    rulesPath: replyRulesPathInput.value.trim()
  };
}

function validateReplySettings(replySettings) {
  if (replySettings.provider === "template") {
    return "";
  }

  if (!replySettings.model) {
    return "Please enter a model name in Settings before querying.";
  }

  if (!replySettings.baseUrl) {
    return "Please enter a Base URL in Settings before querying.";
  }

  if (replySettings.provider === "openai-compatible" && !replySettings.apiKey) {
    return "Please enter an API Key in Settings before querying.";
  }

  return "";
}

function renderResult(result) {
  resultPanel.classList.remove("hidden");

  document.getElementById("docTitle").textContent = result.doc_title || "-";
  docImagePanel.classList.add("hidden");
  docImagePreview.removeAttribute("src");

  if (result.doc_link) {
    docLink.textContent = result.doc_link;
    docLink.href = result.doc_link;
  } else {
    docLink.textContent = "-";
    docLink.removeAttribute("href");
  }

  if (result.doc_link && isImageFileType(result.doc_file_type)) {
    docImagePreview.src = result.doc_link;
    docImagePanel.classList.remove("hidden");
  }

  document.getElementById("problemType").textContent = localizeProblemType(result.problem_type);
  document.getElementById("productName").textContent = result.product || "-";
  replyZhTextElement.textContent = result.reply_zh || "-";
  replyEnTextElement.textContent = result.reply_en || "-";
  copyReplyButton.dataset.replyText = buildCopyReplyText(result);
  syncCopyReplyButton(copyReplyButton.dataset.replyText || "");
  document.getElementById("notes").textContent = result.notes || "-";
  agentNameElement.textContent = localizeAgentType(result.agent_type);
  runStatusElement.textContent = result.success ? "Completed" : "Failed / incomplete";
  commandPreviewElement.textContent = result.command_preview || "-";
  requestPreviewElement.textContent = result.request_preview || "-";
  promptPreviewElement.textContent = result.prompt_preview || "-";
  rawOutputElement.textContent = result.raw_output || result.notes || "-";

  const sourcesList = document.getElementById("sourcesList");
  sourcesList.innerHTML = "";
  const sources = Array.isArray(result.sources) ? result.sources : [];
  for (const source of sources) {
    sourcesList.appendChild(buildSourceListItem(source));
  }
}

syncAgentUi();
const savedReplySettings = loadReplySettings();
const savedSearchSettings = loadSearchSettings();
replyProviderInput.value = savedReplySettings.provider || "template";
tenantOnlyInput.checked = savedSearchSettings.tenantOnly !== false;
replyRulesPathInput.value = savedReplySettings.replyRulesPath || "";
syncReplyModelUi();
refreshCommandPreview();
syncCopyReplyButton("");
setProgressStep("idle");

if (window.assistantApi.onQueryProgress) {
  window.assistantApi.onQueryProgress((progress) => {
    const step = String(progress?.step || "");
    if (step) {
      setProgressStep(step);
    }
    if (progress?.message && step !== "complete") {
      setStatus("loading", progress.message);
    }
  });
}

replyProviderInput.addEventListener("change", () => {
  const saved = loadReplySettings();
  saved.provider = replyProviderInput.value;
  saveReplySettings(saved);
  syncReplyModelUi();
});

tenantOnlyInput.addEventListener("change", () => {
  const saved = loadSearchSettings();
  saved.tenantOnly = tenantOnlyInput.checked;
  saveSearchSettings(saved);
});

replyModelInput.addEventListener("input", () => {
  const saved = loadReplySettings();
  if (replyProviderInput.value === "ollama") {
    saved.ollamaModel = replyModelInput.value.trim();
  } else if (replyProviderInput.value === "openai-compatible") {
    saved.openaiCompatibleModel = replyModelInput.value.trim();
  }
  saveReplySettings(saved);
});

replyBaseUrlInput.addEventListener("input", () => {
  const saved = loadReplySettings();
  if (replyProviderInput.value === "ollama") {
    saved.ollamaBaseUrl = replyBaseUrlInput.value.trim();
  } else if (replyProviderInput.value === "openai-compatible") {
    saved.openaiCompatibleBaseUrl = replyBaseUrlInput.value.trim();
  }
  saveReplySettings(saved);
});

replyRulesPathInput.addEventListener("input", () => {
  const saved = loadReplySettings();
  saved.replyRulesPath = replyRulesPathInput.value.trim();
  saveReplySettings(saved);
});

openHelpButton.addEventListener("click", () => {
  setHelpOpen(true);
});

closeHelpButton.addEventListener("click", () => {
  setHelpOpen(false);
});

helpBackdrop.addEventListener("click", () => {
  setHelpOpen(false);
});

openSettingsButton.addEventListener("click", () => {
  setSettingsOpen(true);
});

closeSettingsButton.addEventListener("click", () => {
  setSettingsOpen(false);
});

settingsBackdrop.addEventListener("click", () => {
  setSettingsOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !helpPanel.classList.contains("hidden")) {
    setHelpOpen(false);
    return;
  }

  if (event.key === "Escape" && !settingsPanel.classList.contains("hidden")) {
    setSettingsOpen(false);
  }
});

docLink.addEventListener("click", async (event) => {
  const href = docLink.getAttribute("href");
  if (!href || href === "#") {
    return;
  }

  event.preventDefault();
  await openExternalUrl(href);
});

copyReplyButton.addEventListener("click", async () => {
  const replyText = replyTextElement.textContent || "";
  const copyText = copyReplyButton.dataset.replyText || "";
  if (!String(copyText).trim() || copyText === "-") {
    return;
  }

  copyReplyButton.disabled = true;
  try {
    await window.assistantApi.copyText(copyText);
    setCopyReplyButtonState("success");
  } catch {
    setCopyReplyButtonState("error");
  } finally {
    copyReplyResetTimer = setTimeout(() => {
      syncCopyReplyButton(copyText);
    }, 1200);
  }
});

testReplyConnectionButton.addEventListener("click", async () => {
  const replySettings = getCurrentReplySettings();
  testReplyConnectionButton.disabled = true;
  setInlineStatus(replyConnectionStatus, "loading", "Testing model connection...");

  try {
    const result = await window.assistantApi.testReplyConnection(replySettings);
    const kind = result.success ? "success" : "error";
    const details = [result.message, result.model ? `Model: ${result.model}` : "", result.endpoint]
      .filter(Boolean)
      .join(" | ");
    setInlineStatus(replyConnectionStatus, kind, details);
  } catch (error) {
    setInlineStatus(
      replyConnectionStatus,
      "error",
      error.message || "Connection test failed. Please check the model settings."
    );
  } finally {
    testReplyConnectionButton.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;

  const formData = new FormData(form);
  const customerMessage = String(formData.get("customerMessage") || "").trim();
  const productHint = String(formData.get("productHint") || "").trim();
  const agentType = "feishu";
  const agentCommand = "";
  const tenantOnly = tenantOnlyInput.checked;
  const currentReplySettings = getCurrentReplySettings();
  const settingsError = validateReplySettings(currentReplySettings);
  const replyProvider = currentReplySettings.provider;
  const replyModel = currentReplySettings.model;
  const replyBaseUrl = currentReplySettings.baseUrl;
  const replyRulesPath = currentReplySettings.rulesPath;

  if (settingsError) {
    submitButton.disabled = false;
    setStatus("error", settingsError);
    setSettingsOpen(true);
    return;
  }

  const existingReplySettings = loadReplySettings();
  saveReplySettings({
    ...existingReplySettings,
    provider: replyProvider,
    replyRulesPath,
    ollamaBaseUrl:
      replyProvider === "ollama" ? replyBaseUrl : existingReplySettings.ollamaBaseUrl || "",
    ollamaModel: replyProvider === "ollama" ? replyModel : existingReplySettings.ollamaModel || "",
    openaiCompatibleBaseUrl:
      replyProvider === "openai-compatible"
        ? replyBaseUrl
        : existingReplySettings.openaiCompatibleBaseUrl || "",
    openaiCompatibleModel:
      replyProvider === "openai-compatible"
        ? replyModel
        : existingReplySettings.openaiCompatibleModel || ""
  });

  resultPanel.classList.remove("hidden");
  setProgressStep("prepare");
  agentNameElement.textContent = localizeAgentType(agentType);
  runStatusElement.textContent = "Running";
  requestPreviewElement.textContent = JSON.stringify(
    {
      customerMessage,
      productHint,
      agentType,
      tenantOnly,
      replyProvider,
      replyModel,
      replyBaseUrl,
      replyRulesPath
    },
    null,
    2
  );
  promptPreviewElement.textContent = "Waiting for the generated prompt...";
  rawOutputElement.textContent = "Waiting for provider output...";
  await refreshCommandPreview();
  setProgressStep("retrieve");

  setStatus(
    "loading",
    "Step 2 of 3: retrieving Feishu documents and preparing the reply. Execution details are available below if you need to debug."
  );

  try {
    const result = await window.assistantApi.query({
      customerMessage,
      productHint,
      agentType,
      agentCommand,
      tenantOnly,
      replySettings: currentReplySettings
    });

    setProgressStep("reply");
    renderResult(result);
    setProgressStep("complete");
    const summary = result.doc_link
      ? "Query completed. Review the document link and suggested reply below."
      : "Query completed, but no matching document was found. Check the notes or expand execution details below.";
    setStatus(result.success === false ? "error" : "success", summary);
  } catch (error) {
    setProgressStep("failed");
    runStatusElement.textContent = "Failed";
    promptPreviewElement.textContent = "-";
    rawOutputElement.textContent = error.message || "Unknown error";
    setStatus("error", `Query failed: ${error.message || "Unknown error"}`);
    replyZhTextElement.textContent = "-";
    replyEnTextElement.textContent = "-";
    copyReplyButton.dataset.replyText = "";
    syncCopyReplyButton("");
  } finally {
    submitButton.disabled = false;
  }
});
