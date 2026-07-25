# Calitiki current status

Last updated: 2026-07-25

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/transient-image-attempt-retry`
- Latest merged checkpoint: PR #61 — relation-first cast classification and explicit relationship/story-role choices (`2789f22`)
- Current focused checkpoint: consume the next bounded image attempt after a transient provider failure
- Pull request: draft PR #62; never merge while a preview is generating
- WordPress Bridge source/package: `0.6.9`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #61 are merged. Bridge 0.6.9 remains the required WordPress package for cover-ready and generation-failure e-mails.

## Current product brick: relation-first image cast classification

1. A live PR #60 test failed because two human brothers were misclassified as `animal companion` aliases; the generated children were correct and the QA rejection was wrong.
2. Explicit child, family and human-friend roles plus sibling/parent relationships now take priority over incidental animal words in clothing, hobbies or visual descriptions.
3. Genuine recurring companions still carry an explicit `human`, `animal` or `plush_toy` entity type and, when available, a stable species such as dog or fox.
4. Generation prompts and scene-fidelity contracts explicitly forbid replacing a genuine non-human companion with a child, teenager or adult.
5. Missing tiny jewelry remains in the visual prompt but is advisory in QA; it cannot by itself consume a retry or abort a book.
6. Retry policy 7 gives projects exhausted under the former cast-classification contract one checkpointed recovery.
7. The creator no longer silently labels every secondary reference photo as a friend or derives its narrative function. Each secondary person or animal requires both an explicit relationship choice and an explicit story role such as Guide, Ally, Companion, Supporter or Guest; selecting Family or Other also requires a concrete relationship such as brother, sister or mother.
8. Live project `49b89fd2-3034-40de-ae5b-231b94bff444` resumed correctly from its saved cover and page-2 checkpoint, but a transient OpenAI server error on image attempt 1/2 stopped the job instead of consuming attempt 2/2. The focused fix keeps the existing two-attempt ceiling and advances only for server, network, timeout or rate-limit failures.

## Verification completed locally

- Server syntax check passes.
- Focused transient-image policy tests: 8 passed, 0 failed.
- Full `npm.cmd test`: 152 passed, 0 failed.

## Next verification target

1. Before merging draft PR #62, confirm that no preview or targeted modification is generating.
2. After deployment, resume project `49b89fd2-3034-40de-ae5b-231b94bff444` from page 3 and confirm that a temporary attempt-1 provider error proceeds to attempt 2 without exceeding the configured ceiling.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
