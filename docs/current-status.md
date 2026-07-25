# Calitiki current status

Last updated: 2026-07-25

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/durable-generation-ledger`
- Latest merged checkpoint: PR #64 — technical image corruption is separated from rendering-style disagreement (`fcbb0d7`)
- Current focused checkpoint: persist preview runs, steps, leases and image candidates in PostgreSQL
- Pull request: not published yet; the user confirmed that no preview is generating and authorized the complete stabilization sequence
- WordPress Bridge source/package: `0.6.9`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #64 are merged. Bridge 0.6.9 remains the required WordPress package for cover-ready and generation-failure e-mails.

## Current product brick: durable preview stabilization

1. Live project `370c9392-ce8a-4dda-bf1d-a6adee309c9c` exposed a false technical rejection: a coherent photographic rendering was described as “no coherent children's-book illustration” and aborted the whole preview.
2. PR #64 makes technical image QA own only file corruption, blank/incomplete output and accidental anatomy or identity fusion. A photograph, painting, cartoon or other coherent rendering is technically complete.
3. Rendering-family disagreement remains in the separate bounded style check and cannot abort a book after the final coherent attempt.
4. The focused durable-ledger brick adds PostgreSQL generation runs, idempotent steps, expiring worker leases and preserved candidate records. The customer job endpoint can recover its status after the Render-local job file disappears.
5. The next brick uses those candidates to isolate unresolved page defects and finish every unaffected page before a bounded repair sweep.

## Verification completed locally

- Exact regression test for the live photographic-style false rejection: passed.
- Focused image quality policy tests: 8 passed, 0 failed.
- Focused durable-ledger, lease and idempotency tests: 2 passed, 0 failed.

## Next verification target

1. Run the complete test suite, publish and merge the durable generation-ledger PR.
2. Isolate unresolved page defects and add one bounded end-of-book repair sweep.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
