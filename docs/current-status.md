# Calitiki current status

Last updated: 2026-07-29

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/causal-story-architecture`
- Latest merged checkpoint: PR #89 — irreversible lifecycle for discoverable, consumable and transformable plot objects
- Current focused checkpoint: quality-first narrative model routing and authoritative causal graph
- Pull request: PR #90 open as draft
- WordPress Bridge source candidate: `0.7.2`; installed production package remains `0.7.1`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #89 are merged. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: causal story architecture

1. New scenarios must declare a versioned causal graph with stable entity and event ids before visible scene prose is accepted.
2. Generic validation rejects premature results, several producers for one result, several terminal outcomes for one source, post-terminal reappearance, invalid state transitions and transformation cycles.
3. The explicit graph is authoritative; multilingual wording inference remains only for persisted legacy scenarios and is never merged into a new graph.
4. The scenario architect and independent narrative editor use separate quality-first model routes and exchange structured repair directives for up to three bounded passes.
5. Whole-book planning, final causal audit and page-text writing have dedicated model routes through the Responses API. Effective routes are logged at server start without customer content.

## Verification completed locally

- Targeted causal-graph tests pass: multi-stage chains, graph authority over conflicting wording, premature results, competing terminal results, stable ids and cycles.
- Full local suite passes: 228 tests, 0 failures.
- Production dependency audit reports 0 known vulnerabilities after upgrading the OpenAI SDK to 7.1.0.

## Next verification target

1. Wait for explicit merge confirmation and ensure that no book is generating before merging PR #90.
2. After Render deployment, verify the `story-model-routing ready` startup log.
3. Create one new story with a three-stage object transformation and verify the causal order in scenario review before generating illustrations.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
