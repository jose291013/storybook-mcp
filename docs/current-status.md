# Calitiki current status

Last updated: 2026-08-02

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/canonical-repair-priority`
- Production/main checkpoint: PR #134 merged at `e84e3b3`; predictive visual cost control deployed
- Current focused checkpoint: prevent a late canonical object defect from losing the scenario-wide repair allowance to an earlier editorial correction
- Pull request: pending publication
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #134 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: canonical repair priority

1. Strictly identical causal events are removed deterministically before canonical compilation; genuinely different changes to one object in the same scene remain blocking.
2. After base structural validation, the NarrativeBookSpec contract compiles before editorial review and therefore has priority over the single shared paid repair call.
3. A canonical repair receives its required fresh semantic audit. Because that audit already acts as editor-in-chief, the ordinary editorial pass is not repeated.
4. An ordinary editorial repair is followed by one final deterministic canonical compilation with no further repair or model call.
5. Private diagnostics now distinguish a canonical defect that was not repaired because the shared allowance had already been consumed.

## Verification

- Focused causal-graph, scenario-pipeline and durable-worker tests: 26/26 passing.
- Complete `npm test`: 379/379 passing.
- `git diff --check`: passing.

## Next verification target

1. Publish and deploy this brick only while no preview is generating.
2. Resume project `b00272d9-f52e-428c-965b-c75739c429ea` through its existing free technical retry after Render is fully live.
3. Confirm that an exact duplicate scene-1 object event is removed without a repair call, or that a genuine ambiguity receives the one canonical repair before editorial review.
4. Confirm that the scenario reaches creator review without exposing internal object-state diagnostics and inspect its private cost report for at most one scenario repair call.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
