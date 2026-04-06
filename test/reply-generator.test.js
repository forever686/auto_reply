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
                content: "The current listed price for CM-2200 is $99."
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
    assert.match(result.promptPreview, /Answer the current customer question directly/i);
    assert.match(result.promptPreview, /Always answer the exact customer question first\./i);
    assert.equal(calls.length, 1);
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(tempDir, { recursive: true, force: true });
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
                content: "The CM-2200 is listed at RMB 299."
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
      docTitle: "AUTO_REPLY_CN_咖啡机_CM-2200_FAQ",
      docLink: "https://example.com/faq",
      sources: [
        {
          id: "doc_1",
          type: "feishu",
          title: "AUTO_REPLY_CN_咖啡机_CM-2200_FAQ",
          excerpt: "建议零售价：299 元。"
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
    assert.match(capturedPrompt, /建议零售价：299 元。/);
  } finally {
    global.fetch = originalFetch;
  }
});

run("normalizeSources preserves retrieval excerpts for downstream reply generation", async () => {
  const normalized = normalizeSources([
    {
      id: "doc_1",
      type: "feishu",
      title: "AUTO_REPLY_CN_咖啡机_CM-2200_FAQ",
      excerpt: "建议零售价：299 元。",
      url: "https://example.com/faq"
    }
  ]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].excerpt, "建议零售价：299 元。");
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
              content: "The CM-2200 costs RMB 499 and includes free shipping."
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
          title: "AUTO_REPLY_CN_咖啡机_CM-2200_FAQ",
          excerpt: "建议零售价：299 元。"
        }
      ],
      replySettings: {
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        baseUrl: "https://api.example.com/v1",
        apiKey: "test-key"
      }
    });

    assert.match(result.reply, /could not find confirmed information/i);
    assert.match(result.notes, /not supported by the retrieved evidence/i);
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
              content: "The current materials do not contain pricing information."
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

    assert.match(result.reply, /could not find relevant information/i);
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
