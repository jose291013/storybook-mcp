# Calitiki current status

Last updated: 2026-07-29

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/generation-run-created-status`
- Last verified production checkpoint: PR #91 — durable asynchronous scenario preparation
- Current focused checkpoint: PostgreSQL compatibility for the scenario run staging state
- Pull request: pending
- WordPress Bridge source and installed production package: `0.7.3`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #91 are merged. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: scenario queue compatibility

1. The durable scenario route deliberately creates a non-claimable `created` run before persisting the matching project checkpoint.
2. Production PostgreSQL retained an older `generation_runs_status_check` that rejected this staging state with SQLSTATE `23514`.
3. Migration `012_generation_run_created_status.sql` upgrades the existing constraint idempotently while migration 011 now provisions new databases with the same state.
4. The worker still claims only `queued` or expired `running` runs, so it cannot process a partially persisted request.
5. The failed production request reached neither the scenario architect nor credit reservation; the customer's questionnaire remains preserved.

## Verification completed locally

- Focused PostgreSQL orchestration tests pass: 2 tests, 0 failures.
- Full suite passes: 233 tests, 0 failures.
- `git diff --check` passes.

## Next verification target

1. Run the full test suite and publish the focused migration PR.
2. Merge only after confirming that no preview or scenario is generating; Render will restart and execute migration 012.
3. Reopen project `ba8611dc-b303-498f-af0b-3bc906d568dc` from **My creations** and request its preserved scenario again.
4. Verify Render logs `queued → architect → editor → completed` and confirm that no credit was consumed by the failed enqueue.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
