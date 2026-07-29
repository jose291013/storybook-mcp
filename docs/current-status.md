# Calitiki current status

Last updated: 2026-07-29

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/scenario-enqueue-previous-status`
- Last deployed production checkpoint: PR #92 — PostgreSQL compatibility for the scenario run staging state
- Current focused checkpoint: scenario enqueue checkpoint variable hotfix
- Pull request: pending
- WordPress Bridge source and installed production package: `0.7.3`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #91 are merged. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: scenario enqueue hotfix

1. PR #92 successfully removed SQLSTATE `23514`; production now accepts the non-claimable `created` run.
2. The route then exposed a second enqueue defect: it computed `previousStatus` but attempted to persist the undefined shorthand `previousProjectStatus`.
3. The hotfix uses one canonical variable name throughout checkpoint creation and queue-failure recovery.
4. A focused route contract test locks the computed and persisted field names together.
5. Both failed requests reached neither the scenario architect nor credit reservation; the customer's questionnaire remains preserved.

## Verification completed locally

- Scenario-focused suite passes: 36 tests, 0 failures.
- Full suite passes: 233 tests, 0 failures.
- Route syntax and `git diff --check` pass.

## Next verification target

1. Run the focused and full test suites, then publish the hotfix PR.
2. Merge only after confirming that no preview or scenario is generating; Render will restart.
3. Reopen project `ba8611dc-b303-498f-af0b-3bc906d568dc` from **My creations** and request its preserved scenario again.
4. Verify Render logs `queued → architect → editor → completed` and confirm that no credit was consumed by either failed enqueue.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
