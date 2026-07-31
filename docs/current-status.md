# Calitiki current status

Last updated: 2026-07-31

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/approved-cover-visual-bible`
- Production/main checkpoint: PR #119 merged at `8a4d603`; independent structural and editorial scenario repairs
- Current focused checkpoint: approved-cover visual bible and categorical style quarantine
- Pull request: PR #120, ready for review
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #119 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: approved-cover visual bible

1. A real 24-page Spanish preview completed, but several interiors drifted between soft painterly, realistic dimensional and photographic-looking rendering while a creator-requested alternative matched the approved cover much better.
2. The normal path previously placed private identity photos before the cover reference and described all references as jointly controlling identity and style. The repair path could effectively rely on the cover alone after a Render restart, creating an accidental behavioral difference.
3. The current brick locks a private versioned visual bible when the cover is approved. Every image path places that cover first as the only artistic-medium authority; original photos remain secondary identity-only evidence and durable storage keys remain usable after restart.
4. A categorical style mismatch receives the existing bounded regeneration and is then preserved for quality review instead of being accepted with a warning. Existing completed previews are unchanged and no additional normal image call is introduced.

## Verification

- Focused visual continuity and image-quality policy tests: passing.
- Complete `npm test`: 331/331 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Publish a focused draft PR; do not merge without explicit confirmation and a Render restart warning.
2. After deployment, create a fresh test book and compare every interior page against the approved cover, especially a scene containing four or five photographed people.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
