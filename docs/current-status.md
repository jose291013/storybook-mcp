# Calitiki current status

Last updated: 2026-08-06

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/deferred-location-bound-objects`
- Production/main checkpoint: PR #141 merged at `f22ae25`; ordered same-scene object transitions compile deterministically
- Current focused checkpoint: keep produced or later-installed location-bound objects absent until their causal appearance
- Pull request: PR #142, published as a draft pending explicit merge authorization
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #141 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: deferred location-bound objects

1. A static location-bound fixture with no causal appearance still exists at its canonical home.
2. A location-bound entity produced as another object's transformation result remains absent until that exact event.
3. A location-bound entity explicitly installed or introduced later also remains absent before its first appearance.
4. The per-scene object ledger continues to be projected deterministically; no AI repair or customer-visible story rewrite is added.

## Verification

- Focused causal graph tests: 13/13 passing.
- Complete `npm test`: 396/396 passing.
- `git diff --check`: passing.

## Next verification target

1. Merge PR #142 only after explicit authorization while no generation is active; Render will restart.
2. Retry a fresh bridge-building scenario after deployment.
3. Confirm the completed bridge is absent before construction and appears only at the declared finishing event, without an AI repair call.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
