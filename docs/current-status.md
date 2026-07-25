# Calitiki current status

Last updated: 2026-07-25

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/page-quarantine-repair-sweep`
- Latest merged checkpoint: PR #65 — preview runs, steps, leases and image candidates are persisted (`bd55c33`)
- Current focused checkpoint: quarantine an unresolved page and repair it after every unaffected page is complete
- Pull request: not published yet; the user confirmed that no preview is generating and authorized the complete stabilization sequence
- WordPress Bridge source/package: `0.6.9`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #65 are merged. Bridge 0.6.9 remains the required WordPress package for cover-ready and generation-failure e-mails.

## Current product brick: durable preview stabilization

1. Live project `370c9392-ce8a-4dda-bf1d-a6adee309c9c` exposed a false technical rejection: a coherent photographic rendering was described as “no coherent children's-book illustration” and aborted the whole preview.
2. PR #64 makes technical image QA own only file corruption, blank/incomplete output and accidental anatomy or identity fusion. A photograph, painting, cartoon or other coherent rendering is technically complete.
3. Rendering-family disagreement remains in the separate bounded style check and cannot abort a book after the final coherent attempt.
4. PR #65 adds PostgreSQL generation runs, idempotent steps, expiring worker leases and preserved candidate records. The customer job endpoint can recover its status after the Render-local job file disappears.
5. The focused page-isolation brick copies every candidate to private storage before its verdict, quarantines an unresolved page, finishes every unaffected page and launches one targeted repair candidate at the end.
6. A successful repair completes the preview normally. A still unresolved page produces `preview_quality_review` with all work preserved and no credit captured, rather than `preview_failed`.

## Verification completed locally

- Exact regression test for the live photographic-style false rejection: passed.
- Focused image quality policy tests: 8 passed, 0 failed.
- Focused durable-ledger, lease and idempotency tests: 2 passed, 0 failed.
- Focused page-quarantine and bounded-repair tests: passed.

## Next verification target

1. Run the complete test suite, publish and merge the page-isolation PR.
2. Add the customer-facing quality-review state, purchasing lock and milestone notification.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
