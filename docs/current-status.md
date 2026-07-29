# Calitiki current status

Last updated: 2026-07-29

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/scenario-provider-background`
- Last deployed production checkpoint: PR #93 — durable scenario enqueue checkpoint hotfix
- Current focused checkpoint: durable provider-side scenario execution
- Pull request: not opened yet
- WordPress Bridge source and installed production package: `0.7.3`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #93 are merged and deployed. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: durable OpenAI scenario responses

1. The PostgreSQL scenario worker and browser polling deployed through PR #93 work correctly.
2. Project `cd42acad-b8fb-4be2-bc7b-37517c914edd` reached the architect but its synchronous Responses API connection ended after about five minutes, before the application's ten-minute SDK timeout.
3. Scenario architect, independent editor and JSON-repair calls now use Responses background mode.
4. Each logical call persists only its provider response id, bounded status and timestamps in `generation_runs.metadata`; no questionnaire, prompt, scenario or provider output is duplicated there.
5. A reclaimed worker retrieves the same provider response after a Render restart instead of creating another paid response.
6. Transient polling failures retry the retrieval only. They never recreate the reasoning request.
7. The existing customer project and its single free retry remain preserved until this brick is deployed.

## Verification completed locally

- Provider-background and scenario-worker focused suite passes: 10 tests, 0 failures.
- Interruption coverage proves that one persisted provider id is resumed after process loss and that the create-call count remains one.
- Full suite passes: 239 tests, 0 failures.
- JavaScript syntax checks and `git diff --check` pass.

## Next verification target

1. Complete the full test suite and open one focused PR.
2. Do not merge until the customer confirms that no scenario or preview is generating; Render will restart.
3. After deployment, use **Retry for free** once on project `cd42acad-b8fb-4be2-bc7b-37517c914edd`.
4. Verify Render logs `queued → architect → editor → completed`. A restart during architect or editor must resume the same `resp_…` checkpoint without a second provider create.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
