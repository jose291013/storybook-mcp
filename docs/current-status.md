# Calitiki current status

Last updated: 2026-07-31

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/canonical-book-language`
- Production/main checkpoint: PR #120 merged at `dc6980b`; approved-cover visual bible and categorical style quarantine
- Current focused checkpoint: canonical book language and no-charge recovery of mismatched manuscripts
- Pull request: not yet published
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #120 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: canonical book language

1. A fresh Spanish project produced a Spanish scenario and cover but a French manuscript. The creator stored the explicit choice as `book_language`, while preview normalization read only `language` and silently fell back to French.
2. `book_language` is now the authoritative persisted alias, independent from interface locale. Blueprint language must match it, and deterministic manuscript-language evidence blocks a wrong-language manuscript before the first image call.
3. Existing non-purchased previews with a proven mismatch expose a no-charge global repair. One bounded translator call preserves the story exactly; only text pages and, if necessary, the title overlay are recomposed. Private illustrations, photos, quality-review decisions and the approved cover image remain intact.
4. The repaired language is written consistently to questionnaire, product configuration, blueprint, manuscript checkpoint and whole-book plan so a later repair, delivery or narration cannot fall back to the former language.

## Verification

- Focused canonical-language tests: passing.
- Complete `npm test`: 337/337 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Complete tests and publish a focused PR; do not merge without explicit confirmation and a Render restart warning.
2. After deployment, reopen project `97b686f1-a89e-4dba-b48b-2746fb0a6569`, use the global language repair, and verify that all text pages are Spanish while existing illustrations remain unchanged.
3. Create one fresh Spanish book from a French interface and confirm that scenario, cover and manuscript all remain Spanish before any interior image is generated.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
