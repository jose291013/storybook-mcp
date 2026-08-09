# Calitiki current status

Last updated: 2026-08-10

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/preserve-post-canonical-audit`
- Production/main checkpoint: PR #143 merged at `54bf175`; reference photos are authoritative for personalized cast and every selected narrative role has deterministic participation requirements
- Current focused checkpoint: preserve a final semantic-audit rejection after a successful canonical repair instead of misreporting `scenario_contract_invalid`
- Pull request: not published yet
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #143 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: post-canonical semantic diagnostics

1. A canonical compiler defect may still consume the single scenario repair and receive one fresh semantic audit.
2. When the repaired candidate compiles but that audit rejects it, the canonical gate returns the real semantic validation instead of throwing a false compiler failure.
3. No additional AI call or repair loop is introduced; the creator receives the reviewable scenario and its actual narrative findings.
4. A genuinely unresolved compiler defect continues to fail privately as `scenario_contract_invalid`.

## Verification

- Focused scenario-generation and durable-worker tests: 20/20 passing.
- Complete `npm test`: 401/401 passing.
- `git diff --check`: passing.

## Next verification target

1. Run the complete test suite and publish the focused correction.
2. After deployment, retry project `551119ae-7c9b-44f6-9048-80ed4f874311` once for free.
3. Confirm that a repaired canonical candidate either completes validly or exposes its real narrative findings without `finalIssues: []` being reported as a compiler failure.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
