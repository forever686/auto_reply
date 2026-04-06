# Reply Model Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Feishu CLI retrieval unchanged while replacing reply generation with configurable Ollama or OpenAI-compatible model APIs plus an optional local reply-rules file.

**Architecture:** Retrieval remains in the Feishu provider and continues to return document metadata. A new reply generation layer receives the user request, retrieval result, and optional rules file content, then either builds a template reply or calls the configured model API. The renderer gains model configuration fields but keeps the existing result display flow.

**Tech Stack:** Electron, Node.js built-in `fetch`, local filesystem reads, existing IPC bridge

---

### Task 1: Add reply model settings to the UI payload

**Files:**
- Modify: `src/index.html`
- Modify: `src/renderer.js`

- [ ] Add a reply model section with provider, base URL, model, API key, and optional rules file path input.
- [ ] Persist the reply model settings in local storage except for the API key.
- [ ] Include the reply model settings in the IPC query payload.

### Task 2: Add a reply generation service

**Files:**
- Create: `src/query/reply-generator.js`

- [ ] Implement reading the optional local rules file safely.
- [ ] Implement deterministic fallback reply generation using the existing template helper when model generation is disabled or fails.
- [ ] Implement Ollama chat generation.
- [ ] Implement OpenAI-compatible chat generation using configurable base URL, model, and API key.
- [ ] Return prompt/debug metadata so the existing result panel can expose it.

### Task 3: Integrate reply generation after Feishu retrieval

**Files:**
- Modify: `src/query/orchestrator.js`
- Modify: `src/query/providers/feishu-cli-client.js`

- [ ] Keep Feishu retrieval behavior unchanged for document lookup.
- [ ] Replace direct reply template assignment in the Feishu provider with orchestration-level reply generation.
- [ ] Pass retrieval result plus user/model settings into the reply generator.
- [ ] Surface reply-model metadata in the final query result.

### Task 4: Update documentation and verify end to end

**Files:**
- Modify: `README.md`

- [ ] Document the new reply model options and the optional rules file.
- [ ] Run syntax checks on changed JS files.
- [ ] Run an end-to-end Feishu retrieval plus reply generation check with template mode and one model mode.
