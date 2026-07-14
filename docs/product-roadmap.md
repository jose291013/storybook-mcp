# Product roadmap and durable handoff

Last updated: 2026-07-14

## Product flow

1. An anonymous visitor can complete all ten questions, choose the book configuration, and add up to five photos.
2. When the visitor requests an AI preview, the draft is preserved and WooCommerce authentication is required.
3. An authenticated customer authorizes one preview with either one credit or a single-use access code.
4. A credit is reserved at generation start, captured on success, and released after a technical failure. A redeemed code grants an idempotent retry for the same project after a technical failure.
5. The customer receives a low-definition, watermarked preview stored in **My creations**.
6. The customer may purchase an ebook, a printed book, or a future bundle.
7. After ebook payment, the unwatermarked PDF is available in the customer library and by a secure email link.
8. After print payment, high-definition production starts. The production range and shipping range are shown before payment and snapshotted on the order.

## Ownership boundaries

- WooCommerce: account, authentication source, cart, checkout, payment, order, subscription, transactional email trigger.
- Storybook service: draft, project, photos, blueprint, previews, print assets, ebook, credit ledger, access-code redemption, child profile, series memory.
- The WooCommerce bridge will issue a short-lived HMAC-signed customer token. The Storybook service never stores WooCommerce passwords.

## Series rules

- A `child_profile` contains the stable identity selected by the parent.
- A `series` contains its world, characters, approved continuity facts, and current progression.
- A `book_project` may be standalone or reference a series and episode number.
- Every episode has its own beginning, obstacle, resolution, and moral.
- A project stores a frozen continuity snapshot so later profile edits cannot change an old book.
- A preview becomes series canon only after explicit validation or purchase.

## Delivery phases

1. Persistent draft foundation: PostgreSQL schema, anonymous ownership, draft API, local autosave, and Woo identity contract.
2. Account gate and **My creations**: claim anonymous draft after login and list customer projects.
3. Preview entitlements: credit ledger, single-use codes, reservation/capture/release, idempotent retry.
4. WooCommerce checkout: configuration token, order metadata, signed webhooks, and payment-triggered finalization.
5. Fulfillment: secure ebook links, print-ready files, editable production rules, delivery estimate snapshots.
6. Series experience: child profiles, approved memory, episode planner, new obstacle selection.
7. Subscription: recurring credits and family plans after the series value is visible.

## Current implementation checkpoint

- The generator, low-definition preview, ebook PDF, print finalization, multilingual book output, visual styles, page counts, and book reader exist.
- Anonymous questionnaire choices are restored from browser storage, and a server-side project is created before preview generation.
- The project store uses PostgreSQL when `DATABASE_URL` is configured and a local JSON fallback during development.
- Anonymous projects can be claimed and listed through the signed WooCommerce customer-token contract.
- The WooCommerce login UI, preview credit/code gate, private object storage, and customer library UI remain for the next phases.
- `data/jobs.json` remains a local development store and must not be committed.

## New environment variables

- `DATABASE_URL`: PostgreSQL connection string. When absent, local draft JSON is used for development.
- `DATABASE_SSL=true`: enable PostgreSQL TLS with Render-compatible certificate handling.
- `DRAFT_SESSION_DAYS`: anonymous draft-cookie lifetime, default 7 days.
- `DRAFT_TTL_DAYS`: anonymous draft retention, default 7 days.
- `WOOCOMMERCE_BRIDGE_SECRET`: shared secret used to verify short-lived customer identity tokens.

## Resume prompt for a new Codex task

> Continue the Storybook MCP project from `docs/product-roadmap.md` and `AGENTS.md`. Inspect Git status and open PRs first. Preserve `data/jobs.json`. Continue the first incomplete delivery phase, run tests, then publish a focused draft PR.
