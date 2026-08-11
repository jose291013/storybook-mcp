# Calitiki current status

Last updated: 2026-08-11

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `agent/visible-adventure-choice-state`
- Production/main checkpoint: PR #153 merged at `8c8fdc2`; the approved intention-perspective limit and continuity bricks are live on `main`
- Current focused checkpoint: selected intentions remain visibly confirmed while the three adventure proposals load or fail
- Pull requests: #150 through #153 merged; the visible adventure-choice-state fix is awaiting publication
- WordPress Bridge source candidate: `0.7.6`; installed production package last recorded as `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #153 are merged on `main`. Render health returned HTTP 200 with `{ "ok": true }` after the final product merge. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: visible adventure-choice handoff

1. Choosing an intention remains authoritative when the creator reaches the universe and adventure step.
2. The adventure-proposal area is visible immediately and shows its loading state instead of presenting an empty step.
3. `Continuer` is disabled while three adventures are being prepared.
4. A request failure remains visible and retryable instead of being overwritten by the final render.
5. Validation copy distinguishes a missing intention from a missing adventure and confirms that the intention was saved.

## Verification

- Focused creator-funnel tests: 7/7 passing.
- Complete `npm test`: 423/423 passing.
- `git diff --check`: passing.

## Next verification target

1. Publish the visible adventure-choice-state PR.
2. After deployment, select an intention and verify the loading, successful suggestion and retryable failure states on the live creator.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
