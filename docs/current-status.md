# Calitiki current status

Last updated: 2026-07-24

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/deterministic-scenario-cast-guard`
- Latest merged checkpoint: PR #58 — targeted reader-text repair and policy-5 recovery (`26495da`)
- Current focused checkpoint: deterministic cast guard after targeted reader-text repair
- Pull request: draft PR #59 — `Bloquer tout personnage absent après réparation`; never merge without confirming that no generation is active
- WordPress Bridge source/package: `0.6.9`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #58 are merged. Bridge 0.6.9 remains the required WordPress package for cover-ready and generation-failure e-mails.

Project `7039d6f6-e411-44fb-ab7a-38d5aac28568` exhausted its policy-5 retry at `story:scenario-fidelity-targeted-recheck`: the targeted repair removed Tyam from scene 5 but replaced him with Santi, who is also absent from the approved scene. Its questionnaire, approved scenario and draft text remain checkpointed.

## Current product brick: deterministic absent-cast guard

1. Every targeted repair receives the exhaustive canonical-character names absent from its approved scene.
2. The repair prompt forbids every such name and explicitly forbids substituting one absent character for another.
3. A local deterministic barrier removes any remaining sentence naming an absent character. If every generated sentence is contaminated, the page falls back to the approved scene action.
4. The same semantic and deterministic audits still run afterward.
5. Preview retry policy 6 makes projects exhausted under policy 5 eligible for one explicit no-charge recovery while reusing their checkpointed work.

## Verification completed locally

- Server syntax check passes.
- Focused scenario and checkpoint tests: 28 passed, 0 failed.
- Full `npm.cmd test`: 144 passed, 0 failed.

## Next verification target

1. Run the full suite and publish this focused change as a draft PR.
2. Before merging, warn that Render may restart and confirm that no preview or targeted modification is generating.
3. After deployment, reopen project `7039d6f6-e411-44fb-ab7a-38d5aac28568`; policy 6 must expose one free retry.
4. Confirm scene 5 contains neither Tyam nor Santi, then logs reach `story scene plan completed` before cover generation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
