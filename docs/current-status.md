# Calitiki current status

Last updated: 2026-07-30

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/scenario-validation-recovery`
- Main checkpoint: PR #102 — scenario-ready e-mail preference remains interactive during durable generation
- Last production deployment reported by the creator: PR #102 with Calitiki Bridge `0.7.5`
- Current focused checkpoint: versioned scenario diagnostics and safe recovery of the legacy repeated-object-introduction false positive
- Pull request: #103 — `Recover false scenario validation failures` (draft, awaiting creator merge confirmation)
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #102 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: scenario validation recovery

1. A lifecycle introduction is labelled as a first physical appearance only in its actual event scene, never in every later scene.
2. Semantic editor failures retain bounded creator-safe scene explanations instead of collapsing into an unexplained generic category.
3. A private authenticated compatibility endpoint repairs an old saved scenario without an AI call only when every red scene carries the known repeated-first-appearance signature and the complete deterministic validator passes afterward.
4. The creator's visible title, action and chronology are unchanged by that compatibility repair; unrelated legacy or genuine semantic failures remain blocked.

## Verification completed locally

- Focused scenario and worker tests: passing.
- The saved Noa diagnostic fixture revalidates locally as `proposed`; only the legitimate first appearances remain.
- Complete `npm test` suite: 263/263 passing.
- `git diff --check`: passing.

## Next verification target

1. Run the complete test suite and create the pull request.
2. Do not merge while a creator preview is generating; Render would restart it.
3. After deployment, reopen project `dbeb57e7-5914-4ee1-a0f8-d83c254589d2` and verify that it is automatically validable without a new paid AI request or visible story change.
4. Generate one deliberately contradictory scenario and verify that its exact creator-safe explanation is visible while approval remains blocked.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
