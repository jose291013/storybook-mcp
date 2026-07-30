# Calitiki current status

Last updated: 2026-07-30

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/authoritative-story-plan-audit`
- Main checkpoint: PR #103 — legacy scenario validation recovery
- Last production deployment reported by the creator: PR #103 with Calitiki Bridge `0.7.5`
- Current focused checkpoint: audit only the scene-contract fields actually sent to illustration generation
- Pull request: #104 — ready to publish as a draft; never merge without creator confirmation
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #103 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: authoritative story-plan audit

1. Whole-book fidelity checks receive a versioned projection containing only the scene metadata, action, visible cast, required elements, object states, spatial relationships and forbidden elements that can influence the illustration prompt.
2. Earlier `story_beat`, source prose, draft image context and planner continuity notes remain private provenance but cannot block a book because image generation never receives them.
3. Reader-visible page text remains independently audited against the approved scenario.
4. Preview retry policy version 12 grants one creator-free recovery to books exhausted under policy 11, including the saved targeted candidate for Noa's doll.

## Verification completed locally

- Focused audit-contract and retry tests: 22/22 passing.
- Regression proves that the stale “doll in her arms” draft context is excluded while the authoritative “secured in the closed band, not in her arms” object state remains audited.
- Complete `npm test` suite: 265/265 passing.
- `git diff --check`: passing.

## Next verification target

1. Publish PR #104 as a draft.
2. Do not merge while a creator preview is generating; Render would restart it.
3. After deployment, reopen project `dbeb57e7-5914-4ee1-a0f8-d83c254589d2` and click **Réessayer gratuitement**.
4. Verify that the saved candidate resumes at the audit, no scenario or manuscript is regenerated, and the book reaches cover preparation.
5. Verify that a real contradiction in an authoritative object state or visible cast still blocks generation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
