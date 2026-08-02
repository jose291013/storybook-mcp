# Calitiki current status

Last updated: 2026-08-02

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/canonical-preflight-audit-order`
- Production/main checkpoint: PR #135 merged at `0b0fae2`; canonical repair priority deployed
- Current focused checkpoint: keep pre-editor mechanical compilation independent from authoritative final audit evidence
- Pull request: pending publication
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #135 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: canonical preflight audit ordering

1. The pre-editor canonical check is a non-persistent mechanical compilation, not the authoritative semantic audit.
2. A stale or absent audit digest is refreshed only on the in-memory compiler candidate and is never routed to the scenario model as a repair directive.
3. The source proposal remains untouched; the independent editor still creates the only authoritative audit evidence.
4. Final approval and contract persistence continue to require a digest matching the exact audited scenario.

## Verification

- Focused candidate-gate, scenario-pipeline and strict-compiler tests: 29/29 passing.
- Complete `npm test`: 379/379 passing.
- `git diff --check`: passing.

## Next verification target

1. Publish and deploy this brick only while no preview is generating.
2. Do not spend another retry on project `b00272d9-f52e-428c-965b-c75739c429ea`; it is an exhausted legacy verification project.
3. Start one genuinely new scenario and confirm that `stale_scenario_audit` never appears in the canonical gate.
4. Confirm that a real mechanical contradiction may still receive the single bounded repair and that the final stored scenario carries current audit evidence.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
