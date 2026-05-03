# Chimera VS Code Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude-Code-like VS Code family integration for Chimera with a structured IDE bridge, native editor context, native diffs, permission prompts, provider controls, sessions, and polished task UI.

**Architecture:** The main Chimera CLI repository owns the shared agent runtime and `chimera ide --stdio` JSON-RPC bridge. A separate sibling repository, `/Users/arahisman/development/chimera-vscode`, owns the VS Code/Cursor/Windsurf extension and talks to the CLI bridge instead of scraping terminal UI. Both surfaces use the same provider, permission, MCP, session, and checkpoint semantics.

**Tech Stack:** Bun, TypeScript, Zod v4, newline-delimited JSON-RPC 2.0 over stdio, VS Code Extension API, esbuild or tsup for extension bundling, Mocha/Vitest-style extension tests, existing Chimera test scripts.

---

## Progress Ledger

- [x] Task 1: CLI IDE protocol types committed in `eff5b43`.
- [x] Task 2: JSON-RPC stdio framing committed in `a0578da`.
- [x] Task 3: Minimal `chimera ide --stdio` server committed in `ba62f55`.
- [x] Task 4: Bridge runtime facade committed in `b730316`.
- [x] Task 5: IDE context normalization committed in `b76b191`.
- [x] Task 6: Separate VS Code extension repository scaffold committed in `/Users/arahisman/development/chimera-vscode` as `a12a0fd`.
- [x] Task 7: Extension bridge client committed in `/Users/arahisman/development/chimera-vscode` as `8d86a8c`.
- [x] Task 8: Extension status bar and commands committed in `/Users/arahisman/development/chimera-vscode` as `c931116`.
- [x] Task 9: IDE context collector committed in `/Users/arahisman/development/chimera-vscode` as `e4f4034`.
- [x] Task 10: Native diff and edit preview committed in `/Users/arahisman/development/claude-code` as `2a02b45` and `/Users/arahisman/development/chimera-vscode` as `fcdd8e1`.
- [x] Task 11: Permission prompt roundtrip committed in `/Users/arahisman/development/claude-code` as `1b27791` and `/Users/arahisman/development/chimera-vscode` as `ec946ac`.
- [x] Task 12: Auth, provider, model, MCP, plugin UI committed in `/Users/arahisman/development/claude-code` as `0c31a23` and `/Users/arahisman/development/chimera-vscode` as `7d8a6b9`.
- [ ] Task 13: Sessions and checkpoints.
- [ ] Task 14: Sidebar timeline and polish.
- [ ] Task 15: End-to-end verification.

## Repository Layout

Main CLI repo: `/Users/arahisman/development/claude-code`

- Create `src/ide/protocol.ts`: typed IDE protocol schemas and helpers.
- Create `src/ide/protocol.test.ts`: protocol parser and compatibility tests.
- Create `src/ide/jsonRpc.ts`: newline JSON-RPC framing and request/response helpers.
- Create `src/ide/jsonRpc.test.ts`: framing tests.
- Create `src/ide/stdioServer.ts`: stdio transport entrypoint for `chimera ide --stdio`.
- Create `src/ide/stdioServer.test.ts`: initialize/status/request tests with mocked runtime.
- Create `src/ide/runtime.ts`: bridge-facing runtime facade over the existing Chimera agent/session/provider services.
- Create `src/ide/context.ts`: IDE context normalization and size policy.
- Create `src/ide/context.test.ts`: active file, selection, diagnostics, git, terminal context tests.
- Modify `src/entrypoints/cli.tsx`: fast-path dispatch for `chimera ide --stdio`.
- Modify `src/services/mcp/vscodeSdkMcp.ts`: rename legacy concepts to Chimera-native naming when reused.
- Modify `package.json`: add focused IDE tests to `test:codex`.

Extension repo: `/Users/arahisman/development/chimera-vscode`

- Create `.gitignore`, `README.md`, `LICENSE`, `package.json`, `tsconfig.json`.
- Create `src/extension.ts`: activation, command registration, status bar, sidebar bootstrap.
- Create `src/chimera/process.ts`: CLI discovery and stdio child process lifecycle.
- Create `src/chimera/protocol.ts`: extension-side mirror of IDE protocol types.
- Create `src/chimera/client.ts`: JSON-RPC client over child process stdio.
- Create `src/context/collector.ts`: VS Code context collector.
- Create `src/ui/statusBar.ts`: status bar controller.
- Create `src/ui/sidebarProvider.ts`: webview or tree/sidebar provider for prompt/timeline.
- Create `src/ui/permissions.ts`: native permission prompts.
- Create `src/ui/diff.ts`: native diff preview and apply flow.
- Create `src/sessions/sessionBrowser.ts`: session quick pick and resume commands.
- Create `src/providers/modelPicker.ts`: model/provider selector.
- Create `test/*`: unit tests for client, context collector, and command wiring.

## Task 1: CLI IDE Protocol Types

**Files:**

- Create: `/Users/arahisman/development/claude-code/src/ide/protocol.ts`
- Create: `/Users/arahisman/development/claude-code/src/ide/protocol.test.ts`
- Modify: `/Users/arahisman/development/claude-code/package.json`

- [ ] **Step 1: Write failing protocol tests**

Create `src/ide/protocol.test.ts` with tests that prove:

```ts
import { describe, expect, test } from 'bun:test'
import {
  ChimeraIdeMessageSchema,
  createIdeEvent,
  createIdeRequest,
  createIdeResponse,
  isIdeRequest,
} from './protocol.js'

describe('Chimera IDE protocol', () => {
  test('parses initialize requests', () => {
    const message = createIdeRequest(1, 'initialize', {
      protocolVersion: 'chimera.ide.v1',
      minProtocolVersion: 'chimera.ide.v1',
      extensionVersion: '0.1.0',
      editor: { kind: 'vscode', name: 'Visual Studio Code' },
      workspaceFolders: [{ uri: 'file:///tmp/project', name: 'project' }],
      capabilities: { context: true, diff: true, permissions: true },
    })
    const parsed = ChimeraIdeMessageSchema.parse(message)
    expect(isIdeRequest(parsed)).toBe(true)
    expect(parsed.method).toBe('initialize')
  })

  test('parses status events', () => {
    const event = createIdeEvent('status', {
      state: 'thinking',
      label: 'Weaving',
      sessionId: 'session-1',
    })
    const parsed = ChimeraIdeMessageSchema.parse(event)
    expect(parsed.method).toBe('event/status')
  })

  test('parses response envelopes', () => {
    const response = createIdeResponse(1, {
      protocolVersion: 'chimera.ide.v1',
      cliVersion: '0.1.0-alpha.0',
      account: { loggedIn: false },
      models: [],
      permissionMode: 'default',
      capabilities: { context: true, diff: true, permissions: true },
    })
    const parsed = ChimeraIdeMessageSchema.parse(response)
    expect(parsed.id).toBe(1)
    expect(parsed.result.account.loggedIn).toBe(false)
  })
})
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
bun test src/ide/protocol.test.ts
```

Expected: fail because `src/ide/protocol.ts` does not exist.

- [ ] **Step 3: Implement protocol schemas and helpers**

Create `src/ide/protocol.ts` with Zod schemas for:

- JSON-RPC request, response, error, and notification envelopes;
- `initialize`, `sendPrompt`, `interrupt`, `setModel`, `setPermissionMode`;
- `context.update`, `auth.*`, `session.*`, `mcp.*`;
- events: `status`, `assistant.delta`, `assistant.message`, `tool.*`, `diff.proposed`, `edit.applied`, `permission.request`, `checkpoint.created`, `session.updated`, `error`;
- helper constructors `createIdeRequest`, `createIdeResponse`, `createIdeError`, `createIdeEvent`;
- type guards `isIdeRequest`, `isIdeResponse`, `isIdeNotification`.

Minimum exported shape:

```ts
export const CHIMERA_IDE_PROTOCOL_VERSION = 'chimera.ide.v1' as const
export type ChimeraIdeProtocolVersion = typeof CHIMERA_IDE_PROTOCOL_VERSION
export type ChimeraIdeMessage = z.infer<typeof ChimeraIdeMessageSchema>
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```bash
bun test src/ide/protocol.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Add focused protocol tests to `test:codex`**

Modify `package.json` so `test:codex` includes:

```text
src/ide
```

- [ ] **Step 6: Run the Codex suite**

Run:

```bash
bun run test:codex
```

Expected: all existing tests plus IDE protocol tests pass.

- [ ] **Step 7: Commit**

```bash
git add package.json src/ide/protocol.ts src/ide/protocol.test.ts
git commit -m "Add Chimera IDE protocol schemas"
```

## Task 2: JSON-RPC Stdio Framing

**Files:**

- Create: `/Users/arahisman/development/claude-code/src/ide/jsonRpc.ts`
- Create: `/Users/arahisman/development/claude-code/src/ide/jsonRpc.test.ts`

- [ ] **Step 1: Write failing framing tests**

Tests must cover:

```ts
import { describe, expect, test } from 'bun:test'
import { JsonRpcLineDecoder, encodeJsonRpcLine } from './jsonRpc.js'

describe('IDE JSON-RPC line framing', () => {
  test('encodes a single JSON message with newline', () => {
    expect(encodeJsonRpcLine({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }))
      .toBe('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n')
  })

  test('decodes fragmented newline-delimited messages', () => {
    const decoder = new JsonRpcLineDecoder()
    expect(decoder.push('{"jsonrpc":"2.0","id":')).toEqual([])
    expect(decoder.push('1,"result":{}}\n{"jsonrpc":"2.0","method":"event/status","params":{}}\n'))
      .toEqual([
        { jsonrpc: '2.0', id: 1, result: {} },
        { jsonrpc: '2.0', method: 'event/status', params: {} },
      ])
  })

  test('reports invalid JSON with line content', () => {
    const decoder = new JsonRpcLineDecoder()
    expect(() => decoder.push('{broken}\n')).toThrow('Invalid JSON-RPC line')
  })
})
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
bun test src/ide/jsonRpc.test.ts
```

Expected: fail because `jsonRpc.ts` does not exist.

- [ ] **Step 3: Implement encoder and decoder**

`JsonRpcLineDecoder` must buffer partial chunks, parse complete newline-delimited
lines, ignore empty lines, and throw a clear error for invalid JSON.

- [ ] **Step 4: Run focused and Codex tests**

Run:

```bash
bun test src/ide/jsonRpc.test.ts
bun run test:codex
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/ide/jsonRpc.ts src/ide/jsonRpc.test.ts
git commit -m "Add IDE JSON-RPC stdio framing"
```

## Task 3: Minimal `chimera ide --stdio` Server

**Files:**

- Create: `/Users/arahisman/development/claude-code/src/ide/stdioServer.ts`
- Create: `/Users/arahisman/development/claude-code/src/ide/stdioServer.test.ts`
- Modify: `/Users/arahisman/development/claude-code/src/entrypoints/cli.tsx`

- [ ] **Step 1: Write failing server tests**

Tests must instantiate the server with fake readable/writable streams and a fake
runtime that returns initialize metadata. Required behaviors:

- `initialize` returns protocol version, CLI version, logged-out account, empty models, default permission mode, and capabilities;
- invalid method returns JSON-RPC method-not-found error;
- malformed JSON emits a structured error and exits test server cleanly.

- [ ] **Step 2: Run focused test and confirm it fails**

Run:

```bash
bun test src/ide/stdioServer.test.ts
```

Expected: fail because server does not exist.

- [ ] **Step 3: Implement `runIdeStdioServer`**

`runIdeStdioServer` accepts:

```ts
type IdeStdioServerOptions = {
  input: NodeJS.ReadableStream
  output: NodeJS.WritableStream
  runtime: ChimeraIdeRuntime
  cliVersion: string
}
```

It decodes incoming lines, validates messages with `ChimeraIdeMessageSchema`,
dispatches requests to runtime, and writes newline JSON-RPC responses.

- [ ] **Step 4: Add CLI fast path**

In `src/entrypoints/cli.tsx`, before loading the full TUI, dispatch:

```ts
if (args[0] === 'ide' && args.includes('--stdio')) {
  const { runDefaultIdeStdioServer } = await import('../ide/stdioServer.js')
  await runDefaultIdeStdioServer()
  return
}
```

- [ ] **Step 5: Run focused, CLI, and Codex tests**

Run:

```bash
bun test src/ide/stdioServer.test.ts
bun test src/entrypoints/cli.codex.test.ts
bun run test:codex
```

Expected: all pass.

- [ ] **Step 6: Manual smoke**

Run:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"chimera.ide.v1","minProtocolVersion":"chimera.ide.v1","extensionVersion":"0.1.0","editor":{"kind":"vscode","name":"VS Code"},"workspaceFolders":[],"capabilities":{"context":true,"diff":true,"permissions":true}}}\n' | ./dist/chimera.js ide --stdio
```

Expected: one JSON-RPC response line with `result.protocolVersion` equal to
`chimera.ide.v1`.

- [ ] **Step 7: Commit**

```bash
git add src/entrypoints/cli.tsx src/ide/stdioServer.ts src/ide/stdioServer.test.ts
git commit -m "Add IDE stdio bridge entrypoint"
```

## Task 4: Bridge Runtime Facade

**Files:**

- Create: `/Users/arahisman/development/claude-code/src/ide/runtime.ts`
- Create: `/Users/arahisman/development/claude-code/src/ide/runtime.test.ts`
- Modify: `/Users/arahisman/development/claude-code/src/ide/stdioServer.ts`

- [ ] **Step 1: Write runtime tests**

Tests must verify:

- initialize returns actual Chimera model list from the existing provider/model registry;
- `setModel` accepts provider-qualified ids already accepted by CLI validation;
- `setPermissionMode` accepts the same permission modes as CLI;
- unsupported model returns a structured IDE error.

- [ ] **Step 2: Implement runtime facade**

Create `createDefaultIdeRuntime()` that wraps existing services without pulling
Ink UI. It must expose:

```ts
export type ChimeraIdeRuntime = {
  initialize(input: IdeInitializeParams): Promise<IdeInitializeResult>
  sendPrompt(input: IdeSendPromptParams): Promise<IdeSendPromptResult>
  interrupt(): Promise<IdeInterruptResult>
  setModel(input: IdeSetModelParams): Promise<IdeSetModelResult>
  setPermissionMode(input: IdeSetPermissionModeParams): Promise<IdePermissionModeResult>
}
```

`sendPrompt` may initially return a clear structured `not_ready` error until
Task 7 connects real turn execution.

- [ ] **Step 3: Wire runtime into stdio server**

`runDefaultIdeStdioServer` creates the default runtime and passes it into
`runIdeStdioServer`.

- [ ] **Step 4: Run tests**

```bash
bun test src/ide/runtime.test.ts src/ide/stdioServer.test.ts
bun run test:codex
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/ide/runtime.ts src/ide/runtime.test.ts src/ide/stdioServer.ts
git commit -m "Add IDE bridge runtime facade"
```

## Task 5: IDE Context Normalization

**Files:**

- Create: `/Users/arahisman/development/claude-code/src/ide/context.ts`
- Create: `/Users/arahisman/development/claude-code/src/ide/context.test.ts`
- Modify: `/Users/arahisman/development/claude-code/src/ide/protocol.ts`

- [ ] **Step 1: Write context tests**

Tests must verify:

- file URIs normalize to absolute paths;
- selection text is included only below configured byte limit;
- diagnostics are grouped by file and sorted by severity;
- git state accepts branch, changed files, staged files, and repository root;
- terminal cwd is optional and normalized when present.

- [ ] **Step 2: Implement `normalizeIdeContext`**

It returns a deterministic structure for runtime consumption:

```ts
export type NormalizedIdeContext = {
  workspaceRoots: string[]
  activeFile?: { path: string; languageId?: string; selectedRanges: IdeRange[] }
  selections: IdeSelection[]
  diagnosticsByPath: Record<string, IdeDiagnostic[]>
  visibleFiles: string[]
  git?: IdeGitContext
  terminal?: IdeTerminalContext
}
```

- [ ] **Step 3: Add `context.update` dispatch**

`stdioServer` dispatches `context.update` to runtime; runtime stores latest
context in memory per bridge process.

- [ ] **Step 4: Run tests and commit**

```bash
bun test src/ide/context.test.ts src/ide/stdioServer.test.ts
bun run test:codex
git add src/ide/context.ts src/ide/context.test.ts src/ide/protocol.ts src/ide/runtime.ts src/ide/stdioServer.ts
git commit -m "Add IDE context normalization"
```

## Task 6: Create Separate VS Code Extension Repository

**Files:**

- Create repository: `/Users/arahisman/development/chimera-vscode`

- [ ] **Step 1: Create repo directory**

```bash
mkdir -p /Users/arahisman/development/chimera-vscode
cd /Users/arahisman/development/chimera-vscode
git init
```

- [ ] **Step 2: Add package metadata**

Create `package.json`:

```json
{
  "name": "chimera-vscode",
  "displayName": "Chimera",
  "description": "VS Code companion for the Chimera coding agent",
  "version": "0.1.0-alpha.0",
  "publisher": "arahisman",
  "license": "MIT",
  "engines": { "vscode": "^1.95.0" },
  "categories": ["AI", "Other"],
  "activationEvents": [
    "onCommand:chimera.open",
    "onCommand:chimera.newTask",
    "onStartupFinished"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      { "command": "chimera.open", "title": "Chimera: Open" },
      { "command": "chimera.newTask", "title": "Chimera: New Task" },
      { "command": "chimera.attachTerminal", "title": "Chimera: Attach Current Terminal" },
      { "command": "chimera.selectModel", "title": "Chimera: Select Model" },
      { "command": "chimera.login", "title": "Chimera: Login" },
      { "command": "chimera.logout", "title": "Chimera: Logout" },
      { "command": "chimera.resumeSession", "title": "Chimera: Resume Session" }
    ],
    "configuration": {
      "title": "Chimera",
      "properties": {
        "chimera.cliPath": {
          "type": "string",
          "default": "chimera",
          "description": "Path to the Chimera CLI binary."
        }
      }
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "watch": "tsc -w -p tsconfig.json",
    "check": "tsc -p tsconfig.json --noEmit",
    "test": "node ./dist/test/run.js",
    "package:vsix": "vsce package --pre-release"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/vscode": "^1.95.0",
    "@vscode/test-electron": "^2.4.1",
    "@vscode/vsce": "^3.2.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 3: Add TypeScript config and baseline files**

Create `.gitignore`, `LICENSE`, `README.md`, `tsconfig.json`, `src/extension.ts`.

- [ ] **Step 4: Install and build**

```bash
npm install
npm run check
npm run build
```

Expected: TypeScript build succeeds.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "Scaffold Chimera VS Code extension"
```

## Task 7: Extension Protocol Client

**Files in `/Users/arahisman/development/chimera-vscode`:**

- Create: `src/chimera/protocol.ts`
- Create: `src/chimera/client.ts`
- Create: `src/chimera/process.ts`
- Create: `src/chimera/client.test.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Port protocol types**

Copy the stable protocol names and TypeScript interfaces from the CLI protocol.
Do not copy server-only runtime code.

- [ ] **Step 2: Add child-process launcher**

`startChimeraBridge(cliPath, cwd)` spawns:

```bash
chimera ide --stdio
```

with `stdio: ['pipe', 'pipe', 'pipe']`.

- [ ] **Step 3: Add JSON-RPC client**

The client must:

- assign incremental ids;
- resolve responses by id;
- emit notifications/events;
- reject pending requests when process exits;
- expose `initialize`, `sendPrompt`, `interrupt`, `setModel`, `setPermissionMode`.

- [ ] **Step 4: Unit test client framing**

Use fake streams to verify initialize request and status event dispatch.

- [ ] **Step 5: Build and commit**

```bash
npm run check
npm run build
git add src/chimera package.json tsconfig.json src/extension.ts
git commit -m "Add Chimera bridge client"
```

## Task 8: Extension Status Bar And Commands

**Files in `/Users/arahisman/development/chimera-vscode`:**

- Create: `src/ui/statusBar.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Implement status bar controller**

Show:

- `Chimera: idle` before connection;
- `Chimera: thinking` while task runs;
- `Chimera: error` on bridge errors;
- current model when known.

- [ ] **Step 2: Register commands**

Commands must call the bridge client:

- `chimera.open`: initialize and show sidebar placeholder;
- `chimera.newTask`: prompt input box and send prompt;
- `chimera.selectModel`: quick pick from initialize result;
- `chimera.login`: call auth flow when CLI exposes it;
- `chimera.logout`: call auth logout when CLI exposes it;
- `chimera.resumeSession`: call session list/resume when CLI exposes it.

- [ ] **Step 3: Build and commit**

```bash
npm run check
npm run build
git add src/extension.ts src/ui/statusBar.ts
git commit -m "Add Chimera extension commands and status bar"
```

## Task 9: IDE Context Collector

**Files in `/Users/arahisman/development/chimera-vscode`:**

- Create: `src/context/collector.ts`
- Create: `src/context/collector.test.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Implement context collection**

Collect:

- workspace folders;
- active editor URI, language id, dirty flag, selections;
- small selected text;
- visible editor URIs;
- diagnostics;
- git branch and changed files through VS Code Git extension API when available;
- terminal cwd when the API provides it.

- [ ] **Step 2: Send `context.update` on changes**

Throttle updates to avoid flooding the bridge. Send when active editor, selection,
diagnostics, or visible editors change.

- [ ] **Step 3: Build and commit**

```bash
npm run check
npm run build
git add src/context src/extension.ts
git commit -m "Send VS Code context to Chimera"
```

## Task 10: Native Diff And Edit Preview

**Files:**

- CLI repo: modify `src/ide/protocol.ts`, `src/ide/runtime.ts`
- Extension repo: create `src/ui/diff.ts`, modify `src/extension.ts`

- [ ] **Step 1: CLI emits `diff.proposed` events**

Add event schema and runtime helper for file path, original text, proposed text,
and tool id.

- [ ] **Step 2: Extension opens native diff**

Write proposed content into an in-memory or temp document and call:

```ts
vscode.commands.executeCommand('vscode.diff', originalUri, proposedUri, title)
```

- [ ] **Step 3: Accept/reject flow**

Provide commands for accept and reject. Accept applies `WorkspaceEdit`; reject
responds to the bridge without changing the file.

- [ ] **Step 4: Test, build, and commit in both repos**

Run CLI tests in the main repo and extension build/tests in the extension repo.
Commit each repo separately with clear messages.

## Task 11: Permission Prompt Roundtrip

**Files:**

- CLI repo: modify `src/ide/protocol.ts`, `src/ide/runtime.ts`, `src/ide/stdioServer.ts`
- Extension repo: create `src/ui/permissions.ts`, modify `src/extension.ts`

- [ ] **Step 1: CLI sends `permission.request`**

Request includes tool id, tool name, display name, input summary, affected paths,
risk level, suggested rules, and decision reason.

- [ ] **Step 2: Extension renders native prompt**

Use `showWarningMessage` for risky actions and `showInformationMessage` for low
risk. Actions:

- Allow once;
- Deny;
- Always allow;
- Switch to dontAsk.

- [ ] **Step 3: CLI consumes permission response**

Permission decisions flow back through JSON-RPC and reuse existing CLI permission
mode semantics.

- [ ] **Step 4: Test and commit**

Run focused permission tests in both repos and commit separately.

## Task 12: Auth, Provider, Model, MCP, Plugin UI

**Files:**

- CLI repo: extend `src/ide/runtime.ts` and protocol schemas.
- Extension repo: create `src/providers/modelPicker.ts`, `src/providers/auth.ts`, `src/mcp/status.ts`.

- [ ] **Step 1: Add CLI bridge methods**

Expose:

- `auth.listProviders`;
- `auth.login`;
- `auth.logout`;
- `models.list`;
- `mcp.status`;
- `mcp.reload`;
- `plugins.reload`.

- [ ] **Step 2: Add VS Code quick picks**

Model picker shows connected providers first, provider-qualified model ids,
context window where known, and unavailable provider login actions.

- [ ] **Step 3: Add API-key input**

Use VS Code secret input with `password: true`; forward to CLI runtime and do
not store provider secrets in extension state.

- [ ] **Step 4: Test and commit**

Run CLI provider tests plus extension build/tests. Commit separately.

## Task 13: Sessions And Checkpoints

**Files:**

- CLI repo: extend `src/ide/runtime.ts` and protocol schemas.
- Extension repo: create `src/sessions/sessionBrowser.ts`, modify sidebar UI.

- [ ] **Step 1: Add session bridge methods**

Expose:

- `session.list`;
- `session.resume`;
- `session.checkpoint`;
- `session.rollback`.

- [ ] **Step 2: Add extension session browser**

Quick pick sessions by title, model/provider, and last activity.

- [ ] **Step 3: Add rollback preview**

Before rollback, show impacted file list and require explicit confirmation.

- [ ] **Step 4: Test and commit**

Run CLI session tests and extension build/tests. Commit separately.

## Task 14: Sidebar Timeline And Polish

**Files in `/Users/arahisman/development/chimera-vscode`:**

- Create: `src/ui/sidebarProvider.ts`
- Create: `media/main.css`
- Create: `media/main.js`
- Modify: `package.json`
- Modify: `src/extension.ts`

- [ ] **Step 1: Add sidebar view contribution**

Contribute a Chimera sidebar view with prompt input, transcript, task timeline,
tool list, checkpoint list, and quick actions.

- [ ] **Step 2: Add message protocol between webview and extension host**

Actions:

- send prompt;
- interrupt;
- select model;
- change permission mode;
- open diff;
- resume session.

- [ ] **Step 3: Add terminal-native brand styling**

Use Chimera palette, compact layout, readable timeline, and no decorative bloat.

- [ ] **Step 4: Build and package VSIX**

```bash
npm run check
npm run build
npm run package:vsix
```

Expected: `.vsix` is produced and installs into VS Code.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "Add Chimera sidebar timeline"
```

## Task 15: End-To-End Verification

**Files:**

- CLI repo: docs and smoke scripts as needed.
- Extension repo: tests and README.

- [ ] **Step 1: CLI verification**

Run in `/Users/arahisman/development/claude-code`:

```bash
bun run check:full
bun run test:codex
bun run smoke:codex-package
```

Expected: all pass.

- [ ] **Step 2: Extension verification**

Run in `/Users/arahisman/development/chimera-vscode`:

```bash
npm run check
npm run build
npm run package:vsix
```

Expected: all pass and VSIX exists.

- [ ] **Step 3: Manual VS Code smoke**

Install VSIX, open a fixture workspace, run:

- `Chimera: Open`;
- `Chimera: New Task`;
- select model;
- send prompt with active selection;
- trigger diff preview;
- approve a permission request;
- interrupt a running task;
- resume a session.

Expected: each flow completes without terminal output scraping.

- [ ] **Step 4: Documentation**

Update:

- `/Users/arahisman/development/claude-code/README.md`;
- `/Users/arahisman/development/claude-code/docs/packaging.md`;
- `/Users/arahisman/development/chimera-vscode/README.md`.

Document install, CLI discovery, supported editors, permissions, model/provider
flows, and known limits.

- [ ] **Step 5: Final commits**

Commit final docs in each repo. The extension repo should have a clean `main`
branch, and the CLI repo should have a clean working tree.

## Self-Review

- Spec coverage: protocol, headless bridge, separate extension repo, context,
  diffs, permissions, auth/providers/models, MCP/plugins, sessions/checkpoints,
  terminal attach, security, packaging, and verification all map to tasks.
- Placeholder scan: no empty implementation sections are left for decision at
  execution time; each task has concrete files and verification commands.
- Type consistency: protocol names use `chimera.ide.v1`, JSON-RPC request/event
  naming is stable, and extension tasks mirror the CLI protocol names.
