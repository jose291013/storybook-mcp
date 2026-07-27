# Calitiki current status

Last updated: 2026-07-27

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/reposition-homepage`
- Latest merged checkpoint: PR #77 — retroactive WooCommerce purchase reconciliation
- Current focused checkpoint: public positioning, trust explanation and persistent customer-library navigation
- Pull request: not published yet
- WordPress Bridge source candidate: `0.7.2`; installed production package remains `0.7.1`
- WordPress theme source candidate: `1.2.0`; installed production theme remains `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #77 are merged. Bridge 0.7.1 remains the active WordPress package until Render has deployed the new endpoint.

## Current product brick: meaning-led storefront

1. The homepage starts with the adult's intention and shows how it becomes an adventure experienced by the child.
2. Three concrete examples connect an adult concern, an adventure and a discovery made through action.
3. The public flow explains scenario validation, AI assistance, private assets and optional paid synthetic narration without overpromising.
4. The creator header exposes a localized, strictly validated return to **My creations Calitiki** at every step.
5. Theme 1.2.0 packages the new responsive storefront; the Render creator carries the matching FR, ES and EN navigation and trust copy.

## Previous product brick: orphaned purchase reconciliation

1. A project is protected from deletion only by a currently paid eBook/print order or series canon, not by a stale `purchased` status.
2. Cancelling, failing or refunding the last paid book order restores the project to its preview lifecycle.
3. Non-paid order history remains auditable behind a project deletion tombstone while the creation and private files disappear from the customer account.
4. The creator restores the authoritative page count and explains expired legacy preview assets instead of rendering blank pages as a valid purchasable book.
5. Production showed one older Render commerce row still marked paid although WooCommerce no longer exposed a paid order card. Bridge 0.7.2 therefore sends a complete signed snapshot of the customer’s currently paid project ids so Render can reconcile this legacy mismatch before listing or deletion.

## Verification completed locally

- Focused theme integration test passes.
- Desktop and mobile visual checks completed for the storefront and creator header.
- Installable Theme 1.2.0 archive inspected with the expected top-level `calitiki-theme` folder.
- Full local suite passes: 184 tests, 0 failures.

## Next verification target

1. Publish a focused draft PR without merging it.
2. Review the final public copy and responsive screenshots.
3. Before any later merge, confirm explicitly that no preview, cover or quality correction is running because Render may restart.
4. After Render has deployed the merge, install Theme 1.2.0 and verify the storefront plus the creator's **Mes créations** return.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
