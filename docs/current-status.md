# Calitiki current status

Last updated: 2026-08-01

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/spec-driven-manuscript`
- Production/main checkpoint: PR #123 merged at `d4153d6`; browser and new-book language defaults
- Current focused checkpoint: seal the approved canonical contract and derive manuscript batches from its scene-local facts
- Pull request: pending publication; the user explicitly authorized direct merge while no book is generating
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #123 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: spec-driven manuscript

1. Scenario approval seals the exact canonical NarrativeBookSpec and its semantic-audit evidence; preview rejects a missing or stale V2 contract before starting generation.
2. Each manuscript page receives only its immutable scene contract and the referenced registry entries, while the shared context carries one contract digest rather than the mutable full scenario.
3. Legacy approved projects remain on the legacy pipeline; only freshly approved V2 scenarios activate the versioned contract path.

## Verification

- Focused canonical candidate, scenario dialogue and durable-worker tests: passing.
- Complete `npm test`: 351/351 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Publish and merge the queued language, canonical-gate and spec-driven-manuscript PRs under the user's standing authorization once GitHub CLI authentication is healthy.
2. Continue with the spec-driven illustration-contract brick without changing Child Safety or Story Sensitivity.
3. On the next fresh test book, verify that every manuscript batch reports one unchanged canonical artifact digest.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
