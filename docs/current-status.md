# Calitiki current status

Last updated: 2026-07-25

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `main`
- Latest merged checkpoint: PR #60 — parent-intention assistant before story inspiration (`061dfca`)
- Current focused checkpoint: live verification of the parent-intention funnel
- Pull request: PR #60 merged; no open product-brick PR
- WordPress Bridge source/package: `0.6.9`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #60 are merged. Bridge 0.6.9 remains the required WordPress package for cover-ready and generation-failure e-mails.

## Current product brick: parent-intention assistant

1. The seven-step, universe-first funnel remains stable.
2. The former inspiration panel now asks the parent to describe one situation in ordinary words or select a concrete example.
3. A dedicated no-credit call proposes exactly three positive, non-diagnostic interpretations. The parent confirms one before any adventure call.
4. The confirmed intention locks the desired change, protective doubt, first small step, motivation, reward and inner message.
5. Only then does Calitiki propose the three teamwork, discovery and creation adventures. Each proposal carries progressive attempts and a reward caused by the child's own decision.
6. Legacy drafts can still use **I already have my own idea** and retain their historical dream/challenge/message fields.

## Verification completed locally

- Server syntax check passes.
- Focused intention-funnel tests: 6 passed, 0 failed.
- Full `npm.cmd test`: 146 passed, 0 failed.
- Browser smoke test: the French seven-step funnel reaches the intention screen, renders four examples, then a mocked no-cost flow renders three intention cards and three matching adventure cards with no console error. FR/ES/EN intention copy is covered by the focused suite.

## Next verification target

1. After deployment, confirm that selecting an intention launches exactly one set of three matching adventures.
2. Confirm in the generated scenario that the first step, progressive attempts, the child's decisive action and the earned reward remain visible and coherent.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
