# Calitiki current status

Last updated: 2026-07-30

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/narrative-pipeline-v2-compiler`
- Production/main checkpoint: PR #111 merged; Narrative Pipeline V2 contract foundation
- Current focused checkpoint: pure approved-scenario → NarrativeBookSpec compiler
- Pull request: draft PR #112
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #111 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: Narrative Pipeline V2 pure compiler

1. `src/contracts/compileNarrativeBookSpec.js` compiles only an approved, currently audited scenario v2 with movement ledger v1 and causal graph v1.
2. The compiler is a synchronous pure function: it performs no AI call, storage read/write, network request or production-route integration.
3. Book page bindings come from the deterministic format plan. Character, location, object and passage registries are stable and every reference is resolved before the artifact is returned.
4. Every illustration targets the end of one approved scene. Visible characters derive from physical end/throughout presences; thought, memory and voice characters are evoked; every other canonical character is forbidden.
5. Passage discovery is projected into an explicit stationary canonical movement. Crossing and return reuse the same two-sided passage registry and cannot be compiled without a prior discovery.
6. Every declared object must be tracked in every scene and have a matching causal graph entity. State, owner and quantity changes without one exact causal event stop compilation.
7. A causal transformation becomes one source event plus one deterministic result-introduction event; the compiler does not ask a model to infer missing state.
8. The returned artifact carries a stable digest and a `pending` semantic-audit slot. Mechanical validation runs before return; semantic approval is never fabricated.
9. Structured `NarrativeBookSpecCompileError` issues are bounded and reject stale audits, legacy ledgers, ambiguous identifiers, unresolved passages and incomplete editorial fields.
10. This brick changes no production route, model call, customer project, credit behavior, Render variable or WordPress package.

## Verification

- Focused compiler tests: 8/8 passing.
- Complete `npm test`: 302/302 passing.
- Complete npm production dependency audit: 0 known vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Review the compiler PR and confirm that it remains disconnected from production.
2. After explicit merge approval, merge this brick without deploying or activating V2.
3. Implement shadow compilation as a separate brick after the pure compiler is accepted.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
