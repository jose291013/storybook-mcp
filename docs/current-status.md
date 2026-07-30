# Calitiki current status

Last updated: 2026-07-30

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `main` after PR #110 merge
- Main checkpoint and current deployment candidate: PR #110 — targeted story-text repair version 3
- Current focused checkpoint: verify the version-3 text repair on the preserved failed preview
- Pull request: #110 merge confirmed on 2026-07-30
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #110 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: targeted story-text repair version 3

1. A version-2 full-plan repair remains bounded to one call and preserves unaffected pages and contracts.
2. When its final audit still finds a reader-prose contradiction, the existing targeted text editor now receives only the affected paired pages, approved scenes and remaining issue directives.
3. The text editor returns the complete corrected prose and exact structured dialogue/thought segments together, so changing a speaker cannot leave stale speaker metadata behind.
4. Every unrelated page and scene contract remains byte-for-byte reusable; the scenario, blueprint and complete manuscript are not regenerated.
5. The result is checkpointed as repair version 3 and receives one newly namespaced final audit. It cannot enter another automatic repair loop.
6. Preview retry policy version 16 grants the preserved version-2 project one explicit free recovery.

## Verification

- Focused targeted-text, workflow and retry-policy regressions: 130/130 passing.
- Complete `npm test` suite: 278/278 passing.
- `git diff --check`: passing.

## Next verification target

1. Wait for Render to deploy merged PR #110.
2. Use the explicit free retry on project `4bd27e64-2a32-456f-b931-c061cfa39e65`.
3. Confirm that the log records `writer:targeted:v3`, that scenes 8 and 10 pass `story:scenario-fidelity-targeted-text-recheck`, and that cover preparation begins without another scenario, blueprint or full-plan call.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
