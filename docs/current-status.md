# Calitiki current status

Last updated: 2026-07-22

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/retry-rebate-capture`
- Latest merged checkpoint on `main`: `9e14dfe` — `Use compact visual contracts for reliable image generation (#43)`
- Current focused checkpoint: tested retry-rebate accounting correction awaiting commit and draft PR
- Draft PR: to be opened without merging or deploying
- Parallel draft PR: `#41` — initial scenario loading; it is separate and unmerged
- WordPress Bridge source/package: `0.6.2`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR 43 is merged and its compact image contract completed the previously blocked 36-page preview. Never merge this accounting correction or trigger Render until the user explicitly confirms that no preview generation is running and separately authorizes the merge.

## Current product brick: technical-retry rebate settlement

Project `7dee3296-9cfc-4796-aa5f-3aa6fdde8442` completed successfully under retry policy v4 and was then purchased using a WooCommerce promotion. Its production credit summary proves the accounting gap: `pageCount: 36`, `balanceCents: 2650`, `rebateCents: 0`. The failed attempt had released the EUR 4.00 reservation; the successful retry reused that released reservation id, but the former capture function ignored released reservations and therefore created no project purchase rebate.

This branch makes three focused corrections:

1. Capturing a successful retry may settle either a still-reserved reservation or its previously released original reservation.
2. Settling a released reservation adds exactly one compensating wallet debit and exactly one project purchase rebate; repeated completion calls remain idempotent in JSON and PostgreSQL.
3. Before opening checkout for a legacy completed-but-unpurchased preview, the service reconciles its stored preview reservation. Projects already marked purchased are never altered automatically, preventing a second discount after payment.

No persistence schema, price, WooCommerce product or coupon behavior changes in this brick.

## Verification completed locally

- Focused promotion, JSON/PostgreSQL released-retry capture and personalized-checkout tests pass.
- Syntax checks pass for the credit store and checkout route.
- Full `npm.cmd test`: 113 passed, 0 failed.

## Next verification target

1. Review the accounting diff, then publish a draft PR without merging it.
2. Keep PR 41 separate and unmerged.
3. Do not modify the already paid order or create a new rebate for its purchased project automatically; any commercial gesture for the consumed WooCommerce promotion is a separate explicit business decision.
4. After a separate merge authorization, validate the next technical retry or a controlled local ledger case: one final preview debit, one equal project rebate, no duplicate on refresh or checkout.

## Separate later brick

Permanent deletion of unfinished or unpaid creations remains separate. It must delete private assets idempotently, preserve purchased books/order history/series canon, and require explicit confirmation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
