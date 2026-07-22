# Calitiki current status

Last updated: 2026-07-22

This is the concise operational memory for a new Codex task. Product direction remains authoritative in `docs/product-roadmap.md`; repository rules remain authoritative in `AGENTS.md`.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/scenario-invalid-review`
- Latest merged checkpoint on `main`: `a3dbf41` — `Improve story scenario update feedback (#37)`
- Current focused checkpoint: pending commit — persist and expose provisional invalid scenarios
- WordPress Bridge source/package: `0.6.2`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR 37 is merged and Render serves the scenario progress and localized-error interface. The current correction branch is not merged or deployed. Never merge or trigger another Render deployment until the user explicitly confirms that no preview generation is running and authorizes the merge.

## Focused product brick

The creator now validates the story logic before Calitiki writes pages or generates images:

1. The ten answers remain the raw personalization source.
2. After authentication and price display, Calitiki prepares a persisted structured scenario without reserving a credit.
3. The scenario may contain up to three adaptive clarification questions.
4. Deterministic validation checks scene order, prerequisites, locations, portal or passage discovery/crossing, physical versus thought/memory presence, and one state per tracked object.
5. The creator can edit scene title/location/action, send general feedback, request a revision, and explicitly approve the valid scenario.
6. Approval starts the existing preview route; only then is the wallet credit reserved.
7. Every later story, manuscript, scene-contract and QA prompt receives the approved scenario as authoritative input.

The workflow is persisted in the project continuity snapshot. Closing the browser is safe: scenario projects appear in **My creations Calitiki**, and Bridge 0.6.2 restores the review screen with **Vérifier le scénario**. Existing projects without the new workflow marker keep their current retry path for rolling-deployment compatibility.

The original timeout fix remains active: whole-book story planning uses its dedicated 360-second request limit, and interrupted Render background work remains eligible for an idempotent customer retry without a second debit.

## Current correction

The first live scenario revision exposed two presentation and validation defects. The update request disabled its buttons but did not show a visible activity indicator, and a failed deterministic validation leaked raw English diagnostics without explaining what the creator could do. In addition, a model-supplied physical-presence sub-location such as “beside the portal” could contradict the scene's canonical location even when no teleportation occurred.

Merged PR 37 adds an accessible busy state, spinner, in-button progress text, disabled form fields, a client request guard and a server-side per-project concurrency guard. Failures provide localized retry guidance and never expose raw validation issues to the browser. Physical presence locations are deterministically normalized to the scene's exact `locationAfter`; real character travel is still checked independently through transition travelers and tracked locations.

The second live retry showed that a project with no previously valid scenario displayed an empty review panel while claiming a previous scenario was preserved. Branch `codex/scenario-invalid-review` persists the best provisional candidate even when validation still fails, restores it through the existing `scenario_review` lifecycle, displays every Act 1/2/3 card, highlights affected scenes, and exposes only sanitized categories and scene numbers. Invisible metadata such as immediate prerequisites, exact transition endpoints, eligible physical travelers and missing carried-object states is stabilized deterministically before validation; semantic decisions remain creator-controlled.

## Verification completed locally

- `npm test`: 105 passed, 0 failed; all 8 focused scenario tests pass.
- Scenario tests cover portal discovery before crossing, physical-character teleportation rejection, thought-only guide presence, and single-state wearable objects.
- The illustration contract explicitly states that a held wearable is not also worn and must never be duplicated.
- JavaScript syntax checks and `git diff --check` pass.
- `wordpress/calitiki-bridge-v0.6.2.zip` contains only the portable `calitiki-bridge/` directory with its PHP source and README.

## Next live verification target

After explicit merge authorization for the current correction, wait until Render serves its merge commit. Retry the Alexandra/Jérôme request. If the scenario becomes valid, all Act 1/2/3 cards must appear and approval becomes available. If it remains invalid, the provisional cards must still appear, affected scenes must be outlined in red with sanitized categories and scene numbers, approval must remain disabled, and another update must reuse the saved proposal rather than start from an empty panel.

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
