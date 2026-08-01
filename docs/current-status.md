# Calitiki current status

Last updated: 2026-08-01

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/narrative-v2-progressive-rollout`
- Production/main checkpoint: PR #123 merged at `d4153d6`; browser and new-book language defaults
- Current focused checkpoint: assign new projects deterministically to legacy or Narrative V2 without changing in-progress books
- Pull request: pending publication; the user explicitly authorized direct merge while no book is generating
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #123 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: progressive Narrative V2 rollout

1. `off`, deterministic `canary` percentage and `on` modes are supported; safe default is `off`.
2. The assignment is persisted at scenario approval and never changes while that project is in progress, even if Render variables later change.
3. Legacy projects remain legacy. Enrolled V2 projects fail closed if their sealed contract becomes missing or stale; Child Safety and Story Sensitivity remain independent gates.

## Verification

- Focused canonical candidate, scenario dialogue and durable-worker tests: passing.
- Complete `npm test`: 358/358 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Publish and merge the queued language fix and five Narrative V2 bricks in dependency order under the user's standing authorization once GitHub CLI authentication is healthy.
2. Start Render with `NARRATIVE_V2_ROLLOUT_MODE=canary` and a deliberately small `NARRATIVE_V2_ROLLOUT_PERCENT`, then increase only after measured completion/cost review.
3. On the first enrolled test book, verify one stable spec digest, zero whole-book planner calls and bounded optional image retries.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
