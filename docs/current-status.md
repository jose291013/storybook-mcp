# Calitiki current status

Last updated: 2026-07-27

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/reconcile-orphaned-purchases`
- Latest merged checkpoint: PR #75 — real cover titles for purchased books
- Current focused checkpoint: reconcile stale purchased projects with paid WooCommerce orders and explain expired legacy preview assets
- Pull request: not published yet
- WordPress Bridge source and installed production package: `0.7.1`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #75 are merged. Bridge 0.7.1 is the active WordPress package.

## Current product brick: orphaned purchase reconciliation

1. A project is protected from deletion only by a currently paid eBook/print order or series canon, not by a stale `purchased` status.
2. Cancelling, failing or refunding the last paid book order restores the project to its preview lifecycle.
3. Non-paid order history remains auditable behind a project deletion tombstone while the creation and private files disappear from the customer account.
4. The creator restores the authoritative page count and explains expired legacy preview assets instead of rendering blank pages as a valid purchasable book.
5. This brick does not require a new Bridge package; Bridge 0.7.1 already renders the server-provided deletion entitlement.

## Verification completed locally

- Targeted commerce, deletion and creator-reader tests pass: 9 passed, 0 failed.
- Complete test suite: 183 passed, 0 failed.

## Next verification target

1. Publish a draft pull request.
2. Do not merge without explicit user confirmation and confirmation that no preview or quality correction is running, because Render may restart.
3. After deployment, reload **My creations Calitiki** and confirm the stale **Noa y su castillo mágico** card exposes **Supprimer définitivement**.
4. Open the stale preview once and confirm Calitiki shows the expired-files explanation with 32 pages, not a blank 24-page purchasable book.
5. Confirm a genuinely paid book still has no deletion action.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
