# Calitiki current status

Last updated: 2026-07-25

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/improve-answer-transient-retry`
- Latest merged checkpoint: PR #62 — bounded retry after a transient image-provider failure (`e2cfa45`)
- Current focused checkpoint: one bounded retry and localized feedback for AI answer improvement
- Pull request: draft PR #63; never merge while a preview is generating
- WordPress Bridge source/package: `0.6.9`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #62 are merged. Bridge 0.6.9 remains the required WordPress package for cover-ready and generation-failure e-mails.

## Current product brick: relation-first image cast classification

1. A live PR #60 test failed because two human brothers were misclassified as `animal companion` aliases; the generated children were correct and the QA rejection was wrong.
2. Explicit child, family and human-friend roles plus sibling/parent relationships now take priority over incidental animal words in clothing, hobbies or visual descriptions.
3. Genuine recurring companions still carry an explicit `human`, `animal` or `plush_toy` entity type and, when available, a stable species such as dog or fox.
4. Generation prompts and scene-fidelity contracts explicitly forbid replacing a genuine non-human companion with a child, teenager or adult.
5. Missing tiny jewelry remains in the visual prompt but is advisory in QA; it cannot by itself consume a retry or abort a book.
6. Retry policy 7 gives projects exhausted under the former cast-classification contract one checkpointed recovery.
7. The creator no longer silently labels every secondary reference photo as a friend or derives its narrative function. Each secondary person or animal requires both an explicit relationship choice and an explicit story role such as Guide, Ally, Companion, Supporter or Guest; selecting Family or Other also requires a concrete relationship such as brother, sister or mother.
8. Live project `49b89fd2-3034-40de-ae5b-231b94bff444` resumed correctly from its saved cover and page-2 checkpoint, but a transient OpenAI server error on image attempt 1/2 stopped the job instead of consuming attempt 2/2. The focused fix keeps the existing two-attempt ceiling and advances only for server, network, timeout or rate-limit failures.
9. The questionnaire's AI improvement call then exposed the same provider-side `500 server_error` / `service_auth_failure`. The focused follow-up gives this no-credit helper exactly one product-level retry for transient OpenAI failures, keeps permanent errors single-shot, localizes the creator message and logs only structured diagnostics instead of the complete SDK error headers.

## Verification completed locally

- Server syntax check passes.
- Focused AI-improvement and shared transient-error tests: 11 passed, 0 failed.
- Full `npm.cmd test`: 155 passed, 0 failed.

## Next verification target

1. Before merging draft PR #63, confirm that no preview or targeted modification is generating.
2. After deployment, retry one questionnaire improvement and confirm that a first transient 500 is absorbed without exposing an English infrastructure message.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
