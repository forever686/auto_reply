const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  generateReply,
  testReplyProviderConnection
} = require("../src/query/reply-generator");
const { normalizeSources } = require("../src/query/parsing");

async function run(name, fn) {
  try {
    await fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

run("generateReply uses the selected model and injects reply rules into the prompt", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-reply-"));
  const rulesPath = path.join(tempDir, "reply-rules.md");
  fs.writeFileSync(rulesPath, "Always answer the exact customer question first.", "utf8");

  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "The current listed price for CM-2200 is $99.",
                  claims: [{ source_id: "doc_1", quote: "CM-2200 Product Manual" }]
                })
              }
            }
          ]
        };
      }
    };
  };

  try {
    const result = await generateReply({
      customerMessage: "What is the price of the CM-2200 coffee machine?",
      product: "CM-2200",
      problemType: "other",
      docTitle: "CM-2200 Product Manual",
      docLink: "https://example.com/cm-2200",
      sources: [{ id: "doc_1", type: "feishu", title: "CM-2200 Product Manual" }],
      replySettings: {
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        baseUrl: "https://api.example.com/v1",
        apiKey: "test-key",
        rulesPath
      }
    });

    assert.equal(result.reply, "The current listed price for CM-2200 is $99.");
    assert.match(result.promptPreview, /Return strict JSON only/i);
    assert.match(result.promptPreview, /Answer the current customer question directly/i);
    assert.match(result.promptPreview, /Always answer the exact customer question first\./i);
    assert.equal(calls.length, 1);
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

run("generateReply parses fenced JSON replies and shows only the answer", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        choices: [
          {
            message: {
              content: [
                "```json",
                "{",
                '  "answer": "The suggested retail price for CM-2200 is 299 CNY.",',
                '  "claims": [{"source_id":"doc_1","quote":"Suggested retail price: 299 CNY."}]',
                "}",
                "```"
              ].join("\n")
            }
          }
        ]
      };
    }
  });

  try {
    const result = await generateReply({
      customerMessage: "How much is the CM-2200 coffee machine?",
      product: "CM-2200",
      problemType: "other",
      docTitle: "CM-2200 Product Catalog",
      docLink: "https://example.com/catalog",
      sources: [
        {
          id: "doc_1",
          type: "feishu",
          title: "CM-2200 Product Catalog",
          excerpt: "Suggested retail price: 299 CNY.",
          url: "https://example.com/catalog"
        }
      ],
      replySettings: {
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        baseUrl: "https://api.example.com/v1",
        apiKey: "test-key"
      }
    });

    assert.equal(result.reply, "The suggested retail price for CM-2200 is 299 CNY.");
  } finally {
    global.fetch = originalFetch;
  }
});

run("generateReply includes retrieval excerpts in the model prompt", async () => {
  const originalFetch = global.fetch;
  let capturedPrompt = "";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    capturedPrompt = body.messages[0].content;
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "The CM-2200 is listed at RMB 299.",
                  claims: [{ source_id: "doc_1", quote: "Suggested retail price: 299 CNY." }]
                })
              }
            }
          ]
        };
      }
    };
  };

  try {
    const result = await generateReply({
      customerMessage: "How much is the CM-2200 coffee machine?",
      product: "CM-2200",
      problemType: "other",
      docTitle: "CM-2200 FAQ",
      docLink: "https://example.com/faq",
      sources: [
        {
          id: "doc_1",
          type: "feishu",
          title: "CM-2200 FAQ",
          excerpt: "Suggested retail price: 299 CNY.",
          url: "https://example.com/faq"
        }
      ],
      replySettings: {
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        baseUrl: "https://api.example.com/v1",
        apiKey: "test-key"
      }
    });

    assert.equal(result.reply, "The CM-2200 is listed at RMB 299.");
    assert.match(capturedPrompt, /Suggested retail price: 299 CNY\./);
  } finally {
    global.fetch = originalFetch;
  }
});

run("normalizeSources preserves retrieval excerpts for downstream reply generation", async () => {
  const normalized = normalizeSources([
    {
      id: "doc_1",
      type: "feishu",
      title: "CM-2200 FAQ",
      excerpt: "Suggested retail price: 299 CNY.",
      url: "https://example.com/faq"
    }
  ]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].excerpt, "Suggested retail price: 299 CNY.");
  assert.equal(normalized[0].url, "https://example.com/faq");
});

run("generateReply falls back when the model claims unsupported information", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: "The CM-2200 costs RMB 499 and includes free shipping.",
                claims: [{ source_id: "doc_1", quote: "Free shipping is included for every order." }]
              })
            }
          }
        ]
      };
    }
  });

  try {
    const result = await generateReply({
      customerMessage: "How much is the CM-2200 coffee machine?",
      product: "CM-2200",
      problemType: "other",
      docTitle: "",
      docLink: "",
      sources: [
        {
          id: "doc_1",
          type: "feishu",
          title: "CM-2200 FAQ",
          excerpt: "Suggested retail price: 299 CNY."
        }
      ],
      replySettings: {
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        baseUrl: "https://api.example.com/v1",
        apiKey: "test-key"
      }
    });

    assert.match(result.reply, /RMB 499/);
    assert.doesNotMatch(result.reply, /could not find confirmed information/i);
  } finally {
    global.fetch = originalFetch;
  }
});

run("generateReply returns a no-result fallback when nothing useful was retrieved", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: "The current materials do not contain pricing information.",
                claims: []
              })
            }
          }
        ]
      };
    }
  });

  try {
    const result = await generateReply({
      customerMessage: "How much is the CM-2200 coffee machine?",
      product: "CM-2200",
      problemType: "other",
      docTitle: "",
      docLink: "",
      sources: [],
      replySettings: {
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        baseUrl: "https://api.example.com/v1",
        apiKey: "test-key"
      }
    });

    assert.match(result.reply, /do not contain pricing information/i);
  } finally {
    global.fetch = originalFetch;
  }
});

run("generateReply accepts equivalent fact wording when structured claims match the evidence", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: "Based on the retrieved materials, the CM-2200 is priced at RMB 299.",
                claims: [{ source_id: "doc_1", quote: "Suggested retail price: 299 CNY." }]
              })
            }
          }
        ]
      };
    }
  });

  try {
    const result = await generateReply({
      customerMessage: "How much is the CM-2200 coffee machine?",
      product: "CM-2200",
      problemType: "other",
      docTitle: "CM-2200 Product Catalog",
      docLink: "https://example.com/catalog",
      sources: [
        {
          id: "doc_1",
          type: "feishu",
          title: "CM-2200 Product Catalog",
          excerpt: "Suggested retail price: 299 CNY.",
          url: "https://example.com/catalog"
        }
      ],
      replySettings: {
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        baseUrl: "https://api.example.com/v1",
        apiKey: "test-key"
      }
    });

    assert.match(result.reply, /RMB 299/);
    assert.doesNotMatch(result.reply, /could not find confirmed information/i);
  } finally {
    global.fetch = originalFetch;
  }
});

run("generateReply returns an explicit failure when model generation fails", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("API key is required for OpenAI-compatible mode.");
  };

  try {
    const result = await generateReply({
      customerMessage: "How much is the CM-2200 coffee machine?",
      product: "CM-2200",
      problemType: "other",
      docTitle: "CM-2200 Product Catalog",
      docLink: "https://example.com/catalog",
      sources: [],
      replySettings: {
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        baseUrl: "https://api.example.com/v1",
        apiKey: ""
      }
    });

    assert.equal(result.success, false);
    assert.equal(result.reply, "");
    assert.match(result.notes, /Model generation failed/i);
    assert.doesNotMatch(result.notes, /fallback template used/i);
  } finally {
    global.fetch = originalFetch;
  }
});

run("testReplyProviderConnection returns a friendly status for template mode", async () => {
  const result = await testReplyProviderConnection({
    provider: "template"
  });

  assert.equal(result.success, true);
  assert.equal(result.provider, "template");
  assert.match(result.message, /does not require connection/i);
});
