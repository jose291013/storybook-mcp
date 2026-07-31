# Calitiki current status

Last updated: 2026-07-31

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/legacy-book-language-evidence`
- Production/main checkpoint: PR #121 merged at `897b1ba`; canonical book language and no-charge mismatch repair
- Current focused checkpoint: recover the requested language of early previews whose interface fallback was persisted into every language field
- Pull request: pending
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #121 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: legacy language evidence

1. Project `97b686f1-a89e-4dba-b48b-2746fb0a6569` has an approved Spanish scenario and Spanish cover but persisted `FR` in questionnaire, product configuration and blueprint; its French manuscript therefore produced no mismatch under PR #121.
2. Early completed previews now recover a different intended language only when a substantial approved scenario provides strong deterministic evidence for it while persisted metadata, blueprint and manuscript all exhibit the same false fallback signature.
3. A title or short foreign phrase alone cannot override otherwise consistent language metadata. The existing no-charge repair remains limited to non-purchased previews and preserves illustration pixels and private references.

## Verification

- Focused legacy-language evidence tests: passing.
- Complete `npm test`: 339/339 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Complete tests and publish a focused PR; do not merge without explicit confirmation and a Render restart warning.
2. After deployment, reopen project `97b686f1-a89e-4dba-b48b-2746fb0a6569` and verify that the global Spanish repair is offered.
3. Apply the repair and verify that every text page and title are Spanish while existing illustrations remain byte-for-byte unchanged.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
