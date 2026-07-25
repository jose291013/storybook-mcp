# Calitiki current status

Last updated: 2026-07-25

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/quality-review-text-or-image`
- Latest merged checkpoint: PR #69 — private quality-correction candidate with before/after creator choice
- Current focused checkpoint: require a creator explanation and allow either a text or illustration candidate for one flagged spread
- Pull request: not published yet; do not merge until the user confirms that no preview or quality correction is running
- WordPress Bridge source/package: `0.7.0`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #69 are merged. Bridge 0.7.0 is prepared for cover-ready, interruption and quality-review e-mails.

## Current product brick: durable preview stabilization

1. Live project `370c9392-ce8a-4dda-bf1d-a6adee309c9c` exposed a false technical rejection: a coherent photographic rendering was described as “no coherent children's-book illustration” and aborted the whole preview.
2. PR #64 makes technical image QA own only file corruption, blank/incomplete output and accidental anatomy or identity fusion. A photograph, painting, cartoon or other coherent rendering is technically complete.
3. Rendering-family disagreement remains in the separate bounded style check and cannot abort a book after the final coherent attempt.
4. PR #65 adds PostgreSQL generation runs, idempotent steps, expiring worker leases and preserved candidate records. The customer job endpoint can recover its status after the Render-local job file disappears.
5. The focused page-isolation brick copies every candidate to private storage before its verdict, quarantines an unresolved page, finishes every unaffected page and launches one targeted repair candidate at the end.
6. A successful repair completes the preview normally. A still unresolved page produces `preview_quality_review` with all work preserved and no credit captured, rather than `preview_failed`.
7. The focused experience brick shows those pages in a localized review notice, disables interactive reading, modifications and checkout, and sends one idempotent milestone e-mail through Bridge 0.7.0.
8. A startup/polling recovery worker converts an expired Render lease into a free resumable interruption, releases its reservation and prevents a permanently frozen progress screen.
9. Production project `370c9392-ce8a-4dda-bf1d-a6adee309c9c` completed with pages 15, 31 and 35 awaiting review. The first quality-review UI preserved the book but offered no resolution, so the customer could not continue.
10. The focused resolution brick adds per-page navigation, explicit creator approval and one bounded free creator-requested repair. The credit is captured and commerce unlocks only after the last flagged page is resolved.
11. While a Render-local job exists, the customer job endpoint now prefers its precise live image step. Durable fallback steps such as `page:31` are also recognized by the progress bar after a restart.
12. The focused candidate-choice brick keeps a creator-requested repair separate from the current illustration, accepts one optional visual instruction, persists the private alternative, shows a before/after comparison and changes the book only after **Keep the original** or **Use the new one**.
13. Production feedback showed that an optional inline instruction could be missed and that a correct illustration may conflict only with a minor gesture in the paired prose. The focused follow-up makes the explanation mandatory and offers separate, bounded **Adjust the illustration** and **Adjust the text to this image** candidates. Both may coexist, and neither changes the spread before explicit selection.

## Verification completed locally

- Exact regression test for the live photographic-style false rejection: passed.
- Focused image quality policy tests: 8 passed, 0 failed.
- Focused durable-ledger, lease and idempotency tests: 2 passed, 0 failed.
- Focused page-quarantine and bounded-repair tests: passed.
- Focused expired-lease recovery and localized quality-review tests: passed.
- Complete test suite after the text-or-illustration quality brick: 167 passed, 0 failed.

## Next verification target

1. Publish the focused text-or-illustration quality-review PR without merging it.
2. After deployment, verify the preserved production page with the Maïté gesture mismatch: the existing image candidate must remain available, a text proposal must be creatable from a required explanation, and applying it must change only the paired text.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
