function detectProblemType(customerMessage) {
  const message = customerMessage.toLowerCase();

  if (/(manual|instruction|instructions|guide|pdf)/.test(message)) {
    return "missing_manual";
  }

  if (/(install|setup|assemble|assembly|how to use)/.test(message)) {
    return "installation_help";
  }

  if (/(missing part|missing piece|part missing|accessory)/.test(message)) {
    return "missing_parts";
  }

  if (/(late|delay|delayed|not arrived|where is my package)/.test(message)) {
    return "delivery_delay";
  }

  if (/(refund|return|money back)/.test(message)) {
    return "refund_request";
  }

  if (/(warranty|guarantee)/.test(message)) {
    return "warranty_question";
  }

  return "other";
}

function deriveProductName(customerMessage, productHint) {
  if (productHint) {
    return productHint;
  }

  const firstSentence = customerMessage
    .split(/[\r\n.!?]/)
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
