# Chimera Packaging Policy

Status date: 2026-05-03

This repository builds the `chimera-code` npm package for dogfooding and
controlled alpha distribution. The installed CLI binary is `chimera`.

## Ships

- Our TypeScript source compiled into `dist/chimera.js`.
- A small `bin/chimera` npm wrapper that launches the compiled CLI with Bun.
- No source maps by default. Set `CHIMERA_BUILD_SOURCEMAP=1` only for local
  debugging builds.
- Local compatibility packages under `local-packages/**`.
- MIT license text.
- Public npm dependencies declared as `devDependencies` for build and smoke
  work. Runtime `dependencies` are limited to tiny local stub packages that
  satisfy intentionally disabled feature gates in the bundled CLI.
- README and this packaging policy.

## Does Not Ship

- Private third-party binaries or assets unless their license explicitly allows
  redistribution.
- The repository `src/**` tree in install packages.
- `node_modules/**`, live OAuth traces, local auth files, transcripts, temp
  smoke output, or developer-only diagnostics.
- Cloud or remote service credentials or endpoints as product defaults.
- Locally installed official package assets.

## Optional Local Vendors

Some runtime adapters can use local vendors when they already exist on the
developer machine. These are treated as optional acceleration or compatibility
paths, not required package contents:

- Local audio capture vendor modules, loaded only when present and compatible.

If a vendor is absent, Chimera must either fall back to a local/public
implementation or report the feature as unavailable.

## Dev-Only Oracle Material

Development notes, provenance references, and any locally installed official
package are development references only. They are useful for contract
comparison and parity work, but they are not redistribution sources for Chimera
packages.

## Install Smoke

The package smoke runs from a clean temp prefix:

```bash
bun run smoke:codex-package
```

It builds the project, creates an npm tarball, installs it under a temporary
global prefix, and verifies:

```text
chimera --version
chimera --help
chimera auth status --json
```

The auth status check uses an isolated config home and must report logged-out
state without email or account identifiers.
