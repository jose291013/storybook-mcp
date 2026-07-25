# Calitiki current status

Last updated: 2026-07-25

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/animal-cast-image-contract`
- Latest merged checkpoint: PR #60 — parent-intention assistant before story inspiration (`061dfca`)
- Current focused checkpoint: lock non-human companion species in image contracts
- Pull request: not published yet; never merge while a preview is generating
- WordPress Bridge source/package: `0.6.9`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #60 are merged. Bridge 0.6.9 remains the required WordPress package for cover-ready and generation-failure e-mails.

## Current product brick: non-human animal-cast image contract

1. A live PR #60 test failed because two recurring animal companions were neutralized as ambiguous `animal companion` aliases and the image model substituted human children.
2. Every recurring companion alias now carries an explicit `human`, `animal` or `plush_toy` entity type and, when available, a stable species such as dog or fox.
3. Generation prompts and scene-fidelity contracts explicitly forbid replacing a non-human companion with a child, teenager or adult.
4. Missing tiny jewelry remains in the visual prompt but is advisory in QA; it cannot by itself consume a retry or abort a book.
5. Retry policy 7 gives projects exhausted under the former animal-cast contract one checkpointed recovery.

## Verification completed locally

- Server syntax check passes.
- Focused image-contract and book-structure tests: 72 passed, 0 failed.
- Full `npm.cmd test`: 148 passed, 0 failed.

## Next verification target

1. Publish the focused fix as a draft PR without merging while project `49b89fd2-3034-40de-ae5b-231b94bff444` is generating or awaiting recovery.
2. After deployment, resume that project from page 3 and confirm that both companions remain distinct non-human animals.
3. Continue the PR #60 live check: verify that the generated story preserves its intention, progressive attempts and earned reward.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
