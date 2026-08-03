# Calitiki current status

Last updated: 2026-08-03

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/ordered-object-transitions`
- Production/main checkpoint: PR #140 merged at `7c40c47`; repeated automatic scenario repairs are stopped durably
- Current focused checkpoint: ordered same-scene object transitions in the deterministic NarrativeBookSpec compiler
- Pull request: PR #141, ready for the authorized merge
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #139 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: ordered object continuity

1. NarrativeBookSpec compiler version 3 consumes every ordered version-2 causal event instead of rejecting a second change for the same object and scene.
2. The mechanical validator version 2 simulates the complete intra-scene chain and compares the scene snapshot only with its final event.
3. State, owner, quantity and progress are carried between atomic steps; an incorrect predecessor or duplicate ordered step remains a deterministic failure.
4. Location-bound fixture visibility and model-independent per-scene object projection remain authoritative.
5. The scenario prompt now makes a later same-scene event declare the state produced by its predecessor. No new environment variable or AI repair route is introduced.

## Verification

- Focused causal graph, canonical compiler and validator tests: 47/47 passing.
- Complete `npm test`: 394/394 passing.
- `git diff --check`: passing.

## Next verification target

1. Merge PR #141 under the user's recorded authorization while no preview is generating; Render will restart.
2. Create a fresh scenario containing an explicit same-scene transfer such as installed support A -> held -> installed support B.
3. Confirm the scenario compiles without `ambiguous_object_events`, without an automatic-repair call and with one final illustration state.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
