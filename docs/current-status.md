# Calitiki current status

Last updated: 2026-07-23

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/targeted-preview-modifications`
- Latest merged checkpoint: PR #50 — `Localize and streamline scenario approval` (`0fe181e`)
- Current focused checkpoint: paid targeted modification of one double-page in a completed, unpurchased preview
- Pull request: not published yet
- WordPress Bridge source/package: `0.6.7`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

Production verification after PR #50 succeeded: the completed customer book was generated, purchased and delivered correctly. The next brick keeps that successful full-preview path unchanged and adds a separate revision path below the reader.

## Current product brick: targeted preview modification

1. The creator chooses one exact narrative double-page and requests text, illustration, or both.
2. Fixed prices are EUR 0.50 / 1.00 / 1.50 and are quoted with wallet balance before reservation.
3. Generation touches only the selected pages and stores a private candidate snapshot; the current preview is not overwritten.
4. A successful candidate captures once and awaits explicit approval. Rejecting it keeps the current preview; approving it creates a new immutable current revision.
5. Technical failure releases the reservation. A lost Render job becomes retryable after the stale interval without a second debit.
6. A pending candidate blocks checkout so the customer cannot accidentally purchase the wrong revision.

## Verification completed locally

- Syntax checks pass for the modification route, revision store and browser client.
- Targeted modification suite: 5 passed, 0 failed.
- Full `npm.cmd test`: 125 passed, 0 failed.

## Next verification target

1. Run the complete automated suite and publish a focused draft pull request.
2. Before any merge, warn that Render may restart and confirm that no preview or targeted modification is generating.
3. In production, test one text-only proposal and one illustration proposal, reject one candidate, approve the other, then verify checkout uses only the approved revision and the wallet/rebate amounts match the quote.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
