# Typecheck Layers

Last measured: 2026-05-01

```text
check:core: pass
test:codex: pass
check:full: fail with 2154 diagnostics, top categories:
- generated SDK missing / unrecovered SDK exports: 361 matching diagnostics
- feature-gated private modules and unrecovered source modules: 535 TS2307 diagnostics
- bundler macro globals missing in raw tsc: 146 MACRO diagnostics
- React compiler runtime declaration mismatch: 395 diagnostics
- recovered-source narrowing/unknown debt: 854 diagnostics
```

Commands:

```bash
bun run check:core
bun run test:codex
bun run check:full
```

`check:core` intentionally covers the Codex auth/client/translator/API seam:

```text
src/codex/**/*.ts
src/services/codex/**/*.ts
src/services/api/codex-integration.test.ts
```

The initial wider core include set pulled the recovered Claude bridge, command,
analytics, UI, and SDK surfaces through transitive imports. Those remain part of
`check:full` until the recovered tree has real declarations for generated SDK
types, feature-gated private modules, and build-time macro globals.
