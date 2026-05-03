# Recovered Module Stub Inventory

Status date: 2026-05-01

Source command:

```bash
bun run build 2>&1 | tee /tmp/chimera-build.log
```

The build currently reports 194 missing recovered-module import sites across 167 unique module specifiers. This file classifies each unique specifier so the local-only Chimera parity work can replace, hide, or remove it intentionally.

## Classification Vocabulary

- `replace-local`: implement a local equivalent that preserves the Chimera harness behavior.
- `replace-openai`: implement an OpenAI-backed equivalent, or prove the OpenAI path is unavailable and leave a clear unsupported state.
- `remove-cloud`: cloud/remote feature outside the local product scope; keep it out of default help/UI/runtime paths.
- `keep-disabled`: noncritical or private feature remains behind a feature gate until a local product decision exists.
- `remove-dead`: delete the product path if later code reading proves it is unreachable. No current row is marked this way yet.

## Summary

| Classification | Unique specifiers |
| --- | ---: |
| replace-local | 68 |
| replace-openai | 34 |
| remove-cloud | 33 |
| keep-disabled | 32 |
| remove-dead | 0 |

| Product area | Unique specifiers |
| --- | ---: |
| Agents and subagents | 5 |
| Attribution hooks | 3 |
| Background, proactive, monitor, workflow services | 25 |
| Browser and computer-use | 5 |
| Build and type shims | 3 |
| Bundled docs and SDK types | 29 |
| Compaction and context management | 23 |
| Core local tools | 3 |
| File attachment helpers | 3 |
| Memory and local intelligence | 3 |
| Misc recovered module | 1 |
| Remote bridge and cross-session services | 33 |
| Security and permissions | 11 |
| Skills and plugin search | 17 |
| TUI messages and dialogs | 3 |

## Inventory

| Product area | Module specifier | Importing file(s) | Classification | Owner phase | Acceptance test |
| --- | --- | --- | --- | --- | --- |
| Agents and subagents | `../../coordinator/workerAgent.js` | `src/tools/AgentTool/builtInAgents.ts` | `remove-cloud` | Phase 5.2 | `bun run smoke:codex-agent` and `bun run smoke:codex-multi-agent`; Codex feature policy keeps coordinator disabled by default |
| Agents and subagents | `../utils/ultraplan/prompt.txt` | `src/commands/ultraplan.tsx` | `replace-local` | Phase 5 | `bun run smoke:codex-agent` and `bun run smoke:codex-multi-agent` |
| Agents and subagents | `./commands/fork/index.js` | `src/commands.ts` | `replace-local` | Phase 5 | `bun run smoke:codex-agent` and `bun run smoke:codex-multi-agent` |
| Agents and subagents | `./components/agents/SnapshotUpdateDialog.js` | `src/dialogLaunchers.tsx`<br>`src/main.tsx` | `replace-local` | Phase 5 | `bun run smoke:codex-agent` and `bun run smoke:codex-multi-agent` |
| Agents and subagents | `./UserForkBoilerplateMessage.js` | `src/components/messages/UserTextMessage.tsx` | `replace-local` | Phase 5 | `bun run smoke:codex-agent` and `bun run smoke:codex-multi-agent` |
| Attribution hooks | `./attributionTrailer.js` | `src/utils/attribution.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Attribution hooks | `./postCommitAttribution.js` | `src/utils/worktree.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Attribution hooks | `./utils/attributionHooks.js` | `src/setup.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `../../tasks/MonitorMcpTask/MonitorMcpTask.js` | `src/components/tasks/BackgroundTasksDialog.tsx`<br>`src/tools/AgentTool/runAgent.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `../../tools/MonitorTool/MonitorTool.js` | `src/components/permissions/PermissionRequest.tsx` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `../../tools/WorkflowTool/constants.js` | `src/utils/permissions/classifierDecision.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `../../tools/WorkflowTool/WorkflowPermissionRequest.js` | `src/components/permissions/PermissionRequest.tsx` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `../../tools/WorkflowTool/WorkflowTool.js` | `src/components/permissions/PermissionRequest.tsx` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `../cli/bg.js` | `src/entrypoints/cli.tsx` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `../cli/handlers/templateJobs.js` | `src/entrypoints/cli.tsx` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `../proactive/index.js` | `src/cli/print.ts`<br>`src/components/Messages.tsx`<br>`src/constants/prompts.ts`<br>`src/screens/REPL.tsx`<br>`src/utils/systemPrompt.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `../proactive/useProactive.js` | `src/screens/REPL.tsx` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `../tools/WorkflowTool/constants.js` | `src/constants/tools.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `./commands/buddy/index.js` | `src/commands.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `./commands/proactive.js` | `src/commands.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `./commands/workflows/index.js` | `src/commands.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `./MonitorMcpDetailDialog.js` | `src/components/tasks/BackgroundTasksDialog.tsx` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `./MonitorPermissionRequest/MonitorPermissionRequest.js` | `src/components/permissions/PermissionRequest.tsx` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `./proactive/index.js` | `src/main.tsx` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `./tasks/LocalWorkflowTask/LocalWorkflowTask.js` | `src/tasks.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `./tasks/MonitorMcpTask/MonitorMcpTask.js` | `src/tasks.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `./tools/MonitorTool/MonitorTool.js` | `src/tools.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `./tools/PushNotificationTool/PushNotificationTool.js` | `src/tools.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `./tools/WorkflowTool/bundled/index.js` | `src/tools.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `./tools/WorkflowTool/createWorkflowCommand.js` | `src/commands.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `./tools/WorkflowTool/WorkflowTool.js` | `src/tools.ts` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `./WorkflowDetailDialog.js` | `src/components/tasks/BackgroundTasksDialog.tsx` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Background, proactive, monitor, workflow services | `src/tasks/LocalWorkflowTask/LocalWorkflowTask.js` | `src/components/tasks/BackgroundTasksDialog.tsx` | `keep-disabled` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Browser and computer-use | `../tools/TungstenTool/TungstenLiveMonitor.js` | `src/screens/REPL.tsx` | `replace-openai` | Phase 9 | future `smoke:codex-computer-use` or explicit unsupported smoke |
| Browser and computer-use | `../tools/WebBrowserTool/WebBrowserPanel.js` | `src/screens/REPL.tsx` | `replace-openai` | Phase 9 | future `smoke:codex-computer-use` or explicit unsupported smoke |
| Browser and computer-use | `./tools/TungstenTool/TungstenTool.js` | `src/tools.ts` | `replace-openai` | Phase 9 | future `smoke:codex-computer-use` or explicit unsupported smoke |
| Browser and computer-use | `./tools/WebBrowserTool/WebBrowserTool.js` | `src/tools.ts` | `replace-openai` | Phase 9 | future `smoke:codex-computer-use` or explicit unsupported smoke |
| Browser and computer-use | `src/tools/TungstenTool/TungstenTool.js` | `src/components/agents/ToolSelector.tsx` | `replace-openai` | Phase 9 | future `smoke:codex-computer-use` or explicit unsupported smoke |
| Build and type shims | `../global.d.ts` | `src/ink/components/Box.tsx`<br>`src/ink/components/ScrollBox.tsx` | `replace-local` | Phase 12 | `bun run check:core`, `bun run build`, package smoke |
| Build and type shims | `./devtools.js` | `src/ink/reconciler.ts` | `replace-local` | Phase 12 | `bun run check:core`, `bun run build`, package smoke |
| Build and type shims | `./types.js` | `src/utils/filePersistence/filePersistence.ts` | `replace-local` | Phase 12 | `bun run check:core`, `bun run build`, package smoke |
| Bundled docs and SDK types | `./claude-api/csharp/claude-api.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/curl/examples.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/go/claude-api.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/java/claude-api.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/php/claude-api.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/python/agent-sdk/patterns.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/python/agent-sdk/README.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/python/claude-api/batches.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/python/claude-api/files-api.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/python/claude-api/README.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/python/claude-api/streaming.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/python/claude-api/tool-use.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/ruby/claude-api.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/shared/error-codes.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/shared/live-sources.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/shared/models.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/shared/prompt-caching.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/shared/tool-use-concepts.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/SKILL.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/typescript/agent-sdk/patterns.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/typescript/agent-sdk/README.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/typescript/claude-api/batches.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/typescript/claude-api/files-api.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/typescript/claude-api/README.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/typescript/claude-api/streaming.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./claude-api/typescript/claude-api/tool-use.md` | `src/skills/bundled/claudeApiContent.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./coreTypes.generated.js` | `src/entrypoints/sdk/coreTypes.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./sdk/runtimeTypes.js` | `src/entrypoints/agentSdkTypes.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Bundled docs and SDK types | `./sdk/toolTypes.js` | `src/entrypoints/agentSdkTypes.ts` | `replace-openai` | Phase 10 / Phase 12 | `bun run deps:audit`, `bun run check:core`, package smoke |
| Compaction and context management | `../../proactive/index.js` | `src/commands/clear/conversation.ts`<br>`src/components/PromptInput/PromptInputFooterLeftSide.tsx`<br>`src/components/PromptInput/usePromptInputPlaceholder.ts`<br>`src/services/compact/prompt.ts`<br>`src/tools/AgentTool/AgentTool.tsx` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `../../services/compact/reactiveCompact.js` | `src/commands/compact/compact.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `../../services/contextCollapse/index.js` | `src/commands/context/context-noninteractive.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `../../services/contextCollapse/operations.js` | `src/commands/context/context-noninteractive.ts`<br>`src/commands/context/context.tsx` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `../../utils/attributionHooks.js` | `src/commands/clear/caches.ts`<br>`src/services/compact/postCompactCleanup.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `../compact/cachedMicrocompact.js` | `src/services/api/claude.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `../contextCollapse/index.js` | `src/services/compact/autoCompact.ts`<br>`src/services/compact/postCompactCleanup.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `../services/compact/cachedMCConfig.js` | `src/constants/prompts.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `../services/compact/snipCompact.js` | `src/components/Message.tsx`<br>`src/utils/attachments.ts`<br>`src/utils/messages.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `../services/compact/snipProjection.js` | `src/components/Message.tsx`<br>`src/utils/messages.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `../services/contextCollapse/index.js` | `src/components/ContextVisualization.tsx`<br>`src/components/TokenWarning.tsx`<br>`src/screens/REPL.tsx`<br>`src/utils/analyzeContext.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `../services/contextCollapse/persist.js` | `src/screens/ResumeConversation.tsx`<br>`src/utils/sessionRestore.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `../services/sessionTranscript/sessionTranscript.js` | `src/utils/attachments.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `../sessionTranscript/sessionTranscript.js` | `src/services/compact/compact.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `../tools/SnipTool/prompt.js` | `src/utils/collapseReadSearch.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `./cachedMicrocompact.js` | `src/services/compact/microCompact.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `./commands/force-snip.js` | `src/commands.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `./messages/SnipBoundaryMessage.js` | `src/components/Message.tsx` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `./services/compact/reactiveCompact.js` | `src/query.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `./services/compact/snipCompact.js` | `src/QueryEngine.ts`<br>`src/query.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `./services/compact/snipProjection.js` | `src/QueryEngine.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `./services/contextCollapse/index.js` | `src/query.ts`<br>`src/setup.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Compaction and context management | `./tools/SnipTool/SnipTool.js` | `src/tools.ts` | `replace-local` | Phase 4 | `bun run smoke:codex-session-cli` and future `smoke:codex-long-session` |
| Core local tools | `./tools/CtxInspectTool/CtxInspectTool.js` | `src/tools.ts` | `replace-local` | Phase 3 / Phase 11 | future `smoke:codex-local-tools` and `smoke:codex-security` |
| Core local tools | `./tools/SleepTool/SleepTool.js` | `src/tools.ts` | `replace-local` | Phase 3 / Phase 11 | future `smoke:codex-local-tools` and `smoke:codex-security` |
| Core local tools | `./tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.js` | `src/tools.ts` | `replace-local` | Phase 3 / Phase 11 | future `smoke:codex-local-tools` and `smoke:codex-security` |
| File attachment helpers | `../SendUserFileTool/prompt.js` | `src/tools/ToolSearchTool/prompt.ts` | `replace-local` | Phase 3 / Phase 10 | `bun run smoke:codex-image` and future plugin/file smoke |
| File attachment helpers | `../tools/SendUserFileTool/prompt.js` | `src/components/Messages.tsx`<br>`src/utils/conversationRecovery.ts` | `replace-local` | Phase 3 / Phase 10 | `bun run smoke:codex-image` and future plugin/file smoke |
| File attachment helpers | `./tools/SendUserFileTool/SendUserFileTool.js` | `src/tools.ts` | `replace-local` | Phase 3 / Phase 10 | `bun run smoke:codex-image` and future plugin/file smoke |
| Memory and local intelligence | `../memdir/memoryShapeTelemetry.js` | `src/utils/sessionFileAccessHooks.ts` | `keep-disabled` | Phase 10, optional local memory | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Memory and local intelligence | `./memoryShapeTelemetry.js` | `src/memdir/findRelevantMemories.ts` | `keep-disabled` | Phase 10, optional local memory | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Memory and local intelligence | `./utils/taskSummary.js` | `src/query.ts` | `keep-disabled` | Phase 10, optional local memory | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Misc recovered module | `./commands/torch.js` | `src/commands.ts` | `keep-disabled` | Phase 0 classification review | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `../../assistant/index.js` | `src/commands/bridge/bridge.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `../../bridge/peerSessions.js` | `src/tools/SendMessageTool/SendMessageTool.ts` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `../../utils/udsClient.js` | `src/tools/SendMessageTool/SendMessageTool.ts` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `../assistant/index.js` | `src/bridge/initReplBridge.ts`<br>`src/hooks/useReplBridge.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `../bridge/webhookSanitizer.js` | `src/hooks/useReplBridge.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `../daemon/main.js` | `src/entrypoints/cli.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `../daemon/workerRegistry.js` | `src/entrypoints/cli.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `../environment-runner/main.js` | `src/entrypoints/cli.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `../self-hosted-runner/main.js` | `src/entrypoints/cli.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `../udsMessaging.js` | `src/utils/messages/systemInit.ts` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `../utils/udsMessaging.js` | `src/cli/print.ts` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./assistant/AssistantSessionChooser.js` | `src/dialogLaunchers.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./assistant/gate.js` | `src/main.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./assistant/index.js` | `src/main.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./assistant/sessionDiscovery.js` | `src/main.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./commands/assistant/assistant.js` | `src/dialogLaunchers.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./commands/assistant/index.js` | `src/commands.ts` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./commands/peers/index.js` | `src/commands.ts` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./commands/remoteControlServer/index.js` | `src/commands.ts` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./commands/subscribe-pr.js` | `src/commands.ts` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./server/backends/dangerousBackend.js` | `src/main.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./server/connectHeadless.js` | `src/main.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./server/lockfile.js` | `src/main.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./server/parseConnectUrl.js` | `src/main.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./server/server.js` | `src/main.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./server/serverBanner.js` | `src/main.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./server/serverLog.js` | `src/main.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./server/sessionManager.js` | `src/main.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./ssh/createSSHSession.js` | `src/main.tsx` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./tools/ListPeersTool/ListPeersTool.js` | `src/tools.ts` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./tools/SubscribePRTool/SubscribePRTool.js` | `src/tools.ts` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./udsClient.js` | `src/utils/conversationRecovery.ts` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Remote bridge and cross-session services | `./utils/udsMessaging.js` | `src/setup.ts` | `remove-cloud` | Out of scope / Phase 0 gate | `bun run build` plus help/UI smoke shows feature hidden or explicit unsupported state |
| Security and permissions | `../../tools/OverflowTestTool/OverflowTestTool.js` | `src/utils/permissions/classifierDecision.ts` | `replace-local` | Phase 11 | `bun run smoke:codex-tool` and future `smoke:codex-security` |
| Security and permissions | `../../tools/ReviewArtifactTool/ReviewArtifactTool.js` | `src/components/permissions/PermissionRequest.tsx` | `replace-local` | Phase 11 | `bun run smoke:codex-tool` and future `smoke:codex-security` |
| Security and permissions | `../../tools/TerminalCaptureTool/prompt.js` | `src/utils/permissions/classifierDecision.ts` | `replace-local` | Phase 11 | `bun run smoke:codex-tool` and future `smoke:codex-security` |
| Security and permissions | `../jobs/classifier.js` | `src/query/stopHooks.ts` | `replace-local` | Phase 11 | `bun run smoke:codex-tool` and future `smoke:codex-security` |
| Security and permissions | `./jobs/classifier.js` | `src/query.ts` | `replace-local` | Phase 11 | `bun run smoke:codex-tool` and future `smoke:codex-security` |
| Security and permissions | `./ReviewArtifactPermissionRequest/ReviewArtifactPermissionRequest.js` | `src/components/permissions/PermissionRequest.tsx` | `replace-local` | Phase 11 | `bun run smoke:codex-tool` and future `smoke:codex-security` |
| Security and permissions | `./securityCheck.jsx` | `src/services/remoteManagedSettings/index.ts` | `replace-local` | Phase 11 | `bun run smoke:codex-tool` and future `smoke:codex-security` |
| Security and permissions | `./tools/OverflowTestTool/OverflowTestTool.js` | `src/tools.ts` | `replace-local` | Phase 11 | `bun run smoke:codex-tool` and future `smoke:codex-security` |
| Security and permissions | `./tools/TerminalCaptureTool/TerminalCaptureTool.js` | `src/tools.ts` | `replace-local` | Phase 11 | `bun run smoke:codex-tool` and future `smoke:codex-security` |
| Security and permissions | `./yolo-classifier-prompts/auto_mode_system_prompt.txt` | `src/utils/permissions/yoloClassifier.ts` | `replace-local` | Phase 11 | `bun run smoke:codex-tool` and future `smoke:codex-security` |
| Security and permissions | `./yolo-classifier-prompts/permissions_external.txt` | `src/utils/permissions/yoloClassifier.ts` | `replace-local` | Phase 11 | `bun run smoke:codex-tool` and future `smoke:codex-security` |
| Skills and plugin search | `../../services/skillSearch/featureCheck.js` | `src/tools/SkillTool/SkillTool.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `../../services/skillSearch/remoteSkillLoader.js` | `src/tools/SkillTool/SkillTool.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `../../services/skillSearch/remoteSkillState.js` | `src/tools/SkillTool/SkillTool.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `../../services/skillSearch/telemetry.js` | `src/tools/SkillTool/SkillTool.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `../../skills/mcpSkills.js` | `src/services/mcp/client.ts`<br>`src/services/mcp/useManageMCPConnections.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `../services/skillSearch/featureCheck.js` | `src/constants/prompts.ts`<br>`src/utils/attachments.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `../services/skillSearch/prefetch.js` | `src/utils/attachments.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `../skillSearch/localSearch.js` | `src/services/mcp/useManageMCPConnections.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `../tools/DiscoverSkillsTool/prompt.js` | `src/constants/prompts.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `./dream.js` | `src/skills/bundled/index.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `./hunter.js` | `src/skills/bundled/index.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `./runSkillGenerator.js` | `src/skills/bundled/index.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `./services/skillSearch/localSearch.js` | `src/commands.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `./services/skillSearch/prefetch.js` | `src/query.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `./verify/examples/cli.md` | `src/skills/bundled/verifyContent.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `./verify/examples/server.md` | `src/skills/bundled/verifyContent.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| Skills and plugin search | `./verify/SKILL.md` | `src/skills/bundled/verifyContent.ts` | `replace-local` | Phase 10 | `bun run smoke:codex-experience` and future `smoke:codex-plugins` |
| TUI messages and dialogs | `../../utils/systemThemeWatcher.js` | `src/components/design-system/ThemeProvider.tsx` | `replace-local` | Phase 6 | future `smoke:codex-tui` screenshot/PTY smoke |
| TUI messages and dialogs | `./UserCrossSessionMessage.js` | `src/components/messages/UserTextMessage.tsx` | `replace-local` | Phase 6 | future `smoke:codex-tui` screenshot/PTY smoke |
| TUI messages and dialogs | `./UserGitHubWebhookMessage.js` | `src/components/messages/UserTextMessage.tsx` | `replace-local` | Phase 6 | future `smoke:codex-tui` screenshot/PTY smoke |

## Immediate Observations

- Remote bridge, cross-session messaging, daemon/server, peer, and subscription/notification paths are outside the current local-only scope and should stay unavailable by default.
- Phase 4.2 replaced the critical compact/context recovered stubs for cache-editing, reactive compact, context-collapse, snip, context inspect, and session-transcript paths with explicit local source files. The optional Anthropic/private systems are disabled/no-op by default; manual `/compact` remains backed by the local Codex summarization path. Verification: `bun run smoke:codex-compact-modules`.
- Skill search and bundled Claude API docs should become local/OpenAI-oriented skill/plugin content rather than Anthropic private search services.
- Computer-use and browser modules should be replaced only by local sandbox/browser loops or OpenAI built-in tool loops, never by remote Anthropic services.
- Product UI should not surface disabled monitor/workflow/proactive paths unless a later phase implements a local equivalent and tests it.

## 2026-05-02 Cloud Surface Removal Queue

Source command:

```bash
bun run smoke:no-cloud-surfaces
```

Initial failing runtime/user-facing cloud surfaces:

- Cloud assistant attach/viewer mode: `src/main.tsx`, `src/dialogLaunchers.tsx`, `src/assistant/**`, `src/commands/assistant/**`.
- Remote control command: `src/commands.ts`, `src/commands/remoteControlServer/**`.
- Cloud subscribe/peer/notification tools: `src/commands/subscribe-pr.ts`, `src/tools/ListPeersTool/**`, `src/tools/PushNotificationTool/**`, `src/tools/SubscribePRTool/**`, `src/tools.ts`.
- Cloud/BYOC runners: `src/entrypoints/cli.tsx`, `src/bridge/**`, `src/cli/remoteIO.ts`.
- Claude Chrome package path: `src/utils/claudeInChrome/**`, `src/services/mcp/client.ts`.
- Anthropic compatibility package fallbacks: `package.json`, `bun.lock`, `local-packages/@ant/**`.
