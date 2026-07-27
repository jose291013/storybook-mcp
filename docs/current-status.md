# Calitiki current status

Last updated: 2026-07-27

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/purchased-book-titles`
- Latest merged checkpoint: PR #74 — per-character movement ledger
- Current focused checkpoint: real cover titles for purchased books in the WooCommerce creation library
- Pull request: draft PR #75 published; do not merge until the user confirms that no preview or quality correction is running
- WordPress Bridge source candidate: `0.7.1`; installed production package remains `0.7.0`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #74 are merged. Bridge 0.7.0 remains the active WordPress package.

## Current product brick: purchased creation titles

1. Unpurchased cards already use the authoritative project/cover title from the Storybook service.
2. Purchased cards now resolve the same project title before falling back to WooCommerce metadata or the generic variation name.
3. New checkout line items persist `_calitiki_project_title` as a stable internal fallback.
4. Existing purchased books require no migration as long as their associated project remains available through the authenticated creation library.

## Verification completed locally

- Bridge 0.7.1 archive contains portable WordPress paths.
- PHP source parses successfully through the repository PHP parser.
- Purchased-card title precedence and stable order metadata are covered by the Bridge contract test.
- Complete test suite: 181 passed, 0 failed.

## Next verification target

1. Review draft PR #75.
2. Do not merge or install Bridge 0.7.1 without explicit user confirmation.
3. After installation, reload **My creations Calitiki** and confirm existing purchased cards show their cover titles.
4. Complete one later checkout and confirm its purchased card keeps the title even during a temporary generator outage.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
