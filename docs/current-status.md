# Calitiki current status

Last updated: 2026-07-24

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/credit-purchase-return`
- Latest merged checkpoint: PR #52 — universe-first story funnel (`40e14dd`)
- Current focused checkpoint: contextual return from WooCommerce credit purchase to the originating book and creator step
- Pull request: not published yet; do not merge while any preview or targeted modification is generating
- WordPress Bridge source/package: `0.6.8`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

Production verification after PR #52 is in progress through a real customer book. This branch changes only credit-purchase navigation and signed return state; generation, visual proof, book checkout and delivery remain unchanged.

## Current product brick: credit purchase return

1. Every creator **Buy credits** link carries the saved project id and its origin: preview authorization, completed-book action center or targeted modification.
2. Calitiki Bridge keeps that bounded context in the WooCommerce session, cart item and order line.
3. The credit product, cart and checkout keep a reassuring **Return to my book** action even when the purchase is abandoned.
4. The order confirmation distinguishes credited, synchronizing, pending, failed and cancelled payments.
5. The signed WooCommerce bridge reopens the owned project, restores the correct creator surface and refreshes the wallet balance.
6. A bounded browser refresh detects a just-settled credit webhook without starting generation or spending credit.

## Verification completed locally

- Browser and server syntax checks pass.
- WordPress Bridge 0.6.8 parses successfully with the project PHP parser.
- Full `npm.cmd test`: 130 passed, 0 failed, including packaged Bridge path verification.

## Next verification target

1. Package Bridge 0.6.8, run `npm.cmd test`, then publish a draft pull request without merging it.
2. Finish the real book already being created against the PR #52 production checkpoint.
3. Before any later merge, warn that Render may restart and confirm that no preview or targeted modification is generating.
4. After deployment and Bridge 0.6.8 installation, verify one paid credit return and one abandoned-cart return from the preview credit panel.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
