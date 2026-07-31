# Calitiki current status

Last updated: 2026-07-31

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/fix-noncharacter-object-owners`
- Production/main checkpoint: PR #116 merged; canonical character aliases and ordinary-return normalization
- Current focused checkpoint: canonical non-character object attribution
- Pull request: not published yet
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #116 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: Canonical object ownership

1. The post-PR #116 Terra rerun produced a valid scenario and no passage defect, but canonical compilation still failed on 20 repeated `unknown_character` object-owner paths. Cost was USD 0.436780 over three requests and 257876 ms.
2. A free-form object attribution now becomes `ownerCharacterId` only when it resolves to a declared character. A location, group or contextual attribution on a non-possession state compiles to `null` instead of inventing a character.
3. `held`, `carried` and `worn` remain strict: an unresolved owner still raises both `unknown_character` and `possessed_object_owner_required`.
4. This brick changes no production model route, customer flow, persistence, safety gate or environment variable.

## Verification

- Focused canonical compiler tests: 12/12 passing.
- Complete `npm test`: 321/321 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Publish and review the focused object-owner compiler PR without changing production model routing.
2. After explicit merge approval and deployment, rerun only Terra on `simple-teamwork-fr-7`.
3. Continue the bounded corpus only if canonical compilation passes; do not infer a production route from three attempts.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
