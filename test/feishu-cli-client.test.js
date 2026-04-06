const assert = require("node:assert/strict");

const { filterSearchResultsForTenant } = require("../src/query/providers/feishu-cli-client");

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
