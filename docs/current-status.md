# Calitiki current status

Last updated: 2026-08-10

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/narration-cost-attribution`
- Production/main checkpoint: PR #144 merged at `96b66a9`; a final semantic-audit rejection after canonical repair is preserved instead of being misreported as `scenario_contract_invalid`
- Current focused checkpoint: include successful paid Speech generation in each book's confidential economic report
- Pull request: PR #145, published as a draft pending explicit merge authorization
- WordPress Bridge source candidate: `0.7.6`; installed production package last recorded as `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #144 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: paid narration cost attribution

1. Each newly generated paid narration scene runs in the originating project's private cost context.
2. The Speech endpoint has no `usage` object, so Calitiki measures the returned MP3 duration and applies the official `gpt-4o-mini-tts` text/audio rates.
3. The WooCommerce-only report includes the narration total and marks its rows with `~` to distinguish the duration-derived estimate from provider accounting.
4. Checkpointed scenes and cached voice samples are not counted as new book narration calls.

## Verification

- Focused narration and cost-ledger tests: 19/19 passing.
- Complete `npm test`: 404/404 passing.
- `git diff --check`: passing.

## Next verification target

1. Merge PR #145 only after explicit authorization while no generation is active; Render will restart.
2. Install Calitiki Bridge `0.7.6` after deployment.
3. Generate one paid narration and verify `narration / narration:scene:*` rows in Pilotage Calitiki.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
