# Calitiki current status

Last updated: 2026-08-01

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/passage-lifecycle-preflight`
- Production/main checkpoint: PR #132 merged at `5e212ec`; canonical passage recovery diagnostics deployed
- Current focused checkpoint: precompile every passage lifecycle deterministically and cap the whole scenario pipeline to one paid AI repair
- Pull request: being prepared; not merged
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #132 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: deterministic passage lifecycle preflight

1. A character may arrive at a passage location and discover the passage at the end of that same scene through two ordered events; the discovery never replaces the arrival.
2. The movement ledger and canonical compiler recognize a zero-distance `discover_passage` event with one stable passage id before any later crossing or return.
3. A deterministic precompiler inserts safely inferable discoveries and validates the complete passage lifecycle before the independent narrative editor runs.
4. Structural, editorial and canonical phases share one scenario-wide paid repair budget. At most one AI repair call is allowed; later unresolved defects fail fast instead of creating a repair cascade.
5. Child Safety, sensitivity contracts, creator choices and persisted legacy compatibility remain unchanged.

## Verification

- Focused passage, compiler, generation-dialogue and cost-policy tests: 77/77 passing.
- Complete `npm test`: 374/374 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Publish and deploy this brick after explicit confirmation and only while no preview is generating.
2. Create a fresh scenario containing an arrival, a discovery at that destination, a later crossing and a return through the same passage id.
3. Confirm that scenario preparation reaches review without `passage_discovery_missing` and that cost logs contain at most one scenario repair call across every validation phase.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
