# Calitiki current status

Last updated: 2026-07-23

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/wordpress-deletion-notice`
- Latest merged checkpoint: PR #45 — `Delete non-purchased creations safely`
- Current focused checkpoint: prevent the WordPress fatal error after a deletion attempt
- Pull request: to be created; do not merge without fresh user confirmation
- WordPress Bridge source/package: `0.6.4`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

Calitiki Bridge 0.6.3 is installed in WordPress. Its deletion handler calls `wc_add_notice()` from `admin-post.php`, where that WooCommerce function is unavailable, and production reported an `E_ERROR` at plugin line 438 after the signed deletion request. The project may therefore already be deleted even though WordPress showed a fatal page.

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

## Next verification target

1. Run the complete test suite for Bridge 0.6.4.
2. Publish the focused PR without merging it.
3. Before merging, confirm no preview is generating and obtain explicit user approval because Render may restart.
4. Install `wordpress/calitiki-bridge-v0.6.4.zip` in WordPress.
5. Confirm the prior creation's actual state before attempting another deletion.
6. Delete one disposable unpurchased creation and confirm the success message appears after redirection without a fatal error.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
