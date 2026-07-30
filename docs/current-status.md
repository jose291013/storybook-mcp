# Calitiki current status

Last updated: 2026-07-30

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/scenario-final-audit-contract`
- Main checkpoint and last production deployment: PR #106 — private quality-cost governor
- Current focused checkpoint: final scenario-audit evidence and consistent pre-approval validation
- Pull request: #107 — open, verified locally, not merged
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #106 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: final scenario-audit contract

1. A scenario repaired after semantic review receives one final editor audit before it can be shown as valid.
2. The approved result carries a server-side digest bound to the exact audited narrative content.
3. Creator approval reuses a current audit digest instead of launching a late, potentially different semantic review.
4. Any narrative edit invalidates the digest and requires a fresh audited revision.
5. Partial or explicitly unfinished object changes remain partial and cannot be promoted to a completed lifecycle event by the auditor.

## Verification

- Final audit-evidence regression: passing.
- Complete `npm test` suite: 272/272 passing.
- `git diff --check`: passing.

## Next verification target

1. Wait for explicit creator confirmation before merging PR #107; warn that Render may restart and interrupt an active generation.
2. After deployment, update the preserved Spanish scenario once and verify that any remaining semantic issue appears before approval.
3. Confirm that approving an unchanged audited scenario does not launch another editor call.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
