# Calitiki current status

Last updated: 2026-07-26

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/editor-scenarist-guardrails`
- Latest merged checkpoint: PR #71 — narrative depth and age guidance
- Current focused checkpoint: automatic controller-to-scenarist causal repairs and pre-credit character-change guardrails
- Pull request: draft PR #72 published; do not merge until the user confirms that no preview or quality correction is running
- WordPress Bridge source/package: `0.7.0`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #71 are merged. Bridge 0.7.0 is prepared for cover-ready, interruption and quality-review e-mails.

## Current product brick: editor-scenarist guardrails

1. A passage crossed before discovery becomes a structured repair directive from the deterministic controller to the existing scenarist retry, naming the discovery scene, crossing scene, stable mechanism id and travelers.
2. A deterministic fallback applies the same safe discovery-before-crossing repair when the model omits it; unrelated scenes and creator choices remain unchanged.
3. A targeted post-preview request that introduces a character absent from the approved scene or scenario is refused before revision creation and credit reservation.
4. The creator receives a localized explanation directing them to a new full scenario, with an explicit confirmation that no credit was reserved.
5. A legacy failed request of the same incompatible type is also refused before a paid retry and retired from the retry loop.

## Verification completed locally

- Focused scenario and targeted-modification tests: 30 passed, 0 failed.
- Complete test suite: 172 passed, 0 failed.

## Next verification target

1. Review draft PR #72 without merging.
2. Do not merge or deploy without explicit user confirmation and confirmation that no preview or correction is running.
3. After deployment, test one scenario that would otherwise cross a passage before discovery and one local request that tries to add an unplanned family member.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
