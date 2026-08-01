# Calitiki current status

Last updated: 2026-08-01

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/canonical-gate-before-review`
- Production/main checkpoint: PR #123 merged at `d4153d6`; browser and new-book language defaults
- Current focused checkpoint: compile a canonical V2 candidate before creator scenario review and keep hidden mechanical defects internal
- Pull request: pending publication; the user explicitly authorized direct merge while no book is generating
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #123 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: canonical pre-review gate

1. A final audited scenario candidate is compiled deterministically before the creator can review it.
2. One internal canonical repair plus one fresh semantic audit is allowed; unresolved mechanical defects become a technical retry instead of creator-facing red cards.
3. Successful preparation stores bounded compiler evidence without making the candidate purchased or series canon.

## Verification

- Focused canonical candidate, scenario dialogue and durable-worker tests: passing.
- Complete `npm test`: 347/347 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Complete the full test suite, publish and merge the canonical-gate PR under the user's standing authorization.
2. Continue with the spec-driven manuscript brick without changing Child Safety or Story Sensitivity.
3. On the next fresh test book, verify that no hidden compiler issue is delegated to the parent.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
