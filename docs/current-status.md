# Calitiki current status

Last updated: 2026-07-31

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/narrative-benchmark-diagnostics`
- Production/main checkpoint: PR #113 merged; compiler, disabled shadow harness and synthetic Luna/Sol benchmark
- Current focused checkpoint: bounded benchmark diagnostics and six-case synthetic corpus
- Pull request: not yet published
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.1`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #113 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: Narrative benchmark diagnostics

1. The first real synthetic run showed Sol at USD 0.576545 and Luna at USD 0.056499. Sol passed scenario validation but failed canonical compilation with `ambiguous_passage_endpoints`; Luna failed scenario validation. Neither model is eligible for a production route change.
2. Report version 2 separates provider execution, scenario validation, canonical compilation and complete end-to-end acceptance.
3. Scenario diagnostics expose only bounded category, scene number and structured code. Compiler diagnostics expose only code and schema path. Generated prose and explanations remain absent.
4. One failed model variant no longer discards the other result. The aggregate report gives per-model pass counts, pass rate, median cost, median duration and total request count.
5. The corpus contains six entirely synthetic FR/ES/EN fixtures covering a simple story, object lifecycle, portal return, late arrival plus memory-only presence, prudent loss treatment and protective education.
6. The command requires either one explicit `--fixture <id>` or an explicit `--all` acknowledgement before paid calls. It emits content-free progress while each variant runs.
7. This brick does not alter scenario generation, customer projects, Render model routes, credits or the disabled-by-default V2 shadow behavior.

## Verification

- Focused benchmark, shadow and compiler tests: 19/19 passing.
- Complete `npm test`: 314/314 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Publish a focused draft PR without activating any production model route.
2. Run one fixture at a time before explicitly authorizing the six-fixture paid corpus.
3. Use the aggregate evidence to decide whether Luna is eligible for any narrative role.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
