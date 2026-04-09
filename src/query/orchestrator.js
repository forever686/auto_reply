const { detectProblemType, deriveProductName, normalizeSources } = require("./parsing");
const { runProvider } = require("./providers");
const { extractSearchQueries, generateReply } = require("./reply-generator");

async function queryAssistant(payload, onProgress = () => {}) {
  const customerMessage = String(payload?.customerMessage || "").trim();
  const productHint = String(payload?.productHint || "").trim();
  const agentType = String(payload?.agentType || "").trim();
  const agentCommand = String(payload?.agentCommand || "").trim();
  const replySettings = payload?.replySettings || {};

  if (!customerMessage) {
    return {
      success: false,
      notes: "Customer message is required.",
      confidence: 0
    };
  }

  const product = deriveProductName(customerMessage, productHint);
  const problemType = detectProblemType(customerMessage);
  onProgress({
    step: "prepare",
    message: "Step 1 of 3: preparing the request and search keywords."
  });
  const keywordResponse = await extractSearchQueries({
    customerMessage,
    productHint,
    product,
    problemType,
    replySettings
  });

  onProgress({
    step: "retrieve",
    message: "Step 2 of 3: retrieving matching Feishu documents."
  });
  const providerResponse = await runProvider({
    customerMessage,
    productHint,
    agentType,
    agentCommand,
    product,
    problemType,
    replySettings,
    aiQueries: keywordResponse.queries
  });

  onProgress({
    step: "reply",
    message: "Step 3 of 3: generating a customer-ready reply from the retrieved context."
  });
  const replyResponse = await generateReply({
    customerMessage,
    product,
    problemType,
    docTitle: providerResponse.doc_title || "",
    docLink: providerResponse.doc_link || "",
    sources: normalizeSources(providerResponse.sources),
    replySettings
  });
  onProgress({
    step: "complete",
    message: "Query completed. Review the suggested reply and document match."
  });

  return {
    success: providerResponse.success !== false && replyResponse.success !== false,
    agent_type: agentType || providerResponse.provider || "",
    product,
    problem_type: problemType,
    doc_title:
      providerResponse.doc_title ||
      (providerResponse.success === false ? "" : `${product || "Matched"} document`),
    doc_link: providerResponse.doc_link || "",
    reply_zh: providerResponse.success === false || replyResponse.success === false ? "" : replyResponse.replyZh || "",
    reply_en: providerResponse.success === false || replyResponse.success === false ? "" : replyResponse.replyEn || "",
    confidence:
      typeof providerResponse.confidence === "number"
        ? providerResponse.confidence
        : providerResponse.doc_link
          ? 0.82
          : 0.48,
    sources: normalizeSources(providerResponse.sources),
    notes:
      [
        keywordResponse.notes,
        keywordResponse.queries.length
          ? `AI queries: ${keywordResponse.queries.join(" | ")}`
          : "AI queries unavailable, rule-based queries used.",
        providerResponse.notes,
        replyResponse.notes,
        replyResponse.rulesFile ? `Rules file: ${replyResponse.rulesFile}` : ""
      ]
        .filter(Boolean)
        .join("\n"),
    raw_output: [keywordResponse.rawOutput, providerResponse.raw_output, replyResponse.rawOutput]
      .filter(Boolean)
      .join("\n\n"),
    command_preview: providerResponse.command_preview || "",
    prompt_preview: [keywordResponse.promptPreview, providerResponse.prompt_preview, replyResponse.promptPreview]
      .filter(Boolean)
      .join("\n\n----- Next Stage -----\n\n"),
    request_preview: JSON.stringify(
      {
        customerMessage,
        productHint,
        product,
        problemType,
        agentType,
        replyProvider: replySettings.provider || "template",
        replyModel: replySettings.model || "",
        replyBaseUrl: replySettings.baseUrl || "",
        replyRulesPath: replySettings.rulesPath || "",
        aiQueries: keywordResponse.queries
      },
      null,
      2
    )
  };
}

module.exports = {
  queryAssistant
};
