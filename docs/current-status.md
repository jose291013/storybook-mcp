# Calitiki current status

Last updated: 2026-07-30

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/cost-quality-governor`
- Main checkpoint and last production deployment: PR #105 — versioned story-audit checkpoints
- Current focused checkpoint: private quality-cost governor targeting a preview below USD 2.00, then USD 1.50
- Pull request: #106 — open, verified locally, not merged
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #105 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: quality-cost governor

1. Scenario generation is capped at one premium architect, one premium editor and one balanced targeted repair.
2. Manuscript generation writes at most three complete acts rather than paying once per text page.
3. One economical whole-manuscript editor may fix language and family address without changing story facts.
4. Whole-book planning uses one ordinary planner and one balanced targeted repair.
5. Rechecks and targeted repairs are attributed as quality rework, while the USD 2.00 and USD 1.50 targets remain private.

## Verification

- Cost-governor and manuscript batching tests: 6/6 passing.
- Focused preview orchestration tests: 2/2 passing.
- Complete `npm test` suite: 271/271 passing.
- `git diff --check`: passing.

## Next verification target

1. Wait for explicit creator confirmation before merging PR #106; warn that Render may restart and interrupt an active generation.
2. After a safe Render window, deploy and create a fresh 24-page preview.
3. Compare the internal per-book cost report with the OpenAI Costs export; validate the first target below USD 2.00 without weakening scenario or illustration review.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
