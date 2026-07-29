# Calitiki current status

Last updated: 2026-07-29

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/narrative-compiler`
- Last deployed production checkpoint: PR #97 — complete pre-cover text and scene-contract repair
- Current focused checkpoint: deterministic narrative compiler before cover generation
- Pull request: not published yet
- WordPress Bridge source candidate: `0.7.4`; installed production package: `0.7.3`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #97 are merged and deployed. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: deterministic narrative compiler

1. PR #97 repaired the symbolic representation and mixed crossing moment in project `cd42acad-b8fb-4be2-bc7b-37517c914edd`, but its final audit still rejected the single sentence `Marie aimait...` inside Bastien's dialogue.
2. The local detector returned no issue for that exact sentence because it recognized only a narrow set of family-address formulations; the balanced auditor found it only after the expensive plan attempts were consumed.
3. Whole-book output now carries structured `speech_segments` with canonical speaker, dialogue/thought mode and exact words.
4. Compiler version 1 normalizes a child's reference to a parent using the localized `preferredAddress` while preserving the parent's civil name in narration and in another adult's dialogue.
5. Legacy saved candidates remain compatible: a returned `family_address` or `parent_first_name_in_dialogue` issue scopes the deterministic repair to the affected scene.
6. Compiler-fixable issues are separated from creative issues. A locally resolved auditor issue is accepted without another planner or auditor call; mixed issue sets send only the remaining creative defects back to the planner.
7. Logs expose only compiler version, counts, page numbers and whether a paid model retry was avoided; no manuscript text is logged.
8. Preview retry policy version 10 grants the policy-9 failed project one explicit checkpointed recovery.

## Verification completed locally

- Compiler, narrative, routing and checkpoint focused suite: 128/128 passing.
- Complete `npm test` suite: 249/249 passing.
- Syntax checks and `git diff --check`: passing.

## Next verification target

1. Publish the PR without merging it.
2. Before merge, confirm that no scenario or preview is generating because Render will restart.
3. After deployment, use **Retry for free** on project `cd42acad-b8fb-4be2-bc7b-37517c914edd`.
4. Verify that Render reuses its saved `targeted-plan`, compiles `Marie` to `Maman` locally, reuses the completed auditor result, avoids a new paid planning call and reaches cover preparation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
