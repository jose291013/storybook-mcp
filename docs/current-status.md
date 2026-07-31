# Calitiki current status

Last updated: 2026-07-31

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/scenario-two-stage-repair`
- Production/main checkpoint: PR #118 merged at `b203bc2`; model-independent Narrative Draft V2 object ledger
- Current focused checkpoint: independent structural and editorial scenario repair stages
- Pull request: not published yet
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #118 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: two-stage scenario repair

1. After PR #118, Terra passed both `simple-teamwork-fr-7` and `seed-lifecycle-fr-8` through scenario validation and canonical compilation. Their combined narrative cost was USD 0.558524.
2. A real Spanish scenario then exposed a distinct orchestration gap: one shared repair allowance could be consumed by a mechanical correction before the editor detected a repeated visible action.
3. The current brick gives structural validation and semantic editorial review one separate bounded repair each. An editorial repair can never be accepted without a fresh final audit.
4. The change is generic and model-independent. Narrative Draft V2, Child Safety, Story Sensitivity, credits and privacy boundaries remain unchanged.

## Verification

- Focused scenario generation, policy, scenario and durable-worker tests: 57/57 passing.
- Complete `npm test`: 329/329 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Complete the regression suite and publish the focused two-stage repair PR.
2. Do not merge without explicit confirmation and a Render restart warning.
3. After deployment, update the preserved invalid Spanish scenario once and verify that an initial structural correction cannot prevent the later editorial repair and final audit.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
