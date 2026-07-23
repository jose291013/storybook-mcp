# Calitiki current status

Last updated: 2026-07-23

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/automatic-deletion-cleanup`
- Latest merged checkpoint: PR #46 — `Fix and reassure WordPress deletion notices` (`72189f4`)
- Current focused checkpoint: automatically finish pending private-asset deletion
- Pull request: `https://github.com/jose291013/storybook-mcp/pull/47` (draft; do not merge without fresh user confirmation)
- WordPress Bridge source/package: `0.6.6`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

Calitiki Bridge 0.6.4 remains installed in WordPress while the user waits for one complete replacement. A real deletion returned `cleanup_pending`: the creation disappeared correctly, but the private-object cleanup exhausted its three immediate attempts. Bridge 0.6.6 pairs the reassuring message with a real durable worker that resumes the existing receipt automatically after deployment.

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

## Next verification target

1. The user confirmed no preview is generating and explicitly authorized merging PR #47; merge it, then wait for Render to restart.
2. After deployment, verify Render logs show the prior pending receipt completing or a precise bounded storage error.
3. Install `wordpress/calitiki-bridge-v0.6.6.zip` in WordPress.
4. Delete one disposable unpurchased creation and confirm no customer action is required.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
