# Chimera OpenCode Provider Layer Design

## Goal

Chimera keeps ChatGPT/Codex OAuth as the default first-party runtime, but adds the provider surface from OpenCode as real external provider modes. External providers are selected explicitly, usually as `provider/model`, and may use API keys, cloud credentials, or subscription/OAuth flows when the upstream provider and OpenCode-compatible implementation support them.

## Architecture

The existing Chimera harness remains intact: TUI, tool execution, permissions, session restore, compaction, MCP, plugins, and local workflow behavior continue to speak the current internal message/event contracts.

Provider support is added under a new provider layer:

- `src/services/providers/catalog/*` stores OpenCode-compatible provider and model metadata.
- `src/services/providers/selection/*` parses and resolves model selections such as `gpt-5.5`, `openai/gpt-5.5`, `openrouter/anthropic/claude-sonnet-4.5`, and provider-local model ids.
- Codex OAuth remains the implicit `codex` provider for bare OpenAI model ids.
- External providers start as BYOK/credential/subscription-capable modes and are never silently selected by legacy aliases.

Runtime integration is staged. The first implementation makes catalog, config, validation, model picker, and selection semantics real. The second implementation plugs resolved external providers into the streaming API boundary by adapting AI SDK streams back into Chimera's existing internal stream events, avoiding a rewrite of the main loop.

## Provider Source

OpenCode is used as the reference for provider IDs, env vars, SDK package names, model metadata shape, and provider-specific behavior. We do not import OpenCode's Effect runtime wholesale. Chimera copies/adapts the provider catalog and keeps the code small enough to maintain inside this project.

The provider set should track OpenCode's bundled providers, including OpenAI-compatible gateways, native cloud providers, Anthropic, Google, Azure, Bedrock, Vertex, xAI, Mistral, Groq, Together, Perplexity, OpenRouter, GitHub Copilot, GitLab, Cloudflare, Venice, Alibaba, Cerebras, Cohere, DeepInfra, Vercel, SAP AI Core, NVIDIA, ZenMux, and compatible custom endpoints where OpenCode exposes them.

## UX

The default model picker remains focused on OpenAI/Codex models so a first-time user is not pushed into a provider maze. External models appear when either:

- selected directly with `--model provider/model` or `CHIMERA_MODEL=provider/model`,
- configured in Chimera provider settings,
- or enabled by an environment variable for provider catalog discovery.

Errors should name the provider and credential path clearly. For example: missing `OPENROUTER_API_KEY`, missing AWS region/credentials, or missing Copilot/GitLab subscription auth.

## Testing

Provider selection and validation are covered first, before runtime streaming:

- bare Codex model IDs resolve to `codex`;
- `provider/model` selections preserve provider and model;
- known OpenCode provider IDs are recognized;
- aliases such as `sonnet`, `opus`, and `haiku` are not revived;
- external provider models are accepted by validation without being misrouted to Codex;
- model options can expose configured external models while keeping Codex defaults.

Runtime tests are added in the next layer for stream adaptation, credential errors, and provider-specific transforms.
