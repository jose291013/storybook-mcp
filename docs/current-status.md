# Calitiki current status

Last updated: 2026-07-27

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `main`
- Latest merged checkpoint: PR #79 — intention-first creator flow and storefront hero overlap correction
- Current focused checkpoint: production deployment and Theme 1.2.1 installation verification
- Pull request: PR #79 merged
- WordPress Bridge source candidate: `0.7.2`; installed production package remains `0.7.1`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #79 are merged. The meaning-led storefront is live and its Spanish translation has been entered in WordPress.

## Current product brick: intention-first flow alignment

1. The creator starts with the adult's situation or message, before asking who the child is or showing a visual universe.
2. The no-credit intention assistant works only from that situation and does not invent child or world details.
3. Child details come second; universe choice and the three personalized adventure approaches come third.
4. Existing version-3 browser drafts retain their saved step and answers while new drafts use flow version 4.
5. Theme 1.2.1 keeps the intention note, arrow and adventure caption separately visible and selectable in TranslatePress.

## Previous product brick: meaning-led storefront

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

- Previous merged checkpoint: 184 tests, 0 failures.
- Intention-first funnel and theme integration tests pass.
- Wide-desktop visual check confirms zero overlap between the intention note and the adventure caption.
- Mobile visual check confirms a vertical, overflow-free composition.
- Theme 1.2.1 archive contains the expected top-level `calitiki-theme` folder.
- Full local suite passes: 184 tests, 0 failures.

## Next verification target

1. Wait for Render to deploy merge commit `cf1ec5a729bfdba5472886ea852f7fcdfd0d4c54`.
2. Install Theme 1.2.1 after the Render deployment is live.
3. Translate the now-visible adventure caption in WordPress.
4. Verify in FR and ES that the creator starts with intention, then child details, then universe and adventure suggestions.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
