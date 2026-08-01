# Calitiki current status

Last updated: 2026-08-01

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/canonical-gate-diagnostics`
- Production/main checkpoint: PR #130 merged at `f573ed3`; Narrative V2 rollout checkpoint documented
- Current focused checkpoint: compiler-v2 deterministic projections plus private canonical-gate diagnostics after the first canary scenario stopped safely at `scenario_contract_invalid`
- Pull request: being prepared; not merged
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #130 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: deterministic canonical gate recovery

1. Causal graph v2 is the sole authority for object state, quantity and owner; parallel scene snapshots no longer provoke a paid repair.
2. Physical presence locations, start-only visible casts and missing presence actions are derived deterministically from approved facts.
3. An unresolved canonical gate persists only bounded private codes, paths and scene numbers in the generation run; no questionnaire or generated prose is copied.
4. The interrupted canary project is intentionally preserved as the post-deploy retry and regression target.

## Verification

- Focused canonical compiler, candidate-gate and durable-worker tests: 30/30 passing.
- Complete `npm test`: 364/364 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Publish and deploy this brick without deleting project `1a76ebc1-b389-4453-8f01-0205e7b4c206`.
2. Use its existing free retry; confirm it reaches scenario review without a new hidden mechanical card.
3. If it still fails, inspect only `generation_runs.metadata.canonicalGate` or the bounded Render `canonicalGate` log and add a generic invariant rather than a story-specific repair.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
