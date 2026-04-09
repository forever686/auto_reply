# Bilingual Reply Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update reply generation and the result panel so the app shows both Chinese and English customer reply suggestions generated in one model call.

**Architecture:** Extend the existing structured reply contract from a single `answer` field to bilingual `answer_zh` and `answer_en` fields, while keeping the same evidence-based claim validation. Pass both values through the orchestrator and render them in separate UI blocks with safe fallbacks for partial or missing output.

**Tech Stack:** Electron, Node.js, plain JavaScript, existing custom test harness

---

### Task 1: Add failing reply-generation tests for bilingual output

**Files:**
- Modify: `test/reply-generator.test.js`

- [ ] **Step 1: Write failing tests for bilingual model output**
- [ ] **Step 2: Run `node test/reply-generator.test.js` and verify the new assertions fail for missing bilingual fields**
- [ ] **Step 3: Implement the minimal reply-generation changes**
- [ ] **Step 4: Re-run `node test/reply-generator.test.js` and verify it passes**

### Task 2: Add failing UI-source tests for bilingual rendering

**Files:**
- Modify: `test/ui-source.test.js`
- Modify: `src/index.html`
- Modify: `src/renderer.js`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing UI-source assertions for Chinese and English reply blocks**
- [ ] **Step 2: Run `node test/ui-source.test.js` and verify the new assertions fail for missing bilingual UI**
- [ ] **Step 3: Implement the minimal UI rendering and styling changes**
- [ ] **Step 4: Re-run `node test/ui-source.test.js` and verify it passes**

### Task 3: Pass bilingual data through the query pipeline and verify full suite

**Files:**
- Modify: `src/query/orchestrator.js`
- Modify: `README.md`

- [ ] **Step 1: Update orchestrator output to expose both `reply_zh` and `reply_en`**
- [ ] **Step 2: Update README wording only if it mentions a single-language reply**
- [ ] **Step 3: Run `npm.cmd test` and verify the full suite passes**
