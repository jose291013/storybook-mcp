# Calitiki current status

Last updated: 2026-07-29

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `main`
- Last deployed production checkpoint: PR #96 — resumable whole-book scenario-fidelity audit
- Current focused checkpoint: PR #97 merged; Render verification pending
- Pull request: PR #97 — complete pre-cover text and scene-contract repair
- WordPress Bridge source candidate: `0.7.4`; installed production package: `0.7.3`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #96 are merged and deployed. PR #97 is merged and awaiting Render verification. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: bounded pre-cover repair

1. Project `cd42acad-b8fb-4be2-bc7b-37517c914edd` now reaches the durable audit, which correctly found a symbolic-object rule, a family-address rule and one mixed crossing moment.
2. The former final repair changed only page prose, so it could not repair required/forbidden elements, cast or the illustrated instant and necessarily failed its recheck.
3. The audit now runs deterministic checks first and calls the model only after local invariants pass.
4. The independent whole-book auditor uses the balanced `story_auditor` route instead of the flagship scenario editor.
5. A semantic rejection goes directly to the bounded full-plan repair instead of paying for an intermediate audit that cannot resolve the reported issue. The pipeline uses at most two model audits.
6. The bounded final repair uses the whole-book planner once more with the remaining issues, updating page text and every dependent scene-contract field together.
7. Persisted legacy `targeted` candidates are recognized and upgraded through the new full-plan repair; a new `targeted-plan` candidate cannot loop indefinitely.
8. Preview retry policy version 9 grants projects exhausted under policy 8 one checkpointed recovery.

## Verification completed locally

- Focused narrative, routing and checkpoint suite: 123/123 passing.
- Complete `npm test` suite: 244/244 passing.
- JavaScript syntax checks and `git diff --check`: passing.

## Next verification target

1. After deployment, use the restored **Retry for free** on project `cd42acad-b8fb-4be2-bc7b-37517c914edd`.
2. Verify that Render reuses the saved `targeted` candidate, performs one full-plan repair, passes the bounded audit and reaches cover preparation without rewriting the 24 page texts.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
