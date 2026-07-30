# Calitiki current status

Last updated: 2026-07-30

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/internal-book-cost-ledger`
- Main checkpoint: PR #100 — objective visual guard for impossible anatomy and duplicated recurring identities
- Last production deployment explicitly reverified in this document: PR #99; verify Render before treating PR #100 as deployed
- Current focused checkpoint: private per-book OpenAI production-cost ledger and WooCommerce economic dashboard
- Pull request: draft PR #101
- WordPress Bridge source candidate: `0.7.5`; installed production package last recorded as `0.7.3`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #99 are merged and deployed; PR #100 is present on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: internal production-cost ledger

1. OpenAI calls made inside scenario, preview, quality repair, targeted modification and finalization workflows are attributed through an asynchronous project/run/stage context.
2. The durable PostgreSQL ledger stores only numeric usage, model, endpoint, stage and cost metadata; no family wording, prompt, manuscript, photo or generated asset is copied into it.
3. Versioned standard OpenAI prices calculate exact usage-based USD micros when the response exposes sufficient usage. Unknown models, service tiers or incomplete image usage stay visibly unpriced instead of being guessed.
4. A short-lived HMAC-signed internal API exposes summary and phase detail only to the WooCommerce bridge. The new **Pilotage Calitiki** screen requires `manage_woocommerce`; no customer API, creator screen or **Mes créations** response contains production costs.
5. Normal manufacture is separated from technical retries, quality repairs and paid customer changes so the economic model can distinguish baseline production from avoidable rework.
6. The candidate bridge is `0.7.5`; no new Render environment variable is introduced.

## Verification completed locally

- Focused cost-ledger tests: 7/7 passing.
- Complete `npm test` suite: 260/260 passing.
- `git diff --check`: passing.

## Next verification target

1. Review draft PR #101 without merging it.
2. Before merge, confirm that no scenario or preview is generating because Render will restart.
3. After deployment and Bridge `0.7.5` installation, create one new test book and compare **WooCommerce > Pilotage Calitiki** with the OpenAI usage export.
4. Verify that a customer account and **Mes créations Calitiki** expose no production-cost field, amount or navigation entry.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
