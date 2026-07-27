# Calitiki current status

Last updated: 2026-07-27

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/reconcile-woocommerce-purchases`
- Latest merged checkpoint: PR #76 — orphaned purchase reconciliation
- Current focused checkpoint: retroactive reconciliation of WooCommerce paid projects with legacy Render commerce rows
- Pull request: not published yet
- WordPress Bridge source candidate: `0.7.2`; installed production package remains `0.7.1`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #76 are merged. Bridge 0.7.1 is the active WordPress package.

## Current product brick: orphaned purchase reconciliation

1. A project is protected from deletion only by a currently paid eBook/print order or series canon, not by a stale `purchased` status.
2. Cancelling, failing or refunding the last paid book order restores the project to its preview lifecycle.
3. Non-paid order history remains auditable behind a project deletion tombstone while the creation and private files disappear from the customer account.
4. The creator restores the authoritative page count and explains expired legacy preview assets instead of rendering blank pages as a valid purchasable book.
5. Production showed one older Render commerce row still marked paid although WooCommerce no longer exposed a paid order card. Bridge 0.7.2 therefore sends a complete signed snapshot of the customer’s currently paid project ids so Render can reconcile this legacy mismatch before listing or deletion.

## Verification completed locally

- Full local suite passes: 184 tests, 0 failures.

## Next verification target

1. Publish a draft pull request for the retroactive WooCommerce reconciliation.
2. Merge only after explicit confirmation that no preview or quality correction is running; deploy Render before installing Bridge 0.7.2.
3. Install Bridge 0.7.2, then reload **My creations Calitiki** and confirm **Noa y su castillo mágico** exposes **Supprimer définitivement**.
4. Confirm **La machine à souvenirs** and every genuinely paid book still have no deletion action.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
