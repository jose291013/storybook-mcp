# Calitiki current status

Last updated: 2026-07-24

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/prefill-story-message`
- Latest merged checkpoint: PR #56 — hard scene fidelity on top of preview milestone e-mails (`07ab4a6`)
- Current focused checkpoint: pre-fill the creator's moral/message from the selected inspiration card
- Pull request: not opened yet; do not merge while the creator's current real-book test is active
- WordPress Bridge source/package: `0.6.9`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 and PR #56 are merged and Render has received the combined notification and hard-fidelity source. Bridge 0.6.9 remains the required WordPress package for the new cover-ready and generation-failure e-mails.

During the next real-book test, selecting an inspiration card correctly copied its dream and gentle challenge but left the required message field empty even though the card already supplied a useful inner realization.

## Current product brick: inspiration-to-message handoff

1. Selecting an inspiration card now copies its `transformation` into the visible `message` answer in addition to its dream and challenge.
2. The pre-filled message remains ordinary editable questionnaire text; the creator may keep, rewrite or replace it before continuing.
3. Choosing **I already have my own idea** still preserves the creator's existing free-form answers.

## Verification completed locally

- Browser syntax check passes.
- Focused story-funnel tests: 4 passed, 0 failed.
- Full `npm.cmd test`: 139 passed, 0 failed.

## Next verification target

1. Let the creator finish the current real-book test without deploying this branch.
2. Publish this focused change as a draft PR.
3. Before merging, warn that Render may restart and confirm that no preview or targeted modification is generating.
4. After deployment, select each inspiration lane in FR, ES and EN and confirm that dream, challenge and message are all pre-filled and editable.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
