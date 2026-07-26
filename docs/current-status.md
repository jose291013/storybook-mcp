# Calitiki current status

Last updated: 2026-07-26

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/character-movement-ledger`
- Latest merged checkpoint: PR #73 — independent character arrivals
- Current focused checkpoint: versioned per-character movement ledger and full-scene causal simulation
- Pull request: draft PR #74 published; do not merge until the user confirms that no preview or quality correction is running
- WordPress Bridge source/package: `0.7.0`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #73 are merged. Bridge 0.7.0 remains the active WordPress package.

## Current product brick: character movement ledger

1. New scenarios use scenario schema version 2 with movement-ledger version 1; persisted version-1 scenarios remain readable and valid.
2. Every scene may carry several ordered `characterMovements`, independently from the focal scene transition.
3. Movements are grouped by shared origin and destination, so arrivals from several origins, parallel routes, departures, separations and reunions are representable without moving residents.
4. Physical presence phases distinguish a character visible before departure, throughout a stationary scene or after arrival.
5. The deterministic simulator checks every traveler's current location before each movement, tracks final locations, rejects nonphysical travelers and validates earlier passage discovery.
6. Legacy single transitions are converted automatically; safe missing arrivals are inferred by origin, while contradictory movement chains remain blocking.

## Verification completed locally

- Multi-origin arrivals with one to three origins and one to three residents: passed.
- Every non-empty traveling subset of a four-character group: passed.
- Departure, separation, resident left behind and later reunion: passed.
- Contradictory second movement and nonphysical traveler rejection: passed.
- Complete test suite: 181 passed, 0 failed.

## Next verification target

1. Review draft PR #74 without merging.
2. Do not merge or deploy without explicit user confirmation and confirmation that no preview or correction is running.
3. After deployment, generate one scenario with two characters joining from different locations and another where one character leaves while the others remain.
4. Confirm that old scenario-review projects continue to reopen and update through the version-1 compatibility path.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
