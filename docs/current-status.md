# Calitiki current status

Last updated: 2026-08-11

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/cross-device-project-resume`
- Production/main checkpoint: PR #154 merged at `2e2edca`; Render health returned `{ "ok": true }`
- Current focused checkpoint: e-mail links resume the server-owned project explicitly across devices instead of exposing a blank local questionnaire
- Pull requests: #150 through #154 merged; the cross-device project-resume brick is awaiting publication
- WordPress Bridge source candidate: `0.7.6`; installed production package last recorded as `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #154 are merged on `main`. Render health returned HTTP 200 with `{ "ok": true }` after the final product merge. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: cross-device project resume

1. Scenario, cover and completion e-mails link to a durable project-resume entry instead of beginning inside an authentication redirect.
2. A fresh phone with no Calitiki local draft sees an explicit resume screen and must connect with the owning WooCommerce account.
3. The authenticated callback is tagged `project_resume`, retains the project id and loads the server project directly.
4. A missing, inaccessible or wrong-account project remains on the resume screen with a safe path to **My creations**; it never falls through to a blank questionnaire.
5. The link reveals no private content before account ownership is verified and adds no generation or model call.

## Verification

- Focused project-resume, authentication and notification tests: 76/76 passing.
- Complete `npm test`: 424/424 passing.
- Browser verification: unauthenticated FR/ES desktop and iPhone-size resume screens pass; invalid project ids do not enter resume mode.
- `git diff --check`: passing.

## Next verification target

1. Publish the cross-device project-resume brick.
2. After deployment, verify one real scenario-ready e-mail from a second device with no Creator local draft.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
