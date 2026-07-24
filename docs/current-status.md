# Calitiki current status

Last updated: 2026-07-24

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/targeted-scenario-fidelity-repair`
- Latest merged checkpoint: PR #57 — inspiration cards pre-fill the creator's editable message (`c8c6af8`)
- Current focused checkpoint: targeted reader-text repair after whole-book scenario fidelity fails
- Pull request: not opened yet; never merge without confirming that no generation is active
- WordPress Bridge source/package: `0.6.9`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #57 are merged. Bridge 0.6.9 remains the required WordPress package for cover-ready and generation-failure e-mails.

Project `7039d6f6-e411-44fb-ab7a-38d5aac28568` exhausted its policy-4 retry at `story:scenario-fidelity-recheck`: the whole-book repair removed the scene-4 contradiction but still mentioned Tyam in scene 5 even though the approved scene excludes him. Its questionnaire, approved scenario and draft text through page 32 remain checkpointed.

## Current product brick: targeted scenario-fidelity repair

1. After the two whole-book planning attempts fail, Calitiki maps every remaining fidelity issue to its exact approved scene and paired reader-text page.
2. A dedicated story repair rewrites only those pages, with the approved cast, location, event and character-presence mode locked.
3. The same semantic and deterministic audits run again; an unresolved contradiction still stops before cover or image generation.
4. Preview retry policy 5 makes projects exhausted under policy 4 eligible for one explicit no-charge recovery while reusing their checkpointed work.

## Verification completed locally

- Server and browser syntax checks pass.
- Focused scenario, checkpoint and structure tests: 89 passed, 0 failed.
- Full `npm.cmd test`: 141 passed, 0 failed.

## Next verification target

1. Run the full suite and publish this focused change as a draft PR.
2. Before merging, warn that Render may restart and confirm that no preview or targeted modification is generating.
3. After deployment, reopen project `7039d6f6-e411-44fb-ab7a-38d5aac28568`; policy 5 must expose one free retry.
4. Confirm logs reach `story:scenario-fidelity-targeted-repair` only when needed, then `story scene plan completed` before cover generation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
