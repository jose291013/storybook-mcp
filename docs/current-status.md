# Calitiki current status

Last updated: 2026-08-11

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `main`
- Production/main checkpoint: PR #152 merged at `7139a67`; canonical fixed landmarks are locked across camera sides and adjacent scenes
- Current focused checkpoint: the three approved journey/continuity bricks are delivered
- Pull requests: #150, #151 and #152 merged
- WordPress Bridge source candidate: `0.7.6`; installed production package last recorded as `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #152 are merged on `main`. Render health returned HTTP 200 with `{ "ok": true }` after the final product merge. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: canonical fixed-landmark continuity

1. Every recurring fixed landmark has one stable id, one canonical home and global quantity 1.
2. Each scene compiles whether it is visible once, absent, elsewhere, or only beyond the established passage.
3. The same registry records previous/current/next visibility so adjacent contract drift is rejected before image generation.
4. The image prompt forbids twins, miniatures, background copies and relocation to a nearby setting.
5. Duplicate or wrongly located landmarks receive stable objective codes eligible for the existing bounded targeted repair.

## Verification

- Focused landmark, topology, scenario, illustration-plan and QA tests: 180/180 passing.
- Complete `npm test`: 423/423 passing.
- `git diff --check`: passing.

## Next verification target

1. Generate one fresh coral-ocean test book and inspect the preparation, crossing, return and lighthouse scenes in sequence.
2. Record any remaining defect with its exact scene triplet and current structured contract before adding another product brick.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
