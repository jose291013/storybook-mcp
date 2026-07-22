# Calitiki current status

Last updated: 2026-07-22

This is the concise operational memory for a new Codex task. Product direction remains authoritative in `docs/product-roadmap.md`; repository rules remain authoritative in `AGENTS.md`.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/scenario-presence-editor`
- Latest merged checkpoint on `main`: `520813a` — `Show provisional scenarios needing revision (#38)`
- Current focused checkpoint: scenario presence editor on the branch tip; PR not opened yet
- WordPress Bridge source/package: `0.6.2`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR 38 is merged and Render serves persisted provisional Act 1/2/3 cards. The current presence-editor branch is not merged or deployed. Never merge or trigger another Render deployment until the user explicitly confirms that no preview generation is running and authorizes the merge.

## Focused product brick

The creator now validates the story logic before Calitiki writes pages or generates images:

1. The ten answers remain the raw personalization source.
2. After authentication and price display, Calitiki prepares a persisted structured scenario without reserving a credit.
3. The scenario may contain up to three adaptive clarification questions.
4. Deterministic validation checks scene order, prerequisites, locations, portal or passage discovery/crossing, physical versus thought/memory presence, and one state per tracked object.
5. The creator can edit scene title/location/action, send general feedback, request a revision, and explicitly approve the valid scenario. The focused branch also adds exact physical/thought/memory/voice/absent choices for every available character in every scene.
6. Approval starts the existing preview route; only then is the wallet credit reserved.
7. Every later story, manuscript, scene-contract and QA prompt receives the approved scenario as authoritative input.

The workflow is persisted in the project continuity snapshot. Closing the browser is safe: scenario projects appear in **My creations Calitiki**, and Bridge 0.6.2 restores the review screen with **Vérifier le scénario**. Existing projects without the new workflow marker keep their current retry path for rolling-deployment compatibility.

The original timeout fix remains active: whole-book story planning uses its dedicated 360-second request limit, and interrupted Render background work remains eligible for an idempotent customer retry without a second debit.

## Current correction

The live PR 38 verification now displays all three acts, but it exposed an ambiguity: Alexandra and Jérôme can be absent from both the physical-presence summary and the nonphysical **Évoqués** summary, while a general request such as “guide Nolan by thought” remains dependent on model interpretation. The creator cannot tell whether the request was applied and cannot correct the authoritative cast directly.

Branch `codex/scenario-presence-editor` always displays **Présents physiquement** and **Évoqués**, including an explicit “Aucun”. Every scene has a collapsible editor with one deterministic choice per available character: absent, physically present, thought, memory or voice. A missing story character can be added to the scenario. Explicit presence choices are sanitized and reapplied after every model response, so the model cannot omit or reinterpret them; nonphysical choices never become travelers or illustration cast members. A newly physical character receives a causal starting location and is added to a real transition when required.

Only fields actually edited in the browser are sent as authoritative scene edits. This is important: untouched title/location/action values no longer block a general feedback request from genuinely rewriting the scenario. Any unsaved feedback, field edit, added character or presence choice disables approval until **Mettre à jour le scénario** succeeds.

## Verification completed locally

- `npm test`: 107 passed, 0 failed; all 10 focused scenario tests pass.
- Scenario tests cover portal discovery before crossing, physical-character teleportation rejection, thought-only guide presence, and single-state wearable objects.
- The illustration contract explicitly states that a held wearable is not also worn and must never be duplicated.
- JavaScript syntax checks and `git diff --check` pass.
- Focused tests prove that creator presence choices override model output exactly and that a newly added physical character receives a causal origin and transition.
- `wordpress/calitiki-bridge-v0.6.2.zip` contains only the portable `calitiki-bridge/` directory with its PHP source and README.

## Next live verification target

After explicit merge authorization for the current correction, wait until Render serves its merge commit. Reopen the current scenario and confirm that every scene shows both presence summaries. In the dinosaur-valley scenes, choose Alexandra and Jérôme as **Par la pensée**, update the scenario, and verify that both names persist under **Évoqués** while never appearing under **Présents physiquement**. Approval must remain disabled whenever a local change has not yet been updated.

For the complete scenario flow, create a fresh portal story and confirm:

1. Preparing the scenario does not reserve or spend a credit.
2. The scenario orders discovery of the portal, crossing it, then arrival in the enchanted dinosaur valley.
3. Alexandra appears physically only where her route permits it; guidance by thought or memory does not put her in the illustration cast.
4. Nolan's cap has exactly one state in every scene, for example worn or held, never both.
5. Closing the browser before approval leaves the scenario accessible from **My creations Calitiki**.
6. Approval reserves the displayed credit once and generation follows the approved chronology.
7. Closing the browser during generation still allows the customer to return through **My creations** or the ready email.

Do not use the first production book as proof until both Render and WordPress display the expected versions.

## Next separate product brick

Add permanent deletion for unfinished or unpaid creations. It must require explicit confirmation, delete private project assets idempotently, and never delete purchased books, order history, or series canon. Do not mix that work into the scenario-approval branch.

## Protected local state

- Never commit, reset, overwrite, or clean `data/jobs.json`, `output/`, uploads, generated books, child photos, customer data, secrets, or credentials.
- Old ZIP files under `wordpress/` are installation artifacts. Do not delete them unless the user explicitly requests cleanup.
- Always inspect `git status` before staging and preserve unrelated user changes.

## Handoff checklist

Before merging any product brick:

1. Run focused tests and `npm test`.
2. Review the complete diff and staged file list for private or generated data.
3. Update this status and the roadmap when durable behavior changed.
4. Push a focused branch and open a draft PR.
5. Ask the user explicitly before merging; also confirm no preview is currently generating.
