const assert = require("node:assert/strict");

const childProcess = require("node:child_process");
const { EventEmitter } = require("node:events");

const clientPath = require.resolve("../src/query/providers/feishu-cli-client");

function loadClientWithSpawn(spawnImpl) {
  delete require.cache[clientPath];
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = spawnImpl;

  try {
    return require("../src/query/providers/feishu-cli-client");
  } finally {
    childProcess.spawn = originalSpawn;
  }
}

const {
  filterSearchResultsForTenant,
  getCommandPreview
} = loadClientWithSpawn(childProcess.spawn);

async function run(name, fn) {
  try {
    await fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

run("filterSearchResultsForTenant removes cross-tenant documents when tenant-only mode is enabled", async () => {
  const results = [
    { result_meta: { is_cross_tenant: false, token: "local_1" } },
    { result_meta: { is_cross_tenant: true, token: "external_1" } },
    { result_meta: { token: "local_2" } }
  ];

  const filtered = filterSearchResultsForTenant(results, true);

  assert.deepEqual(
    filtered.map((result) => result.result_meta.token),
    ["local_1", "local_2"]
  );
});

run("filterSearchResultsForTenant keeps cross-tenant documents when tenant-only mode is disabled", async () => {
  const results = [
    { result_meta: { is_cross_tenant: false, token: "local_1" } },
    { result_meta: { is_cross_tenant: true, token: "external_1" } }
  ];

  const filtered = filterSearchResultsForTenant(results, false);

  assert.deepEqual(
    filtered.map((result) => result.result_meta.token),
    ["local_1", "external_1"]
  );
});

run("filterSearchResultsForTenant defaults to tenant-only filtering when the flag is omitted", async () => {
  const results = [
    { result_meta: { is_cross_tenant: false, token: "local_1" } },
    { result_meta: { is_cross_tenant: true, token: "external_1" } }
  ];

  const filtered = filterSearchResultsForTenant(results, undefined);

  assert.deepEqual(
    filtered.map((result) => result.result_meta.token),
    ["local_1"]
  );
});

run("getCommandPreview uses the cmd shim on Windows to avoid PowerShell script policy", async () => {
  if (process.platform !== "win32") {
    return;
  }

  const previous = process.env.LARK_CLI_COMMAND;
  delete process.env.LARK_CLI_COMMAND;

  try {
    const preview = getCommandPreview("feishu");

    assert.match(preview, /^lark-cli\.cmd docs \+search /);
  } finally {
    if (previous === undefined) {
      delete process.env.LARK_CLI_COMMAND;
    } else {
      process.env.LARK_CLI_COMMAND = previous;
    }
  }
});

run("runFeishuCli enriches the top source with fetched document content", async () => {
  const calls = [];
  const spawnImpl = (_file, args) => {
    calls.push(args.join(" "));
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    process.nextTick(() => {
      const command = args.join(" ");
      const payload = command.includes("docs +fetch")
        ? {
            ok: true,
            data: {
              markdown: [
                "# 咖啡机 CM-2200 产品说明书",
                "基本信息",
                "- 容量：1.2L"
              ].join("\n")
            }
          }
        : {
            ok: true,
            data: {
              results: [
                {
                  title_highlighted: "AUTO_REPLY_CN_咖啡机_CM-2200_产品说明书",
                  summary_highlighted: "咖啡机 CM-2200 产品说明书",
                  result_meta: {
                    token: "ZgYmdlcPhotgT1xZStHcySCRnKd",
                    url: "https://mcn6zu9tnpwu.feishu.cn/docx/ZgYmdlcPhotgT1xZStHcySCRnKd",
                    is_cross_tenant: false
                  }
                }
              ]
            }
          };

      child.stdout.emit("data", Buffer.from(JSON.stringify(payload), "utf8"));
      child.emit("close", 0);
    });

    return child;
  };
  const { runFeishuCli } = loadClientWithSpawn(spawnImpl);

  const result = await runFeishuCli({
    customerMessage: "咖啡机一次能装多少",
    productHint: "咖啡机",
    product: "咖啡机",
    problemType: "other",
    agentType: "feishu",
    aiQueries: ["咖啡机 容量"],
    tenantOnly: true
  });

  assert.equal(result.success, true);
  assert.match(result.sources[0].excerpt, /容量：1\.2L/);
  assert.ok(calls.some((command) => command.includes("docs +fetch")));
});

run("runFeishuCli fetches file content by token and prioritizes price documents for price questions", async () => {
  const calls = [];
  const spawnImpl = (_file, args) => {
    calls.push(args.join(" "));
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    process.nextTick(() => {
      const command = args.join(" ");
      const payload = command.includes("docs +fetch")
        ? {
            ok: true,
            data: {
              markdown: "FS-001 price: 199 CNY"
            }
          }
        : {
            ok: true,
            data: {
              results: [
                {
                  title_highlighted: "SKU <h>FS-001</h>.docx",
                  summary_highlighted: "SKU:<h>FS-001</h> MADE IN CHINA",
                  result_meta: {
                    token: "token_sku",
                    url: "https://example.feishu.cn/file/token_sku",
                    is_cross_tenant: false
                  }
                },
                {
                  title_highlighted: "<h>FS-001</h>价格明细.docx",
                  summary_highlighted: "",
                  result_meta: {
                    token: "token_price",
                    url: "https://example.feishu.cn/file/token_price",
                    is_cross_tenant: false
                  }
                }
              ]
            }
          };

      child.stdout.emit("data", Buffer.from(JSON.stringify(payload), "utf8"));
      child.emit("close", 0);
    });

    return child;
  };
  const { runFeishuCli } = loadClientWithSpawn(spawnImpl);

  const result = await runFeishuCli({
    customerMessage: "FS-001价格",
    productHint: "FS-001",
    product: "FS-001",
    problemType: "specification_question",
    agentType: "feishu",
    aiQueries: [],
    tenantOnly: true
  });

  assert.equal(result.success, true);
  assert.equal(result.doc_title, "FS-001价格明细.docx");
  assert.equal(result.sources[0].id, "token_price");
  assert.match(result.sources[0].excerpt, /199 CNY/);
  assert.ok(calls.some((command) => command.includes("docs +fetch") && command.includes("token_price")));
  assert.ok(!calls.some((command) => command.includes("docs +fetch") && command.includes("https://example.feishu.cn/file/token_price")));
});

run("runFeishuCli exposes the matched file type for image previews", async () => {
  const spawnImpl = (_file, _args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    process.nextTick(() => {
      const payload = {
        ok: true,
        data: {
          results: [
            {
              title_highlighted: "FS-IMG-001.png",
              summary_highlighted: "",
              result_meta: {
                token: "image_token",
                url: "https://example.feishu.cn/file/image_token",
                file_type: "png",
                is_cross_tenant: false
              }
            }
          ]
        }
      };

      child.stdout.emit("data", Buffer.from(JSON.stringify(payload), "utf8"));
      child.emit("close", 0);
    });

    return child;
  };
  const { runFeishuCli } = loadClientWithSpawn(spawnImpl);

  const result = await runFeishuCli({
    customerMessage: "FS-IMG-001",
    productHint: "FS-IMG-001",
    product: "FS-IMG-001",
    problemType: "other",
    agentType: "feishu",
    aiQueries: [],
    tenantOnly: true
  });

  assert.equal(result.success, true);
  assert.equal(result.doc_file_type, "png");
});
