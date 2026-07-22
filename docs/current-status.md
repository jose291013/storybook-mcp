# Calitiki current status

Last updated: 2026-07-22

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/image-safety-recovery`
- Latest merged checkpoint on `main`: `9fd9397` — `Add visual identity proof workflow (#40)`
- Current focused checkpoint: `629f3ff` — `Recover safely from image policy rejection`
- Draft PR: `#42` — `https://github.com/jose291013/storybook-mcp/pull/42`
- Parallel draft PR: `#41` — initial scenario loading; it is separate and unmerged
- WordPress Bridge source/package: `0.6.2`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR 40 is merged and its visual-proof workflow is deployed. Never merge this correction or trigger Render until the user explicitly confirms that no preview generation is running and authorizes the merge.

## Current product brick: bounded image-safety recovery

Project `7dee3296-9cfc-4796-aa5f-3aa6fdde8442` has an approved cover and completed pages through page 10. Its resume job `816c87cc25b4819f8b4f6043` failed while generating page 11 after a scene-QA retry repeated branded clothing details and OpenAI rejected the second image request for safety. The project is preserved with `retryAvailable: true`; do not spend that retry on the currently deployed code.

This branch makes four focused corrections:

1. Scene QA ignores wardrobe-, inscription- and logo-only complaints while retaining action, cast, scale, quantity and held-versus-worn contradictions.
2. Explicit brand or printed-inscription details are replaced with generic unbranded wording at the final image-prompt boundary.
3. A safety rejection on the final normal image attempt may receive exactly one extra call using only the approved cover as continuity reference. The extension cannot repeat.
4. A technical failure after cover approval leaves the visual-proof panel and opens the preserved-project/free-retry panel instead of showing only `La génération a échoué`.

No environment variable, persistence schema, commerce rule, scenario behavior or credit price changes in this brick.

## Verification completed locally

- Focused image-policy suite: 5 passed, 0 failed.
- Syntax checks pass for the browser app and both modified image services.
- Full `npm test`: 110 passed, 0 failed.
- `git diff --check` passes apart from expected Windows line-ending notices.

## Next verification target

1. Keep draft PR 42 unmerged until the user explicitly authorizes it and confirms that no generation is active.
2. Leave draft PR 41 unmerged while this existing book is recovered, to avoid a second Render restart.
3. After explicit user authorization, merge and wait for this safety correction to be live on Render.
4. Only then use the project's free technical retry. It must resume at page 11 without regenerating the cover or completed pages.
5. Verify that any later technical failure shows the preserved/free-retry screen and does not reserve or consume another credit.

## Separate later brick

Permanent deletion of unfinished or unpaid creations remains separate. It must delete private assets idempotently, preserve purchased books/order history/series canon, and require explicit confirmation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
