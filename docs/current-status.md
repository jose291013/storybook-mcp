# Calitiki current status

Last updated: 2026-07-30

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/scenario-email-toggle-busy`
- Main checkpoint: PR #101 — private per-book OpenAI production-cost ledger and WooCommerce economic dashboard
- Last production deployment reported by the creator: PR #101 with Calitiki Bridge `0.7.5`
- Current focused checkpoint: keep the scenario-ready e-mail preference interactive while durable scenario generation is busy
- Pull request: not created yet
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #101 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: scenario e-mail control during generation

1. Scenario generation still locks all editable story fields and actions.
2. The dedicated e-mail preference is explicitly exempt from that busy lock because it is meant to be selected while the creator waits.
3. Its cursor remains interactive instead of inheriting the panel-wide wait cursor.
4. The existing authenticated persistence and scenario-ready/scenario-failed notification delivery remain unchanged.

## Verification completed locally

- Focused scenario tests: 36/36 passing.
- Complete `npm test` suite: 260/260 passing.
- `git diff --check`: passing.

## Next verification target

1. Run the complete test suite and create the pull request.
2. Do not merge while the creator's current test scenario is generating; Render would restart it.
3. After deployment, start a scenario and activate/deactivate the e-mail preference while the three-step preparation remains busy.
4. Verify that refreshing or reopening the project preserves the chosen preference and that the ready or interrupted milestone sends one e-mail.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
