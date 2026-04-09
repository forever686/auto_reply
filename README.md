# Auto Reply Assistant

桌面弹窗版客服辅助工具 MVP。

当前版本已经包含：

- Electron 桌面弹窗
- 客户消息输入 + 商品补充输入
- 固定结构结果展示
- 固定飞书检索 + 可选模型回复生成
- 代理调用适配层，支持 `Feishu CLI`、`OpenClaw`、`OpenCode`、`ClaudeCode`

## 启动

1. 安装依赖

```powershell
npm install
```

2. 启动桌面弹窗

```powershell
npm start
```

## Windows portable packaging

```powershell
npm run dist:win-portable
```

After the build completes, run the generated app from:

```text
dist/
  win-unpacked/
    auto-reply-assistant.exe
```

## 当前调用方式

当前版本不会再返回任何 mock 数据。

现在分两种模式：

1. 选择内置模式：`Feishu CLI`、`OpenClaw`、`OpenCode`、`ClaudeCode`
   这些模式不需要你再手填命令，程序会自动调用对应 CLI。
2. 选择 `自定义`
   这时才需要你自己填写命令，或者设置环境变量：

```powershell
$env:AGENT_COMMAND="your-agent-command-here"
npm start
```

约定：

- 应用会把 JSON 请求写入命令的 `stdin`
- 同时把同一份 JSON 放到环境变量 `AGENT_INPUT_JSON`
- 兼容保留 `OPENCLAW_INPUT_JSON`
- 命令应返回 JSON 到 `stdout`
- 如果没有配置真实命令，界面会直接报错，不会生成假结果

界面里可以切换代理类型：

- `Feishu CLI`
- `OpenClaw`
- `OpenCode`
- `ClaudeCode`
- `自定义`

注意：

- `Feishu CLI` 实际调用 `lark-cli docs +search --as user --query ...`
- `OpenCode` 实际调用 `opencode run ...`
- `ClaudeCode` 实际调用 `claude --print ...`
- `OpenClaw` 实际调用 `openclaw agent --message ...`
- 当前机器上我确认到了 `lark-cli`、`openclaw`、`opencode`、`claude`

## 回复生成

飞书文档检索保持不变，回复生成现在支持三种方式：

- `不用模型（模板）`
- `Ollama`
- `OpenAI Compatible`

界面中可配置：

- `模型名称`
- `Base URL`
- `API Key`（仅 OpenAI Compatible）
- `回复约定文件`（本地可选）

其中：

- `Ollama` 默认 Base URL 为 `http://127.0.0.1:11434`
- `OpenAI Compatible` 默认 Base URL 为 `https://api.openai.com/v1`
- 若模型生成失败，程序会自动回退到本地模板回复

建议真实返回结构：

```json
{
  "success": true,
  "doc_title": "ABC Coffee Maker User Manual",
  "doc_link": "https://...",
  "reply_en": "Hello, thank you for reaching out...",
  "confidence": 0.87,
  "sources": [
    {
      "id": "feishu_doc_12",
      "type": "feishu",
      "title": "ABC Coffee Maker FAQ"
    }
  ],
  "notes": "Matched via Feishu CLI"
}
```

## 目录

```text
src/
  main.js                     Electron 主进程
  preload.js                  安全桥接
  index.html                  弹窗界面
  renderer.js                 前端交互
  styles.css                  样式
  query/
    orchestrator.js           主流程编排
    parsing.js                问题类型识别
    reply-generator.js        回复生成（模板 / Ollama / OpenAI Compatible）
    templates.js              标准话术模板
    providers/feishu-cli-client.js
    providers/openclaw-client.js
    providers/index.js
scripts/
```

## 下一步建议

下一阶段可以继续接：

- 真实 OpenClaw 命令
- 飞书 CLI / 飞书知识库检索
- SKU/ASIN 到说明书链接映射
- 网页弹窗入口复用同一套查询层
