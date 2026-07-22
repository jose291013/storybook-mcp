# Calitiki current status

Last updated: 2026-07-22

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/image-visual-contract`
- Latest merged checkpoint on `main`: `ca81a17` — `Recover safely from image policy rejection (#42)`
- Current focused checkpoint: uncommitted compact visual-contract recovery brick
- Draft PR: to be opened after the full test suite passes
- Parallel draft PR: `#41` — initial scenario loading; it is separate and unmerged
- WordPress Bridge source/package: `0.6.2`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR 42 is merged and its bounded safety-recovery UI is deployed. Never merge this new correction or trigger Render until the user explicitly confirms that no preview generation is running and separately authorizes the merge.

## Current product brick: compact image-facing visual contract

Project `7dee3296-9cfc-4796-aa5f-3aa6fdde8442` has an approved cover and a persisted checkpoint at page 11. Job `dca68ace4d79d19f8b7e7401` exhausted retry policy v3 on page 12 after two image safety rejections. The project is preserved with `retryAvailable: false`, `retryExhausted: true`; policy v4 in this branch will expose one new free recovery after deployment.

This branch makes six focused corrections:

1. The full manuscript, dialogue, story beat and persisted `planned_image_context` no longer cross the image-generation boundary.
2. Character display names become stable visual roles such as `hero child`, `family member` or `original unbranded plush-bear companion`; the story and customer-facing manuscript keep their real names.
3. Brand inscriptions and product comparisons such as `à l'effigie de Sonic` and `type Crocs` become generic unbranded clothing details.
4. Interior identity references use a face-focused crop; after a safety rejection the replacement call uses the already-approved cover plus a smaller positive-only visual prompt.
5. Scene QA rejects only explicit contradictions and ignores affirmative observations mistakenly returned in the `issues` array.
6. Retry policy v4 grants the exhausted v3 project one free idempotent resume from its first missing page.

`IMAGE_MODEL` and `DRAFT_IMAGE_MODEL` now default to the current `gpt-image-2`; `REFERENCE_IMAGE_MODEL` already used that model. No persistence schema, commerce rule, scenario behavior or credit price changes in this brick.

## Verification completed locally

- Focused image, scenario, checkpoint and structure suites: 83 passed, 0 failed.
- The exact failed page-12 contract is covered: no dialogue, source prose, `Winnie`, `Sonic` or `Crocs` reaches the image prompt.
- Full `npm.cmd test`: 111 passed, 0 failed.

## Next verification target

1. Finish the full suite, review the diff, then publish a draft PR without merging it.
2. Keep PR 41 separate and unmerged while this existing book is recovered.
3. After a separate user authorization, merge and wait for Render to finish deploying.
4. Reopen project `7dee3296-9cfc-4796-aa5f-3aa6fdde8442`; policy v4 must offer one free retry and resume at page 12 without regenerating the approved cover or page 11.
5. Confirm Render logs show `gpt-image-2`, the optional `safetyFallback` marker, and no false scene-QA rejection for positive confirmations.

## Separate later brick

Permanent deletion of unfinished or unpaid creations remains separate. It must delete private assets idempotently, preserve purchased books/order history/series canon, and require explicit confirmation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
