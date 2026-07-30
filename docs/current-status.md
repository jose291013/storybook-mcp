# Calitiki current status

Last updated: 2026-07-30

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/structured-story-plan-repair`
- Main checkpoint and last production deployment: PR #108 — durable economical blueprint and bounded scenario revisions
- Current focused checkpoint: structured versioned repair for rejected whole-book plans
- Pull request: pending creation; do not merge without fresh creator confirmation
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #108 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: structured targeted story-plan repair

1. The targeted repair receives the previous plan in its declared `snake_case` schema instead of the internal persistence shape.
2. Every rejected scene carries one bounded repair target with its paired pages, audit instructions, approved action, exact physical cast and authoritative object states.
3. Scene normalization removes an absent canonical character from every image-facing field and restores the approved per-character actions, not only the visible-cast array.
4. Targeted repair contract version 2 starts one new provider call for a preserved version-1 candidate, while every unaffected page remains reusable.
5. Preview retry policy version 15 grants the failed project one explicit free recovery without rebuilding its scenario, blueprint or manuscript.

## Verification

- Focused repair-envelope, visual-contract and retry-policy regressions: passing.
- Complete `npm test` suite: 276/276 passing.
- `git diff --check`: passing.

## Next verification target

1. Wait for explicit creator confirmation before merging this repair; warn that Render may restart and interrupt an active generation.
2. After deployment, use the explicit free retry on project `4bd27e64-2a32-456f-b931-c061cfa39e65`.
3. Confirm that the log records `planner:targeted:v2`, that scenes 8, 10 and 11 pass the targeted recheck, and that cover preparation begins without another scenario or blueprint call.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
