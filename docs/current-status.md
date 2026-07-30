# Calitiki current status

Last updated: 2026-07-30

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/versioned-story-audit-checkpoints`
- Main checkpoint and last production deployment: PR #104 — authoritative rendered scene-contract audit
- Current focused checkpoint: invalidate incompatible durable audit responses when the audit contract changes
- Pull request: #105 — creator authorized publication and merge after verification
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #104 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: versioned story-audit checkpoints

1. Every whole-book audit provider checkpoint is namespaced with `STORY_PLAN_AUDIT_CONTRACT_VERSION`.
2. A saved response produced for an older audit input remains private but cannot be retrieved by a newer contract.
3. The versioning is centralized inside the audit agent, so current and future callers cannot omit it.
4. Preview retry policy version 13 grants one creator-free recovery to books exhausted under policy 12.
5. The saved scenario, manuscript and targeted plan remain reusable; only the compatible auditor response must be created.

## Verification completed locally

- Focused audit-checkpoint and retry tests: 24/24 passing.
- Regression proves that legacy `audit:targeted:primary` cannot satisfy `audit-contract:v1:audit:targeted:primary`.
- Complete `npm test` suite: 267/267 passing.
- `git diff --check`: passing.

## Next verification target

1. Publish PR #105 and merge it as explicitly authorized.
2. Confirm the Render service responds after deployment.
3. Reopen project `dbeb57e7-5914-4ee1-a0f8-d83c254589d2` and click **Réessayer gratuitement**.
4. Verify that logs show a newly executed versioned audit rather than the previous cached rejection, then that the book reaches cover preparation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
