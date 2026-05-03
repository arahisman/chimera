# Chimera

> A terminal-first coding agent with ChatGPT/Codex OAuth, OpenAI models, and OpenCode-style provider freedom.

Chimera is an agentic coding harness for people who want the polished local CLI workflow of a serious coding agent without being locked into one model provider. It keeps the parts that matter in day-to-day engineering: a fast terminal UI, project memory, permissioned file edits, shell access, git workflows, subagents, MCP, plugins, hooks, web search, image input, voice transcription, and resumable sessions.

Chimera uses ChatGPT/Codex OAuth as the first-party default, supports real OpenAI model IDs such as `gpt-5.5`, and can also run external provider models with `provider/model` selectors.

## Status

Chimera is alpha software. It is ready for local dogfooding and controlled testing, but the package is not yet a broad stable public release.

The current build is local-first:

- no cloud task delegation;
- no remote managed sessions;
- no implicit legacy model aliases;
- no hidden provider routing.

## Install

### From Source

```bash
# from a Chimera repository checkout
bun install
bun run build
./dist/chimera.js
```

### Package Build

When publishing is enabled, the package exposes the `chimera` binary:

```bash
npm install -g chimera-code
chimera
```

For local package verification:

```bash
bun run smoke:codex-package
```

## Quick Start

Sign in with ChatGPT/Codex:

```bash
chimera login
```

Start an interactive session:

```bash
chimera
```

Ask for a one-shot answer:

```bash
chimera -p "summarize this repository"
```

Pick a model:

```bash
chimera --model gpt-5.5
chimera --model gpt-5.4-mini
chimera model gpt-5.5
```

Resume work:

```bash
chimera --continue
chimera --resume
```

## Why Chimera

- **Terminal-native workflow**: interactive TUI, streaming output, keyboard-driven approvals, diffs, and session restore.
- **ChatGPT subscription path**: use Codex OAuth instead of managing an OpenAI API key for the default flow.
- **Provider freedom**: configure external providers and select models as `provider/model`.
- **Local tool execution**: file reads/writes, structured edits, Bash, grep/glob, notebooks, todo lists, git helpers, and browser/computer-use adapters.
- **Agent workflows**: built-in agents, custom agents, subagents, task continuation, and project-specific instructions.
- **MCP and plugins**: load local MCP servers, plugin commands, plugin skills, LSP servers, and repository marketplaces.
- **Provider-native web search**: web research uses the current provider's native search tool where supported, with a Codex/OpenAI fallback.
- **Explicit permissions**: choose whether tools ask, auto-accept edits, run in plan mode, or act autonomously.

## Model Providers

Chimera defaults to ChatGPT/Codex OAuth and OpenAI/Codex models. Bare model IDs such as `gpt-5.5` are treated as first-party Codex models.

External providers use explicit selectors:

```bash
chimera providers
chimera providers configure openrouter --api-key "$OPENROUTER_API_KEY"
chimera --model openrouter/openai/gpt-5.5

chimera login xai --api-key "$XAI_API_KEY"
chimera --model xai/grok-4.3
```

The provider catalog currently includes more than 100 OpenCode-compatible providers, including OpenAI API keys, OpenRouter, xAI, Google, Perplexity, Groq, Mistral, DeepSeek, Cerebras, Together, GitHub Models, GitLab Duo, Bedrock, Vertex, Azure, local LM Studio, and many OpenAI-compatible gateways.

Model aliases such as `sonnet`, `opus`, and `haiku` are intentionally not routed. Use real provider/model IDs.

## Web Search

The user-facing tool is always `WebSearch`, but Chimera routes execution by the active model:

| Model selector | Search backend |
| --- | --- |
| `gpt-*` | Codex/ChatGPT OAuth + OpenAI Responses `web_search` |
| `openai/*` | OpenAI API-key Responses `web_search` |
| `xai/*` | xAI Responses `web_search` |
| `openrouter/*` | OpenRouter `openrouter:web_search` |
| `google/*` | Gemini `google_search` grounding |
| `perplexity/*` | Perplexity Search API |
| `anthropic/*` | Anthropic-compatible web search API |
| unsupported provider | Codex/OpenAI fallback |

This keeps search results model-readable and citation-friendly, and avoids falling back to `curl` when a real provider search tool is available.

## Project Memory

Chimera reads project instructions from:

- `AGENTS.md`
- `CLAUDE.md`
- `.chimera/CLAUDE.md`
- `.chimera/rules/*.md`

`AGENTS.md` is the preferred file for new projects. `CLAUDE.md` compatibility is kept so existing repositories do not lose their instruction files.

Initialize a project memory file:

```bash
chimera
/init
```

## Permissions

Chimera's tools are powerful, so permissions are explicit.

Common modes:

| Mode | Behavior |
| --- | --- |
| `default` | Ask before sensitive tools. |
| `acceptEdits` | Auto-accept file edits, keep other gates. |
| `dontAsk` | Approve permission prompts automatically unless explicitly denied by rules. |
| `plan` | Explore and plan without executing write actions. |
| `bypassPermissions` | Skip permission checks; only use in disposable sandboxes. |

Examples:

```bash
chimera --permission-mode plan
chimera --permission-mode acceptEdits
chimera --permission-mode dontAsk
chimera --allowed-tools "Read Grep Bash(git:*)"
```

## Tools

Chimera exposes a local tool surface designed for real engineering work:

- file system: `Read`, `Write`, `Edit`, `MultiEdit`, `LS`;
- search: `Grep`, `Glob`, `WebSearch`, `WebFetch`;
- execution: `Bash`, notebooks, git-oriented commands;
- workflow: `TodoWrite`, `/compact`, `/resume`, `/rewind`, `/diff`;
- agents: built-in agents, custom `.chimera/agents`, and subagents;
- integrations: MCP, plugins, skills, LSP, hooks, image input, voice transcription.

Use `/help` inside the TUI or `chimera --help` for the full command surface.

## MCP, Plugins, and Skills

Chimera can load local MCP servers and plugin bundles. Project-local plugin metadata uses `.chimera-plugin/`.

Useful commands:

```bash
chimera mcp
chimera plugins
chimera plugins install <plugin>
chimera agents
chimera hooks
```

Project settings live in `.chimera/settings.json`, with personal overrides in `.chimera/settings.local.json`.

## Configuration

Chimera uses Chimera-specific config paths.

Common locations:

| Scope | Path |
| --- | --- |
| User settings | `~/.config/chimera/settings.json` |
| Global config | `~/.config/chimera/.chimera.json` |
| Project settings | `.chimera/settings.json` |
| Local project overrides | `.chimera/settings.local.json` |
| Project agents | `.chimera/agents/` |
| Project skills | `.chimera/skills/` |
| Project rules | `.chimera/rules/` |

Override config discovery with:

```bash
CHIMERA_CONFIG_DIR=/path/to/config chimera
CHIMERA_CONFIG_HOME=/path/to/xdg-root chimera
```

## Development

Install dependencies and build:

```bash
bun install
bun run build
```

Core checks:

```bash
bun run check:core
bun run check:full
bun run test:codex
```

Release-gate smoke suite:

```bash
bun run smoke:chimera-local-clean
```

Focused smokes:

```bash
bun run smoke:codex-login
bun run smoke:codex-tool
bun run smoke:codex-agent
bun run smoke:codex-plugins
bun run smoke:codex-web-search
bun run smoke:codex-package
```

Live ChatGPT/Codex probes are opt-in:

```bash
CHIMERA_LIVE=1 bun run live:codex-turn
CHIMERA_LIVE=1 bun run live:codex-tool
CHIMERA_LIVE=1 bun run live:codex-voice
```

## Current Limits

Chimera deliberately keeps the local product surface narrow:

- cloud task delegation is out of scope;
- remote/mobile/web session control is out of scope;
- provider-native computer use is not generalized yet;
- provider-native speech-to-text is not generalized yet;
- some legacy internal protocol names remain implementation details while the local harness is being cleaned up.

See [docs/local-parity-matrix.md](docs/local-parity-matrix.md) for the detailed parity and cleanup status.

## FAQ

### Is Chimera tied to one provider?

No. ChatGPT/Codex OAuth is the default path, but external providers can be configured with API keys, cloud credentials, local endpoints, or subscription-style auth where the provider supports it.

### Can I use an OpenAI API key instead of ChatGPT login?

Yes. Configure OpenAI as an external provider and select an explicit provider model:

```bash
chimera login openai --api-key "$OPENAI_API_KEY"
chimera --model openai/gpt-5.5
```

### Does Chimera support project instruction files?

Yes. Use `AGENTS.md` for new projects. Existing `CLAUDE.md` files are still read for compatibility.

### Is `dontAsk` safe?

`dontAsk` means "do not interrupt me with permission prompts." It still respects explicit deny rules. Use it when you trust the workspace and want autonomous execution.

### Is Chimera affiliated with OpenAI or OpenCode?

No. Chimera is an independent local CLI project. It integrates with OpenAI/Codex APIs and uses OpenCode-compatible provider ideas, but it is not an official OpenAI or OpenCode product.
