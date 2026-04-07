function detectProblemType(customerMessage) {
  const message = customerMessage.toLowerCase();

  if (/(manual|instruction|instructions|guide|pdf|说明书|手册|指南|使用说明)/.test(message)) {
    return "missing_manual";
  }

  if (/(install|setup|assemble|assembly|how to use|安装|装配|组装|怎么用|如何使用|使用方法)/.test(
    message
  )) {
    return "installation_help";
  }

  if (/(missing part|missing piece|part missing|accessory|缺件|少了|配件|零件)/.test(message)) {
    return "missing_parts";
  }

  if (/(late|delay|delayed|not arrived|where is my package|延迟|迟到|还没到|物流|包裹在哪)/.test(
    message
  )) {
    return "delivery_delay";
  }

  if (/(refund|return|money back|退款|退货|退回|退钱)/.test(message)) {
    return "refund_request";
  }

  if (/(warranty|guarantee|保修|质保)/.test(message)) {
    return "warranty_question";
  }

  if (/(capacity|volume|size|spec|specification|price|how much|容量|规格|参数|尺寸|大小|价格|多少钱|能装多少|装多少)/.test(
    message
  )) {
    return "specification_question";
  }

  return "other";
}

function extractProductModel(text) {
  const match = String(text || "").match(/\b([A-Z]{1,8}[-\s]?\d{2,}[A-Z0-9-]*)\b/i);
  return match ? match[1].replace(/\s+/g, "-").toUpperCase() : "";
}

function deriveProductName(customerMessage, productHint) {
  if (productHint) {
    return productHint;
  }

  const model = extractProductModel(customerMessage);
  if (model) {
    return model;
  }

  const firstSentence = customerMessage
    .split(/[\r\n.!?。！？]/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstSentence || "Unknown product";
}

function normalizeSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return [];
  }

  return sources.map((source, index) => {
    if (typeof source === "string") {
      return source;
    }

    return {
      ...source,
      id: source.id || `source_${index + 1}`,
      type: source.type || "knowledge",
      title: source.title || source.id || `Source ${index + 1}`
    };
  });
}

module.exports = {
  detectProblemType,
  deriveProductName,
  normalizeSources
};
