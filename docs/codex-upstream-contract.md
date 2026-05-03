# Codex Upstream Contract

Status date: 2026-05-01

This document records the live ChatGPT/Codex OAuth contract as observed by
opt-in live smokes. It must not contain bearer tokens, refresh tokens, account
emails, or full opaque response IDs.

## Live Smoke

Run only after logging in:

```bash
chimera login
CHIMERA_LIVE=1 bun run live:codex-contract
CHIMERA_LIVE_MODEL=gpt-5.4-mini bun run live:codex-turn
CHIMERA_LIVE_MODEL=gpt-5.4-mini bun run live:codex-tool
```

The smoke writes a sanitized trace to:

```text
/tmp/chimera-live-contract.json
/tmp/chimera-live-tool.json
```

The trace intentionally records only:

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
http_status
error_type
```

## Live Model Discovery

Run only after logging in:

```bash
chimera login
CHIMERA_LIVE=1 bun run live:codex-models
```

The discovery smoke probes the static registry, including preview models, plus
optional comma-separated `CHIMERA_LIVE_MODEL_IDS`. It writes only sanitized
model availability metadata to:

```text
/tmp/chimera-live-models.json
```

Each result is classified as one of:

```text
available
unavailable
requires_plan
preview
unknown
```

The probe never stores tokens, account IDs, emails, prompts beyond the fixed
probe phrase, or raw upstream error bodies.

## Current Assumptions

| Area | Current value |
| --- | --- |
| Primary endpoint | `https://chatgpt.com/backend-api/codex/responses` |
| OAuth issuer | `https://auth.openai.com` |
| Originator header | `chimera` |
| Stream accept header | `text/event-stream` |
| Default live contract model | `gpt-5.4-mini`, overridable with `CHIMERA_LIVE_MODEL` |
| Store mode | `store: false` |
| Live gate | `CHIMERA_LIVE=1` is required |

## Sanitized Trace Fields

Successful live runs update the observed contract section below using only these
safe fields:

```text
required request header names:
allowed models observed:
SSE event names observed:
output item types observed:
response id prefix shape:
rate-limit headers observed:
401 refresh behavior:
tool call item shape:
tool result item shape:
image item shape:
reasoning field support:
error/rate-limit schema:
unknowns:
```

## Safety Rules

- Never commit `/tmp/chimera-live-contract.json`.
- Never commit `/tmp/chimera-live-models.json`.
- Never commit `/tmp/chimera-live-tool.json`.
- Never paste full bearer tokens, refresh tokens, ID tokens, or account IDs.
- Keep only header names, model IDs, event type names, and short response ID
  prefixes.
- If an upstream error body includes sensitive data, summarize it manually
  instead of copying it.

## Observed Contract On 2026-05-01

Observed against ChatGPT/Codex OAuth after `chimera login`, using
`gpt-5.4-mini` for the live contract, turn, and tool smokes.

| Area | Observed value |
| --- | --- |
| Required request header names | `accept`, `authorization`, `chatgpt-account-id`, `content-type`, `openai-beta`, `originator`, `session_id`, `user-agent`, `x-client-request-id`, `x-codex-window-id` |
| Auth endpoint assumptions | OAuth refresh uses `https://auth.openai.com/oauth/token` with `grant_type=refresh_token` and the Codex client ID. |
| Token refresh behavior | `postCodexResponses` refreshes before expiry and retries once after a `401`. The 2026-05-01 contract run did not need refresh. |
| Allowed models observed | `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`; `gpt-5.3-codex-spark` responded as preview; `gpt-5.4-nano` returned `400` in discovery. |
| SSE event names observed | `response.created`, `response.in_progress`, `response.output_item.added`, `response.content_part.added`, `response.output_text.delta`, `response.output_text.done`, `response.content_part.done`, `response.function_call_arguments.delta`, `response.function_call_arguments.done`, `response.output_item.done`, `response.completed` |
| Output item types observed | `message`, `function_call`, `reasoning` |
| Response ID prefix shape | `resp_` followed by opaque characters; traces store only short prefixes. |
| Rate-limit headers observed | No rate-limit headers were present on the successful `200` contract run. |
| Tool call item shape | Upstream streams `response.output_item.added` with `item.type=function_call`, `call_id`, and `name`; arguments arrive via `response.function_call_arguments.delta`/`done`; final call is repeated in `response.output_item.done`. |
| Tool result item shape | Client sends `{type:"function_call_output", call_id, output}` in the next Responses input. The live tool smoke confirmed assistant completion after that result. |
| Image item shape | Client sends `{type:"input_image", image_url}`; `image_url` can be a URL or data URL. Live image upstream behavior is covered by the image smoke, not the 2026-05-01 contract trace. |
| Reasoning field support | `reasoning: {effort}` plus `include: ["reasoning.encrypted_content"]` is supported by translation. Live discovery observed `reasoning` output items on `gpt-5.5` and `gpt-5.3-codex-spark`. |
| Error/rate-limit schema | HTTP failures map to `authentication_error`, `rate_limit_error`, `invalid_request_error`, or `api_error`; `retry-after` is preserved when present. Streamed `codex.rate_limits`, `response.failed`, `response.error`, and `error` events are handled by the reducer. |
| Unknowns | Exact upstream rate-limit header set, spoken-audio realtime voice deltas, file-search contract, and image-specific SSE deltas still need dedicated live traces. |
