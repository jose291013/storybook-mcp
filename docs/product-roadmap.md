# Product roadmap and durable handoff

Last updated: 2026-07-22

## Product flow

1. An anonymous visitor can complete all ten questions, choose the book configuration, and add up to five photos.
2. When the visitor requests an AI preview, the draft is preserved and WooCommerce authentication is required.
3. An authenticated customer sees the exact preview price, may apply a single-use access code, and explicitly confirms the displayed wallet debit. A sufficient balance never starts generation automatically.
4. A credit is reserved at generation start, captured on success, and released after a technical failure. A redeemed code grants an idempotent retry for the same project after a technical failure.
5. Before any illustration is generated, Calitiki performs one whole-manuscript continuity pass, then creates an authoritative structured contract for every facing spread. Each contract fixes the central action (subject, verb and target), recurring named characters, distinct generic characters, required objects and groups, quantities, physical scale, spatial relationships and forbidden substitutions. Names entered with uploaded photos are immutable canonical identifiers throughout prose, cast and image prompts. Illustration QA rejects objective production defects such as corruption, blank output, repeated bands or incomplete rendering. A separate continuity comparison groups rendering into broad families and may request one stronger style regeneration, while a bounded semantic comparison may request one regeneration for a clear contradiction of the structured scene contract. If the second output is technically sound, a subjective style or semantic-QA disagreement is logged but never aborts the whole book. If OpenAI rejects branded identity pixels for safety, Calitiki retries once with the already-derived non-branded identity canon while retaining the safe cover-style reference.
6. The customer receives a low-definition, watermarked preview stored in **My creations**.
7. The customer may purchase an ebook, a printed book, or a future bundle. After buying an eBook, the customer may separately purchase AI narration with a chosen voice and narration style.
8. After ebook payment, the unwatermarked PDF is available in the customer library and by a secure email link.
9. After print payment, high-definition production starts. The production range and shipping range are shown before payment and snapshotted on the order.

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
- A paid eBook creation exposes **Create a new adventure** in WooCommerce My Account. The action authenticates through the signed bridge and creates the next editable episode without an AI call or wallet debit.
- The new episode copies the ten answers, configuration and private character-photo references. The customer may change the new obstacle, dream, roles, cast or photos before requesting a separately priced preview.
- Repeating the action for the same source book is idempotent: it reopens the existing unfinished next episode instead of creating duplicates.

## Post-preview experience and credit wallet

- After a successful preview, the questionnaire and generation controls are replaced by one action center directly below the book reader. The original preview is immutable and a second generation can never be triggered accidentally.
- The connected creator header shows the current wallet balance at every step. Immediately before preview, a separate confirmation button displays the exact amount that will be used; promotion codes remain available before that decision. The WooCommerce **My account** area shows the same balance, recent ledger history and a **Buy credits** action.
- The post-preview action center shows the remaining credit balance, **Request a change**, **Regenerate**, **Buy the eBook**, **Buy the printed book**, and **Buy credits**. Production and delivery estimates are shown beside the printed-book action before checkout.
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
4. WooCommerce checkout: credit products, configuration token, partial credit application, order metadata, signed webhooks, and payment-triggered finalization. **Paid credit products, signed wallet grants, project-bound eBook/print cart creation, preview-rebate reservation and paid/cancelled/refunded settlement are implemented. Applying unused wallet balance beyond the project preview rebate and production fulfillment remain.**
5. Fulfillment: secure ebook links, print-ready files, editable production rules, delivery estimate snapshots. **Paid eBook fulfillment, private S3-compatible storage, expiring download links, retryable WooCommerce notification and the purchased eBook account view are implemented; production storage credentials must be configured. Print production remains.**
6. Series experience: **foundation implemented** with purchased-book canon, child profiles, approved memory, private character reuse and an idempotent editable next-episode draft. A richer episode planner and series library remain.
7. Subscription: recurring credits and family plans after the series value is visible.

## Current implementation checkpoint

- Calitiki Bridge 0.6.0 adds **Create a new adventure** to every paid eBook in **My creations**. The Storybook service creates or reuses the series and child profile, marks the purchased source as episode 1, freezes its continuity memory, and opens episode 2 with the original ten answers, book choices and authenticated private reference photos. No generation begins until the customer edits the draft, reviews it and explicitly confirms a new preview debit.

- The generator, low-definition preview, ebook PDF, print finalization, multilingual book output, visual styles, page counts, and book reader exist.
- The installable interactive reader under `/interactive-reader/` now accepts either its public demonstration manifest or an authenticated `?project=<id>` book. A completed preview is converted without AI calls into a private manifest containing its cover, opening text, correctly paired narrative spreads and closing moral. The manifest, every illustration and every purchased narration file remain authenticated and `no-store`; the service worker never caches `/api/` responses. Without the paid option, the reader keeps using the free voice installed on the customer device.
- Paid books created before raw illustration assets were stored privately can reuse their already-private composed illustration pages in the interactive reader. This compatibility path never calls image generation and never spends credits.
- Anonymous questionnaire choices are restored from browser storage, and a server-side project is created before preview generation.
- The project store uses PostgreSQL when `DATABASE_URL` is configured and a local JSON fallback during development.
- Anonymous projects can be claimed and listed through the signed WooCommerce customer-token contract.
- The installable `wordpress/calitiki-bridge` plugin sends logged-in customers back from WooCommerce with a five-minute HMAC identity token. The generator exchanges it for its own HTTP-only customer session and resumes the saved preview request.
- Preview generation requires an authenticated customer-owned project. The preview credit/code gate is implemented behind `PREVIEW_ENTITLEMENTS_ENABLED`; private object storage and the customer-library UI remain for later phases.
- Personalized eBook and print products can no longer be added directly to the cart. Their product pages lead to the creator; only a short-lived signed link issued after a completed preview can select the matching page-count variation and attach the project to the WooCommerce cart.
- Successful preview spend is reserved as a project rebate when checkout starts, deducted from the configured book line, captured on payment, and released after cancellation, failure or refund.
- Preview spending requires a distinct customer confirmation after authentication and after wallet/code choices are displayed. The creator header exposes the live balance, and Calitiki Bridge 0.4.0 adds a signed wallet/history page to WooCommerce My account.
- The WordPress theme is prepared for TranslatePress with an accessible flag-and-language dropdown. Active languages keep the same page context, and links to the external creator carry the selected FR/ES/EN interface language. TranslatePress Multiple Languages is required to publish all three languages simultaneously.
- The storefront is mobile-first: on a visitor's first visit the browser language selects an available TranslatePress language, while an explicit language choice is remembered and takes precedence afterward. The mobile navigation must cover the page instead of being clipped by it, and WooCommerce account navigation scrolls the requested account panel into view on small screens.
- Long passages in the interactive reader keep the customer's selected typography and scroll directly inside the text card; no separate “read more” expansion step is required.
- The interactive reader is installable from iPhone and compatible browsers only after a private customer book has loaded successfully. Its per-book manifest carries the non-secret project id in the installed start URL, because iPhone Home Screen apps may not share Safari storage. It also remembers only that project id on the device, never private assets or credentials. An expired private session uses the existing signed WooCommerce bridge to reauthenticate and return to the same book. The public demonstration cannot be installed, iPhone installation guidance is visible in the reader, and service-worker upgrades reload the app automatically.
- The launch offer is presented as one **Calitiki digital pack**: the downloadable PDF and the private interactive reader are included in the same eBook purchase. Calitiki Bridge 0.5.6 independently keeps the printed WooCommerce product non-purchasable by default, labels it **Coming soon** in the catalog, and blocks direct or signed checkout attempts. It can later be enabled from WooCommerce > Calitiki Bridge when the print supplier is ready; Render's `PRINT_BOOK_ENABLED` flag must be enabled at the same time.
- The external creator header provides a localized return to Calitiki. It remembers a trusted Calitiki referrer path without retaining query parameters or commerce authentication tokens, and otherwise falls back to the FR, ES or EN storefront home.
- A paid personalized eBook order now creates one idempotent commerce record, generates the low-definition unwatermarked PDF, stores it in a private S3-compatible bucket and returns an expiring signed link. WooCommerce sends a separate localized “eBook ready” email and exposes a fresh link under **My creations Calitiki**. Processing/completed orders with a zero total after coupons follow the exact same paid flow; failed callbacks are retried with WP-Cron, and refunded deliveries are revoked.
- eBook assembly is distinct from print imposition: after the cover and opening, every narrative spread is ordered **text then illustration**, followed by the closing moral. Existing paid PDFs with the legacy print-side alternation are detected from their storage key and rebuilt in the background from the same private preview assets, without regenerating illustrations. **My creations Calitiki** automatically retries a ready-message that was never recorded and provides an authenticated **Resend email** action with an explicit SMTP failure notice.
- New preview covers and composed pages are copied to the same private S3-compatible storage as soon as they are generated. The reader serves them through a customer-authenticated route, and paid eBook assembly reads those durable objects instead of relying on Render's ephemeral filesystem. Legacy previews created before this checkpoint must be rebuilt once if their local source files were lost.
- New reference photos are normalized and written directly to the same private object storage before a draft may be generated. The AI receives an in-memory private image payload rather than a public child-photo URL, and generation is rejected before credit reservation if any reference object is missing. Legacy previews affected by Render's former ephemeral upload directory may use one controlled, no-charge rebuild after the customer uploads the photos again.
- Every new draft illustration passes a low-cost technical file check before it reaches the reader. Only corrupted, blank, striped or visibly incomplete outputs are regenerated automatically, with two attempts by default; wardrobe, cast, composition and aesthetic preferences never trigger an automatic retry. Before purchase, the customer may report a suspected technical defect. The server inspects the existing private asset first and regenerates it only when an objective defect is confirmed. Each successfully completed page check is counted once, at most three pages per project can be checked, and only bounded confirmed repairs may launch image generation (maximum two image attempts per request). A first failed repair consumes neither wallet credit nor the customer's free retry: its page becomes explicitly retryable and the exact server-side failure category is logged for support. A second failed repair on the same page stops automatic costs and requires manual support. Purchased revisions are never overwritten. Aesthetic improvement remains a separate paid modification.
- Automatic book generation treats style comparison as a bounded continuity aid rather than a fatal gate. A first categorical mismatch triggers one regeneration with the locked cover medium emphasized. A technically coherent second result is persisted with an `approved-with-style-warning` diagnostic instead of failing the preview. Retry-policy version 3 grants projects exhausted under the former fatal style gate one checkpointed recovery, reusing every completed page.
- OpenAI calls now have explicit bounded timeouts and no hidden SDK retries by default. Text agents require JSON mode, accept a safely extracted balanced object if a model adds formatting, and rebuild an invalid response once with the original task context and schema. Image attempts are logged with the job and page number. After a deployment or a generation with no progress, the same customer project can recover its abandoned job: every still-reserved preview credit is released idempotently before the technical retry, so the customer is never charged twice.
- Preview generation now checkpoints the narrative agents, character canons, approved blueprint, written page text, cover and every completed page in PostgreSQL/private storage. Losing an ephemeral Render job never restarts generation automatically: the customer sees a reassuring failure state and may explicitly use one free technical retry, which resumes at the first missing step. A failed second technical attempt is stopped for manual support so it cannot create an unbounded API bill. During generation, an authenticated customer may opt into a WooCommerce transactional email when the preview is ready; WhatsApp remains a later channel requiring explicit opt-in and a configured Business provider.
- A purchased digital creation can issue up to three simultaneous private family invitations. Each invitation uses a 256-bit unguessable token stored only as a hash, expires after 7 or 30 days, is revocable immediately and exchanges into a read-only HTTP-only guest session for exactly one interactive book. Guest manifests and assets remain private, `no-store` and non-indexable; the secret invitation disappears from the browser address after exchange. The raw link is shown to the owner only once. If AI narration was purchased, the same protected family reader may play it without exposing the S3 object.
- Paid AI narration is a separate WooCommerce variable product (`narration-ia-calitiki`, SKU `CAL-NARRATION`) available only from a paid eBook creation. The customer selects one of four voices and one of four narration styles, hears an explicitly requested cached sample, acknowledges that the voice is synthetic, and then checks out. No narration API call for the full book occurs before payment. This line never receives or consumes the preview rebate. Render uses the dedicated Speech endpoint, with the exact scene text isolated from delivery instructions; Spanish books request neutral European Spanish from Spain rather than a Latin American accent. It generates one private MP3 per interactive scene, checkpoints the delivery manifest after every scene, and resumes from the first missing scene after interruption without a second purchase or duplicate API spend. A ready narration may be replaced through a new WooCommerce order (including a merchant coupon); the previous ready version remains active until the replacement is complete. A queued or generating narration blocks duplicate checkout, while a failed paid narration exposes an explicit free technical retry that resumes its existing checkpoint.
- `data/jobs.json` remains a local development store and must not be committed.

## New environment variables

- `DATABASE_URL`: PostgreSQL connection string. When absent, local draft JSON is used for development.
- `DATABASE_SSL=true`: enable PostgreSQL TLS with Render-compatible certificate handling.
- `DRAFT_SESSION_DAYS`: anonymous draft-cookie lifetime, default 7 days.
- `DRAFT_TTL_DAYS`: anonymous draft retention, default 7 days.
- `WOOCOMMERCE_BRIDGE_SECRET`: shared secret used to verify short-lived customer identity tokens.
- `WOOCOMMERCE_BRIDGE_URL`: public connection URL displayed in WooCommerce > Calitiki Bridge.
- `WOOCOMMERCE_CHECKOUT_URL`: optional WooCommerce checkout bridge base URL. When empty, it is derived from `WOOCOMMERCE_BRIDGE_URL`.
- `PRINT_BOOK_ENABLED`: feature flag for printed-book selection and checkout. It defaults to `false`, leaving the format visible as **Coming soon** while the eBook remains purchasable.
- `CUSTOMER_SESSION_DAYS`: lifetime of the generator's HTTP-only customer session, default 7 days.
- `PREVIEW_ENTITLEMENTS_ENABLED`: activates the preview wallet gate after promotion codes or paid credit fulfillment are configured.
- `PREVIEW_PROMO_CODES`: comma-separated `CODE:AMOUNT_IN_EURO_CENTS` campaign codes; each code can be redeemed once per WooCommerce customer.
- `WOOCOMMERCE_CREDITS_URL`: WooCommerce URL used by the generator's **Buy credits** action.
- `PRIVATE_STORAGE_BACKEND=s3`: private production delivery backend. `local` is allowed only for local development.
- `PRIVATE_STORAGE_ENDPOINT`, `PRIVATE_STORAGE_REGION`, `PRIVATE_STORAGE_BUCKET`, `PRIVATE_STORAGE_ACCESS_KEY_ID`, `PRIVATE_STORAGE_SECRET_ACCESS_KEY`, `PRIVATE_STORAGE_FORCE_PATH_STYLE`: credentials and compatibility options for the private S3-compatible bucket.
- `DELIVERY_SIGNING_SECRET`: secret used for expiring eBook links; minimum 32 characters and preferably different from the WooCommerce bridge secret.
- `FAMILY_SHARE_SIGNING_SECRET`: optional dedicated secret for family-reader sessions. When absent, `DELIVERY_SIGNING_SECRET` is reused; a separate 32+ character value is preferred in production.
- `EBOOK_LINK_DAYS`: emailed eBook link lifetime, default 7 days. Customers can request a fresh link from their account.
- `SHARP_CONCURRENCY`, `SHARP_CACHE_MEMORY_MB`: cap native image-processing concurrency and cache usage on memory-constrained Render instances (defaults: 1 and 16 MB).
- `IMAGE_CONTENT_QA_ENABLED`: enables visual content inspection of generated illustrations (default enabled; set to `false` only for local troubleshooting).
- `IMAGE_QA_MODEL`: vision model used for the economical illustration check, default `gpt-4.1-mini`.
- `IMAGE_GENERATION_ATTEMPTS`: maximum automatic attempts for a technically defective illustration, default 2.
- `IMAGE_SCENE_QA_ENABLED`: enables the economical structured-scene fidelity check (default enabled). It checks only clear action/cast/quantity/scale contradictions and fails open if the QA service itself is unavailable.
- `OPENAI_REQUEST_TIMEOUT_MS`, `OPENAI_IMAGE_TIMEOUT_MS`, `OPENAI_QA_TIMEOUT_MS`: maximum duration of general, image and technical-QA calls (defaults 180000, 180000 and 60000 ms).
- `OPENAI_REQUEST_MAX_RETRIES`, `OPENAI_IMAGE_MAX_RETRIES`, `OPENAI_QA_MAX_RETRIES`: SDK-level retries for the corresponding calls (default 0; the product-level idempotent retry remains authoritative).
- `PREVIEW_STALE_MINUTES`: no-progress period after which a preview job can be recovered, default 15 minutes.
- `REFERENCE_PHOTO_RECOVERY_CUTOFF`: optional ISO timestamp limiting the one-time free rebuild to legacy previews created before durable reference-photo storage was deployed.
- `NARRATION_TTS_MODEL`: Speech-endpoint model used only for paid narration generation and cached voice samples; defaults to `gpt-4o-mini-tts`. The former conversational `NARRATION_MODEL` setting is intentionally ignored.

## Resume prompt for a new Codex task

> Continue the Storybook MCP project from `docs/product-roadmap.md` and `AGENTS.md`. Inspect Git status and open PRs first. Preserve `data/jobs.json`. Continue the first incomplete delivery phase, run tests, then publish a focused draft PR.
