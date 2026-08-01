# Calitiki current status

Last updated: 2026-08-01

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/book-language-init-order-final`
- Production/main checkpoint: PR #128 merged at `d309406`; Narrative V2 progressive rollout with safe default `off`
- Current focused checkpoint: prevent dynamic questionnaire reconstruction from restoring the static French HTML default over the selected Spanish new-book language
- Pull request: pending publication under the user's standing authorization while no book is generating
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #128 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: Narrative V2 foundation and book-language initialization

1. `off`, deterministic `canary` percentage and `on` modes are supported; safe default is `off`.
2. The assignment is persisted at scenario approval and never changes while that project is in progress, even if Render variables later change.
3. Legacy projects remain legacy. Enrolled V2 projects fail closed if their sealed contract becomes missing or stale; Child Safety and Story Sensitivity remain independent gates.
4. The selected new-book language is written into the values passed through dynamic field reconstruction; saved drafts and existing projects remain locked and unchanged.

## Verification

- Focused canonical, rollout, browser-language and theme-contract tests: passing.
- Complete `npm test`: 359/359 passing after final Narrative V2 and language integration.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Complete and merge the language regression PR under the user's standing authorization.
2. After deployment, verify `newBook=1&uiLanguage=ES&bookLanguage=ES`, then explicitly switch the book to French and confirm the saved choice survives reopening.
3. Start Render with `NARRATIVE_V2_ROLLOUT_MODE=canary` and a deliberately small percentage, then verify one stable spec digest, zero whole-book planner calls and bounded optional image retries on an enrolled test book.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
