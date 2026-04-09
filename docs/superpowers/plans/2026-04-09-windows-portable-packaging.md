# Windows Portable Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable build flow that packages this Electron app into a Windows portable directory the user can run without installing.

**Architecture:** Keep the existing Electron app structure unchanged and add packaging metadata in `package.json` using `electron-builder`. The build should emit a `dist/win-unpacked/` directory that includes the executable and runtime files, while repository hygiene is preserved by ignoring generated output.

**Tech Stack:** Electron, electron-builder, npm scripts, PowerShell

---

### Task 1: Add packaging metadata and scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package metadata for packaging**

Add product metadata and a build script so packaging can be invoked with npm:

```json
{
  "name": "auto-reply-assistant",
  "version": "0.1.0",
  "description": "Desktop popup that queries OpenClaw and returns manual links plus reply scripts.",
  "main": "src/main.js",
  "scripts": {
    "start": "electron .",
    "test": "node test/parsing.test.js && node test/reply-generator.test.js && node test/feishu-cli-client.test.js && node test/ui-source.test.js",
    "dist:win-portable": "electron-builder --win portable --x64"
  },
  "dependencies": {
    "electron": "^37.2.6"
  },
  "devDependencies": {
    "electron-builder": "^24.13.3"
  },
  "build": {
    "appId": "com.autoreply.assistant",
    "productName": "auto-reply-assistant",
    "directories": {
      "output": "dist"
    },
    "files": [
      "src/**/*",
      "package.json"
    ],
    "win": {
      "target": [
        {
          "target": "portable",
          "arch": [
            "x64"
          ]
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Run package metadata sanity check**

Run: `npm pkg get scripts build name version`
Expected: JSON output includes `dist:win-portable`, `build`, `name`, and `version`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build: add windows portable packaging config"
```

### Task 2: Ignore generated packaging output

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add packaging output directories to gitignore**

Append the generated build directory so artifacts stay out of version control:

```gitignore
node_modules/
.agent-home/
.agent-runtime/
nul
dist/
```

- [ ] **Step 2: Verify ignore rule**

Run: `git check-ignore -v dist`
Expected: output points to `.gitignore` entry for `dist/`

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore packaged app output"
```

### Task 3: Refresh lockfile for build dependency

**Files:**
- Modify: `package-lock.json`

- [ ] **Step 1: Install the packaging dependency**

Run: `npm install --save-dev electron-builder`
Expected: `package.json` and `package-lock.json` are updated and npm exits with code 0

- [ ] **Step 2: Verify dependency is present**

Run: `npm ls electron-builder`
Expected: tree output shows `electron-builder` under the project root

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: install electron-builder"
```

### Task 4: Produce and verify the portable build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a short packaging section**

Document the packaging command and output path:

```md
## Windows portable packaging

```powershell
npm run dist:win-portable
```

After the build completes, run the generated app from:

```text
dist/
  auto-reply-assistant 0.1.0.exe
```
```

- [ ] **Step 2: Run the existing test suite**

Run: `npm test`
Expected: all existing test files pass

- [ ] **Step 3: Build the portable executable**

Run: `npm run dist:win-portable`
Expected: `electron-builder` completes successfully and writes a portable `.exe` under `dist/`

- [ ] **Step 4: Verify the packaged artifact exists**

Run: `Get-ChildItem dist`
Expected: output includes the generated portable executable

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add windows portable packaging instructions"
```
