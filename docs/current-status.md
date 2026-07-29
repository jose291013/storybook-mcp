# Calitiki current status

Last updated: 2026-07-29

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/compiler-legacy-audit-compatibility`
- Last deployed production checkpoint: PR #98 — deterministic narrative compiler before cover generation
- Current focused checkpoint: compatibility with saved free-form family-address audits
- Pull request: draft PR #99
- WordPress Bridge source candidate: `0.7.4`; installed production package: `0.7.3`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #98 are merged and deployed. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: saved-audit compatibility

1. After PR #98 deployed, project `cd42acad-b8fb-4be2-bc7b-37517c914edd` reused an audit created before the prompt required the exact `parent_first_name_in_dialogue` code.
2. Its French explanation still identified the canonical pair `Marie` / `Maman`, but the free-form legacy code was classified as creative and bypassed the local compiler.
3. Compiler version 2 recognizes a family-address defect either by its stable code family or by the presence of both the canonical civil name and localized preferred address in the bounded audit instruction.
4. The normalized internal code remains `family_address`; the original free-form code is used only transiently during classification and is not added to logs.
5. A legacy issue may force repair only when the affected page contains one unambiguous quoted parent reference. Multiple unattributed adult quotations remain untouched and unresolved rather than being guessed.
6. Preview retry policy version 11 grants the project that exhausted policy 10 one explicit checkpointed recovery.
7. No manuscript or audit explanation is added to logs.

## Verification completed locally

- Legacy compiler and checkpoint focused suite: 20/20 passing.
- Complete `npm test` suite: 253/253 passing.
- Syntax checks and `git diff --check`: passing.

## Next verification target

1. Review draft PR #99 without merging it.
2. Before merge, confirm that no scenario or preview is generating because Render will restart.
3. After deployment, use **Retry for free** on project `cd42acad-b8fb-4be2-bc7b-37517c914edd`.
4. Verify that Render classifies the saved free-form audit as mechanical, compiles `Marie` to `Maman`, avoids a new paid planning call and reaches cover preparation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
