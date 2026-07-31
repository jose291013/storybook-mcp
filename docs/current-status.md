# Calitiki current status

Last updated: 2026-07-31

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/narrative-benchmark-terra`
- Production/main checkpoint: PR #114 merged; V2 compiler, disabled shadow harness and bounded six-case Sol/Luna benchmark
- Current focused checkpoint: explicit Terra benchmark route and fail-closed paid CLI selection
- Pull request: not yet published
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #114 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: Explicit Terra benchmark

1. Four completed Sol/Luna comparisons show material stochastic variation: each model has passed one complete case out of four. Sol has cost USD 3.593703 across those runs; Luna USD 0.228819. The latest simple-story rerun passed scenario validation for both models but failed canonical compilation on passage discovery, plus two Luna object-event defects. Neither model is eligible for a production route change from this evidence.
2. Terra is added as an isolated benchmark-only role at high reasoning. This does not change any production narrative route.
3. The paid CLI now requires both a fixture scope and `--variant sol|terra|luna|all`. Unknown, misspelled, duplicated or contradictory options stop before any model call.
4. The CLI announces the exact variants and paid-run count before execution. Selecting Terra on one fixture launches exactly one variant rather than silently rerunning Sol and Luna.
5. Existing report-v2 privacy rules remain: only bounded codes, schema paths, counts, duration and attributable cost are emitted; generated prose and explanations remain absent.

## Verification

- Focused benchmark and model-routing tests: 11/11 passing.
- Complete `npm test`: 317/317 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Publish and review the focused Terra/CLI-safety PR without activating any production model route.
2. After explicit merge approval and deployment, run Terra alone on `seed-lifecycle-fr-8`, then `simple-teamwork-fr-7`.
3. Compare Terra end-to-end acceptance and attributable cost before authorizing another model or corpus run.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
