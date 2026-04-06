const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    product: { type: "string" },
    problem_type: { type: "string" },
    doc_title: { type: "string" },
    doc_link: { type: "string" },
    reply_en: { type: "string" },
    confidence: { type: "number" },
    notes: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          title: { type: "string" }
        },
        required: ["id", "type", "title"],
        additionalProperties: true
      }
    }
  },
  required: [
    "success",
    "product",
    "problem_type",
    "doc_title",
    "doc_link",
    "reply_en",
    "confidence",
    "notes",
    "sources"
  ],
  additionalProperties: true
};

function buildAgentPrompt(payload) {
  const customerMessage = String(payload.customerMessage || "").trim();
  const productHint = String(payload.productHint || "").trim();
  const product = String(payload.product || "").trim();
  const problemType = String(payload.problemType || "").trim();

  return [
    "You are a customer support retrieval agent.",
    "Your first action must be to query Feishu using the locally configured Feishu CLI or Feishu document tools.",
    "You must search Feishu documents, Feishu wiki, or Feishu knowledge first before doing anything else.",
    "Do not inspect the local app source code to answer the user request.",
    "Do not use glob, grep, read, or code search on the current project as a substitute for Feishu retrieval.",
    "Only use local files if the user explicitly asks about local files or if you need a tiny amount of context after Feishu retrieval is complete.",
    "If Feishu retrieval fails, return success=false and explain the Feishu failure reason in notes.",
    "Return strict JSON only. Do not output markdown, prose, or explanation outside JSON.",
    "",
    "Task:",
    "1. Query Feishu for the most relevant document/manual based on the customer message and product hint.",
    "2. Extract the best matching Feishu document link.",
    "3. Write a customer-facing English reply in reply_en.",
    "4. Return matched Feishu sources in sources.",
    "5. If no Feishu result is found, return success=false.",
    "",
    "Input:",
    `customer_message: ${customerMessage}`,
    `product_hint: ${productHint || "(empty)"}`,
    `detected_product: ${product || "(empty)"}`,
    `detected_problem_type: ${problemType || "(empty)"}`,
    "",
    "Required output schema:",
    JSON.stringify(RESULT_SCHEMA),
    "",
    "Important constraints:",
    "1. Feishu retrieval is mandatory.",
    "2. Local code search is not an acceptable substitute.",
    "3. If you cannot access Feishu tools, say so in notes and set success=false.",
    "4. doc_link must be a real Feishu link when success=true.",
    "5. sources must describe the matched Feishu documents."
  ].join("\n");
}

function parseAgentJsonOutput(stdout) {
  const text = String(stdout || "").trim();
  if (!text) {
    throw new Error("Agent returned empty output.");
  }

  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split(/\r?\n/).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index].trim();
      if (!(line.startsWith("{") || line.startsWith("["))) {
        continue;
      }
      try {
        return JSON.parse(line);
      } catch {
        continue;
      }
    }
  }

  throw new Error("Agent output is not valid JSON.");
}

function parseJsonLines(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      return null;
    }
  }

  return events.length > 0 ? events : null;
}

function parseOpencodeEventStream(stdout) {
  const events = parseJsonLines(stdout);
  if (!events) {
    return null;
  }

  const toolErrors = [];
  const textParts = [];
  for (const event of events) {
    const part = event?.part;
    if (event?.type === "tool_use" && part?.state?.status === "error") {
      toolErrors.push({
        tool: part.tool || "unknown",
        error: part.state.error || "unknown error",
        input: part.state.input || {}
      });
    }
    if (event?.type === "text" && typeof part?.text === "string") {
      textParts.push(part.text);
    }
  }

  if (toolErrors.length > 0) {
    const firstError = toolErrors[0];
    const triedInput = JSON.stringify(firstError.input);
    return {
      success: false,
      doc_title: "",
      doc_link: "",
      reply_en: "",
      confidence: 0,
      sources: [],
      notes:
        `OpenCode did not complete Feishu retrieval. It attempted local tool usage (${firstError.tool}) and failed: ${firstError.error}.`,
      raw_output: stdout,
      tool_errors: toolErrors,
      debug_reason: `tool_error:${firstError.tool}:${firstError.error}:${triedInput}`
    };
  }

  const combinedText = textParts.join("\n").trim();
  if (!combinedText) {
    return {
      success: false,
      doc_title: "",
      doc_link: "",
      reply_en: "",
      confidence: 0,
      sources: [],
      notes: "OpenCode returned event stream output, but no final text result was found.",
      raw_output: stdout
    };
  }

  try {
    return JSON.parse(combinedText);
  } catch {
    return {
      success: false,
      doc_title: "",
      doc_link: "",
      reply_en: "",
      confidence: 0,
      sources: [],
      notes:
        "OpenCode returned event stream output, but the final text was not valid JSON. It likely did not follow the Feishu retrieval instruction.",
      raw_output: stdout
    };
  }
}

function buildAgentCommandSpec(payload) {
  const agentType = String(payload?.agentType || "").trim() || "openclaw";
  const prompt = buildAgentPrompt(payload);
  const workdir = payload?.agentWorkspace || payload?.workdir || process.cwd();
  const schema = JSON.stringify(RESULT_SCHEMA);

  if (agentType === "opencode") {
    return {
      file: "opencode",
      args: ["run", "--format", "json", "--dir", workdir, prompt],
      shell: true
    };
  }

  if (agentType === "claude") {
    return {
      file: "claude",
      args: [
        "--print",
        "--output-format",
        "json",
        "--permission-mode",
        "bypassPermissions",
        "--add-dir",
        workdir,
        "--json-schema",
        schema,
        prompt
      ],
      shell: true
    };
  }

  if (agentType === "openclaw") {
    return {
      file: "openclaw",
      args: ["agent", "--message", prompt],
      shell: true
    };
  }

  return {
    file: String(payload?.agentCommand || "").trim(),
    args: [],
    shell: true
  };
}

function getCommandPreview(agentType) {
  const normalized = String(agentType || "").trim() || "openclaw";
  const spec = buildAgentCommandSpec({
    agentType: normalized,
    customerMessage: "<customer_message>",
    productHint: "<product_hint>",
    product: "<product>",
    problemType: "<problem_type>",
    workdir: process.cwd()
  });

  if (!spec.file) {
    return "";
  }

  return [spec.file, ...(spec.args || [])].join(" ");
}

function getPromptPreview(payload) {
  return buildAgentPrompt(payload);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function buildAgentRuntimeEnv(payload) {
  const agentType = String(payload?.agentType || "").trim() || "agent";
  const workdir = payload?.workdir || process.cwd();
  const runtimeRoot = ensureDir(path.join(workdir, ".agent-runtime", agentType));
  const homeDir = ensureDir(path.join(runtimeRoot, "home"));
  const configDir = ensureDir(path.join(runtimeRoot, "config"));
  const dataDir = ensureDir(path.join(runtimeRoot, "data"));
  const stateDir = ensureDir(path.join(runtimeRoot, "state"));
  const cacheDir = ensureDir(path.join(runtimeRoot, "cache"));
  const tmpDir = ensureDir(path.join(runtimeRoot, "tmp"));
  const workspaceDir = ensureDir(path.join(runtimeRoot, "workspace"));

  return {
    runtimeRoot,
    workspaceDir,
    HOME: homeDir,
    USERPROFILE: homeDir,
    XDG_CONFIG_HOME: configDir,
    XDG_DATA_HOME: dataDir,
    XDG_STATE_HOME: stateDir,
    XDG_CACHE_HOME: cacheDir,
    TMP: tmpDir,
    TEMP: tmpDir,
    TMPDIR: tmpDir,
    OPENCLAW_STATE_DIR: ensureDir(path.join(runtimeRoot, "openclaw-state")),
    OPENCLAW_CONFIG_PATH: path.join(runtimeRoot, "openclaw-config.json"),
    OPENCODE_BIN_PATH: process.env.OPENCODE_BIN_PATH || "",
    AGENT_RUNTIME_ROOT: runtimeRoot
  };
}

function runCommandProvider(payload, commandSpec) {
  return new Promise((resolve, reject) => {
    const agentType = String(payload?.agentType || "").trim() || "agent";
    const commandPreview = [commandSpec.file, ...(commandSpec.args || [])].join(" ");
    const timeoutMs = Number(process.env.AGENT_TIMEOUT_MS || 120000);
    const runtimeEnv = buildAgentRuntimeEnv(payload);
    const child = spawn(commandSpec.file, commandSpec.args || [], {
      shell: commandSpec.shell === true,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      cwd: payload?.agentWorkspace || payload?.workdir || process.cwd(),
      env: {
        ...process.env,
        HOME: runtimeEnv.HOME,
        USERPROFILE: runtimeEnv.USERPROFILE,
        XDG_CONFIG_HOME: runtimeEnv.XDG_CONFIG_HOME,
        XDG_DATA_HOME: runtimeEnv.XDG_DATA_HOME,
        XDG_STATE_HOME: runtimeEnv.XDG_STATE_HOME,
        XDG_CACHE_HOME: runtimeEnv.XDG_CACHE_HOME,
        TMP: runtimeEnv.TMP,
        TEMP: runtimeEnv.TEMP,
        TMPDIR: runtimeEnv.TMPDIR,
        OPENCLAW_STATE_DIR: runtimeEnv.OPENCLAW_STATE_DIR,
        OPENCLAW_CONFIG_PATH: runtimeEnv.OPENCLAW_CONFIG_PATH,
        OPENCODE_BIN_PATH: runtimeEnv.OPENCODE_BIN_PATH,
        OPENCLAW_INPUT_JSON: JSON.stringify(payload),
        AGENT_INPUT_JSON: JSON.stringify(payload),
        AGENT_TYPE: agentType,
        CUSTOMER_SUPPORT_APP_ROOT: process.cwd(),
        AGENT_RUNTIME_ROOT: runtimeEnv.runtimeRoot
      }
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill();
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n\n");
      reject(
        new Error(
          `${agentType} command timed out after ${Math.round(timeoutMs / 1000)} seconds.` +
            (details ? `\n\n${details}` : "")
        )
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        reject(
          new Error(
            [stderr.trim(), stdout.trim()].filter(Boolean).join("\n\n") ||
              `${agentType} exited with code ${code}.`
          )
        );
        return;
      }

      try {
        const parsed =
          agentType === "opencode"
            ? parseOpencodeEventStream(stdout) || parseAgentJsonOutput(stdout)
            : parseAgentJsonOutput(stdout);
        resolve({
          ...parsed,
          provider: agentType,
          command_preview: commandPreview,
          raw_output: stdout,
          notes: parsed.notes || stderr || `Response returned from configured ${agentType} command.`
        });
      } catch (error) {
        resolve({
          success: false,
          provider: agentType,
          doc_title: "",
          doc_link: "",
          reply_en: "",
          confidence: 0.15,
          sources: [],
          command_preview: commandPreview,
          raw_output: stdout || stderr,
          notes: `Command returned non-JSON output. ${error.message}`
        });
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function runOpenClaw(payload) {
  const agentType = String(payload?.agentType || "").trim() || "openclaw";
  const customCommand = String(payload?.agentCommand || "").trim();
  const promptPreview = buildAgentPrompt(payload);

  if (agentType === "custom" && !customCommand) {
    return {
      success: false,
      provider: "custom",
      confidence: 0,
      sources: [],
      command_preview: "",
      prompt_preview: promptPreview,
      raw_output: "",
      notes: "Custom command is not configured. Please provide a real command."
    };
  }

  const workdir = path.resolve(process.cwd());
  const runtimeEnv = buildAgentRuntimeEnv({ ...payload, workdir });
  const commandSpec =
    agentType === "custom"
      ? {
          file:
            customCommand ||
            String(process.env.AGENT_COMMAND || "").trim() ||
            String(process.env.OPENCLAW_COMMAND || "").trim(),
          args: [],
          shell: true
        }
      : buildAgentCommandSpec({
          ...payload,
          workdir,
          agentWorkspace: runtimeEnv.workspaceDir
        });

  return runCommandProvider(
    {
      ...payload,
      workdir,
      agentWorkspace: runtimeEnv.workspaceDir
    },
    commandSpec
  ).then((result) => ({
    ...result,
    prompt_preview: result.prompt_preview || promptPreview
  }));
}

module.exports = {
  runOpenClaw,
  getCommandPreview,
  getPromptPreview
};
