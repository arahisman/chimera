# Local Chimera Parity Matrix

Status date: 2026-05-01

This matrix tracks the local-only parity target: preserve the Chimera-style
local harness while replacing Anthropic/private dependencies with local or
OpenAI-backed implementations. Cloud task delegation and remote Anthropic
services are intentionally out of scope.

## Auth

| Field | Value |
| --- | --- |
| Original Chimera behavior | Claude.ai OAuth and Anthropic API/provider credentials feed the Claude request layer. |
| Target Chimera behavior | ChatGPT Pro/Codex OAuth is the default auth path, with tokens stored under Chimera config and never printed in logs. |
| Current status | Mock OAuth, token storage, logout, auth status, missing-auth guidance, refresh-on-401 tests are covered. |
| Blocked by | Live ChatGPT/Codex OAuth contract capture. |
| Test command | `bun run smoke:codex-login && bun run test:codex` |
| Live smoke command | `CHIMERA_LIVE=1 bun run live:codex-contract` |

## Models

| Field | Value |
| --- | --- |
| Original Chimera behavior | Model UX is Claude-family oriented, with Sonnet/Opus/Haiku aliases and access notices. |
| Target Chimera behavior | Model selector, CLI, settings, and tests expose real OpenAI/Codex model IDs only. Anthropic aliases must reject with clear guidance. |
| Current status | Codex model registry is wired into the request translator, CLI model status, model picker, agent model picker, and validation. Anthropic aliases such as `sonnet`, `haiku`, `opus`, and `claude-*` now reject with OpenAI model guidance. |
| Blocked by | Live ChatGPT/Codex OAuth model discovery and observed availability for preview/research models. |
| Test command | `bun run test:codex && bun test src/entrypoints/cli.codex.test.ts src/utils/model/codexModelUx.test.ts` |
| Live smoke command | `CHIMERA_LIVE=1 bun run live:codex-models` |

## Core Tools

| Field | Value |
| --- | --- |
| Original Chimera behavior | Local file, shell, search, notebook, web, todo, skill, agent, MCP, and LSP tools are surfaced through Claude tool calls. |
| Target Chimera behavior | Same local tool behavior is surfaced through OpenAI/Codex function calls and function outputs. |
| Current status | Read, Write, Edit, MultiEdit, Notebook read/edit, Bash, LS, Grep, Glob, WebFetch, WebSearch, TodoWrite, MCP, Agent, LSP, image input, Skill, permission denial/allow rules, and schema failures have focused smokes. WebSearch uses OpenAI Responses `web_search` through ChatGPT/Codex OAuth. |
| Blocked by | Broader hardening for edge cases: stale writes, deny settings, failed WebFetch preflight, MCP resource helpers, custom agents, and long-session tool histories. |
| Test command | `bun run smoke:codex-tool && bun run smoke:codex-daily-cli && bun run smoke:codex-local-tools && bun run smoke:codex-agent && bun run smoke:codex-lsp` |
| Live smoke command | `CHIMERA_LIVE=1 bun run live:codex-tool` |

### Tool Detail Matrix

This table is based on the current local tool registry in `src/tools.ts` and
the Codex smoke scripts under `scripts/`.

| Tool | Registered local surface | Current Codex status | Covered by | Gap / next acceptance |
| --- | --- | --- | --- | --- |
| Read | `FileReadTool` as `Read` when `file-read` is enabled. | Basic function-call round trip, transcript persistence, daily CLI path, schema failure, and `.ipynb` read path are covered. `Read` also claims image/PDF handling through local adapters. | `bun run smoke:codex-tool`, `bun run smoke:codex-daily-cli`, `bun run smoke:codex-local-tools`, `bun run smoke:codex-image` | Add PDF and large-file edge coverage. |
| Write | `FileWriteTool` as `Write` when `file-write` is enabled. | Non-interactive write works with `--permission-mode acceptEdits`, and output is returned through Codex `function_call_output`. | `bun run smoke:codex-daily-cli` | Add stale-file and explicit settings deny coverage. |
| Edit | `FileEditTool` as `Edit` when `file-edit` is enabled. | Single edit after a preceding `Read` is covered, including file mutation and transcript round trip. | `bun run smoke:codex-daily-cli`, structured diff tests | Add old-string-not-found, unexpected-modification, deny, and repeated-edit coverage. |
| MultiEdit | `MultiEditTool` as `MultiEdit` when `file-edit` is enabled. | Multi-hunk ordered edits are registered, require prior `Read`, mutate the file, update read state, and return Codex `function_call_output`. | `bun run smoke:codex-local-tools` | Add unit coverage for missing old_string, replace_all, deny, and stale-file behavior. |
| NotebookRead | No dedicated `NotebookRead` tool is present. `Read` prompt and implementation support `.ipynb` files. | Codex can request notebook cells through `Read`, and the output can seed read-before-edit state. | `bun run smoke:codex-local-tools` | Add PDF/notebook size-limit edge coverage. |
| NotebookEdit | `NotebookEditTool` as `NotebookEdit` when `file-edit` is enabled. | Replace flow is covered after a preceding notebook `Read`, including file mutation and model-visible result. | `bun run smoke:codex-local-tools` | Add insert/delete and permission-denial coverage. |
| Bash | `BashTool` as `Bash` when `bash` is enabled. | Interactive approval, deny in `dontAsk`, allow-once via `--allowed-tools`, allow-always via settings, command output, and transcript round trip are covered. | `bun run smoke:codex-tool`, `bun run smoke:codex-local-tools` | Add read-only auto-allow and classifier-fallback tests. |
| LS | `LSTool` as `LS`/`Ls` when `file-read` is enabled. | Directory listing is a first-class Codex tool surface and returns stable sorted entries. | `bun run smoke:codex-local-tools` | Add ignore-pattern, deny-rule, symlink, and empty-directory coverage. |
| Glob | `GlobTool` as `Glob` when `glob` is enabled and embedded search tools are absent. | Daily CLI path verifies local file discovery and Codex round trip. | `bun run smoke:codex-daily-cli` | Add deny-rule filtering and empty-result coverage. |
| Grep | `GrepTool` as `Grep` when `grep` is enabled and embedded search tools are absent. | Daily CLI path verifies local content search and Codex round trip. | `bun run smoke:codex-daily-cli` | Add multiline, context, head-limit, and no-match coverage. |
| WebFetch | `WebFetchTool` as `WebFetch` when `web-fetch` is enabled. | Local HTTPS fixture works with allowed domain and skipped preflight. | `bun run smoke:codex-daily-cli` | Add denied-domain, failed-preflight, and real preflight coverage. |
| WebSearch | `WebSearchTool` now routes through `src/services/providers/webSearch.ts`. Bare Codex/OpenAI models still use ChatGPT/Codex OAuth and OpenAI Responses `web_search`; external provider selections use provider-native web search where supported: OpenAI API key Responses `web_search`, xAI Responses `web_search`, OpenRouter `openrouter:web_search`, Google Gemini `google_search` grounding, Perplexity Search API, and Anthropic `web_search_20250305`. Unsupported providers fall back to Codex OAuth search instead of shell/curl. | Offline tests verify native request shape and source extraction for Codex fallback, xAI, OpenRouter, Google, Perplexity, and Anthropic. Live OAuth probe against the Codex endpoint succeeded on 2026-05-01 with `gpt-5.4`. | `bun run smoke:codex-web-search`, `bun test src/services/providers/webSearch.test.ts src/services/openai/builtinTools.test.ts src/codex/featurePolicy.test.ts` | Add live BYOK smokes for xAI/OpenRouter/Perplexity/Google, plus rate-limit/no-result coverage and richer citation annotation variants. |
| Computer use | `src/utils/computerUse/codexLoop.ts` implements the OpenAI Responses `computer` loop contract locally: receive `computer_call`, execute actions through a local target, capture/redact screenshot, and return `computer_call_output` with `detail: "original"`. `src/utils/computerUse/browserTarget.ts` provides a real local Chrome DevTools Protocol target with an isolated temp profile. | Unit tests and `smoke:codex-computer-use` verify the protocol, max-turn loop, local approval gate, domain allow/deny gate, authenticated-browser default denial, screenshot redaction hook, CDP action mapping, real headless Chrome screenshot, and a real click mutating DOM. Product UX remains disabled until a user-facing permission flow is wired to the CDP target. | `bun test src/utils/computerUse/browserTarget.test.ts src/utils/computerUse/codexLoop.test.ts`, `bun run smoke:codex-computer-use` | Permission UI integration and live model computer_call smoke. |
| TodoWrite | `TodoWriteTool` as `TodoWrite` when `todo` is enabled. | Daily CLI path verifies todo mutation and Codex round trip. | `bun run smoke:codex-daily-cli` | Add Todo v2 tool coverage if `isTodoV2Enabled()` is enabled. |
| MCP tools | Dynamic `mcp__server__tool` entries are merged by `assembleToolPool`; plugin-provided MCP servers are scoped as dynamic plugin servers. Resource helpers are `ListMcpResourcesTool` and `ReadMcpResourceTool`. | Local stdio MCP tool call is covered. `smoke:codex-plugins` verifies a session-only plugin MCP server loads without marketplace access, receives user config substitution, and roundtrips through a Codex function call. Resource helper tools are registered but not smoked. | `bun run smoke:codex-daily-cli`, `bun run smoke:codex-plugins` | Add list/read resource fixture, denial filtering coverage, and MCP skill indexing. |
| Skill | `SkillTool` as `Skill` when `skills` is enabled; plugin skills can also be slash-invoked through the plugin command loader. | Local skill expansion, Codex product copy, and plugin-contributed slash skill expansion pass. Remote skill search remains outside the local target. | `bun run smoke:codex-experience`, `bun run smoke:codex-plugins` | Verify remote skill surfaces stay hidden/disabled and replace bundled Claude API docs with OpenAI-oriented content. |
| Agent | `AgentTool` as `Agent` plus `TaskOutputTool` and `TaskStopTool` when `agent` is enabled. | Built-in Codex agent identity, sync general-purpose round trip, Explore/Plan availability, custom agent loading, OpenAI model overrides, agent tool restrictions, sidechain transcript markers, and Anthropic alias rejection are covered. | `bun run smoke:codex-agent`, `bun run smoke:codex-multi-agent`, `bun test src/tools/AgentTool/builtInAgents.codex.test.ts` | Add task-output, cancellation, fork/snapshot, and coordinator/cloud exclusion coverage. |
| LSP | `LSPTool` as `LSP` when `lsp` is enabled and `ENABLE_LSP_TOOL` is truthy. | Hover smoke with plugin-provided server passes. `smoke:codex-plugins` also verifies LSP loading from a session-only plugin with user config substitution. | `bun run smoke:codex-lsp`, `bun run smoke:codex-plugins` | Add diagnostics, multi-server, unavailable-server, and startup-race coverage. |
| AskUserQuestion | `AskUserQuestionTool` is always in the base registry. | Permission UI exists; no Codex-specific tool smoke yet. | None | Add interactive prompt smoke or explicitly keep as local TUI-only helper. |
| Plan tools | `EnterPlanModeTool` and `ExitPlanModeV2Tool` are always in the base registry. | Registered; Codex mode does not yet have focused plan-mode smoke. | Partial TUI/session coverage | Add enter/exit plan function-call smoke and product-copy assertions. |
| Worktree tools | `EnterWorktreeTool` and `ExitWorktreeTool` are registered when worktree mode is enabled. | Local feature exists but is not part of the current Codex smoke suite. | None | Add isolated worktree smoke or disable/hide until product policy is decided. |

## Permissions

| Field | Value |
| --- | --- |
| Original Chimera behavior | Protected tools prompt for user approval, support allow/deny settings, and classify risky Bash/tool activity. |
| Target Chimera behavior | Same permission model, with Codex function-call results receiving explicit denial or approval outputs. |
| Current status | Interactive Bash approval, `dontAsk` denial, `--allowed-tools` allow-once, settings allow-always, and model-visible denial output are covered. Several classifier/prompt modules are still stubs. |
| Blocked by | Phase 11 replacement of classifier/prompt stubs and broader security smoke coverage. |
| Test command | `bun run smoke:codex-tool && bun run smoke:codex-local-tools` |
| Live smoke command | None required until local permission smokes are complete. |

## Sessions

| Field | Value |
| --- | --- |
| Original Chimera behavior | Sessions persist to JSONL, resume/continue can restore context, and sidechain records preserve subagent history. |
| Target Chimera behavior | Local Codex sessions preserve the same transcript and resume semantics while translating context back to Codex input. |
| Current status | Seed/resume, transcript persistence, long resumed histories, image input, tool-heavy turns, Agent sidechain, manual `/compact`, post-compact tool continuation, and compact/context module resolution are covered. |
| Blocked by | Broader fork/rewind coverage and future optional context-collapse/snip feature decisions. |
| Test command | `bun run smoke:codex-session-cli && bun run smoke:codex-long-session && bun run smoke:codex-compact-modules` |
| Live smoke command | `CHIMERA_LIVE=1 bun run live:codex-turn` |

## Compaction

| Field | Value |
| --- | --- |
| Original Chimera behavior | `/compact`, auto-compact, snip projection, and context collapse reduce history while preserving enough context to continue. |
| Target Chimera behavior | Local-only compaction must not call Anthropic private compact endpoints and must survive resume/tool continuations. |
| Current status | Headless empty-history `/compact` diagnostic and a non-empty long-session `/compact` followed by resume/tool continuation are covered. Phase 4 compact/context recovered stubs now resolve to explicit local source: cache-editing, reactive compact, context-collapse, snip, context inspect, and session-transcript paths are safe disabled/no-op adapters unless a later phase implements them fully. |
| Blocked by | Optional full local context-collapse/snip behavior if we decide to expose those experimental systems. |
| Test command | `bun run smoke:codex-session-cli && bun run smoke:codex-long-session && bun run smoke:codex-compact-modules` |
| Live smoke command | Future long-session live smoke after live Codex contract capture. |

## Agents

| Field | Value |
| --- | --- |
| Original Chimera behavior | Built-in and custom subagents run sidechain sessions with agent-specific prompts, tools, and transcript records. |
| Target Chimera behavior | Local subagents use Codex upstream, real OpenAI model IDs, and no cloud worker/coordinator services. |
| Current status | Built-in prompts use Codex identity, Explore/Plan are enabled directly in Codex mode, Agent tool model overrides expose real OpenAI IDs, custom agents can pin OpenAI models and restrict tools, nested Agent use is bounded by the local tool filter, Anthropic aliases are rejected before a child request launches, and coordinator worker mode is disabled by Codex feature policy. Fork/snapshot paths remain incomplete. |
| Blocked by | Fork/snapshot decisions and optional future local coordinator design. |
| Test command | `bun run smoke:codex-agent && bun run smoke:codex-multi-agent && bun test src/tools/AgentTool/builtInAgents.codex.test.ts` |
| Live smoke command | Future live agent smoke after model registry is fixed. |

## Skills

| Field | Value |
| --- | --- |
| Original Chimera behavior | Local and remote skill search can discover skills; bundled skills include Claude API-oriented content. |
| Target Chimera behavior | Local skills and plugin-provided skills work without remote Anthropic skill search; bundled content is Codex/OpenAI-oriented or hidden. |
| Current status | Local skill listing, `/skill` expansion, and plugin-contributed slash skill expansion are covered. Remote skill search and bundled Claude API docs are stubs. |
| Blocked by | OpenAI-oriented bundled skill replacement. |
| Test command | `bun run smoke:codex-experience && bun run smoke:codex-plugins` |
| Live smoke command | None required for local skill resolution. |

## MCP

| Field | Value |
| --- | --- |
| Original Chimera behavior | MCP servers provide tools and skills, with plugin and connection-management UI. |
| Target Chimera behavior | Local MCP tools and plugin-provided MCP skills work through Codex function calls. |
| Current status | Local stdio MCP tool smoke passes; plugin-provided MCP tool smoke passes with user config substitution. MCP skill helper modules are stubs. |
| Blocked by | Local MCP skill indexing. |
| Test command | `bun run smoke:codex-daily-cli && bun run smoke:codex-plugins` |
| Live smoke command | Future live tool smoke with MCP server. |

## LSP

| Field | Value |
| --- | --- |
| Original Chimera behavior | Plugins can provide LSP servers; LSP hover/diagnostics can be exposed to the model. |
| Target Chimera behavior | Local plugin-provided LSP works under Codex with the same tool contract. |
| Current status | LSP hover smoke passes; early availability race was fixed. Session-only plugin LSP loading and user config substitution are also covered. |
| Blocked by | Broader LSP coverage for diagnostics, multiple servers, and unavailable-server handling. |
| Test command | `bun run smoke:codex-lsp && bun run smoke:codex-plugins` |
| Live smoke command | Not required until live tool coverage expands beyond basic Read/Bash. |

## Hooks

| Field | Value |
| --- | --- |
| Original Chimera behavior | Hook lifecycle events can run before/after tools and around sessions/subagents. |
| Target Chimera behavior | Hooks run locally with Chimera identity and see local session/tool context. |
| Current status | `smoke:codex-hooks` verifies SessionStart, PreToolUse, PostToolUse, Notification, Stop, and SubagentStop command hooks with Codex provider env, OpenAI model id, local cwd, and local transcript paths. Attribution hook stubs are intentionally disabled. |
| Blocked by | Broader hook coverage for HTTP, prompt, agent, async, permission, and interactive UI-triggered notification paths. |
| Test command | `bun run smoke:codex-hooks` |
| Live smoke command | None required; hooks are local. |

## Settings

| Field | Value |
| --- | --- |
| Original Chimera behavior | Settings control models, tools, hooks, plugins, output styles, permissions, voice, and UI preferences. |
| Target Chimera behavior | Settings expose only local Chimera features and real OpenAI model IDs; cloud/remote settings are hidden or rejected. |
| Current status | Output styles, Codex identity settings paths, OpenAI model picker copy, voice-unavailable copy, local stats/feedback/statusline/install/insights command descriptions, trust dialog copy, and cloud/promo command hiding are covered. Broader config settings cleanup remains. |
| Blocked by | Phase 2 model registry and Phase 6/10 product copy/settings cleanup. |
| Test command | `bun run smoke:codex-experience && bun run test:codex` |
| Live smoke command | Future model live smoke. |

## TUI

| Field | Value |
| --- | --- |
| Original Chimera behavior | Ink UI renders welcome, messages, diffs, permission prompts, model/config/resume pickers, progress, and errors. |
| Target Chimera behavior | Same local interaction feel, with Codex/OpenAI wording and no disabled cloud features in default UI. |
| Current status | Interactive prompt submit, Codex-branded welcome output, OpenAI-only model picker entries, Bash permission dialog, Edit structured diff preview/acceptance, missing-auth and rate-limit error views, resume picker with local sessions, config panel search hiding cloud/Chrome settings, permission/help/onboarding/trust/output-style copy, hidden cloud-only and promo command entry points, image input, and output styles are covered. Screenshot/image capture and broader visual regression coverage remain open. |
| Blocked by | Phase 6 optional screenshot smoke plus final product-copy audit. |
| Test command | `bun run smoke:codex-tui && bun run smoke:codex-tool && bun run smoke:codex-experience && bun run smoke:codex-image` |
| Live smoke command | Future live turn/tool smokes after TUI smoke exists. |

## Native Adapters

| Field | Value |
| --- | --- |
| Original Chimera behavior | Uses private native/vendor modules for diffing, image handling, audio capture, tree-sitter, modifier keys, URL handling, and ripgrep. |
| Target Chimera behavior | Uses distributable local implementations or optional vetted local vendor adapters, never random exact-name private npm packages. |
| Current status | Native adapter matrix is recorded. Color diff, image processing, image paste command fallbacks, ripgrep fallback, pure-TypeScript bash parsing, optional audio vendor loading, modifier no-op behavior, and deeplink URL-launch disable behavior are covered by source-policy/unit tests. |
| Blocked by | Platform integration smokes for clipboard/image paste, optional future native modifier polling, and optional deeplink registration UX. |
| Test command | `bun test src/services/native src/tools/BashTool/bashPermissions.codex.test.ts src/utils/imagePaste.codex.test.ts src/native-ts/color-diff/colorDiff.codex.test.ts && bun run smoke:codex-image` |
| Live smoke command | None required except voice if enabled. |

### Native Adapter Detail

| Adapter | Implementation | Test / evidence | Remaining gap |
| --- | --- | --- | --- |
| Color diff | `src/native-ts/color-diff/index.ts` TypeScript port using `diff` and lazy `highlight.js`; `src/components/StructuredDiff/colorDiff.ts` routes to it. | `bun test src/native-ts/color-diff/colorDiff.codex.test.ts`; `nativeAdapters.test.ts` asserts no `color-diff-napi` dependency. | Visual parity is good enough for structured diff smoke; no native dependency required. |
| Image processor | `sharp` direct import in `src/tools/FileReadTool/imageProcessor.ts`, replacing private `image-processor-napi`. | `nativeAdapters.test.ts`; `bun run smoke:codex-image`. | Broader PDF/large-image edge cases remain under core tool coverage. |
| Image paste | Shell command fallbacks in `src/utils/imagePaste.ts`: macOS `osascript`, Linux `wl-paste` on Wayland, Linux `xclip` on X11, Windows PowerShell, with Sharp BMP-to-PNG conversion. Missing command paths return a clear diagnostic and `null`. | `nativeAdapters.test.ts` source-policy assertions; `imagePaste.codex.test.ts` mocks platform command availability across macOS, Wayland, X11, Windows, and headless/no-clipboard cases. | Real platform clipboard smoke coverage remains optional/manual. |
| Ripgrep | `src/utils/ripgrep.ts` prefers system `rg` when requested/available, embedded Bun `argv0=rg` in bundled mode, and `dist/vendor/ripgrep` otherwise. | `nativeAdapters.test.ts` source-policy assertions; local tool smokes exercise `Glob`/`Grep`. | Clean temp package install should verify bundled binary placement. |
| Tree-sitter bash | Private/native dependency is replaced by pure TypeScript `src/utils/bash/bashParser.ts`, consumed by `src/utils/bash/parser.ts` and security walkers. Local builds enable `TREE_SITTER_BASH` through `src/build-shims/bun-bundle.ts`. | `nativeAdapters.test.ts` asserts parser routing and no `tree-sitter-bash` import; `bashPermissions.codex.test.ts` verifies parser extraction for permission-relevant compound commands. Existing Bash/tool smokes cover permission flow. | Broader Bash classifier fuzz/regression corpus remains useful in Phase 11. |
| Audio capture | Optional local Chimera vendor loader in `src/services/native/audioCapture.ts`; absent/invalid native returns `null`, and voice remains disabled by default. | `nativeAdapters.test.ts` covers path resolution, absent/invalid module, and optional vendor shape. | Phase 8 must decide OpenAI-compatible STT before enabling voice. |
| Modifier keys | `src/utils/modifiers.ts` is an explicit no-op returning false, avoiding dependency-confusion-prone public native packages. | `nativeAdapters.test.ts` asserts `return false` and no `modifiers-napi`. | Implement only if a vetted local adapter is needed for UX. |
| Deeplink URL handler | `src/utils/deepLink/protocolHandler.ts` handles parsed URI launch paths but does not load private `url-handler-napi`; macOS bundle URL launch returns `null` until a vetted adapter exists. | `nativeAdapters.test.ts` asserts disabled native hook and no `url-handler-napi`. | Optional registration/launch smoke if deeplink UX becomes in scope. |

## Voice

| Field | Value |
| --- | --- |
| Original Chimera behavior | Push-to-talk captures local audio and sends it to Anthropic `voice_stream` STT. |
| Target Chimera behavior | Push-to-talk works under ChatGPT/Codex OAuth through OpenAI Realtime transcription with live interim previews and final prompt insertion. |
| Current status | Native capture adapter is vetted as optional. After `chimera login`, `bun run live:codex-voice` verifies REST `/v1/audio/transcriptions` and Realtime transcription with ChatGPT/Codex OAuth plus `ChatGPT-Account-Id`. `src/services/openai/realtimeTranscription.ts` now uses Realtime by default, resamples captured 16 kHz mono PCM to 24 kHz mono PCM, streams `input_audio_buffer.append`, commits on release, maps transcription `delta` events to interim UI text, maps `completed` to final prompt insertion, and keeps the REST WAV transcription path as a fallback/test path. Local builds enable `VOICE_MODE`; availability is gated by the Codex auth file. |
| Blocked by | No known local-code blocker for transcription parity. A manual real-speech UI smoke is still useful because the sanitized live probe sends silence and therefore only verifies Realtime session/update/audio commit, not actual spoken `delta` text. |
| Test command | `bun test src/services/openai/realtimeTranscription.test.ts src/services/native/nativeAdapters.test.ts` |
| Live smoke command | `bun run live:codex-voice` |

## Provider-Native Built-In Capabilities

| Capability | Current status | Native providers | Fallback / gap |
| --- | --- | --- | --- |
| Web search | Provider-native router implemented in `src/services/providers/webSearch.ts`; the user-facing tool remains one `WebSearch` surface. | Codex/OpenAI OAuth, OpenAI API key, xAI, OpenRouter, Google Gemini, Perplexity, Anthropic. | Providers without a documented native search path fall back to Codex OAuth search. Mistral has a native Agents/Conversations web search path, but it requires a separate agent/conversation lifecycle and is not wired yet. |
| Computer use | Still implemented through the OpenAI Responses `computer` loop in `src/utils/computerUse/codexLoop.ts`. | Codex/OpenAI. | No general provider-native abstraction yet; most OpenCode text providers do not expose a compatible local computer-control protocol. |
| Voice transcription | Still implemented through OpenAI transcription/Realtimes APIs in `src/services/openai/realtimeTranscription.ts`. | Codex/OpenAI. | Provider-native STT is not part of the text provider catalog yet; add only if we wire explicit audio/STT providers. |

## Plugins

| Field | Value |
| --- | --- |
| Original Chimera behavior | Plugins can contribute commands, skills, MCP servers, LSP servers, and config. |
| Target Chimera behavior | Local plugin loading works without cloud marketplace dependencies. |
| Current status | Session-only plugin smoke verifies command, skill, MCP server, LSP server, user config option substitution, local transcripts, and no cloud marketplace dependency. |
| Blocked by | Hook smoke and packaging install smoke. |
| Test command | `bun run smoke:codex-plugins` |
| Live smoke command | None required unless plugin tools participate in live tool smoke. |

## Packaging

| Field | Value |
| --- | --- |
| Original Chimera behavior | Distributed package includes official Chimera assets and vendor binaries. |
| Target Chimera behavior | `chimera` installs cleanly from a package or standalone build using only distributable assets and optional local vendors. |
| Current status | Local build works; package policy and clean temp install smoke are not done. |
| Blocked by | Phase 12 distribution asset policy and package smoke. |
| Test command | `bun run build && bun dist/chimera.js --version && bun dist/chimera.js --help` |
| Live smoke command | None required for packaging itself. |

## Cloud/Remote Exclusions

| Field | Value |
| --- | --- |
| Original Chimera behavior | Includes remote bridge, cloud sessions, background/proactive services, server/daemon paths, and cloud task delegation. |
| Target Chimera behavior | These features are not part of the local product and must not appear as working default UX. |
| Current status | Feature policy disables many cloud/remote paths, WebSearch is backed by OpenAI Responses instead of Anthropic cloud search, and stub inventory classifies remote bridge/cross-session modules as `remove-cloud`. |
| Blocked by | Help/UI smoke proving disabled features stay hidden or explicit unsupported states. |
| Test command | `bun run build && bun dist/chimera.js --help` |
| Live smoke command | None. |
