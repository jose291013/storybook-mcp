# Calitiki current status

Last updated: 2026-07-31

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/fix-canonical-aliases-and-return-travel`
- Production/main checkpoint: PR #115 merged; explicit Terra benchmark route and fail-closed paid CLI selection
- Current focused checkpoint: canonical character aliases and ordinary-return normalization
- Pull request: not published yet
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #115 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: Canonical compiler semantics

1. Terra produced two valid scenarios. `seed-lifecycle-fr-8` compiled end to end for USD 0.348706; `simple-teamwork-fr-7` failed canonical compilation for one repeated character-owner alias and an ordinary return misclassified as a passage, at USD 0.449864.
2. The compiler now indexes a character's stable id and approved display name onto the same canonical id. One owner-name alias can no longer create repeated `unknown_character` defects across every scene.
3. A `return_travel` that exactly reverses an earlier ordinary route with the same mechanism is normalized to canonical `ordinary_travel`. A true discovered/crossed portal remains a passage and retains strict discovery validation.
4. This brick changes no production model route, customer flow, persistence, safety gate or environment variable.

## Verification

- Focused canonical compiler tests: 10/10 passing.
- Complete `npm test`: 319/319 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Publish and review the focused compiler PR without changing production model routing.
2. After explicit merge approval and deployment, rerun only Terra on `simple-teamwork-fr-7`.
3. Continue the bounded corpus only if canonical compilation passes; do not infer a production route from two fixtures.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
