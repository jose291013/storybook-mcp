# Product roadmap and durable handoff

Last updated: 2026-07-15

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

## Post-preview experience and credit wallet

- After a successful preview, the questionnaire and free-generation button are replaced by one action center directly below the book reader. The original preview is immutable and a second generation can never be triggered accidentally.
- The action center shows the current credit balance, **Request a change**, **Regenerate**, **Buy the eBook**, **Buy the printed book**, and **Buy credits**. Production and delivery estimates are shown beside the printed-book action before checkout.
- Preview credit is stored as a euro-cent wallet. The configured preview prices are **EUR 2.50 / 3.00 / 3.50 / 4.00 / 4.50 / 5.00 including tax** for 24 / 28 / 32 / 36 / 40 / 44 pages. The amount is snapshotted on reservation.
- Promotion codes have a configurable euro-cent value of EUR 2.50 or more. A campaign code may be redeemed once per WooCommerce customer; an individual code can use the same mechanism with a single intended customer. If the code does not cover the selected preview, the missing wallet credit must be purchased before generation.
- Every successful preview consumes its reserved wallet amount and creates an equal purchase rebate tied to that book project. Multiple previews remain possible while the wallet is funded; their successful charges accumulate as purchase rebate for that project only. A targeted modification creates a new revision and must quote the affected spreads before reservation.
- Credits are purchased through WooCommerce products. A signed paid-order webhook grants append-only entries in the Storybook credit ledger.
- Credits may also be applied to an eBook or printed-book checkout at their snapshotted monetary value. The Storybook service reserves the selected balance and issues a short-lived signed credit application to WooCommerce; WooCommerce applies it as an order discount and collects any remainder by its configured payment methods. A paid/cancelled/refunded webhook captures or releases the reservation.
- WooCommerce remains authoritative for tax, invoice, refund and payment presentation. Storybook remains authoritative for available, reserved and spent credit ledger entries. Every grant, reservation, capture, release and checkout conversion is idempotent and auditable.
- A text or illustration correction never overwrites a purchased or explicitly approved revision. Series canon changes only when the customer approves or purchases the new revision.

## Delivery phases

1. Persistent draft foundation: PostgreSQL schema, anonymous ownership, draft API, local autosave, and Woo identity contract.
2. Account gate and **My creations**: claim anonymous draft after login and list customer projects. **Account gate implemented; customer-library UI remains.**
3. Preview entitlements: credit ledger, per-customer promotion codes, reservation/capture/release, project purchase rebate, idempotent retry. **Core implementation present behind `PREVIEW_ENTITLEMENTS_ENABLED`; WooCommerce paid credit fulfillment remains phase 4.**
4. WooCommerce checkout: credit products, configuration token, partial credit application, order metadata, signed webhooks, and payment-triggered finalization. **Paid credit products and their signed idempotent wallet-grant webhook are implemented; applying project rebates to ebook/print checkout remains.**
5. Fulfillment: secure ebook links, print-ready files, editable production rules, delivery estimate snapshots.
6. Series experience: child profiles, approved memory, episode planner, new obstacle selection.
7. Subscription: recurring credits and family plans after the series value is visible.

## Current implementation checkpoint

- The generator, low-definition preview, ebook PDF, print finalization, multilingual book output, visual styles, page counts, and book reader exist.
- Anonymous questionnaire choices are restored from browser storage, and a server-side project is created before preview generation.
- The project store uses PostgreSQL when `DATABASE_URL` is configured and a local JSON fallback during development.
- Anonymous projects can be claimed and listed through the signed WooCommerce customer-token contract.
- The installable `wordpress/calitiki-bridge` plugin sends logged-in customers back from WooCommerce with a five-minute HMAC identity token. The generator exchanges it for its own HTTP-only customer session and resumes the saved preview request.
- Preview generation now requires an authenticated customer-owned project. The preview credit/code gate, private object storage, and customer library UI remain for the next phases.
- `data/jobs.json` remains a local development store and must not be committed.

## New environment variables

- `DATABASE_URL`: PostgreSQL connection string. When absent, local draft JSON is used for development.
- `DATABASE_SSL=true`: enable PostgreSQL TLS with Render-compatible certificate handling.
- `DRAFT_SESSION_DAYS`: anonymous draft-cookie lifetime, default 7 days.
- `DRAFT_TTL_DAYS`: anonymous draft retention, default 7 days.
- `WOOCOMMERCE_BRIDGE_SECRET`: shared secret used to verify short-lived customer identity tokens.
- `WOOCOMMERCE_BRIDGE_URL`: public connection URL displayed in WooCommerce > Calitiki Bridge.
- `CUSTOMER_SESSION_DAYS`: lifetime of the generator's HTTP-only customer session, default 7 days.
- `PREVIEW_ENTITLEMENTS_ENABLED`: activates the preview wallet gate after promotion codes or paid credit fulfillment are configured.
- `PREVIEW_PROMO_CODES`: comma-separated `CODE:AMOUNT_IN_EURO_CENTS` campaign codes; each code can be redeemed once per WooCommerce customer.
- `WOOCOMMERCE_CREDITS_URL`: WooCommerce URL used by the generator's **Buy credits** action.

## Resume prompt for a new Codex task

> Continue the Storybook MCP project from `docs/product-roadmap.md` and `AGENTS.md`. Inspect Git status and open PRs first. Preserve `data/jobs.json`. Continue the first incomplete delivery phase, run tests, then publish a focused draft PR.
