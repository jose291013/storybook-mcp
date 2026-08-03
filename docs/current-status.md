# Calitiki current status

Last updated: 2026-08-03

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/location-aware-object-contracts`
- Production/main checkpoint: PR #137 merged at `3cdd59c`; bounded targeted visual QA V2 is on `main`
- Current focused checkpoint: model-independent spatial and progressive object contracts
- Pull request: pending publication
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #137 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: location-aware and progressive objects

1. Every recurring object is explicitly `portable` or `location_bound`.
2. A location-bound fixture has one canonical home location and becomes scene-visible or scene-absent from that location without fake possession or installation events.
3. Returning to the home location reveals the same fixture in its latest canonical state.
4. Repeated work advances bounded monotonic progress instead of repeating discovery, acquisition or installation.
5. The causal graph, legacy compatibility ledger, canonical compiler and NarrativeBookSpec validator share this same deterministic rule.
6. Legacy objects remain portable by default and the new schema fields stay optional for stored-book compatibility.

## Verification

- Focused scenario, causal graph and canonical contract tests: passing.
- Complete `npm test`: 386/386 passing.
- `git diff --check`: passing.

## Next verification target

1. Publish and merge the spatial-object brick under the user's existing no-book-in-progress authorization.
2. Build the separate automatic targeted scenario-repair brick on the refreshed `main` branch.
3. Deploy only while no preview is generating because Render may restart.
4. Test one story with a fixed machine, mural, chest or bridge visited, left and revisited; confirm it never follows the characters.
5. Test one multi-step construction or restoration; confirm progress advances once per scene without repeated discovery or installation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
