# Calitiki current status

Last updated: 2026-07-30

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/durable-blueprint-cost-control`
- Main checkpoint and last production deployment: PR #107 — final scenario-audit evidence
- Current focused checkpoint: durable economical blueprint generation and single-premium-pass scenario routing
- Pull request: pending creation; merge explicitly authorized once verification passes
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #107 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: durable blueprint and bounded scenario cost

1. Blueprint generation uses the Responses API on the economical `gpt-4.1-mini` route and persists its provider response id in the existing private preview checkpoint.
2. A Render restart or explicit technical retry retrieves the same background response instead of repeating the paid blueprint request.
3. The high-reasoning architect is reserved for the first scenario proposal. A persisted creator revision starts directly on the balanced repair route while keeping deterministic validation and final editor audit.
4. Preview retry policy version 14 grants the preserved failed project one new free recovery and reuses its completed intake, portraits, story brand, world and style.
5. The model route remains configurable through optional `BLUEPRINT_MODEL` and `BLUEPRINT_REASONING_EFFORT`; no Render change is required for the defaults.

## Verification

- Focused durability, routing and retry-policy regressions: passing.
- Complete `npm test` suite: 273/273 passing.
- `git diff --check`: passing.

## Next verification target

1. After deployment, use the explicit free retry on project `4bd27e64-2a32-456f-b931-c061cfa39e65`.
2. Confirm that the saved style is reused, the blueprint reaches completion without the former 180-second request timeout, and the cover stage begins.
3. On the next new book, verify that one initial scenario proposal records one `scenario:architect` call and that a creator-requested revision records `scenario:revision` on the repair model rather than another architect call.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
