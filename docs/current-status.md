# Calitiki current status

Last updated: 2026-07-22

This is the short operational memory for a new Codex task. Product rules and architecture remain authoritative in `docs/product-roadmap.md`; repository working rules remain authoritative in `AGENTS.md`.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local working folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/scene-planner-timeout`
- Latest merged product-code checkpoint: `6ed7c02` — `Add whole-book scene coherence contracts`
- Current focused fix checkpoint: `17faf67` — `Extend whole-book scene planning timeout`
- WordPress Bridge source version: `0.6.0`
- WordPress theme source version: `1.1.5`
- Render service: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

Do not assume that the Git checkpoint, Render deployment, WordPress plugin, and WordPress theme are synchronized. Confirm their displayed versions and deployed commit before diagnosing production behavior.

## Current product state

- The scene-contract coherence brick is merged into `main` and its live execution was confirmed on project `66ca304a-4ee3-498e-b0f8-145216fb6874`. Its 36 page texts were checkpointed through `text:36`, then the whole-book `story:coherence-and-scene-contracts` request exceeded the former 180-second general limit. Fix `17faf67` gives only this larger response a dedicated 360-second timeout, retains zero hidden SDK retries, and adds start/completion timing plus exact failure-step logging. After all page texts exist, the pass minimally reconciles narrative continuity and creates one structured contract per spread before any illustration begins. Photo-upload names are immutable canon (for example `Mathéo` cannot become `Mathieu`); named observers cannot replace generic friends; main actions, objects, quantities, scale and spatial relationships are carried into preview, repair and final-generation prompts. A low-cost bounded scene check may request one correction, but an advisory-QA failure cannot abort a technically coherent book.

- The first series brick is implemented on the current branch: a paid eBook can create one idempotent editable next-adventure draft, reusing the ten answers and private character references without an AI call. It is not deployed until this branch is merged and Bridge 0.6.0 is installed.

- The personalized eBook purchase includes the downloadable PDF and private interactive reader.
- The printed book remains visible as **Coming soon** and must remain non-purchasable until the supplier and both feature flags are ready.
- Preview generation is authenticated, wallet-gated, checkpointed, resumable, and protected against duplicate technical retries.
- Reference photos, generated assets, eBooks, family-reader assets, and paid narration are private and use authenticated or signed access.
- A paid digital creation can issue up to three revocable private family links.
- Paid AI narration is a separate WooCommerce product. It uses private per-scene audio, resumes from checkpoints, and reads only the page text.
- Spanish narration requests European Spanish; French narration requests French from France.
- A completed narration can be replaced only through a new WooCommerce order. The previous ready narration stays active until the replacement succeeds.

For the complete implementation checkpoint and all environment variables, read `docs/product-roadmap.md`.

## Next verification target

Deploy `17faf67`, optionally set `OPENAI_STORY_TIMEOUT_MS=360000` explicitly on Render, and then use the existing free technical retry for project `66ca304a-4ee3-498e-b0f8-145216fb6874`. Confirm that Render logs `[preview] story scene plan started`, reuses every text through `text:36` without another text call or wallet debit, reaches `[preview] story scene plan completed` within the dedicated limit, persists phase `scene-contracts`, and continues with the cover. Do not consume the retry before this deployment is live.

After merge, create a fresh story containing (1) a named photographed brother who only observes, (2) a new anonymous friend who shakes the hero's hand, and (3) three explicitly very large slides. Confirm that every uploaded name spelling remains exact, the generic friend stays distinct, the illustration shows the correct handshake, and the requested quantity and scale are visible. Confirm Render reaches `story:coherence-and-scene-contracts` once before the first interior illustration and a resumed job reuses that checkpoint without repeating the text call.

Verify project `6760b75e-84d6-4c37-a545-32b798b3e771` after deploying `codex/stable-style-continuity`. Its exhausted checkpoint must receive exactly one recovery under retry-policy version 3 and resume from the first missing illustration. A first categorical style mismatch may cause one regeneration; a technically coherent second image must log `approved-with-style-warning`, persist, and let the remaining book finish without another wallet debit. Objective corrupt, blank or incomplete files remain blocking.

Verify project `0c04bb8a-bc29-4a7a-84e6-be5adbc68d0a` after deploying this branch: page 8 must become eligible again under technical-check policy version 3. If its repair fails, the free entitlement and retry button must remain available and Render must log `[preview-repair] failed` with its page, step and failure category. A successful repair must keep page 35's photographic rendering medium. Then verify pages 12 and 32 under the same bounded behavior.

Verify the image-safety recovery on project `0c04bb8a-bc29-4a7a-84e6-be5adbc68d0a`: completed pages must be reused, a stylistic QA comment such as “photo-realistic style” must not reject a coherent image, and an OpenAI safety rejection caused by branded reference pixels must retry once using the non-branded textual identity canon. The legacy exhausted checkpoint receives one additional recovery under retry-policy version 2.

Verify the series-foundation flow end to end after merge:

1. Install Calitiki Bridge 0.6.0 and purge the WordPress cache.
2. Open a paid eBook under **My creations Calitiki** and click **Create a new adventure**.
3. Confirm that the creator opens at step 1 with all ten answers, choices and private reference photos restored.
4. Change the obstacle, one role and one photo; confirm the source purchased book remains unchanged.
5. Click the series action twice and confirm the unfinished episode is reopened rather than duplicated.
6. Confirm that no preview begins and no credit is spent until the normal review and explicit debit confirmation.

After that, choose whether the next focused brick is the series dashboard/episode planner or explicit canon approval before purchase.

## Previous narration verification target

Verify the narration-replacement flow end to end before starting another commerce brick:

1. Open a paid eBook creation that already has ready narration.
2. Start a replacement narration order, optionally using a merchant coupon.
3. Confirm that a queued or generating replacement cannot create a duplicate checkout.
4. Confirm that the previous narration remains playable while the replacement is generated.
5. Confirm that the new narration becomes active only after every scene is ready.
6. Confirm European Spanish and French-from-France behavior with literal page-text reading.
7. Confirm that a failed paid replacement exposes only its idempotent free technical retry.

After this verification, choose one focused next brick. Likely candidates are responsive reader layouts by screen class, series memory, or production-print fulfillment.

## Protected local state

- `data/jobs.json` is modified local development/customer state. Never commit, reset, overwrite, or clean it.
- `output/` contains generated local artifacts. Never commit it.
- Old ZIP packages under `wordpress/` may be untracked installation artifacts. Do not add or delete them unless the task explicitly concerns packaging.
- Never commit generated books, uploaded child photos, secrets, credentials, or customer data.

Always inspect `git status` before editing and preserve unrelated user changes.

## Starting a new Codex task

Use the same local project folder, then begin with:

> Continue Calitiki from `AGENTS.md`, `docs/current-status.md`, and `docs/product-roadmap.md`. Inspect `git status` and the latest commit first. Preserve `data/jobs.json`, `output/`, customer assets, and unrelated ZIP files. Work on one product brick only: **[objective]**. Done means **[acceptance criteria]**.

Create a dedicated `codex/<brick-name>` branch when code changes are required. A new Codex task is a new conversation; a new Git branch is an isolated line of code changes. They are related but are not the same thing.

## Completing a product brick

Before handoff or merge:

1. Run the relevant focused tests and `npm test`.
2. Review `git diff` and confirm no private or generated data is staged.
3. Update this file with the new commit, component versions, completed verification, and next target.
4. Update `docs/product-roadmap.md` only if durable product behavior, architecture, commerce rules, or environment variables changed.
5. Commit and push the focused branch, then merge only after checks pass.
