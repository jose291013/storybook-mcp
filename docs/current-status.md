# Calitiki current status

Last updated: 2026-08-13

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `main`
- Production/main checkpoint: creator-edited scenario retry
- Current focused checkpoint: per-character final arrivals and immutable automatic-repair scene scope
- Pull requests: #150 through #164 merged
- WordPress Bridge source candidate: `0.7.7`; installed production package last recorded as `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through #164 are merged on `main`. PR #164 and its rejected-candidate marker were verified live on Render. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`.

## Current product brick: unified resume and deterministic series passages

1. Scenario e-mails and My creations use the same signed `project_resume` destination.
2. Reused passage ids are split deterministically by endpoint pair; reverse returns preserve their original id.
3. The first affected crossing is recorded in compiler diagnostics instead of scene 0.
4. A prior passage-only exhausted automatic repair receives one versioned recovery.
5. Series episodes freeze and reuse bounded character, universe, location and passage canon from their purchased source.
6. Calitiki Bridge 0.7.7 packages the corrected library handoff.

## Current candidate brick: explainable scenario findings

1. Preparing, inviting and sharing are recognized as distinct causal stages rather than duplicate narrative functions.
2. Precise bounded semantic diagnostics survive a failed automatic repair.
3. Each red scene card displays its own creator-safe reason.
4. Passage, progression, repetition, emotion, cast, travel and incomplete failures from the former policy receive one new versioned recovery; physical object and order ambiguity remain closed.

## Current product brick: validated before presentation

1. Mechanical/canonical correction and post-editor semantic correction each have one independent bounded budget.
2. A canonical repair whose mandatory audit finds a semantic defect now flows into the targeted semantic repair and a fresh final audit.
3. No invalid initial candidate is stored or shown; one free technical retry remains available.
4. A rejected revision preserves the exact previous scenario, and approval never overwrites a visible proposal with new red diagnostics.
5. The architect and auditor explicitly lock family-role equivalence, communication mechanisms and post-disembark location/presence state.
6. One versioned recovery remains available to eligible legacy automatic-repair failures created before this publication gate.

## Current product brick: retry with visible scenario corrections

1. A dirty failed scenario uses a fresh revision request instead of replaying the saved failed request.
2. The button distinguishes an unchanged technical retry from applying visible corrections.
3. Editing action or location sends the visible focal location as part of the same physical correction.
4. Stale transition destinations, movements and end-phase presences are rebuilt deterministically from the creator's location.
5. Scenario worker failures are localized through stable error codes; raw English server messages are no longer displayed.

## Candidate product brick: ordered multi-step scenario revisions

1. A repaired return, arrival and disembark chain is preserved when it reaches the creator's visible final location.
2. Travel wording keeps the original departure instead of silently turning the entire scene into the new location.
3. One focal transition may represent one actual step in an ordered movement chain; physical end presences still have to match the scene destination.
4. A rejected replacement stores no candidate prose and leaves the previous reviewable scenario untouched.
5. Its bounded scene/category diagnostic is shown separately so the creator knows the correction was received and why the replacement stayed private.

## Candidate product brick: per-character arrivals and targeted repair isolation

1. Explicit movements are projected in sequence for each physical character.
2. Every end-phase character still at an intermediate location receives exactly one final leg to the visible scene destination.
3. An earlier passage crossing no longer hides a missing later disembark or local arrival.
4. Automatic repair derives one immutable target-scene set from its bounded failure plan.
5. Non-target scenes and global creator choices are restored after every normalization pass, so a targeted repair cannot introduce unrelated scene regressions.

## Verification

- Focused scenario, retry, publication-gate and worker tests: 85/85 passing.
- Complete `npm test`: 451/451 passing.
- `git diff --check`: passing.

## Next verification target

1. Retry scene 21 after deployment and confirm Noa, Kovu, Antonio and Eva all finish at the rooftop destination after the passage and disembark steps.
2. Run one targeted automatic repair and confirm no non-target scene such as scene 8 changes or receives a new diagnostic.
3. Confirm any remaining rejected-candidate summary names only genuine unresolved targets while the previous proposal remains intact.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
