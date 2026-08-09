# Calitiki current status

Last updated: 2026-08-09

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/canonical-cast-participation`
- Production/main checkpoint: PR #142 merged at `8559526`; produced or later-installed location-bound objects remain absent until their causal appearance
- Current focused checkpoint: make reference photos the sole registry for personalized characters and enforce each selected narrative role inside the scenario
- Pull request: not published yet
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #142 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: canonical personalized cast

1. The photo step is the sole creation point for personalized characters: name, relationship and narrative role remain authoritative.
2. The duplicated questionnaire field asking who accompanies the child is removed for new projects; legacy answers remain readable.
3. A versioned cast-participation contract gives every selected role a minimum number of meaningful and, where appropriate, physical scenes.
4. Deterministic scenario validation rejects a missing companion, guide, ally, supporter or guest before approval and supports one bounded automatic repair.
5. Scenario presence controls list only the photographed creator cast; arbitrary free-text additions are rejected by the API, while generic world characters remain preserved.

## Verification

- Focused questionnaire, scenario and cast tests: passing.
- Complete `npm test`: 400/400 passing.
- `git diff --check`: passing.

## Next verification target

1. Publish the cast-participation pull request after the complete test suite passes.
2. Merge only after explicit authorization while no generation is active; Render will restart.
3. Create a fresh book with hero, companion, guide and supporter photos, then confirm each appears in the scenario according to the selected role.
4. Confirm the scenario presence editor contains no arbitrary-name field and preserves generic world characters when creator presences change.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
