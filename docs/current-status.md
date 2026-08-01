# Calitiki current status

Last updated: 2026-08-01

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/browser-language-defaults`
- Production/main checkpoint: PR #122 merged at `837a88e`; legacy requested-language recovery
- Current focused checkpoint: synchronize first-visit storefront, Creator interface and new-book language from the browser while preserving explicit and persisted choices
- Pull request: PR #123 open as draft; never merge without explicit confirmation and a Render restart warning
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #122 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: browser language defaults

1. First-visit storefront selection remains browser-driven through TranslatePress, while an explicit storefront choice stays remembered.
2. A direct Creator visit now uses the first supported browser language instead of silently defaulting to French. A localized storefront link passes both `uiLanguage` and `bookLanguage` explicitly.
3. A new book follows that language until the creator explicitly changes the book-language field. Saved drafts and existing projects remain authoritative and are never rewritten by a later interface change.

## Verification

- Focused browser-language and theme-contract tests: passing.
- Complete `npm test`: 343/343 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Review PR #123; do not merge without explicit confirmation and a Render restart warning.
2. After deployment and theme installation, open a clean Spanish-browser session and verify Spanish storefront, Creator and new-book language without manual correction.
3. Explicitly switch the book to French, save/reopen the draft and verify that the persisted French choice is not overwritten by the Spanish interface.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
