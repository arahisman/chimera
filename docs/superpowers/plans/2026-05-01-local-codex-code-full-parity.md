# Local Chimera Full Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only `chimera` that preserves the Chimera CLI/TUI/tool/session experience while replacing every missing/private dependency with a real local or OpenAI-backed implementation, authenticating out of the box through ChatGPT Pro/Codex OAuth.

**Architecture:** Keep the recovered Chimera harness as the local product shell: CLI, Ink UI, permissions, transcripts, tools, agents, skills, MCP, hooks, and settings. Replace the upstream model/API layer with ChatGPT Codex OAuth and OpenAI/Codex models only, while keeping cloud/remote Anthropic services explicitly out of scope. Every former private/native module must either become a tested local adapter, a tested OpenAI-backed adapter, or be removed from the local product surface.

**Tech Stack:** Bun, TypeScript, Ink/React, OpenAI Responses/Codex-compatible transport, ChatGPT OAuth token store, local MCP, local native adapters, Playwright/PTY smoke tests where UI behavior matters.

---

## Current Scope Decisions

### In Scope

- Local CLI and TUI experience.
- ChatGPT Pro/Codex OAuth as the primary auth path.
- Real OpenAI/Codex model IDs in all selectors, settings, help text, tests, and transcripts.
- Local tools: Read, Write, Edit, MultiEdit, Bash, Glob, Grep, LS, WebFetch, Todo, Notebook tools, MCP, LSP.
- WebSearch only behind a deliberate OpenAI/local adapter; the default local-only product must expose an explicit unavailable result instead of cloud search UX.
- Local session behavior: resume, continue, fork, compact, transcript recovery, sidechain transcripts for agents.
- Local agents/subagents and custom agents.
- Local skills, output styles, hooks, settings, permissions, and plugin loading.
- Local native replacements: diff rendering, image processing, clipboard/image paste, ripgrep, tree-sitter-bash, optional audio capture, modifier/deeplink adapters where useful.
- Voice only if it can be backed by an OpenAI-compatible transcription path under the intended auth model.

### Out Of Scope

- Codex Cloud task delegation.
- Remote bridge, remote sessions, multi-device inbox, daemon cloud sync.
- Cloud proactive agents, cloud notifications, cloud web search by default, Enterprise analytics, Compliance API, RBAC management.
- Anthropic private endpoints.
- Anthropic model names and aliases in product UX.
- Copying or deminifying installed Chimera bundle internals.

### Model Policy

The product must not expose Claude/Anthropic model aliases:

```text
forbidden: sonnet, opus, haiku, claude-*, anthropic-style aliases
```

The selector must expose real OpenAI/Codex model IDs only. Friendly labels are allowed, but the stored/sent value must be the real model ID.

Initial candidate registry, to be confirmed by live Codex OAuth:

```text
gpt-5.5
gpt-5.4
gpt-5.4-mini
gpt-5.4-nano
gpt-5.3-codex
gpt-5.3-codex-spark    # research preview only, behind experimental gate
```

Do not reintroduce GPT-5.1 family defaults. Do not assume public API availability equals ChatGPT/Codex OAuth availability.

Official references checked on 2026-05-01:

- OpenAI Help says GPT-5.5 is rolling out to ChatGPT and Codex, while GPT-5.3 remains the default logged-in ChatGPT experience and GPT-5.5 Pro is available to Pro/Business/Enterprise/Edu tiers: https://help.openai.com/en/articles/11909943-gpt-5-1-in-chatgpt
- OpenAI Codex rate card lists GPT-5.5, GPT-5.4, GPT-5.4-Mini, GPT-5.3-Codex, and GPT-5.3-Codex-Spark: https://help.openai.com/en/articles/20001106-codex-rate-card
- OpenAI API model guide recommends `gpt-5.5` for complex reasoning/coding and `gpt-5.4-mini`/`gpt-5.4-nano` for lower latency/cost API use: https://developers.openai.com/api/docs/models
- Codex Help clarifies local Codex and cloud Codex are separate surfaces and local usage is not covered by cloud compliance surfaces: https://help.openai.com/en/articles/11369540-codex-in-chatgpt

---

## Phase 0: Baseline Lock And Parity Ledger

**Purpose:** Prevent scope drift. Every missing/private item must be visible and classified before implementation starts.

**Files:**

- Create: `docs/local-parity-matrix.md`
- Create: `docs/stub-inventory.md`
- Modify: `docs/milestones.md`
- Modify: `docs/superpowers/plans/2026-05-01-chimera-claude-harness.md`
- Read: `scripts/build.mjs`
- Read: `src/codex/featurePolicy.ts`

### Task 0.1: Generate The Stub Inventory

- [x] Run:

```bash
bun run build 2>&1 | tee /tmp/chimera-build.log
```

Expected:

```text
exit 0
Build used missing recovered-module stubs:
...
```

- [x] Extract every missing recovered module into `docs/stub-inventory.md`.

Document each row with:

```text
module specifier
importing file
product area
classification: replace-local | replace-openai | remove-cloud | remove-dead | keep-disabled
owner phase
acceptance test
```

- [x] Commit:

```bash
git add docs/stub-inventory.md
git commit -m "docs: inventory recovered module stubs"
```

### Task 0.2: Define Local Parity Matrix

- [x] Create `docs/local-parity-matrix.md` with these sections:

```text
Auth
Models
Core tools
Permissions
Sessions
Compaction
Agents
Skills
MCP
LSP
Hooks
Settings
TUI
Native adapters
Voice
Plugins
Packaging
Cloud/remote exclusions
```

- [x] For each section, record:

```text
original Chimera behavior
target Chimera behavior
current status
blocked by
test command
live smoke command
```

- [x] Commit:

```bash
git add docs/local-parity-matrix.md docs/milestones.md
git commit -m "docs: define local parity matrix"
```

---

## Phase 1: Live ChatGPT Codex OAuth Contract

**Purpose:** Replace mock confidence with real upstream facts.

**Files:**

- Create: `docs/codex-upstream-contract.md`
- Create: `scripts/live-codex-contract.mjs`
- Create: `scripts/live-codex-turn.mjs`
- Create: `scripts/live-codex-tool.mjs`
- Modify: `package.json`
- Read/modify: `src/services/codex/auth/*`
- Read/modify: `src/services/codex/client.ts`
- Read/modify: `src/services/codex/translate/*`

### Task 1.1: Add Opt-In Live Contract Smoke

- [x] Add script:

```json
"live:codex-contract": "CHIMERA_LIVE=1 bun scripts/live-codex-contract.mjs"
```

- [x] Script must fail closed unless `CHIMERA_LIVE=1` is set.
- [x] Script must read the existing Codex auth store, never print tokens.
- [x] Script must make a minimal request and save a sanitized event trace to `/tmp/chimera-live-contract.json`.

Sanitized trace fields:

```text
request_url_host
request_path
request_header_names
model
response_id_prefix
sse_event_types
output_item_types
rate_limit_headers_present
auth_refresh_attempted
```

- [x] Commit:

```bash
git add package.json scripts/live-codex-contract.mjs docs/codex-upstream-contract.md
git commit -m "test: add live codex contract smoke"
```

### Task 1.2: Document The Real Upstream Contract

- [x] Run:

```bash
CHIMERA_LIVE=1 bun scripts/live-codex-contract.mjs
```

- [x] Update `docs/codex-upstream-contract.md` with:

```text
auth endpoint assumptions
token refresh behavior
required headers
allowed models observed
SSE event names observed
tool call item shape
tool result item shape
image item shape
reasoning field support
error/rate-limit schema
unknowns
```

- [x] Commit:

```bash
git add docs/codex-upstream-contract.md
git commit -m "docs: record live codex upstream contract"
```

### Task 1.3: Add Live Turn And Tool Smokes

- [x] Add scripts:

```json
"live:codex-turn": "CHIMERA_LIVE=1 bun scripts/live-codex-turn.mjs",
"live:codex-tool": "CHIMERA_LIVE=1 bun scripts/live-codex-tool.mjs"
```

- [x] `live-codex-turn.mjs` must verify:

```text
real streamed assistant text
transcript write
no token leakage
selected real OpenAI model ID
```

- [x] `live-codex-tool.mjs` must verify:

```text
function_call received
local tool executed
function_call_output sent
assistant completes after tool result
```

- [x] Commit:

```bash
git add package.json scripts/live-codex-turn.mjs scripts/live-codex-tool.mjs
git commit -m "test: add live codex turn and tool smokes"
```

---

## Phase 2: Real OpenAI Model Registry, No Anthropic Aliases

**Purpose:** Remove Claude model names from product behavior and expose only real OpenAI/Codex models.

**Files:**

- Modify: `src/services/codex/translate/model-allowlist.ts`
- Modify: `src/services/codex/translate/model-allowlist.test.ts`
- Modify: `src/services/codex/translate/request.test.ts`
- Modify: `src/services/codex/count-tokens.test.ts`
- Modify: `src/commands/model/model.tsx`
- Modify: `src/components/ModelPicker.tsx`
- Modify: `src/components/agents/ModelSelector.tsx`
- Modify: `src/utils/model/*`
- Modify: `src/commands/advisor.ts`
- Modify: `src/components/EffortCallout.tsx`
- Modify: `package.json`
- Create: `src/services/codex/models/registry.ts`
- Create: `src/services/codex/models/registry.test.ts`

### Task 2.1: Introduce Codex Model Registry

- [x] Create `src/services/codex/models/registry.ts`.

Required exported contract:

```ts
export type CodexModelAvailability = 'stable' | 'preview' | 'live-discovered'

export type CodexModelConfig = {
  id: string
  label: string
  availability: CodexModelAvailability
  defaultEffort: 'low' | 'medium' | 'high' | 'xhigh'
  allowedEfforts: readonly ('none' | 'low' | 'medium' | 'high' | 'xhigh')[]
  supportsImages: boolean
  supportsTools: boolean
  supportsComputerUse: boolean
  supportsWebSearch: boolean
  supportsFileSearch: boolean
}
```

Initial static registry:

```text
gpt-5.5
gpt-5.4
gpt-5.4-mini
gpt-5.4-nano
gpt-5.3-codex
gpt-5.3-codex-spark
```

`gpt-5.3-codex-spark` must be hidden unless `CHIMERA_EXPERIMENTAL_MODEL_ALLOWLIST=true` or live discovery confirms it.

- [x] Commit:

```bash
git add src/services/codex/models/registry.ts
git commit -m "feat: add codex model registry"
```

### Task 2.2: Remove Anthropic Alias Resolution

- [x] Replace `resolveCodexModel('sonnet') -> gpt-*` behavior with strict rejection.
- [x] Expected behavior:

```text
chimera --model sonnet
Model "sonnet" is not supported by Chimera. Choose an OpenAI model such as gpt-5.5, gpt-5.4, or gpt-5.4-mini.
```

- [x] Remove or rewrite tests named like:

```text
maps Claude-style aliases to Codex models
```

- [x] New tests must assert:

```text
gpt-5.5 resolves
gpt-5.4 resolves
gpt-5.4-mini resolves
gpt-5.3-codex resolves if live/known
sonnet rejects
opus rejects
haiku rejects
claude-* rejects
CHIMERA_MODEL override rejects unsupported values
```

- [x] Commit:

```bash
git add src/services/codex src/constants src/utils/model
git commit -m "fix: reject anthropic model aliases"
```

### Task 2.3: Replace Model Picker UI

- [x] Update `/model` and agent model picker to show real OpenAI model labels only.
- [x] Default selection order:

```text
1. gpt-5.5 if available
2. gpt-5.4
3. gpt-5.4-mini for fast/cheap mode
4. live-discovered additional OpenAI models
```

- [x] Remove references to:

```text
Opus
Sonnet
Haiku
1M Sonnet/Opus access
Claude model migration notices
```

- [x] Commit:

```bash
git add src/commands/model src/components src/utils/model
git commit -m "feat: show openai models in model picker"
```

### Task 2.4: Add Live Model Discovery

- [x] Add `scripts/live-codex-models.mjs`.
- [x] Script must query or probe allowed model IDs using the live Codex OAuth path.
- [x] The script must classify:

```text
available
unavailable
requires plan
preview
unknown
```

- [x] Add docs section in `docs/codex-upstream-contract.md`.
- [x] Commit:

```bash
git add scripts/live-codex-models.mjs docs/codex-upstream-contract.md package.json
git commit -m "test: add live codex model discovery"
```

---

## Phase 3: Core Local Tool Parity

**Purpose:** Make every local tool behave like a first-class product feature, not just pass the happy path.

**Files:**

- Read/modify: `src/tools.ts`
- Read/modify: `src/tools/*`
- Read/modify: `src/utils/permissions/*`
- Read/modify: `src/query.ts`
- Read/modify: `src/QueryEngine.ts`
- Extend: `scripts/smoke-codex-daily-cli.mjs`
- Extend: `scripts/smoke-codex-tool.mjs`
- Create: `scripts/smoke-codex-local-tools.mjs`

### Task 3.1: Expand Tool Matrix

- [x] Update `docs/local-parity-matrix.md` with every tool and status.
- [x] Include at minimum:

```text
Read
Write
Edit
MultiEdit
NotebookRead
NotebookEdit
Bash
LS
Glob
Grep
WebFetch
WebSearch
TodoWrite
MCP tools
Skill
Agent
LSP
```

- [x] Commit:

```bash
git add docs/local-parity-matrix.md
git commit -m "docs: expand local tool parity matrix"
```

### Task 3.2: Add Missing Tool Smokes

- [x] Add smoke coverage for:

```text
MultiEdit with multiple hunks
NotebookRead/NotebookEdit
LS
WebSearch or explicit unavailable behavior
permission deny
permission allow once
permission allow always
tool schema validation failure
```

- [x] Expected command:

```bash
bun run smoke:codex-local-tools
```

- [x] Commit:

```bash
git add scripts package.json docs/milestones.md
git commit -m "test: expand local codex tool smokes"
```

### Task 3.3: Harden Tool Translation

- [x] For every tool, assert:

```text
Codex function_call arguments map to Claude tool input
tool result maps to Codex function_call_output
errors become structured tool_result, not thrown process crashes
permission denial returns usable model-visible result
```

- [x] Add tests under:

```text
src/services/codex/translate
src/query.codex-tool-loop.test.ts
```

- [x] Commit:

```bash
git add src/services/codex src/query.codex-tool-loop.test.ts
git commit -m "test: harden codex tool translation"
```

---

## Phase 4: Sessions, Transcript, Resume, Compact

**Purpose:** Long-running local coding sessions must survive restarts, compaction, forks, and tool-heavy histories.

**Files:**

- Read/modify: `src/utils/sessionStorage.ts`
- Read/modify: `src/utils/sessionRestore.ts`
- Read/modify: `src/services/compact/*`
- Read/modify: `src/commands/compact/*`
- Read/modify: `src/commands/resume/*`
- Read/modify: `src/commands/rewind/*`
- Extend: `scripts/smoke-codex-session-cli.mjs`
- Create: `scripts/smoke-codex-long-session.mjs`

### Task 4.1: Add Long Session Smoke

- [x] Simulate:

```text
20 user/assistant turns
multiple tool calls
image attachment
subagent sidechain
compact
resume
another tool call after resume
```

- [x] Assert:

```text
transcript JSONL can be loaded
compacted context reaches Codex
tool_result IDs remain consistent
sidechain transcript does not corrupt parent chain
```

- [x] Commit:

```bash
git add scripts package.json
git commit -m "test: add codex long session smoke"
```

### Task 4.2: Replace Missing Compact Modules

- [x] For stubs classified as local compact/context modules, implement local equivalents or remove unreachable cloud paths.
- [x] Required behavior:

```text
/compact works interactively and headless
auto-compact can be disabled/enabled locally
manual compact emits clear diagnostics
no Anthropic private compact endpoint is called
```

- [x] Add `smoke:codex-compact-modules` so `bun run build` fails the smoke if
  compact/context modules resolve through recovered-module stubs.
- [x] Implement explicit local disabled adapters for Anthropic/private
  cache-editing, reactive compact, context-collapse, history snip, context
  inspect, and Kairos session-transcript paths. These adapters keep default
  local Codex behavior honest: manual `/compact` uses the existing local Codex
  summarization path, while unsupported experimental context systems are
  visible in source and return safe no-op/disabled behavior instead of proxy
  stubs.

- [x] Commit:

```bash
git add src/services/compact src/services/contextCollapse src/commands/compact
git commit -m "feat: implement local codex compaction"
```

---

## Phase 5: Agents And Subagents

**Purpose:** Preserve Chimera's local agent experience with Codex upstream.

**Files:**

- Read/modify: `src/tools/AgentTool/*`
- Read/modify: `src/utils/forkedAgent.ts`
- Read/modify: `src/components/agents/*`
- Read/modify: `src/commands/agents/*`
- Extend: `scripts/smoke-codex-agent.mjs`
- Create: `scripts/smoke-codex-multi-agent.mjs`

### Task 5.1: Multi-Agent Smoke

- [x] Cover:

```text
general-purpose subagent
Explore subagent
Plan subagent
custom agent from settings
agent-specific model selection using real OpenAI models
agent-specific tool restrictions
nested-agent prevention or bounded behavior
```

- [x] Commit:

```bash
git add scripts package.json src/tools/AgentTool
git commit -m "test: add codex multi-agent smoke"
```

### Task 5.2: Remove Coordinator/Cloud Agent Paths

- [x] Any missing coordinator/worker module must be classified:

```text
local subagent replacement
or remove-cloud
```

- [x] Remote/background worker concepts must not appear in default help.
- [x] Commit:

```bash
git add src/tools/AgentTool src/codex/featurePolicy.ts docs/stub-inventory.md
git commit -m "fix: remove cloud agent paths from codex code"
```

---

## Phase 6: TUI And Chimera Feel

**Purpose:** Match the local interaction feel: dialogs, spinners, diffs, errors, model picker, resume picker, config UI.

**Files:**

- Read/modify: `src/components/*`
- Read/modify: `src/screens/REPL.tsx`
- Read/modify: `src/commands/model/model.tsx`
- Read/modify: `src/commands/config/*`
- Read/modify: `src/components/StructuredDiff*`
- Create: `scripts/smoke-codex-tui.mjs`
- Create: `scripts/smoke-codex-tui-screenshots.mjs`

### Task 6.1: PTY/Screenshot-Based TUI Smoke

- [x] Create `scripts/smoke-codex-tui.mjs` and package script `smoke:codex-tui`.
- [x] Use PTY text snapshots to verify:

```text
welcome screen says Chimera, not Chimera
model picker lists OpenAI models only
permission prompt renders
diff view renders structured diff
```

- [x] Extend PTY text snapshots to verify:

```text
missing-auth error view renders /login guidance
Codex rate-limit SSE renders the API error surface
resume picker renders local sessions
```

- [x] Extend PTY text snapshots to verify:

```text
config UI renders and hides disabled Codex cloud/Chrome settings from search
```

- [ ] Optional: add screenshot/image capture wrapper once terminal rendering is stable in CI:

```text
scripts/smoke-codex-tui-screenshots.mjs
```

- [x] Commit:

```bash
git add scripts package.json docs
git commit -m "test: add codex tui smoke"
git commit -m "test: extend codex tui smoke"
```

### Task 6.2: Remove Anthropic UX Copy

- [x] Search current user-facing command/component/hook surfaces:

```bash
rg -n "tell Claude|allow Claude|Claude needs|Claude wants|Chimera needs|Chimera wants|Chimera will|Claude can|Claude understands|Voice mode requires a Claude|Opus 4\\.6 only|Anthropic marketplace|Claude\\.ai|Sonnet only|more Opus|Chimera on the web|claude-plugins-official" src/components src/hooks src/commands src/projectOnboardingState.ts --glob '*.ts' --glob '*.tsx'
```

- [x] First Codex product-copy pass:

```text
startup Anthropic notices are no-ops in Codex mode
welcome/model picker/help/onboarding/permission copy says Chimera/OpenAI/the assistant
voice and cloud/remote commands return unavailable or are hidden in Codex mode
/init rewrites Claude-only instructions to Codex/the assistant wording at runtime
```

- [x] Remaining allowed source strings must be audited and classified as:

```text
historical docs about recovered source
compatibility notes such as CLAUDE.md/.claude paths
explicit "not supported" errors for removed Claude.ai/cloud features
source provenance notes
hidden Anthropic-mode strings guarded out of Codex mode
```

Audited classification:

```text
cloud/remote commands and dialogs: ultraplan, ultrareview, remote setup,
remote session detail, teleport login, Chrome, desktop, upgrade, passes,
stickers, and think-back remain hidden or unavailable in Codex mode
compatibility paths: CLAUDE.md, .claude, claude.ai connector keys, and legacy
session/stat names remain source-compatible where the local harness expects them
runtime-rewritten prompts: /init keeps recovered Claude-oriented source prompt
text but rewrites Chimera/Claude to Chimera/the assistant in Codex mode
guarded Anthropic model UX: Sonnet/Opus/Haiku strings remain only behind
non-Codex model/settings branches
local Codex UI pass: stats, feedback, statusline, install, insights,
output-style, trust dialog, and local promo command visibility now use Codex
Code or hide non-local surfaces
```

- [x] Follow-up product UI should say only:

```text
Chimera
ChatGPT
OpenAI
Codex
the assistant
```

- [x] Commit:

```bash
git add src docs scripts
git commit -m "fix: remove anthropic product copy"
git commit -m "fix: clean codex local product copy"
```

---

## Phase 7: Native And Local Dependency Replacements

**Purpose:** Remove private/native fragility while preserving local functionality.

**Files:**

- Read/modify: `src/services/native/*`
- Read/modify: `src/native-ts/color-diff/*`
- Read/modify: `src/tools/FileReadTool/imageProcessor.ts`
- Read/modify: `src/utils/imagePaste.ts`
- Read/modify: `src/utils/modifiers.ts`
- Read/modify: `src/utils/deepLink/protocolHandler.ts`
- Read/modify: `src/utils/bash/treeSitterAnalysis.ts`
- Read/modify: `scripts/build.mjs`
- Extend: `src/services/native/nativeAdapters.test.ts`

### Task 7.1: Complete Native Adapter Matrix

- [x] For each adapter, record implementation and test:

```text
color diff: TypeScript fallback
image processor: sharp
image paste: osascript / xclip / wl-paste / powershell
ripgrep: bundled or system rg
tree-sitter-bash: pure TypeScript bash parser replacement
audio capture: optional Claude vendor or OpenAI/local alternative
modifier keys: local adapter or disabled with explicit UX
deeplink/url handler: local registration or disabled with explicit UX
```

- [x] Commit:

```bash
git add docs/local-parity-matrix.md docs/superpowers/plans/2026-05-01-local-chimera-full-parity.md src/services/native/nativeAdapters.test.ts
git commit -m "docs: record native adapter matrix"
```

### Task 7.2: Tree-Sitter Bash Replacement

- [x] Decide:

```text
use the recovered pure TypeScript bash parser for distribution
enable TREE_SITTER_BASH in the local Codex build shim by default
do not use local Claude vendor or public exact-name tree-sitter-bash packages
```

- [x] Add test that Bash permission classification works without private module.
- [x] Commit:

```bash
git add src/build-shims/bun-bundle.ts src/tools/BashTool/bashPermissions.codex.test.ts package.json docs/local-parity-matrix.md docs/superpowers/plans/2026-05-01-local-chimera-full-parity.md
git commit -m "feat: replace private tree-sitter bash dependency"
```

### Task 7.3: Clipboard And Image Paste

- [x] Add platform tests with mocked command availability.
- [x] Required behavior:

```text
macOS: osascript/png paste path
Linux Wayland: wl-paste
Linux X11: xclip
Windows: powershell clipboard path
headless/no clipboard: clear diagnostic
```

- [x] Commit:

```bash
git add src/utils/imagePaste.ts src/utils/imagePaste.codex.test.ts package.json docs/local-parity-matrix.md docs/superpowers/plans/2026-05-01-local-chimera-full-parity.md
git commit -m "feat: implement local image paste adapters"
```

---

## Phase 8: Voice Through OpenAI-Compatible STT

**Purpose:** Preserve push-to-talk only if it can work under the intended OpenAI/ChatGPT auth path.

**Files:**

- Read/modify: `src/services/voice.ts`
- Replace or fork: `src/services/voiceStreamSTT.ts`
- Read/modify: `src/hooks/useVoice.ts`
- Read/modify: `src/commands/voice/*`
- Read/modify: `src/voice/voiceModeEnabled.ts`
- Create: `src/services/openai/realtimeTranscription.ts`
- Create: `src/services/openai/realtimeTranscription.test.ts`
- Create: `scripts/live-codex-voice.mjs`

### Task 8.1: Verify Auth Compatibility

- [x] Test whether the ChatGPT Pro/Codex OAuth token can access OpenAI realtime transcription or audio transcription endpoints.
- [x] Add sanitized live probe for `/v1/audio/transcriptions` and `/v1/realtime` using the stored Codex OAuth token.
- [x] Document required headers and event schema from official OpenAI docs.
- [x] Keep voice disabled by default until the live probe proves OAuth compatibility; otherwise document API-key-only fallback as optional non-default mode.

Verified on 2026-05-01 after `chimera login`: REST `/v1/audio/transcriptions`
accepts the stored ChatGPT/Codex OAuth token and `ChatGPT-Account-Id` header.
Realtime transcription also accepts the stored ChatGPT/Codex OAuth token when
using `wss://api.openai.com/v1/realtime?intent=transcription`, a
`session.update` payload with `session.type = "transcription"`, 24 kHz mono PCM
`input_audio_buffer.append`, and `input_audio_buffer.commit`.

### Task 8.2: Implement REST Transcription Adapter

- [x] Convert local captured PCM to WAV for OpenAI REST audio transcription.
- [x] Route Codex runtime voice through `src/services/openai/realtimeTranscription.ts`.
- [x] Preserve push-to-talk UX:

```text
hold key to record
release to submit
final transcript inserted into prompt
```

- [x] Enable local `VOICE_MODE` feature gate when Codex auth is present.
- [x] Commit:

```bash
git add src/services/openai src/services/voiceStreamSTT.ts src/voice/voiceModeEnabled.ts src/commands/voice src/build-shims/bun-bundle.ts docs
git commit -m "feat: add openai voice transcription adapter"
```

### Task 8.3: Upgrade To Realtime Interim Transcripts

- [x] Convert local captured PCM to required OpenAI Realtime transcription format.
- [x] Map events:

```text
conversation.item.input_audio_transcription.delta -> interim transcript
conversation.item.input_audio_transcription.completed -> final transcript
error -> voiceError UI
```

- [x] Preserve push-to-talk UX:

```text
hold key to record
release to submit
interim transcript visible
final transcript inserted into prompt
```

Verified on 2026-05-01:

- `src/services/openai/realtimeTranscription.ts` streams Codex runtime voice
  through OpenAI Realtime transcription by default, using ChatGPT/Codex OAuth.
- Local 16 kHz mono PCM capture is resampled to OpenAI Realtime's required 24
  kHz mono PCM before `input_audio_buffer.append`.
- Unit tests cover cumulative interim previews from
  `conversation.item.input_audio_transcription.delta`, final insertion from
  `conversation.item.input_audio_transcription.completed`, and error mapping.
- `bun run live:codex-voice` verified live OAuth compatibility for REST
  transcription and Realtime `session.updated` + `input_audio_buffer.committed`.
  The live smoke sends silence, so transcript `delta/completed` are intentionally
  exercised by unit tests and real push-to-talk usage rather than the sanitized
  probe.

---

## Phase 9: Web Search, File Search, Computer Use

**Purpose:** Replace private/Claude-specific advanced features with OpenAI-backed or local equivalents, without cloud task delegation.

**Files:**

- Read/modify: `src/tools/WebSearchTool/*`
- Read/modify: `src/tools/WebFetchTool/*`
- Read/modify: `src/utils/computerUse/*`
- Create: `src/services/openai/builtinTools.ts`
- Create: `src/services/openai/builtinTools.test.ts`
- Create: `scripts/smoke-codex-web-search.mjs`
- Create: `scripts/smoke-codex-computer-use.mjs`

### Task 9.1: Web Search

- [x] Keep disabled by default unless one of these adapters is implemented:

```text
OpenAI Responses web_search tool
or local browser/search adapter
```

- [x] Implement OpenAI Responses `web_search` adapter in `src/services/openai/builtinTools.ts`.
- [x] Pass `allowed_domains` and `blocked_domains` through to the OpenAI built-in tool filters.
- [x] Request `include: ["web_search_call.action.sources"]`.
- [x] The product must clearly show citations/sources if OpenAI returns them.
- [x] Verify live ChatGPT/Codex OAuth access to Responses `web_search` against the Codex endpoint.
- [x] Commit:

```bash
git add src/tools/WebSearchTool src/services/openai scripts package.json src/codex docs
git commit -m "feat: add codex web search support"
```

### Task 9.2: Computer Use Without Cloud

- [x] Implement only local sandbox/browser computer-use loop core in `src/utils/computerUse/codexLoop.ts`.
- [x] Do not use cloud desktop or remote Anthropic computer-use services.
- [x] Required loop:

```text
send screenshot
receive computer_call
execute local action after permission
return screenshot as computer_call_output
repeat until final answer
```

- [x] Add safety gates:

```text
no authenticated browser by default
explicit user approval for risky actions
domain allow/deny
screenshot redaction hooks
```

- [x] Add offline smoke for the OpenAI Responses `computer` protocol and `computer_call_output` screenshot loop.
- [x] Attach the loop to a real local browser/sandbox target via `src/utils/computerUse/browserTarget.ts`, a Chrome DevTools Protocol adapter that launches isolated headless Chrome with a temp profile.
- [x] Keep product UX gated until a user-facing permission flow is wired to the CDP target.
- [x] Commit:

```bash
git add src/utils/computerUse src/tools scripts package.json
git commit -m "feat: add local computer use loop"
```

---

## Phase 10: Plugins, Skills, Hooks, Settings

**Purpose:** Make local extension points production-quality.

**Files:**

- Read/modify: `src/utils/plugins/*`
- Read/modify: `src/skills/*`
- Read/modify: `src/tools/SkillTool/*`
- Read/modify: `src/services/mcp/*`
- Read/modify: `src/utils/hooks/*`
- Read/modify: `src/utils/settings/*`
- Create: `scripts/smoke-codex-plugins.mjs`
- Create: `scripts/smoke-codex-hooks.mjs`

### Task 10.1: Local Plugin Smoke

- [x] Create a temp plugin with:

```text
command
skill
MCP server
LSP server
user config option
```

- [x] Verify it loads without cloud marketplace access.
- [x] Commit:

```bash
git add scripts package.json src/utils/plugins
git commit -m "test: add local plugin smoke"
```

### Task 10.2: Hook Parity

- [x] Cover:

```text
PreToolUse
PostToolUse
Notification
Stop
SubagentStop
SessionStart
```

- [x] Verify hooks see Chimera product identity and local session paths.
- [x] Commit:

```bash
git add scripts package.json src/utils/hooks
git commit -m "test: add codex hook smoke"
```

---

## Phase 11: Security And Permission Model

**Purpose:** Make local autonomy safe enough for day-to-day use.

**Files:**

- Read/modify: `src/utils/permissions/*`
- Read/modify: `src/tools/BashTool/*`
- Read/modify: `src/tools/*Permission*`
- Read/modify: `src/constants/prompts.ts`
- Read/modify: `src/constants/system.ts`
- Create: `scripts/smoke-codex-security.mjs`

### Task 11.1: Permission Regression Suite

- [x] Cover:

```text
allow tool
deny tool
ask every time
accept edits
dangerously skip permissions
directory boundary
MCP tool trust
Bash risky command rejection
prompt injection in tool output
external data warning
```

- [x] Commit:

```bash
git add scripts package.json src/utils/permissions src/tools/BashTool
git commit -m "test: add codex permission regression suite"
```

---

## Phase 12: Packaging And Distribution

**Purpose:** Install and run cleanly without relying on the development machine.

**Files:**

- Modify: `package.json`
- Modify: `scripts/build.mjs`
- Create: `scripts/package-smoke.mjs`
- Create: `docs/packaging.md`
- Modify: `README.md`

### Task 12.1: Distribution Asset Policy

- [x] Decide which assets are distributable:

```text
own TS code
npm dependencies
generated dist files
open-source native binaries with license
no copied Anthropic private binaries unless license explicitly allows
```

- [x] Document:

```text
what ships
what is optional local vendor
what is dev-only oracle
```

- [x] Commit:

```bash
git add docs/packaging.md README.md scripts/build.mjs package.json
git commit -m "docs: define codex code packaging policy"
```

### Task 12.2: Fresh Install Smoke

- [x] In a temp directory:

```bash
npm pack
npm install -g ./chimera-*.tgz
chimera --version
chimera --help
chimera auth status --json
```

- [x] Commit:

```bash
git add scripts/package-smoke.mjs package.json
git commit -m "test: add package install smoke"
```

---

## Phase 13: Final Verification Matrix

**Purpose:** Declare parity only with evidence.

### Required Local Commands

```bash
bun install --frozen-lockfile
bun run deps:audit
bun run build
bun run check:core
bun run check:full
bun run test:codex
bun run smoke:codex
bun run smoke:codex-login
bun run smoke:codex-turn
bun run smoke:codex-tool
bun run smoke:codex-daily-cli
bun run smoke:codex-session-cli
bun run smoke:codex-experience
bun run smoke:codex-agent
bun run smoke:codex-lsp
bun run smoke:codex-image
bun run smoke:codex-local-tools
bun run smoke:codex-tui
bun run smoke:codex-plugins
bun run smoke:codex-hooks
bun run smoke:codex-security
git diff --check
```

### Required Live Commands

Run only with explicit live auth:

```bash
CHIMERA_LIVE=1 bun run live:codex-contract
CHIMERA_LIVE=1 bun run live:codex-models
CHIMERA_LIVE=1 bun run live:codex-turn
CHIMERA_LIVE=1 bun run live:codex-tool
```

Optional if voice is enabled:

```bash
CHIMERA_LIVE=1 bun run live:codex-voice
```

### Final Acceptance Criteria

The project is not "full local parity" until all are true:

```text
No runtime recovered-module stubs are used in default local product paths.
Every remaining disabled feature is documented as cloud/remote out of scope or explicitly unsupported.
No Anthropic model aliases appear in selectors, help, settings, or default tests.
Real OpenAI model IDs are live-discovered or rejected with a clear message.
ChatGPT Pro/Codex OAuth supports live text, tool, image, and session flows.
Core local tools pass mocked and live smokes.
Sessions survive resume, compact, and tool-heavy long histories.
Agents/subagents work locally with real OpenAI models.
TUI screenshot smokes pass for permission, model picker, diff, errors, resume, config.
Native adapters have deterministic local fallback behavior.
Package install smoke passes from a clean temp directory.
```

---

## Recommended Execution Order

```text
1. Phase 0: parity ledger and stub inventory
2. Phase 1: live Codex OAuth contract
3. Phase 2: real OpenAI model registry, remove Anthropic aliases
4. Phase 3: core tool parity
5. Phase 4: sessions/compact/resume
6. Phase 5: agents/subagents
7. Phase 6: TUI parity
8. Phase 7: native replacements
9. Phase 10: plugins/skills/hooks/settings
10. Phase 11: security/permissions
11. Phase 8: voice, only after auth feasibility check
12. Phase 9: web/file/computer-use advanced local features
13. Phase 12: packaging
14. Phase 13: final verification
```

The first three phases are the critical path. Do not spend major time polishing UI or replacing rare native adapters until live OAuth and the real model registry are proven.
