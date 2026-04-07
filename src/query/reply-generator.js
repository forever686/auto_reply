const fs = require("node:fs");
const { buildReplyTemplate } = require("./templates");

function readRulesFile(rulesPath) {
  const normalizedPath = String(rulesPath || "").trim();
  if (!normalizedPath) {
    return {
      path: "",
      content: "",
      error: ""
    };
  }

  try {
    return {
      path: normalizedPath,
      content: fs.readFileSync(normalizedPath, "utf8"),
      error: ""
    };
  } catch (error) {
    return {
      path: normalizedPath,
      content: "",
      error: `Unable to read reply rules file: ${error.message}`
    };
  }
}

function buildReplyPrompt(context) {
  const rulesBlock = context.rulesContent
    ? `Reply rules:\n${context.rulesContent}\n`
    : "Reply rules:\n(no extra rules file selected)\n";

  return [
    "You are a customer support reply assistant.",
    "Return strict JSON only with this shape: {\"answer\":\"...\",\"claims\":[{\"source_id\":\"...\",\"quote\":\"exact supporting text\"}]}",
    "Write one concise, helpful English reply for the customer in the answer field.",
    "Answer the current customer question directly before offering any extra help.",
    "Base the reply only on the provided retrieval context and reply rules.",
    "Treat the matched source excerpts as evidence and use them when they answer the question.",
    "Use the document link when it actually helps answer the current question.",
    "If the retrieved context does not answer the question, clearly say no relevant information was found in the retrieved materials.",
    "Do not invent policies, prices, product details, or troubleshooting steps not present in the provided context.",
    "If a detail is not supported by explicit evidence, do not guess. State that it could not be confirmed.",
    "If rules are provided, they have higher priority and must be followed.",
    "",
    rulesBlock,
    "Customer request:",
    context.customerMessage,
    "",
    `Product: ${context.product || "(unknown)"}`,
    `Problem type: ${context.problemType || "(unknown)"}`,
    `Matched document title: ${context.docTitle || "(none)"}`,
    `Matched document link: ${context.docLink || "(none)"}`,
    "Matched sources:",
    JSON.stringify(context.sources || [], null, 2)
  ].join("\n");
}

function buildKeywordPrompt(context) {
  return [
    "You are a search query optimizer for customer support knowledge retrieval.",
    "Your job is to transform the customer request into short search queries for a document search system.",
    "Return strict JSON only with this shape: {\"queries\":[\"query 1\",\"query 2\"]}.",
    "Return 1 to 3 concise search queries.",
    "Prefer product name, SKU, issue keyword, and business keyword.",
    "Do not return full sentences or explanations.",
    "Queries should be short and searchable.",
    "",
    `Customer request: ${context.customerMessage || "(empty)"}`,
    `Product hint: ${context.product || context.productHint || "(empty)"}`,
    `Detected problem type: ${context.problemType || "(empty)"}`,
    "",
    "Examples:",
    "{\"queries\":[\"ABC coffee maker manual\",\"ABC-1200 manual\"]}",
    "{\"queries\":[\"ABC coffee maker price\",\"ABC-1200 price\"]}"
  ].join("\n");
}

function buildFallbackReply(context) {
  return buildReplyTemplate({
    product: context.product,
    docLink: context.docLink,
    problemType: context.problemType
  });
}

function parseStructuredReply(text) {
  const rawText = String(text || "").trim();
  if (!rawText) {
    return {
      answer: "",
      claims: [],
      rawText
    };
  }

  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const parseTarget = fencedMatch ? fencedMatch[1].trim() : rawText;

  try {
    const parsed = JSON.parse(parseTarget);
    return {
      answer: String(parsed?.answer || "").trim(),
      claims: Array.isArray(parsed?.claims) ? parsed.claims : [],
      rawText
    };
  } catch {
    return {
      answer: rawText,
      claims: [],
      rawText
    };
  }
}

function sourceEvidenceText(sources) {
  return (Array.isArray(sources) ? sources : [])
    .map((source) => {
      if (typeof source === "string") {
        return source;
      }

      return [source.title, source.excerpt, source.url].filter(Boolean).join("\n");
    })
    .join("\n")
    .toLowerCase();
}

function hasUnsupportedClaims(claims, sources) {
  if (!Array.isArray(claims) || claims.length === 0) {
    return false;
  }

  const evidenceText = sourceEvidenceText(sources);
  if (!evidenceText) {
    return true;
  }

  return claims.some((claim) => {
    const quote = String(claim?.quote || "").trim().toLowerCase();
    return quote && !evidenceText.includes(quote);
  });
}

function buildUnsupportedReply(context) {
  const productText = context.product ? ` for ${context.product}` : "";
  const linkText = context.docLink ? ` The closest document I found is: ${context.docLink}` : "";

  return [
    `Hello, thank you for your message. I could not confirm the requested details${productText} from the retrieved support materials.`,
    linkText,
    "Please share any additional product label, SKU, or order details so we can check again."
  ]
    .filter(Boolean)
    .join(" ");
}

async function callOllama(settings, prompt) {
  const baseUrl = String(settings?.baseUrl || "").trim() || "http://127.0.0.1:11434";
  const model = String(settings?.model || "").trim() || "qwen2.5:7b";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with status ${response.status}.`);
  }

  const data = await response.json();
  return {
    text: data?.message?.content || "",
    raw: data,
    provider: "ollama",
    model,
    endpoint: `${baseUrl.replace(/\/$/, "")}/api/chat`
  };
}

async function callOpenAiCompatible(settings, prompt) {
  const baseUrl = String(settings?.baseUrl || "").trim() || "https://api.openai.com/v1";
  const model = String(settings?.model || "").trim() || "gpt-4o-mini";
  const apiKey = String(settings?.apiKey || "").trim();

  if (!apiKey) {
    throw new Error("API key is required for OpenAI-compatible mode.");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI-compatible request failed with status ${response.status}.`);
  }

  const data = await response.json();
  return {
    text: data?.choices?.[0]?.message?.content || "",
    raw: data,
    provider: "openai-compatible",
    model,
    endpoint: `${baseUrl.replace(/\/$/, "")}/chat/completions`
  };
}

async function runModelPrompt(settings, prompt) {
  const provider = String(settings?.provider || "template").trim() || "template";
  if (provider === "template") {
    throw new Error("Template mode does not support live model prompting.");
  }

  return provider === "ollama"
    ? callOllama(settings, prompt)
    : callOpenAiCompatible(settings, prompt);
}

async function testReplyProviderConnection(settings) {
  const provider = String(settings?.provider || "template").trim() || "template";

  if (provider === "template") {
    return {
      success: true,
      provider,
      model: "",
      endpoint: "",
      message: "Template mode does not require connection testing."
    };
  }

  const model = String(settings?.model || "").trim();
  const prompt = [
    "Connection test.",
    "Reply with the single word OK."
  ].join("\n");

  try {
    const response = await runModelPrompt(settings, prompt);
    const replyText = String(response.text || "").trim();

    return {
      success: true,
      provider: response.provider,
      model: response.model || model,
      endpoint: response.endpoint || "",
      message: replyText
        ? `Connection succeeded. Model replied: ${replyText}`
        : "Connection succeeded."
    };
  } catch (error) {
    return {
      success: false,
      provider,
      model,
      endpoint:
        provider === "ollama"
          ? `${String(settings?.baseUrl || "http://127.0.0.1:11434").replace(/\/$/, "")}/api/chat`
          : `${String(settings?.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`,
      message: error.message || "Connection test failed."
    };
  }
}

function normalizeExtractedQueries(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 3);
}

async function extractSearchQueries(context) {
  const provider = String(context?.replySettings?.provider || "template").trim() || "template";
  const prompt = buildKeywordPrompt(context);

  if (provider === "template") {
    return {
      queries: [],
      provider: "template",
      model: "",
      promptPreview: prompt,
      notes: "Template mode skips AI keyword extraction.",
      rawOutput: ""
    };
  }

  try {
    const response = await runModelPrompt(context.replySettings, prompt);
    const text = String(response.text || "").trim();
    const parsed = JSON.parse(text);
    const queries = normalizeExtractedQueries(parsed?.queries);

    if (queries.length === 0) {
      throw new Error("Model returned no usable queries.");
    }

    return {
      queries,
      provider: response.provider,
      model: response.model,
      promptPreview: prompt,
      notes: `AI keyword extraction succeeded via ${response.provider}.`,
      rawOutput: JSON.stringify(response.raw, null, 2),
      endpoint: response.endpoint
    };
  } catch (error) {
    return {
      queries: [],
      provider,
      model: String(context?.replySettings?.model || "").trim(),
      promptPreview: prompt,
      notes: `AI keyword extraction failed, fallback queries used: ${error.message}`,
      rawOutput: ""
    };
  }
}

async function generateReply(context) {
  const rules = readRulesFile(context?.replySettings?.rulesPath);
  const prompt = buildReplyPrompt({
    customerMessage: context.customerMessage,
    product: context.product,
    problemType: context.problemType,
    docTitle: context.docTitle,
    docLink: context.docLink,
    sources: context.sources,
    rulesContent: rules.content
  });
  const provider = String(context?.replySettings?.provider || "template").trim() || "template";
  const fallbackReply = buildFallbackReply(context);

  if (provider === "template") {
    return {
      success: true,
      reply: fallbackReply,
      provider: "template",
      model: "",
      promptPreview: prompt,
      rulesFile: rules.path,
      notes: rules.error || "Reply generated from local template.",
      rawOutput: ""
    };
  }

  try {
    const response = await runModelPrompt(context.replySettings, prompt);
    const structuredReply = parseStructuredReply(response.text || "");
    const reply = hasUnsupportedClaims(structuredReply.claims, context.sources)
      ? buildUnsupportedReply(context)
      : structuredReply.answer || fallbackReply;

    return {
      success: true,
      reply,
      provider: response.provider,
      model: response.model,
      promptPreview: prompt,
      rulesFile: rules.path,
      notes: rules.error || `Reply generated via ${response.provider}.`,
      rawOutput: JSON.stringify(response.raw, null, 2),
      endpoint: response.endpoint
    };
  } catch (error) {
    return {
      success: false,
      reply: "",
      provider,
      model: String(context?.replySettings?.model || "").trim(),
      promptPreview: prompt,
      rulesFile: rules.path,
      notes: [rules.error, `Model generation failed: ${error.message}`]
        .filter(Boolean)
        .join(" "),
      rawOutput: ""
    };
  }
}

module.exports = {
  extractSearchQueries,
  generateReply,
  testReplyProviderConnection
};
