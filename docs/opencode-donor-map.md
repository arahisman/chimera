# OpenCode Donor Map

OpenCode reference checkout:
`/Users/arahisman/development/opencode`

Reference commit:
`668d77bb4e5955eb56a81b3db13ea1dd74400cc2`

| Area | OpenCode source | Decision |
| --- | --- | --- |
| Codex OAuth | `packages/opencode/src/plugin/codex.ts` | Use as reference; proxy implementation is primary |
| Provider auth schemas | `packages/opencode/src/provider/auth.ts`, `src/auth/index.ts` | Port concepts, not Effect runtime |
| OpenAI provider responses mode | `packages/opencode/src/provider/provider.ts` | Reference for `responses(modelID)` behavior |
| LLM stream abstraction | `packages/opencode/src/session/llm.ts` | Reference only; Claude query loop remains primary |
| System prompt per provider | `packages/opencode/src/session/system.ts` | Reference for Codex prompt, not replacement |
| LSP | `packages/opencode/src/lsp` | Candidate if Claude LSP remains incomplete |
| PTY | `packages/opencode/src/pty` | Candidate if Claude shell PTY breaks |
| MCP OAuth | `packages/opencode/src/mcp` | Candidate for later MCP auth improvement |

## License

OpenCode is MIT. Any copied code must retain attribution in repository notices.
Installed Chimera minified bundle is not a source donor.

## Implementation Review Note

Every implementation PR touching auth/provider/session/tool infrastructure must
state:

```text
Claude source used:
Proxy source used:
OpenCode source used:
Installed Claude oracle used:
```

Use this note to keep provenance explicit. The intended default is to preserve
the recovered Chimera harness, port request/auth mechanics from
`claude-code-proxy`, and consult OpenCode for behavior-level comparison before
copying any implementation.
