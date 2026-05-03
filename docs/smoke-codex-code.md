# Chimera Smoke Harness

Mock smoke:

```bash
bun run smoke:codex
```

This builds `dist/chimera.js`, starts a local mock Codex SSE endpoint, writes
a temporary fake Codex auth store, and verifies both text and tool-call stream
translation. It does not call ChatGPT.

Mock login smoke:

```bash
bun run smoke:codex-login
```

This builds `dist/chimera.js`, starts a local OAuth issuer, runs
`chimera login`, `chimera login --device`, `chimera auth status
--json`, and `chimera logout` with temporary config directories. It verifies
that Codex tokens are written with `0600` permissions and removed by logout. It
does not call ChatGPT.

Mock one-turn smoke:

```bash
bun run smoke:codex-turn
```

This builds `dist/chimera.js`, starts a local Codex SSE endpoint, runs one
headless `chimera -p` turn and one interactive REPL turn through `expect`,
then verifies prompt delivery, rendered text, and transcript JSONL persistence.
It does not call ChatGPT.

Mock tool-turn smoke:

```bash
bun run smoke:codex-tool
```

This builds `dist/chimera.js`, starts a local Codex SSE endpoint, then
verifies a headless `Read` round trip and an interactive `Bash` permission
round trip through `expect`. It checks that Codex `function_call` events become
Claude tool uses, tool execution results are sent back as
`function_call_output`, the assistant completes after the tool, and transcript
JSONL contains the prompt, tool use, tool result, and final assistant response.
It does not call ChatGPT.

Mock daily CLI smoke:

```bash
bun run smoke:codex-daily-cli
```

This builds `dist/chimera.js`, starts a local mock Codex SSE endpoint, a
local HTTPS WebFetch target, and a local stdio MCP server, then verifies the
daily tool surface through the real CLI: `Read`, `Write`, `Edit`, `Glob`,
`Grep`, `TodoWrite`, `WebFetch`, and an `mcp__...` tool. It checks real
filesystem side effects, WebFetch summarization round trips, MCP tool output,
Codex `function_call_output`, and transcript JSONL persistence. It does not
call ChatGPT.

Mock session/slash/error smoke:

```bash
bun run smoke:codex-session-cli
```

This builds `dist/chimera.js`, starts a local mock Codex SSE endpoint, seeds
a real headless session, resumes it with `--resume`, and verifies that resumed
Codex requests include pre-resume context and that JSONL transcripts contain
both turns. It also checks a headless `/compact` local-command diagnostic via
verbose stream-json output, the `--model haiku` alias mapping to
`gpt-5.4-mini`, missing-auth login guidance, and streamed Codex rate-limit
errors. It does not call ChatGPT. The smoke intentionally keeps these checks in
headless CLI mode; interactive TTY submission and permission flows are covered
by the existing turn/tool smokes.

Mock experience smoke:

```bash
bun run smoke:codex-experience
```

This builds `dist/chimera.js`, starts a local mock Codex SSE endpoint, and
verifies high-level Chimera experience plumbing through the real CLI. It
creates a temporary project output style and local `SKILL.md`, checks that the
Codex request contains the selected output-style section and Skill-tool listing,
then invokes `/codex-review ...` headlessly and verifies that the skill body and
arguments are expanded into the Codex request. It does not call ChatGPT.

Mock Agent/subagent smoke:

```bash
bun run smoke:codex-agent
```

This builds `dist/chimera.js`, starts a local mock Codex SSE endpoint, and
verifies that a parent Codex turn can call the `Agent` tool, launch the
built-in `general-purpose` subagent as a separate Codex request, receive the
subagent response, send it back to the parent as `function_call_output`, and
persist the parent and subagent markers in transcript JSONL. It does not call
ChatGPT.

Mock multi-agent smoke:

```bash
bun run smoke:codex-multi-agent
```

This extends the Agent coverage across `general-purpose`, `Explore`, `Plan`,
and a custom settings-provided agent. It verifies OpenAI model override
selection, custom agent model pinning to `gpt-5.4-mini`, agent-specific tool
restrictions, nested `Agent` removal from subagent tool lists, local-only Agent
tool schema, and rejection of Anthropic aliases such as `sonnet` before a child
Codex request is launched. It does not call ChatGPT.

Mock TUI smoke:

```bash
bun run smoke:codex-tui
```

This builds `dist/chimera.js`, starts a local mock Codex SSE endpoint, and
drives the real interactive TUI through `expect`. It verifies Codex-branded
welcome output, OpenAI-only model picker entries, absence of Claude model names
in the model selector, Bash permission approval UI, and Edit structured diff
preview/acceptance. It writes temporary text terminal snapshots during the run
and removes/overwrites them on the next run. It does not call ChatGPT.

Mock LSP smoke:

```bash
bun run smoke:codex-lsp
```

This builds `dist/chimera.js`, starts a local mock Codex SSE endpoint,
creates a temporary inline plugin that provides a stdio LSP server, and verifies
that a Codex `function_call` can execute `LSP.hover`, receive the fake server's
hover result, send it back as `function_call_output`, and persist the result in
transcript JSONL. It does not call ChatGPT.

Mock expanded local tool smoke:

```bash
bun run smoke:codex-local-tools
```

This builds `dist/chimera.js`, starts a local mock Codex SSE endpoint, and
verifies the expanded local tool matrix: `MultiEdit`, notebook `Read` plus
`NotebookEdit`, `LS`, explicit unavailable `WebSearch`, Bash permission deny,
allow-once and allow-always paths, and tool schema validation failure. It does
not call ChatGPT.

Mock image attachment smoke:

```bash
bun run smoke:codex-image
```

This builds `dist/chimera.js`, starts a local mock Codex SSE endpoint, sends
an SDK-style `stream-json` user message containing an image content block, and
verifies that the non-native image processing path normalizes it into a Codex
`input_image` data URL while preserving the prompt and final response in
transcript JSONL. It does not call ChatGPT.

Mock long-session stress smoke:

```bash
bun run smoke:codex-long-session
```

This builds `dist/chimera.js`, starts a local mock Codex SSE endpoint, and
drives one session through 20 resumed turns, a `Read` tool call, a stream-json
image turn, a synchronous `Agent` sidechain, `/compact`, and another `Read`
tool call after post-compact resume. It verifies transcript persistence and
that compacted summary context reaches the resumed request. It does not call
ChatGPT.

Mock compact/context module smoke:

```bash
bun run smoke:codex-compact-modules
```

This runs the build and fails if Phase 4 compact/context modules are still
resolved through recovered-module stubs. It covers cache-editing, reactive
compact, context-collapse, history snip, context inspect, and
session-transcript paths. It does not call ChatGPT.

Manual CLI smoke:

```bash
bun run build
bun dist/chimera.js --version
bun dist/chimera.js --help
```

Live ChatGPT/Codex smoke is opt-in only:

```bash
CHIMERA_LIVE=1 bun dist/chimera.js
```

Expected live behavior:

```text
If authenticated: REPL opens and can answer one simple prompt.
If unauthenticated: login UI appears.
```
