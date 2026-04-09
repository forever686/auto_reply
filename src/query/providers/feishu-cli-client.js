const { spawn } = require("node:child_process");
const path = require("node:path");

function extractSku(text) {
  const match = String(text || "").match(/\bSKU[:\s-]*([A-Z0-9-]+)\b/i);
  return match ? match[1].toUpperCase() : "";
}

function uniqueQueries(queries) {
  return Array.from(
    new Set(
      queries
        .map((query) => String(query || "").trim())
        .filter(Boolean)
    )
  );
}

function buildSearchQueries(payload) {
  const aiQueries = Array.isArray(payload?.aiQueries) ? payload.aiQueries : [];
  const productHint = String(payload?.productHint || "").trim();
  const product = String(payload?.product || "").trim();
  const problemType = String(payload?.problemType || "").trim();
  const sku = extractSku(productHint || product);
  const baseProduct = productHint || product;
  const queries = [];

  for (const query of aiQueries) {
    queries.push(query);
  }

  if (baseProduct && problemType === "missing_manual") {
    queries.push(`${baseProduct} manual`);
    queries.push(`${baseProduct} guide`);
  }

  if (baseProduct && problemType === "missing_parts") {
    queries.push(`${baseProduct} missing parts`);
    queries.push(`${baseProduct} accessory`);
  }

  if (baseProduct && problemType === "refund_request") {
    queries.push(`${baseProduct} refund return`);
    queries.push(`${baseProduct} return policy`);
  }

  if (baseProduct && problemType === "specification_question") {
    queries.push(`${baseProduct} 容量`);
    queries.push(`${baseProduct} 规格 参数`);
    queries.push(`${baseProduct} capacity specification`);
  }

  if (baseProduct) {
    queries.push(baseProduct);
  }

  if (sku) {
    queries.push(sku);
    if (problemType === "missing_manual") {
      queries.push(`${sku} manual`);
    }
  }

  return uniqueQueries(queries);
}

function resolveLarkCliCommand() {
  const configured = String(process.env.LARK_CLI_COMMAND || "").trim();
  if (configured) {
    return configured;
  }

  if (process.platform === "win32") {
    return "lark-cli.cmd";
  }

  return "lark-cli";
}

function buildCommandPreview(query) {
  const larkCliCommand = resolveLarkCliCommand();
  return `${larkCliCommand} docs +search --as user --query "${query}" --format json`;
}

function buildFetchCommandPreview(doc) {
  const larkCliCommand = resolveLarkCliCommand();
  return `${larkCliCommand} docs +fetch --as user --doc "${doc}" --format json`;
}

function escapePowershellSingleQuoted(value) {
  return String(value || "").replace(/'/g, "''");
}

function getCommandPreview(agentType) {
  if (String(agentType || "").trim() !== "feishu") {
    return "";
  }

  return buildCommandPreview("<query>");
}

function getPromptPreview(payload) {
  const queries = buildSearchQueries(payload);
  return [
    "Deterministic Feishu CLI retrieval mode.",
    "The app will query Lark documents directly instead of asking an agent to decide how to search.",
    payload?.aiQueries?.length
      ? "Search queries were prefixed with AI-extracted query suggestions."
      : "Search queries were generated from rule-based heuristics.",
    "",
    "Search queries:",
    ...queries.map((query, index) => `${index + 1}. ${query}`)
  ].join("\n");
}

function runLarkSearch(query, cwd) {
  const larkCliCommand = resolveLarkCliCommand();

  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn(
            "powershell.exe",
            [
              "-NoProfile",
              "-Command",
              `& '${escapePowershellSingleQuoted(larkCliCommand)}' docs +search --as user --query '${escapePowershellSingleQuoted(query)}' --format json`
            ],
            {
              stdio: ["ignore", "pipe", "pipe"],
              windowsHide: true,
              cwd,
              env: process.env
            }
          )
        : spawn(
            larkCliCommand,
            ["docs", "+search", "--as", "user", "--query", query, "--format", "json"],
            {
              stdio: ["ignore", "pipe", "pipe"],
              windowsHide: true,
              cwd,
              env: process.env
            }
          );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error([stderr.trim(), stdout.trim()].filter(Boolean).join("\n\n") || `lark-cli exited with code ${code}.`)
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`lark-cli returned invalid JSON. ${error.message}`));
      }
    });
  });
}

function runLarkFetch(doc, cwd) {
  const larkCliCommand = resolveLarkCliCommand();

  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn(
            "powershell.exe",
            [
              "-NoProfile",
              "-Command",
              `& '${escapePowershellSingleQuoted(larkCliCommand)}' docs +fetch --as user --doc '${escapePowershellSingleQuoted(doc)}' --format json`
            ],
            {
              stdio: ["ignore", "pipe", "pipe"],
              windowsHide: true,
              cwd,
              env: process.env
            }
          )
        : spawn(
            larkCliCommand,
            ["docs", "+fetch", "--as", "user", "--doc", doc, "--format", "json"],
            {
              stdio: ["ignore", "pipe", "pipe"],
              windowsHide: true,
              cwd,
              env: process.env
            }
          );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error([stderr.trim(), stdout.trim()].filter(Boolean).join("\n\n") || `lark-cli exited with code ${code}.`)
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`lark-cli returned invalid JSON. ${error.message}`));
      }
    });
  });
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function extractFetchedMarkdown(response) {
  return String(
    response?.data?.markdown ||
      response?.markdown ||
      response?.data?.content ||
      response?.content ||
      response?.data?.text ||
      ""
  ).trim();
}

function mergeExcerpt(summary, markdown) {
  const parts = [summary, markdown]
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  return parts.join("\n\n").slice(0, 6000);
}

async function enrichSourcesWithFetchedContent(sources, cwd, rawOutputs) {
  const enrichedSources = [];

  for (const source of sources) {
    const fetchTarget = String(source.fetchTarget || source.id || source.url || "").trim();
    if (!fetchTarget) {
      enrichedSources.push(source);
      continue;
    }

    try {
      const response = await runLarkFetch(fetchTarget, cwd);
      rawOutputs.push(JSON.stringify({ fetch: fetchTarget, response }, null, 2));
      const markdown = extractFetchedMarkdown(response);
      enrichedSources.push({
        ...source,
        excerpt: mergeExcerpt(source.excerpt, markdown)
      });
    } catch (error) {
      rawOutputs.push(
        JSON.stringify(
          {
            fetch: fetchTarget,
            error: error.message || "Unable to fetch document content."
          },
          null,
          2
        )
      );
      enrichedSources.push(source);
    }
  }

  return enrichedSources;
}

function stripHighlightTags(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function filterSearchResultsForTenant(results, tenantOnly) {
  if (tenantOnly === false) {
    return Array.isArray(results) ? results : [];
  }

  return (Array.isArray(results) ? results : []).filter(
    (result) => result?.result_meta?.is_cross_tenant !== true
  );
}

function scoreResult(result, payload, query) {
  const title = String(result?.title_highlighted || "").replace(/<[^>]+>/g, " ").toLowerCase();
  const summary = String(result?.summary_highlighted || "").replace(/<[^>]+>/g, " ").toLowerCase();
  const haystack = `${title} ${summary}`;
  const sku = extractSku(payload?.productHint || payload?.product);
  const productTokens = tokenize(payload?.productHint || payload?.product);
  const problemType = String(payload?.problemType || "").trim();
  const customerMessage = String(payload?.customerMessage || "").toLowerCase();
  const asksForPrice = /(价格|价钱|报价|单价|price|pricing|quote)/i.test(customerMessage);
  let score = 0;

  if (sku && haystack.includes(sku.toLowerCase())) {
    score += 40;
  }

  for (const token of productTokens) {
    if (haystack.includes(token)) {
      score += 8;
    }
  }

  if (problemType === "missing_manual" && /(manual|guide|instruction|faq)/.test(haystack)) {
    score += 25;
  }
  if (problemType === "missing_manual" && /manual/.test(title)) {
    score += 25;
  }
  if (problemType === "missing_manual" && /faq/.test(title)) {
    score -= 10;
  }

  if (problemType === "missing_parts" && /(missing|part|accessory)/.test(haystack)) {
    score += 25;
  }

  if (problemType === "refund_request" && /(refund|return)/.test(haystack)) {
    score += 25;
  }

  if (problemType === "specification_question" && /(容量|规格|参数|price|capacity|specification|型号|sku)/i.test(haystack)) {
    score += 25;
  }

  if (
    problemType === "specification_question" &&
    /(价格|价钱|报价|明细|spec|specification|capacity|parameter|参数|规格|容量|型号|sku|price)/i.test(haystack)
  ) {
    score += 25;
  }

  if (asksForPrice && /(价格|价钱|报价|明细|price|pricing|quote)/i.test(haystack)) {
    score += 35;
  }

  if (haystack.includes(String(query || "").toLowerCase())) {
    score += 10;
  }

  return score;
}

function normalizeSearchResults(results, payload, query) {
  return (Array.isArray(results) ? results : [])
    .map((result) => ({
      ...result,
      _score: scoreResult(result, payload, query)
    }))
    .sort((left, right) => right._score - left._score);
}

async function runFeishuCli(payload) {
  const queries = buildSearchQueries(payload);
  const tenantOnly = payload?.tenantOnly !== false;
  const promptPreview = getPromptPreview(payload);
  const rawOutputs = [];
  const aggregatedResults = [];

  if (queries.length === 0) {
    return {
      success: false,
      provider: "feishu",
      doc_title: "",
      doc_link: "",
      reply_en: "",
      confidence: 0,
      sources: [],
      command_preview: buildCommandPreview("<query>"),
      prompt_preview: promptPreview,
      raw_output: "",
      notes: "No Feishu search query could be derived from the current request."
    };
  }

  for (const query of queries) {
    try {
      const response = await runLarkSearch(query, path.resolve(process.cwd()));
      rawOutputs.push(JSON.stringify({ query, response }, null, 2));

      if (response?.ok === false) {
        const message = response?.error?.message || "Feishu CLI search failed.";
        return {
          success: false,
          provider: "feishu",
          doc_title: "",
          doc_link: "",
          reply_en: "",
          confidence: 0,
          sources: [],
          command_preview: buildCommandPreview(query),
          prompt_preview: promptPreview,
          raw_output: rawOutputs.join("\n\n"),
          notes: `Feishu CLI search failed for query "${query}": ${message}`
        };
      }

      const tenantScopedResults = filterSearchResultsForTenant(response?.data?.results, tenantOnly);
      const rankedResults = normalizeSearchResults(tenantScopedResults, payload, query);
      for (const result of rankedResults) {
        aggregatedResults.push({ query, result });
      }

      if (rankedResults.length > 0 && rankedResults[0]._score >= 25) {
        break;
      }
    } catch (error) {
      return {
        success: false,
        provider: "feishu",
        doc_title: "",
        doc_link: "",
        reply_en: "",
        confidence: 0,
        sources: [],
        command_preview: buildCommandPreview(query),
        prompt_preview: promptPreview,
        raw_output: rawOutputs.join("\n\n"),
        notes: `Unable to execute Feishu CLI search for query "${query}": ${error.message}`
      };
    }
  }

  if (aggregatedResults.length === 0) {
    return {
      success: false,
      provider: "feishu",
      doc_title: "",
      doc_link: "",
      reply_en: "",
      confidence: 0,
      sources: [],
      command_preview: buildCommandPreview(queries[0]),
      prompt_preview: promptPreview,
      raw_output: rawOutputs.join("\n\n"),
      notes: tenantOnly
        ? `No Feishu documents from the current tenant matched the derived queries: ${queries.join(" | ")}`
        : `No Feishu documents matched the derived queries: ${queries.join(" | ")}`
    };
  }

  aggregatedResults.sort((left, right) => right.result._score - left.result._score);
  const best = aggregatedResults[0];
  const cwd = path.resolve(process.cwd());
  const topSources = aggregatedResults.slice(0, 3).map(({ result }) => ({
    id: result?.result_meta?.token || result?.title_highlighted || "feishu_result",
    type: "feishu",
    title: stripHighlightTags(result?.title_highlighted || "Feishu document"),
    excerpt: stripHighlightTags(result?.summary_highlighted || ""),
    url: result?.result_meta?.url || "",
    fetchTarget: result?.result_meta?.token || result?.result_meta?.url || ""
  }));
  const enrichedSources = await enrichSourcesWithFetchedContent(topSources, cwd, rawOutputs);

  return {
    success: true,
    provider: "feishu",
    product: payload?.product || payload?.productHint || "",
    problem_type: payload?.problemType || "other",
    doc_title: stripHighlightTags(best.result?.title_highlighted || "Feishu document"),
    doc_link: best.result?.result_meta?.url || "",
    doc_file_type: String(best.result?.result_meta?.file_type || "").trim().toLowerCase(),
    reply_en: "",
    confidence: Math.min(0.95, 0.45 + best.result._score / 100),
    sources: enrichedSources,
    command_preview: buildCommandPreview(best.query),
    prompt_preview: promptPreview,
    raw_output: rawOutputs.join("\n\n"),
    notes: `Matched via Feishu CLI search using query "${best.query}". Tenant-only filter: ${tenantOnly ? "on" : "off"}. Fetched document content for top sources.`,
    extracted_queries: queries
  };
}

module.exports = {
  runFeishuCli,
  getCommandPreview,
  getPromptPreview,
  buildFetchCommandPreview,
  filterSearchResultsForTenant
};
