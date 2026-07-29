# Calitiki current status

Last updated: 2026-07-29

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/resumable-story-plan-audit`
- Last deployed production checkpoint: PR #95 — generation journey, scenario e-mails and explicit JSON input contract
- Current focused checkpoint: resumable whole-book scenario-fidelity audit
- Pull request: #96 — open, not merged
- WordPress Bridge source candidate: `0.7.4`; installed production package: `0.7.3`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #95 are merged and deployed. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: resumable whole-book fidelity audit

1. Project `cd42acad-b8fb-4be2-bc7b-37517c914edd` preserved all 24 page texts but failed at `story:scenario-fidelity-check` because the whole-book editor used the 60-second QA client.
2. Planner, global audit and targeted text repair now use the story client and Responses background execution.
3. Provider response ids and bounded statuses are stored in the private generation checkpoint; prompts and provider output are not duplicated there.
4. Each completed planning or repair candidate is persisted before its audit. A retry resumes the exact candidate and provider response instead of rewriting pages or recreating a paid reasoning request.
5. Successful audit clears temporary candidates and provider ids, then persists the final scene plan as before.
6. Preview retry policy version 8 grants projects exhausted under the former synchronous audit one new checkpointed recovery.

## Verification completed locally

- Focused checkpoint, scenario, timeout and book-structure suite passes: 119 tests, 0 failures.
- Full suite passes: 243 tests, 0 failures.
- JavaScript syntax checks and `git diff --check` pass.

## Next verification target

1. Run focused and complete tests, then publish the PR without merging it.
2. Before merge, confirm that no scenario or preview is generating because Render will restart.
3. After deployment, use the newly restored **Retry for free** on project `cd42acad-b8fb-4be2-bc7b-37517c914edd`.
4. Verify that Render resumes at the saved story-plan candidate/audit, then reaches cover preparation without rewriting the 24 page texts.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
