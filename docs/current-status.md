# Calitiki current status

Last updated: 2026-07-31

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/narrative-draft-v2`
- Production/main checkpoint: PR #117 merged at `af3c7a0`; canonical non-character object attribution
- Current focused checkpoint: model-independent Narrative Draft V2 object ledger
- Pull request: draft PR #118
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #117 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: Narrative Draft V2

1. The post-PR #117 Terra rerun removed all 20 false `unknown_character` findings but failed scenario validation on one generic `object_validation_failed` at scene 10. Cost was USD 0.357508 over two requests and 242199 ms.
2. The root cause is redundant AI authorship: the prompt asked one model to keep the same object fact synchronized across a lifecycle, a causal graph and every scene snapshot.
3. Narrative Draft V2 makes causal graph version 2 the only model-authored mechanical object truth. Code derives the legacy lifecycle and every scene state, owner and quantity from that graph before deterministic validation and canonical compilation.
4. Persisted version-1 causal graphs remain supported. Child Safety, Story Sensitivity, model routes, credits and customer data boundaries are unchanged.

## Verification

- Focused scenario, causal graph, canonical compiler and benchmark tests: 73/73 passing.
- Complete `npm test`: 326/326 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Review draft PR #118; do not merge without explicit confirmation and a Render restart warning.
2. After explicit merge approval and deployment, rerun only Terra on `simple-teamwork-fr-7`.
3. Continue the bounded corpus only if both scenario validation and canonical compilation pass; do not choose a production model from isolated attempts.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
