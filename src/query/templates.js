function buildReplyTemplate({ product, docLink, problemType }) {
  if (problemType === "missing_manual") {
    return [
      "Hello, thank you for reaching out.",
      `Here is the manual for ${product || "your product"}: ${docLink || "[manual link pending]"}.`,
      "Please let us know if you would also like step-by-step setup help."
    ].join(" ");
  }

  if (problemType === "installation_help") {
    return [
      "Hello, thank you for contacting us.",
      `We found the setup guide for ${product || "your product"}: ${docLink || "[guide link pending]"}.`,
      "Please review the instructions and tell us which step is blocking you if you still need help."
    ].join(" ");
  }

  return [
    "Hello, thank you for your message.",
    `We found a relevant support document for ${product || "your product"}: ${docLink || "[document link pending]"}.`,
    "Please review it and let us know if you need any additional assistance."
  ].join(" ");
}

module.exports = {
  buildReplyTemplate
};
