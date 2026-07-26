# Calitiki current status

Last updated: 2026-07-26

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/join-travel-arrivals`
- Latest merged checkpoint: PR #72 — editor-scenarist causal repairs and targeted character guardrails
- Current focused checkpoint: independent character arrivals into an already established scene location
- Pull request: not published yet; do not merge until the user confirms that no preview or quality correction is running
- WordPress Bridge source/package: `0.7.0`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #72 are merged. Bridge 0.7.0 is prepared for cover-ready, interruption and quality-review e-mails.

## Current product brick: independent arrivals

1. The scenario contract now distinguishes a focal scene changing location from one or more characters joining residents at that location.
2. `join_travel` preserves the focal before/after location, records the incoming travelers' shared origin and moves only those travelers.
3. The deterministic stabilizer repairs the known pattern automatically when a physical character appears at the focal destination from one safely established origin.
4. Residents already at the destination are never added to the arrival transition or moved.
5. Ambiguous arrivals from multiple origins remain invalid instead of being guessed.

## Verification completed locally

- Exact Marie-from-home/Bastien-at-workshop regression: passed.
- Complete test suite: 174 passed, 0 failed.

## Next verification target

1. Publish the focused pull request without merging.
2. Do not merge or deploy without explicit user confirmation and confirmation that no preview or correction is running.
3. After deployment, reopen project `ab3d4899-21d4-44b3-98d3-a79d9d88fede` and request one scenario update; scene 4 should become valid without moving Bastien.
4. Confirm that a newly generated scenario uses `join_travel` when a family member joins a child already present elsewhere.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
