# Calitiki current status

Last updated: 2026-08-10

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/mobile-square-image-center`
- Production/main checkpoint: PR #146 merged at `9ae95ed`; complete 21 x 21 cm pages are preserved without cropping in creator previews and the interactive reader
- Current focused checkpoint: center the complete square page vertically in the mobile interactive reader
- Pull request: pending publication
- WordPress Bridge source candidate: `0.7.6`; installed production package last recorded as `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #146 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: centered mobile page framing

1. The complete square illustration is centered vertically inside the mobile reader's usable stage above its controls.
2. Spare portrait-screen space is balanced around the page instead of accumulating underneath it.
3. `contain` remains authoritative, so centering cannot reintroduce cropping.
4. The reader service-worker cache advances to version 23 so installed mobile readers receive the adjustment.

## Verification

- Mobile visual QA passed at 390 x 844 and 430 x 932 with balanced page spacing and no navigation overlap.
- Tablet visual QA passed at 768 x 1024 with no navigation overlap.
- Focused interactive-reader tests: 3/3 passing.
- Complete `npm test`: 404/404 passing.
- `git diff --check`: passing.

## Next verification target

1. Publish the focused draft PR after explicit authorization.
2. Merge only after explicit authorization while no generation is active; Render will restart.
3. After deployment, verify the balanced page position on the real phone shown in the customer screenshot.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
