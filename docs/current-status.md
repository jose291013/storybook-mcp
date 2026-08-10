# Calitiki current status

Last updated: 2026-08-10

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/mobile-square-image-fit`
- Production/main checkpoint: PR #145 merged at `34f4901`; successful paid Speech generation is included in each book's confidential economic report
- Current focused checkpoint: preserve the complete 21 x 21 cm page in creator previews and the interactive reader on mobile
- Pull request: pending publication
- WordPress Bridge source candidate: `0.7.6`; installed production package last recorded as `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #145 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: complete mobile page framing

1. Square creator-preview pages use `contain`, so a slightly non-square source cannot lose an edge on narrow screens.
2. Interactive-reader illustrations use the complete square canvas on phone and tablet instead of filling and cropping the portrait viewport.
3. Desktop keeps the full square illustration beside the text panel; collapsing the text still expands the uncropped image.
4. The reader service-worker cache advances to version 22 so installed mobile readers receive the new CSS.

## Verification

- Mobile visual QA passed at 390 x 844, 430 x 932 and 768 x 1024; the complete square remains visible.
- Desktop visual QA passed at 1280 x 800; the complete square remains centered.
- Complete `npm test`: 404/404 passing.
- `git diff --check`: passing.

## Next verification target

1. Publish the focused draft PR.
2. Merge only after explicit authorization while no generation is active; Render will restart.
3. After deployment, open one existing preview and one purchased interactive book on a real phone and verify the complete page framing.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
