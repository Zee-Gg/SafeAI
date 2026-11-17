<!--
  How to install, run and load the SafeAI extension.
  Full run steps are completed in Milestone 7.
-->

# SafeAI for Teams

A Chrome extension (Manifest V3) that protects sensitive data in prompts sent to AI chat sites.
Phase 1 supports ChatGPT only. See [docs/phase-1-plan.md](docs/phase-1-plan.md).

## Requirements

- Node 24 (see `.nvmrc`). We use [fnm](https://github.com/Schniz/fnm) to switch versions.
- pnpm (enabled through Corepack: `corepack enable pnpm`)

## Quick start

```sh
pnpm install
pnpm lint
pnpm format:check
```

More steps (dev, build, loading the extension) arrive in Milestone 7.
