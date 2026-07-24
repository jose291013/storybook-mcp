# Calitiki current status

Last updated: 2026-07-24

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/scenario-causal-handoff`
- Latest merged checkpoint: PR #53 — contextual credit-purchase return (`079e90f`)
- Current focused checkpoint: causal scenario repair, approved-scenario fidelity through manuscript and illustrations, and explicit cover-approval handoff
- Pull request: not published yet; keep it in draft and do not merge while the current customer preview is generating
- WordPress Bridge source/package: `0.6.8`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

Production confirms that the PR #53 credit-purchase return restores the originating book correctly. A real PR #52 book exposed two remaining coherence gaps: an omitted beach-to-reef transition produced cascading travel errors, and a character authorized only as a thought could still become physically present in the final prose.

## Current product brick: causal scenario handoff

1. Every discovered passage receives a stable causal id that remains unchanged when its descriptive wording changes.
2. A missing location transition is reconstructed deterministically, including the physical travelers, and scenario generation receives up to three bounded structural repair passes.
3. The final manuscript and illustration contracts are audited against the approved scenario; one bounded rewrite is allowed and an unresolved contradiction stops before cover generation.
4. Illustration contracts use exactly the approved physical cast. A character present only by thought, memory or voice cannot become visible, touch another character or travel physically.
5. A failed initial scenario request stays on the preparation screen with saved-work reassurance and a free retry instead of returning ambiguously to credit confirmation.
6. Preview generation now tells the creator that Calitiki is preparing the cover first, that the cover must be approved before interior illustrations, and that the page may safely be closed and reopened from **My creations**.

## Verification completed locally

- Browser and server syntax checks pass.
- Focused scenario and structure tests: 79 passed, 0 failed.
- Full `npm.cmd test`: 133 passed, 0 failed.

## Next verification target

1. Publish the causal-handoff pull request as a draft and keep it unmerged while the current real book is generating.
2. Before any later merge, warn that Render may restart and confirm that no preview or targeted modification is generating.
3. After deployment, verify a scenario with an implicit journey and a remembered guide, then confirm the cover-first waiting message and the required cover approval.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
