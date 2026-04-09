const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function run(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

const rendererSource = fs.readFileSync(path.join(__dirname, "..", "src", "renderer.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf8");
const readmeSource = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
const mainSource = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
const preloadSource = fs.readFileSync(path.join(__dirname, "..", "src", "preload.js"), "utf8");
const orchestratorSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "query", "orchestrator.js"),
  "utf8"
);
const stylesSource = fs.readFileSync(path.join(__dirname, "..", "src", "styles.css"), "utf8");

run("UI source does not contain common mojibake characters", () => {
  assert.doesNotMatch(
    `${rendererSource}\n${htmlSource}\n${readmeSource}`,
    /鈿|鉁|猝|璁剧疆|澶嶅埗|鍏抽棴|妗岄潰|褰撳墠|鍥炲/
  );
});
run("document links are opened through the system browser", () => {
  assert.match(mainSource, /clipboard, ipcMain, shell/);
  assert.match(mainSource, /ipcMain\.handle\("assistant:open-external"/);
  assert.match(mainSource, /shell\.openExternal/);
  assert.match(preloadSource, /openExternal\(url\)/);
  assert.match(preloadSource, /assistant:open-external/);
  assert.match(rendererSource, /docLink\.addEventListener\("click"/);
  assert.match(rendererSource, /window\.assistantApi\.openExternal/);
});

run("matched sources render titles with clickable URLs", () => {
  assert.match(rendererSource, /const sourceLink = document\.createElement\("a"\)/);
  assert.match(rendererSource, /const sourceMeta = document\.createElement\("p"\)/);
  assert.match(rendererSource, /source\.url \|\| "-"/);
  assert.match(rendererSource, /sourceLink\.textContent = source\.title/);
  assert.match(rendererSource, /sourceLink\.href = source\.url/);
  assert.match(stylesSource, /\.source-link/);
  assert.match(stylesSource, /\.source-meta/);
});

run("suggested replies render separate Chinese and English blocks", () => {
  assert.match(htmlSource, /id="replyZhText"/);
  assert.match(htmlSource, /id="replyEnText"/);
  assert.match(htmlSource, /中文回复/);
  assert.match(htmlSource, /English Reply/);
  assert.match(rendererSource, /const replyZhTextElement = document\.getElementById\("replyZhText"\)/);
  assert.match(rendererSource, /const replyEnTextElement = document\.getElementById\("replyEnText"\)/);
  assert.match(rendererSource, /replyZhTextElement\.textContent = result\.reply_zh \|\| "-"/);
  assert.match(rendererSource, /replyEnTextElement\.textContent = result\.reply_en \|\| "-"/);
  assert.match(stylesSource, /\.reply-language-grid/);
  assert.match(stylesSource, /\.reply-language-block/);
});

run("image hits render a conditional preview block", () => {
  assert.match(htmlSource, /id="docImagePanel"/);
  assert.match(htmlSource, /id="docImagePreview"/);
  assert.match(rendererSource, /docImagePanel\.classList\.add\("hidden"\)/);
  assert.match(rendererSource, /docImagePreview\.src = result\.doc_link/);
  assert.match(rendererSource, /result\.doc_file_type/);
  assert.match(stylesSource, /\.doc-image-preview/);
});

run("settings panel supports keyboard close behavior", () => {
  assert.match(rendererSource, /document\.addEventListener\("keydown"/);
  assert.match(rendererSource, /Escape/);
  assert.match(rendererSource, /openSettingsButton\.focus\(\)/);
});

run("query UI exposes staged loading feedback", () => {
  assert.match(htmlSource, /id="progressSteps"/);
  assert.match(htmlSource, /data-progress-step="prepare"/);
  assert.match(htmlSource, /data-progress-step="retrieve"/);
  assert.match(htmlSource, /data-progress-step="reply"/);
  assert.match(rendererSource, /function setProgressStep/);
  assert.match(rendererSource, /setProgressStep\("retrieve"/);
  assert.match(rendererSource, /setProgressStep\("reply"/);
  assert.match(rendererSource, /setProgressStep\("complete"/);
});

run("query progress is streamed from the main process to the renderer", () => {
  assert.match(mainSource, /assistant:query-progress/);
  assert.match(preloadSource, /onQueryProgress/);
  assert.match(rendererSource, /onQueryProgress/);
  assert.match(orchestratorSource, /onProgress/);
  assert.match(orchestratorSource, /step: "retrieve"/);
  assert.match(orchestratorSource, /step: "reply"/);
});

run("execution feedback is collapsed behind a details disclosure", () => {
  assert.match(htmlSource, /<details id="executionDetails"/);
  assert.match(htmlSource, /<summary>.*执行详情/s);
  assert.match(htmlSource, /<\/details>/);
});

run("settings panel has dialog semantics for focus management", () => {
  assert.match(htmlSource, /id="settingsPanel"[^>]*role="dialog"/);
  assert.match(htmlSource, /id="settingsPanel"[^>]*aria-modal="true"/);
  assert.match(htmlSource, /id="settingsPanel"[^>]*tabindex="-1"/);
});

run("result header does not show a confidence percentage badge", () => {
  assert.doesNotMatch(htmlSource, /confidenceBadge/);
  assert.doesNotMatch(rendererSource, /confidenceBadge/);
  assert.doesNotMatch(htmlSource, /0%/);
});

run("outer surfaces share a unified refined border treatment", () => {
  assert.match(stylesSource, /--surface-border:/);
  assert.match(stylesSource, /--surface-highlight:/);
  assert.match(stylesSource, /--surface-shadow:/);
  assert.match(stylesSource, /\.panel\s*{[\s\S]*border: 1px solid var\(--surface-border\)/);
  assert.match(stylesSource, /\.panel\s*{[\s\S]*box-shadow: var\(--surface-shadow\)/);
  assert.match(stylesSource, /\.result-card\s*{[\s\S]*border: 1px solid var\(--surface-border\)/);
  assert.match(stylesSource, /\.side-panel\s*{[\s\S]*border-left: 1px solid var\(--surface-border\)/);
});

run("help panel matches the settings panel interaction pattern", () => {
  assert.match(htmlSource, /id="openHelpButton"/);
  assert.match(htmlSource, /id="helpBackdrop"/);
  assert.match(htmlSource, /id="helpPanel"[\s\S]*role="dialog"/);
  assert.match(htmlSource, /id="helpPanel"[\s\S]*aria-modal="true"/);
  assert.match(htmlSource, /id="closeHelpButton"/);
  assert.match(htmlSource, /使用方法/);
  assert.match(rendererSource, /function setHelpOpen/);
  assert.match(rendererSource, /openHelpButton\.addEventListener\("click"/);
  assert.match(rendererSource, /closeHelpButton\.addEventListener\("click"/);
  assert.match(rendererSource, /helpBackdrop\.addEventListener\("click"/);
  assert.match(rendererSource, /openHelpButton\.focus\(\)/);
  assert.match(stylesSource, /\.side-panel/);
  assert.match(stylesSource, /\.help-list/);
});

run("help panel documents Feishu CLI setup and verification", () => {
  assert.match(htmlSource, /飞书 CLI/);
  assert.match(htmlSource, /lark-cli auth login/);
  assert.match(htmlSource, /search:docs:read/);
  assert.match(htmlSource, /lark-cli docs \+search/);
  assert.match(htmlSource, /need_user_authorization/);
});
