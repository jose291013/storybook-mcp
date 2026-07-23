# Calitiki current status

Last updated: 2026-07-23

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/scenario-language-direct-approval`
- Latest merged checkpoint: PR #49 — `Handle legacy photo references during deletion` (`4e05a6d`)
- Current focused checkpoint: keep every scenario-review field in the requested language and allow direct approval of unchanged suggested answers
- Pull request: draft PR #50 — `Localize and streamline scenario approval`; do not merge while the user's current book is being created
- WordPress Bridge source/package: `0.6.7`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

The scenario review exposed two UX defects on a French book: clarification questions were generated in English, and prefilled suggested answers blocked approval until an unnecessary scenario update. The current branch adds the authoritative book-language instruction to the scenario agent, removes the raw technical `story_role` from the customer UI, and lets the creator approve the visible coherent scenario directly when every clarification has an unchanged suggested answer. Editing any answer, scene or presence still marks the scenario dirty and requires an update; a clarification without any answer remains blocking.

## Current product brick: permanent deletion of non-purchased creations

This branch adds an owner-only irreversible deletion workflow from **My creations Calitiki**:

1. WordPress shows **Supprimer définitivement** only on non-purchased project cards and requires a clear browser confirmation plus a WordPress nonce.
2. The Bridge sends a fresh signed DELETE request; Node verifies the signature, timestamp, exact project confirmation and WooCommerce customer ownership.
3. Purchased projects, any project referenced by a commerce order, approved series canon and a currently active generation job are protected from deletion.
4. Any still-reserved preview credit is released. Project rebates, checkout reservations and preview reservations are removed, while append-only wallet history remains with its project reference cleared.
5. The project record, private preview prefix, project-only reference photos, legacy uploads, generated local outputs and job metadata are removed. A photo still referenced by another project is preserved.
6. A persistent deletion receipt makes cleanup idempotent and retryable without restoring the deleted project.

PostgreSQL migration `008_project_deletions.sql` adds only the durable cleanup receipt. It does not change prices, order behavior, series canon or purchased-book delivery.

## Verification completed locally

- Syntax checks pass for the new Node service, stores and signed route.
- Focused deletion and customer-library suites: 4 passed, 0 failed.
- PHP CLI is not installed locally; plugin behavior is covered by source-contract tests and the packaged archive test.
- Full `npm.cmd test` with Bridge 0.6.4: 116 passed, 0 failed.
- Bridge 0.6.4 focused PHP-parser, archive and deletion suites: 67 passed, 0 failed.
- Bridge 0.6.5 focused PHP-parser, archive and deletion suites: 67 passed, 0 failed.
- Full `npm.cmd test` with Bridge 0.6.5: 116 passed, 0 failed.
- Bridge 0.6.6 automatic-cleanup, PHP-parser and archive suites: 68 passed, 0 failed.
- Full `npm.cmd test` with Bridge 0.6.6: 117 passed, 0 failed.
- Bridge 0.6.7 focused deletion and archive suites: 69 passed, 0 failed.
- Full `npm.cmd test` with Bridge 0.6.7: 118 passed, 0 failed.
- Legacy `photo_refs` deletion regression suite: 6 passed, 0 failed.
- Full `npm.cmd test` after legacy `photo_refs` normalization: 119 passed, 0 failed.
- Scenario language/direct-approval regression suite: 11 passed, 0 failed.
- Full `npm.cmd test` after scenario language/direct approval: 120 passed, 0 failed.

## Next verification target

1. Let the current customer book finish, then obtain explicit confirmation that no generation is active before merging PR #50 because Render may restart.
2. On a fresh French scenario, confirm questions, reasons, suggested answers and scene prose are French, no technical role slug is visible, unchanged suggestions allow direct approval, and any edit requires an update.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
