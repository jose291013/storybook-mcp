# Calitiki current status

Last updated: 2026-07-31

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/narrative-v2-shadow-benchmark`
- Production/main checkpoint: PR #111 merged; Narrative Pipeline V2 contract foundation
- Current focused checkpoint: allowlisted Narrative V2 shadow compilation and synthetic Luna/Sol benchmark
- Pull request: draft PR #113, stacked on draft PR #112
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #111 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: Narrative Pipeline V2 shadow benchmark

1. The pure PR #112 compiler remains the immutable base and is still not consumed by prose, illustration, credits or delivery.
2. `NARRATIVE_V2_SHADOW_MODE` defaults to `off`; `observe` also requires an exact project id in `NARRATIVE_V2_SHADOW_PROJECT_IDS`.
3. An eligible scenario compiles only after current audit and explicit creator approval. The private spec and bounded comparison are stored beside the legacy project.
4. Compiler rejection stores only issue codes and schema paths. It never stores explanations in diagnostics and never blocks the approved legacy flow.
5. The explicit local `benchmark:narrative-models` command accepts synthetic fixtures only and compares isolated Sol/high and Luna/high routes.
6. Benchmark output contains validation, canonical compilation, duration, request count and attributable cost, but no scenario prose or customer content.
7. The price ledger uses the new non-retroactive `openai-standard-2026-07-30-luna-reduction` snapshot: Luna USD 0.20/1.20 and Terra USD 2/12 per million standard input/output tokens.
8. No Render variable is activated and no customer receives a duplicate model call from this brick.

## Verification

- Focused shadow, benchmark and pricing tests: 16/16 passing.
- Complete `npm test`: 311/311 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Review draft PR #113 while it remains stacked on the compiler branch.
2. Merge PR #112 first after explicit user approval and a no-generation window.
3. Rebase or retarget PR #113 to `main`, then request separate merge approval.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
