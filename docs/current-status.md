# Calitiki current status

Last updated: 2026-08-03

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/automatic-repair-exhausted-state`
- Production/main checkpoint: PR #139 merged at `dbdc8a6`; bounded one-click scenario repair is on `main`
- Current focused checkpoint: durable exhausted state after an inconclusive automatic repair
- Pull request: draft PR #140
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #139 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: automatic-repair terminal state

1. An inconclusive automatic repair persists a creator-safe failure summary containing only bounded categories and scene numbers.
2. The automatic-repair button disappears and is replaced by a localized explanation that the attempt stopped to prevent a loop.
3. The existing scenario remains visible and editable; the creator may make a targeted manual change or contact Calitiki.
4. A second identical automatic-repair request is rejected server-side, including from an older browser tab.
5. The prior scenario is preserved and no customer credit is used.

## Verification

- Focused scenario, worker and UI structure tests: passing.
- Complete `npm test`: 392/392 passing.
- `git diff --check`: passing.

## Next verification target

1. Review draft PR #140.
2. Merge only with fresh user confirmation and while no preview is generating because Render may restart.
3. Reopen project `ec1dcd70-d131-4c1a-8b41-5bca11e98cfe`; confirm the repair button is gone and the preserved scenario shows a localized no-loop explanation.
4. Confirm a direct repeated request returns `scenario_auto_repair_exhausted` without a model call.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
