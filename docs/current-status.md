# Calitiki current status

Last updated: 2026-07-28

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/guided-sensitivity-resources`
- Latest merged checkpoint: PR #85 — localized child-safety intervention guidance (`7cf2c26`)
- Current focused checkpoint: guided editorial sensitivity and country-aware human-support resources
- Pull request: in preparation; this focused branch is not merged
- WordPress Bridge source candidate: `0.7.2`; installed production package remains `0.7.1`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #85 are merged. Production currently uses `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`.

## Current product brick: guided sensitivity and international support

1. `STORY_SENSITIVITY_MODE=observe` remains behaviorally unchanged. The new behavior is opt-in through `guided`.
2. Level 1 keeps the ordinary journey. Level 2 receives a private action-led gentle contract without adding a customer obstacle.
3. Level 3 receives a private symbolic and open-ended contract that forbids definitive, diagnostic or therapeutic promises. The adult sees a prudent notice and must acknowledge it explicitly before continuing.
4. Restricted acute-safety input stops before persistence, generation and credit reservation, then directs the adult toward human help.
5. The versioned contract is propagated through intentions, suggestions, scenario, blueprint, manuscript and scene planning. It contains no copied family wording or diagnosis.
6. Human-support contacts are served from a dated, versioned registry. The adult explicitly selects the country where the child is currently located; interface language, nationality and IP address are never used as a substitute.
7. The first registry covers France, Spain, Belgium, Switzerland, the United Kingdom, the United States and Canada, with EU 112 and an honest unlisted-country fallback.
8. Child sexual-safety enforcement remains independent and stricter: protective education is allowed, a possible disclosure pauses creation, and exploitative normalization is refused.

## Verification completed locally

- Guided sensitivity targeted tests pass: level 2 internal guidance, level 3 acknowledgment and acute-safety pause.
- Country-resource tests verify explicit current-country selection, localized labels, official sources and the absence of invented fallback numbers.
- Existing child-safety, funnel, persistence, generation, commerce and private-asset tests remain green.
- Full local suite passes: 209 tests, 0 failures.
- The production dependency audit previously reported 0 known vulnerabilities after the Sharp 0.35.3 upgrade.

## Next verification target

1. Publish the focused PR without merging it.
2. After explicit user approval and confirmation that no book is generating, merge and let Render redeploy.
3. Keep `STORY_SENSITIVITY_MODE=observe` for a smoke test proving that the new release does not change the live journey.
4. Then set `STORY_SENSITIVITY_MODE=guided` deliberately and verify one level-1, one level-2, one level-3 and one acute-safety case in FR, ES and EN.
5. For the acute case, select at least France, Spain and **Other country** and verify that the contacts change by current country, no language-based inference occurs, no credit is reserved and no project is created.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
