# Calitiki current status

Last updated: 2026-07-22

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/scenario-initial-loading`
- Latest merged checkpoint on `main`: `9fd9397` — `Add visual identity proof workflow (#40)`
- Current focused checkpoint: initial scenario-preparation UI correction, not yet merged
- WordPress Bridge source/package: `0.6.2`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR 40 is merged and Render exposes the seven styles and three rendering modes. Never merge or trigger another Render deployment until the user explicitly confirms that no preview generation is running and authorizes the merge.

## Current correction: initial scenario preparation

The first scenario request previously reused the revision state before any proposal existed. It displayed empty modification controls and the misleading message that Calitiki was checking a creator request. The focused branch separates both moments:

1. Initial preparation shows only a dedicated three-step progress card explaining that Calitiki is organizing the acts, checking chronology and preparing editable cards from the ten answers.
2. Character controls, Act 1/2/3 cards, general feedback and approval actions appear only after a real scenario response exists.
3. Revision keeps its existing “checking your request” state because a creator request exists at that point.
4. If the initial request fails without producing a provisional scenario, the creator returns to the credit-confirmation screen with an actionable no-charge retry message instead of remaining on an empty scenario screen.

## Current product brick: visual identity proof

The scenario workflow is unchanged: ten answers, persisted Act 1/2/3 review, deterministic chronology, creator-added characters, exact physical/thought/memory/voice presence choices, and explicit scenario approval before any paid generation.

The current branch adds the next gate after scenario approval:

1. Seven real style examples are derived from one synthetic non-customer portrait and one identical lantern scene.
2. Style choice is grouped by expected likeness: maximum photorealism; illustrated and recognizable; clearly cartoon.
3. Desktop hover and keyboard focus reveal the same reference portrait. Mobile has an explicit reference toggle.
4. `3D douce` is renamed `3D cartoon douce`; its copy honestly says that facial traits are stylized.
5. Reference payloads combine the full figure with a face-focused crop. Prompting preserves face geometry independently from the medium.
6. A bounded identity QA check may request one correction in maximum/strong likeness modes.
7. After scenario approval and credit reservation, Calitiki creates the manuscript/contracts and one medium-quality cover proof, then pauses. No interior image starts until the creator approves the proof. One same-style cover retry is included without a second credit reservation.
8. The proof decision is checkpointed while the project remains `preview_generating`, so Bridge 0.6.2 and **My creations Calitiki** remain compatible. Closing the browser safely restores the proof.

If a source identity image is rejected by the safety system before a cover reference exists, Calitiki now asks for a clear non-branded portrait rather than silently producing a generic cover. After approval, an interior retry may use the approved private cover as its continuity reference.

## Verification completed locally

- `node --check` passes for the browser app, preview routes and image services.
- `npm.cmd test`: 107 passed, 0 failed.
- Tests cover the seven-style catalog, three likeness families, real comparison assets, photoreal prompt rules, identity QA wiring and the mandatory cover pause before the interior loop.
- Desktop browser QA loaded 7 cards in 3 groups with `soft_watercolor` selected by default.
- Generated comparison assets are WebP files in `public/assets/examples/styles/`; the reference is entirely synthetic and contains no customer or child data.
- `git diff --check` passes apart from expected Windows line-ending notices.

## Next verification target

Verify the focused initial-loading correction locally, publish it as a separate draft PR, and leave it unmerged until explicit authorization and confirmation that no preview is generating.

After explicit merge authorization and a confirmed idle generator, verify on Render with a fresh project:

1. Scenario review and character presence editing behave exactly as on main.
2. Every style example loads; hover/focus/mobile reference comparison works.
3. A photoreal project keeps natural facial geometry; an illustrated project changes only the medium; 3D is visibly labelled cartoon.
4. Scenario approval reserves once and stops after the cover proof.
5. Closing and reopening through **My creations** restores that proof.
6. Regenerating the proof once does not reserve a second credit; a third attempt is blocked.
7. Approving the proof resumes from the persisted manuscript/contracts and completes all interior pages.
8. The ready email is sent only after the complete book is ready.

Do not use an existing paid or purchased book as the first test. Use a fresh unpaid preview project.

## Separate later brick

Permanent deletion of unfinished or unpaid creations remains separate. It must delete private assets idempotently, preserve purchased books/order history/series canon, and require explicit confirmation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
