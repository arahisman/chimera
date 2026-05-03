# Chimera Milestones

Status date: 2026-05-01

## Milestone A: Bootable Harness

Status: complete.

Evidence:

```text
bun install: pass
bun run deps:audit: pass, 0 unresolved runtime imports
bun run build: pass
bun run check:core: pass
bun run test:codex: pass
bun dist/chimera.js --version: 0.0.0-local (Chimera)
bun dist/chimera.js --help: pass
disabled feature commands: absent from top-level help
```

Known note:

```text
deps:audit reports one unresolved type-only package, type-fest, which is
declared and used only through import type.
```

## Milestone B: ChatGPT Login

Status: complete for mocked OAuth issuer; live ChatGPT login remains manual/opt-in.

Exit criteria:

```text
chimera login opens browser PKCE flow
chimera login --device prints device code
tokens stored under ~/.config/chimera/codex/auth.json with 0600 mode
chimera logout removes tokens
```

Evidence:

```text
bun run smoke:codex-login: pass
browser PKCE flow: pass against local OAuth issuer
device flow: pass against local OAuth issuer
auth file mode: 0600
chimera auth status --json: loggedIn true, authMethod chatgpt
chimera logout: removes Codex auth file
```

Mock-only configuration hooks:

```text
CHIMERA_OAUTH_ISSUER
CHIMERA_OAUTH_CLIENT_ID
CHIMERA_OAUTH_PORT
CHIMERA_OAUTH_REDIRECT_URI
```

## Milestone C: One Non-Tool Turn

Status: complete against mocked Codex SSE.

Exit criteria:

```text
REPL accepts prompt
Codex request reaches mocked server
streamed text renders in Chimera message UI
transcript persists
```

Evidence:

```text
bun run smoke:codex-turn: pass
headless chimera -p: stdout renders "hello from codex"
interactive REPL: expect submits prompt and observes rendered "hello from codex"
mock Codex server: receives submitted prompts
transcript JSONL: contains user prompts and assistant response
```

## Milestone D: Tool Turn

Status: complete against mocked Codex SSE.

Exit criteria:

```text
Codex function_call maps to Claude tool_use
permission prompt appears for protected tool
tool executes
tool_result maps back to Codex function_call_output
assistant completes after tool
```

Evidence:

```text
bun run smoke:codex-tool: pass
headless Read: Codex function_call becomes Claude Read tool_use
headless Read: function_call_output contains README content and no validation error
interactive Bash: original Claude permission dialog renders and accepts approval
interactive Bash: command executes and produces codex-tool-smoke
assistant completion: final "hello from codex" renders after each tool turn
transcript JSONL: contains prompts, tool uses, tool results, and final responses
```

## Milestone E: Usable Daily CLI

Status: complete against mocked Codex SSE.

Exit criteria:

```text
Read/Edit/Write/Bash/Grep/Glob/WebFetch/MCP/Todo work
/resume works
/compact works
/model works
session storage and first prompt extraction work
error UI handles auth/rate limits
```

Evidence:

```text
bun run smoke:codex-daily-cli: pass
bun run smoke:codex-local-tools: pass
bun run smoke:codex-session-cli: pass
bun run smoke:codex-long-session: pass
bun run smoke:codex-compact-modules: pass
Read: reads a real temp file
Write: creates a real temp file under acceptEdits
Edit: reads then edits a real temp file under acceptEdits
Glob/Grep: execute against real ripgrep runtime from dist/vendor/ripgrep
TodoWrite: updates the session todo state and returns tool_result
WebFetch: fetches a local HTTPS markdown page and completes nested summarization
MCP: connects to a local stdio MCP server and executes mcp__codexSmoke__ping
--resume: loads the seeded session and sends pre-resume context to Codex
long session: 20 resumed turns, Read, image input, Agent sidechain, /compact,
and post-compact Read all complete in one session
compact/context recovered stubs: cache-editing, reactive compact,
context-collapse, history snip, context inspect, and Kairos session-transcript
paths resolve to explicit local source files
session JSONL: contains seed and resumed turns
/compact: headless slash command renders empty-history diagnostic in stream-json
--model with Anthropic aliases such as haiku/sonnet: rejected with OpenAI model guidance
auth error: missing Codex auth prints Not authenticated and /login guidance
rate-limit error: codex.rate_limits SSE renders API Error: rate limit reached
transcript JSONL: contains prompts, tool uses, tool results, and final responses
```

Implementation notes:

```text
--bare is intentionally not used for the daily full-tool smoke because it sets
CLAUDE_CODE_SIMPLE=1 and limits the harness to Bash/Read/Edit.
The build script copies ripgrep binaries from a locally installed
@anthropic-ai/claude-code package when available; runtime falls back to system
rg if dist/vendor/ripgrep is absent.
Codex numeric tool schemas preserve optional/default fields while still
accepting numeric strings; the Grep smoke keeps explicit numeric fields to
exercise the full contract.
Expanded local tool coverage now lives in `smoke:codex-local-tools`: MultiEdit,
Notebook Read/Edit, LS, disabled WebSearch behavior, permission deny/allow, and
schema validation failure.
Interactive slash-command assertions are intentionally left out of this smoke:
the REPL/tool smokes already cover TTY submit and permission interaction, while
expect pty CR/newline handling was too brittle for stable slash-command CI.
/model is a local-jsx TUI command, so noninteractive model routing is covered
through the CLI --model alias contract.
```

## Milestone F: Maximal Claude Experience

Status: complete for the scoped Chimera experience. Output styles, local
skills, Agent/subagent flow, LSP, structured diffs, image attachments, optional
native audio capture, first-pass TUI parity, and OpenCode donor mapping are
covered.

Exit criteria:

```text
output styles preserved
skills preserved
agent/subagent flows functional
LSP functional
structured diffs functional
image attachments functional through non-native fallback
native audio optional through vetted vendor adapter
OpenCode donor map complete
```

Evidence:

```text
bun run smoke:codex-experience: pass
bun run smoke:codex-agent: pass
bun run smoke:codex-multi-agent: pass
bun run smoke:codex-tui: pass
bun run smoke:codex-lsp: pass
bun run smoke:codex-image: pass
src/tools/AgentTool/builtInAgents.codex.test.ts: pass
src/native-ts/color-diff/colorDiff.codex.test.ts: pass
src/services/native/nativeAdapters.test.ts: pass
output styles: project .claude/output-styles selection reaches Codex system prompt
skills listing: project .claude/skills entry reaches Skill-tool reminder
/skill invocation: headless slash skill expands SKILL.md body and arguments
built-in agents: general-purpose, Explore, Plan, and statusline setup prompts use Chimera identity
agent/subagent: parent Agent function_call launches general-purpose subagent via Codex request and returns result as function_call_output
multi-agent: general-purpose, Explore, Plan, custom agent, OpenAI model override, tool restrictions, and Anthropic alias rejection pass through mock Codex CLI smoke
coordinator worker mode: disabled by default in Codex feature policy so recovered workerAgent is not part of the local Codex surface
TUI: Codex-branded welcome, OpenAI-only model picker, Bash permission prompt,
Edit structured diff prompt, missing-auth guidance, Codex rate-limit error,
config search filtering, and resume picker render through the real interactive terminal
Codex product copy: startup Anthropic notices are suppressed,
permission/help/onboarding copy uses Chimera or assistant-neutral wording,
local stats, feedback, statusline, install, insights, output-style, and trust
surfaces use Codex wording, and cloud-only or promo command entry points are
hidden or unavailable in Codex mode
LSP: plugin-provided stdio LSP server handles hover through Codex function_call_output
structured diffs: TypeScript color-diff fallback renders highlighted hunks, wrapped lines, full files, and env kill switch
image attachments: stream-json image block is normalized through sharp fallback and reaches Codex as input_image
native audio: optional local Chimera audio-capture vendor is loaded only when present; public exact-name native packages remain forbidden
docs/opencode-donor-map.md: complete with OpenCode reference commit and license note
```

Known note:

```text
Voice dictation remains disabled by default because its upstream STT path is
Anthropic voice_stream, not ChatGPT Codex OAuth. The recovered native capture
adapter is vetted and covered, but the voice UX should stay behind
CHIMERA_FEATURE_VOICE_NATIVE and VOICE_MODE until a ChatGPT-compatible STT
path is implemented.
```

## Milestone G: Full Local Parity Track

Status: planned. The target is a local-only Chimera experience: no cloud task
delegation, no remote Anthropic services, and no Anthropic model aliases in
product UX. Full parity work is tracked in the local parity plan and its
supporting ledgers.

Evidence:

```text
docs/superpowers/plans/2026-05-01-local-chimera-full-parity.md: plan recorded
docs/stub-inventory.md: 194 missing recovered-module import sites classified
docs/local-parity-matrix.md: local parity target/status/test matrix recorded
```

Next gates:

```text
live ChatGPT/Codex OAuth contract smoke
real OpenAI/Codex model registry with Anthropic aliases rejected
screenshot-level TUI capture and broader visual regression smokes
```

## Milestone H: Local-Only Clean Tree

Status: complete when `bun run smoke:chimera-local-clean` passes.

Evidence:

```text
no cloud-only commands/tools in local product surface
no @ant package fallbacks
no createLocalUnavailableCommand/createLocalUnavailableTool
check:full passes or intentionally excludes deleted cloud trees
OpenAI/Codex model UX remains clean
```
