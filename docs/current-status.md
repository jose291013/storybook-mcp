# Calitiki current status

Last updated: 2026-08-02

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/targeted-visual-qa-v2`
- Production/main checkpoint: PR #136 merged at `d7a5ef7`; canonical preflight is independent from final semantic audit
- Current focused checkpoint: bounded targeted visual QA V2 for interior illustrations
- Pull request: pending publication
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #136 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: targeted visual QA V2

1. Visual findings receive stable private codes, severity, confidence and an automatic-repair decision.
2. Only high-confidence objective scene defects enter automatic interior-page repair: duplicated, fused, substituted or missing required identities, forbidden elements, contradictory object state, or the wrong main-action subject.
3. The first coherent defective page candidate is quarantined immediately instead of paying for a second full regeneration.
4. The repair call receives that exact private candidate as the target image to edit, plus the approved cover and identity references. It must preserve every unaffected part of the composition.
5. Post-edit QA rechecks only the original defect codes, permanent severe identity guardrails and technical integrity. It cannot reopen subjective composition, style, likeness or gesture preferences.
6. A page receives at most one ordinary coherent candidate and one targeted edit under this path. An inconclusive edit enters creator quality review with every candidate preserved.

## Verification

- Focused visual policy and page-isolation tests: 14/14 passing.
- Complete `npm test`: 382/382 passing.
- `git diff --check`: passing.

## Next verification target

1. Publish this brick as one focused PR after the complete test suite passes.
2. Deploy only while no preview is generating because Render may restart.
3. Generate one new 24-page test book containing at least three recurring characters.
4. Confirm logs show `quarantined-for-targeted-repair` at attempt 1 for a high-confidence identity/cast defect, followed by one `targeted_image_edit` outcome at most.
5. Confirm composition or likeness-only warnings do not trigger another paid image call.
6. Compare total illustration calls and correction cost with the previous completed test book.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
