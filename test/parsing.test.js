const assert = require("node:assert/strict");

const { detectProblemType, deriveProductName } = require("../src/query/parsing");

function run(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

run("detectProblemType understands Chinese customer support intents", () => {
  assert.equal(detectProblemType("你好，我买的咖啡机没有说明书，可以发我 PDF 吗？"), "missing_manual");
  assert.equal(detectProblemType("这个机器怎么安装和使用？"), "installation_help");
  assert.equal(detectProblemType("包装里面少了一个配件"), "missing_parts");
  assert.equal(detectProblemType("我想退款退货"), "refund_request");
  assert.equal(detectProblemType("咖啡机一次能装多少？容量是多少？"), "specification_question");
});

run("deriveProductName extracts a product model from a Chinese message before falling back", () => {
  assert.equal(deriveProductName("你好，我买了 CM-2200 咖啡机，但是没有说明书。", ""), "CM-2200");
});
