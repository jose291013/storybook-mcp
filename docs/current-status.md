# Calitiki current status

Last updated: 2026-07-28

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/universe-outfit-continuity`
- Latest merged checkpoint: PR #86 — guided editorial sensitivity and country-aware support (`384b7a9`)
- Current focused checkpoint: creator-selected, universe-appropriate wardrobe continuity
- Pull request: draft PR #87; not merged
- WordPress Bridge source candidate: `0.7.2`; installed production package remains `0.7.1`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #86 are merged. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: universe-appropriate wardrobe continuity

1. At the private-photo role step, every human reference can explicitly keep the photo clothing, use the recommended universe outfit, or select one of three curated outfits.
2. Outfit examples are universe-specific and localized in French, Spanish and English. Mascots are excluded from human wardrobe choices.
3. The scenario stores a wardrobe plan and exposes the activation scene during creator review. A changed outfit activates before the character enters the adventure zone, not after arrival.
4. Cover and interior prompts use per-scene wardrobe locks. Earlier scenes preserve reference clothing; later scenes preserve the approved adventure outfit.
5. Identity remains independent from wardrobe. Animal and plush canons ignore human outfit contracts.
6. Legacy projects without an explicit outfit choice keep their photo wardrobe and retain their previous preview fingerprint.

## Verification completed locally

- Targeted wardrobe tests pass: selected underwater outfit normalization, per-scene activation, cover outfit and legacy continuity wording.
- Full local suite passes: 212 tests, 0 failures.
- The production dependency audit previously reported 0 known vulnerabilities after the Sharp 0.35.3 upgrade.

## Next verification target

1. Review draft PR #87 without merging.
2. Verify the photo-role UI at desktop and mobile widths in FR and ES.
3. After explicit user approval and confirmation that no book is generating, mark PR #87 ready, merge and let Render redeploy.
4. Smoke-test one coral-ocean book: ordinary photo clothes before preparation, selected marine outfit before submersion, same outfit and breathing mechanism throughout underwater scenes.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
