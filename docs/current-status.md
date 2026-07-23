# Calitiki current status

Last updated: 2026-07-23

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/nonblocking-project-deletion`
- Latest merged checkpoint: PR #47 — `Automate private deletion cleanup` (`4181550`)
- Current focused checkpoint: make the deletion receipt immediately authoritative and the request non-blocking
- Pull request: to be created; do not merge without fresh user confirmation
- WordPress Bridge source/package: `0.6.7`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

The automatic worker deployed by PR #47 recovered project `6e934bb8-7322-4f7e-b77c-e40d30f0fa90` on attempt 5 after the missing AWS `s3:ListBucket` permission was granted. That project no longer appears in the customer DOM. Two different projects, `66ca304a-4ee3-498e-b0f8-145216fb6874` and `0c04bb8a-bc29-4a7a-84e6-be5adbc68d0a`, still returned the Bridge's generic pre-receipt error. Bridge 0.6.7 therefore removes S3 work from the request, treats every deletion receipt as a tombstone, and exposes bounded actionable failure categories.

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

## Next verification target

1. Publish a dedicated draft PR without merging it.
2. Before merging, confirm no preview is generating and obtain explicit user approval because Render may restart.
3. Install `wordpress/calitiki-bridge-v0.6.7.zip` only after the Node deployment completes.
4. Retry exactly one of the two identified projects and confirm its card disappears immediately while Render logs `cleanup queued`.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
