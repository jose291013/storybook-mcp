# Calitiki current status

Last updated: 2026-07-30

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/narrative-pipeline-v2-contract`
- Production/main checkpoint: PR #110 merged; targeted story-text repair version 3
- Current focused checkpoint: Narrative Pipeline V2 contract foundation
- Pull request: draft PR #111
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #110 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: Narrative Pipeline V2 contract foundation

1. `docs/narrative-pipeline-v2.md` defines one immutable canonical artifact and the side-by-side migration away from repeated probabilistic mechanical audits.
2. `src/contracts/narrativeBookSpec.v1.schema.json` declares canonical registries, scenes, safety references, exact visible moments and versioned validation evidence.
3. `src/contracts/narrativeBookSpec.js` supplies a pure digest and deterministic invariant validator without an AI call or production integration.
4. The reference fixture explicitly keeps a guide in the adventure world after the hero and parent return; reintroducing that guide in the return illustration is rejected deterministically.
5. Physical locations are reconstructed from ordered movements independently from presence and cast declarations. Each illustration targets one explicit scene phase, preventing a matching presence/cast edit from disguising a teleportation or a mixed departure/arrival moment.
6. Object events now prove complete before/after state, owner and quantity values. A silent owner or quantity change is rejected even if the coarse state is unchanged.
7. Child Safety remains a separate repeated gate. A support/refusal or restricted profile cannot produce a canonical book contract. Protective education requires an immutable `body_safety_v1` reference; ordinary stories cannot carry a stray protective contract.
8. The JSON Schema is compiled and executed in the focused test suite with AJV instead of being checked only as a static document.
9. This brick changes no production route, model call, customer project, credit behavior, Render variable or WordPress package.

## Verification

- Focused Narrative Book Spec tests: 16/16 passing.
- Complete `npm test`: 294/294 passing.
- Complete npm dependency audit: 0 known vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Review draft PR #111 and the canonical schema/V2 ownership boundaries.
2. After explicit merge approval, merge the contract foundation without connecting it to production.
3. Implement the pure approved-scenario compiler as a separate brick after that foundation is accepted.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
