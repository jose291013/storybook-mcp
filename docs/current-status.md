# Calitiki current status

Last updated: 2026-07-29

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/durable-async-scenario`
- Last verified production checkpoint: PR #90 — quality-first narrative routing and authoritative causal graph
- Current focused checkpoint: durable asynchronous scenario preparation
- Pull request: not yet opened
- WordPress Bridge source candidate: `0.7.3`; installed production package remains `0.7.1`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #90 are merged. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: durable asynchronous scenario preparation

1. Scenario requests pass child safety synchronously, then return an authenticated durable job id before any credit reservation.
2. The persisted `story_scenario` run exposes architect, editor and finalization stages without storing customer content in job metadata.
3. A renewable lease lets a new Render process reclaim an interrupted run after deployment or restart.
4. Refreshing or closing the browser is safe; **My creations** exposes generating and failed scenario states.
5. A technical failure preserves the private request and any previous scenario, and offers one explicit free retry.
6. Scenario architect/editor calls use their own ten-minute bound through `OPENAI_SCENARIO_TIMEOUT_MS`; hidden SDK retries remain disabled.

## Verification completed locally

- Full suite passes: 233 tests, 0 failures.
- Durable worker tests cover successful completion, timeout retry preservation and failed revision preservation.
- Production dependency audit passes: 0 vulnerabilities.
- Bridge `0.7.3` archive structure and the complete diff check pass.

## Next verification target

1. Publish the focused pull request.
2. Merge only after confirming that no preview or scenario is generating; Render will restart.
3. Install Bridge `0.7.3` after the Node deployment.
4. Retry the currently preserved scenario and verify `queued → architect → editor → completed`.
5. During a separate disposable test, refresh the browser while the architect is running and confirm automatic resumption.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
