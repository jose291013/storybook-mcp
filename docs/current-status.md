# Calitiki current status

Last updated: 2026-07-23

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `main` after post-merge synchronization
- Latest merged checkpoint on `main`: PR `#41` — `Separate initial scenario preparation`
- Current focused checkpoint: production verification of initial scenario preparation
- Pull request: `#41` — `https://github.com/jose291013/storybook-mcp/pull/41`
- WordPress Bridge source/package: `0.6.2`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR 41 was explicitly authorized for merge after confirmation that no preview generation was active. It retains the image-recovery and retry-rebate corrections from PRs 42–44. The already purchased production order remains unchanged.

## Current product brick: initial scenario preparation

The first scenario request previously reused the revision state before any proposal existed. It displayed empty modification controls and the misleading message that Calitiki was checking a creator request. PR 41 separates both moments while retaining the current visual-proof, image-recovery and credit behavior from `main`:

1. Initial preparation shows only a dedicated three-step progress card explaining that Calitiki is organizing the acts, checking chronology and preparing editable cards from the ten answers.
2. Character controls, Act 1/2/3 cards, general feedback and approval actions appear only after a real scenario response exists.
3. Revision keeps its existing “checking your request” state because a creator request exists at that point.
4. If the initial request fails without producing a provisional scenario, the creator returns to the credit-confirmation screen with an actionable no-charge retry message.
5. If the service returns a provisional scenario with validation issues, the creator still sees the editable Act 1/2/3 cards and localized guidance.

No persistence schema, commerce rule, preview price, image policy or WordPress package changes in this brick.

## Verification completed locally

- The merge conflict with current `main` was limited to this operational status file.
- `public/app.js`, the scenario markup/styles, the roadmap and scenario tests merged automatically with PRs 42–44.
- Syntax check for `public/app.js`: passed.
- Full `npm.cmd test`: 113 passed, 0 failed.

## Next verification target

1. Wait for Render to finish deploying PR 41.
2. Verify with a fresh unpaid project that the initial three-step preparation appears before any scenario controls.
3. Confirm the editable Act 1/2/3 review appears after preparation, while a true revision still shows the “checking your request” state.
4. Confirm the visual cover proof, safe image recovery and retry-rebate accounting introduced by later PRs remain unchanged.

## Separate later brick

Permanent deletion of unfinished or unpaid creations remains separate. It must delete private assets idempotently, preserve purchased books/order history/series canon, and require explicit confirmation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
