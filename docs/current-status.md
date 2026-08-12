# Calitiki current status

Last updated: 2026-08-12

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `main`
- Production/main checkpoint: locked adjacent visual continuity and non-destructive illustration retouching
- Current focused checkpoint: participant photos are fully framed and zoomable; flagged spreads are reviewed directly under the reader; a second technical attempt uses a cause-aware strategy instead of replaying an incompatible request
- Pull requests: #150 through the current product brick merged
- WordPress Bridge source candidate: `0.7.6`; installed production package last recorded as `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through the current product brick are merged on `main`. Render health returned HTTP 200 with `{ "ok": true }` after the final product merge. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: reader-integrated final review

1. Participant thumbnails use `contain` in a larger portrait frame and open the complete local image in an accessible lightbox.
2. The quality-review list is a compact index; correction, comparison and validation live directly below the currently visible flagged spread.
3. The reader displays review progress and advances to the next unresolved spread after each decision.
4. Temporary technical failures use a more conservative source-preserving second strategy.
5. A request incompatible with the approved scene is never resent unchanged; Calitiki asks for reformulation or suggests the other scope without another AI call.
6. Diagnostics store only categorical failure codes and an irreversible instruction fingerprint, never the creator's wording.

## Verification

- Focused reader and failure-policy tests: 19/19 passing.
- Complete `npm test`: 438/438 passing.
- `git diff --check`: passing.

## Next verification target

1. Upload portrait and landscape participant photos and verify the full bodies remain visible; open and close each lightbox with pointer and keyboard.
2. Generate a review with several flagged spreads and verify contextual correction, candidate comparison, next-page advance and the final completion summary.
3. Verify one incompatible text request is rejected unchanged without an AI call, while a reformulation or temporary failure may use the bounded second strategy.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
