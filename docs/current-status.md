# Calitiki current status

Last updated: 2026-08-01

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/internal-economic-governor`
- Production/main checkpoint: PR #123 merged at `d4153d6`; browser and new-book language defaults
- Current focused checkpoint: contain optional AI retries at the private per-book cost target without blocking required completion
- Pull request: pending publication; the user explicitly authorized direct merge while no book is generating
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #123 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: internal economic governor

1. Private attributed cost is read before each interior image; `$2.00` enters containment and `$3.00` enters completion-first mode by default.
2. Containment removes only optional style, likeness and preference retries. Required pages, child-safety gates and objective mechanical repairs continue.
3. No amount, threshold or governor state is exposed to the customer, and the governor never blocks a paid creator flow.

## Verification

- Focused canonical candidate, scenario dialogue and durable-worker tests: passing.
- Complete `npm test`: 355/355 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Publish and merge the queued language, canonical-gate and spec-driven-manuscript PRs under the user's standing authorization once GitHub CLI authentication is healthy.
2. Continue with the progressive-rollout brick without changing Child Safety or Story Sensitivity.
3. On the next fresh test book, verify zero whole-book planner calls and that optional image retries stop after the private target is reached.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
