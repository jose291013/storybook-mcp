# Calitiki current status

Last updated: 2026-08-03

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/automatic-scenario-repair`
- Production/main checkpoint: PR #138 merged at `d761848`; location-aware and progressive object contracts are on `main`
- Current focused checkpoint: one-click bounded automatic scenario repair
- Pull request: pending publication
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #138 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: bounded automatic scenario repair

1. An invalid reviewable scenario may expose **Repair automatically** only when no creator clarification is pending.
2. The server recomputes deterministic and stored semantic diagnostics and builds a private structured repair plan; the browser receives only bounded categories and scene numbers.
3. One targeted `story_repair` call is allowed. Follow-on structural, editorial or canonical model-repair loops are disabled for this action.
4. A fresh deterministic validation, independent editor audit and canonical compile remain mandatory.
5. Any failure preserves the exact prior reviewable scenario, launches no automatic retry and consumes no customer credit.
6. Child-safety gates remain in force and genuine creator decisions are never auto-filled.

## Verification

- Focused scenario, worker and UI structure tests: passing.
- Complete `npm test`: 391/391 passing.
- `git diff --check`: passing.

## Next verification target

1. Publish and merge the automatic-repair brick under the user's existing no-book-in-progress authorization.
2. Deploy only while no preview is generating because Render may restart.
3. Create one scenario with a repairable passage, object or travel contradiction; confirm the button repairs it and approval becomes available.
4. Create one scenario with a genuine clarification; confirm the automatic button stays hidden.
5. Force an inconclusive repair in a non-production fixture; confirm the previous scenario remains visible and no retry loop starts.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
