# Calitiki current status

Last updated: 2026-07-29

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/generation-journey-notifications`
- Last deployed production checkpoint: PR #94 — durable provider-side scenario execution
- Current focused checkpoint: generation journey animation and scenario milestone e-mails
- Pull request: not published yet
- WordPress Bridge source candidate: `0.7.4`; installed production package: `0.7.3`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #94 are merged and deployed. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: visible generation journey and scenario e-mails

1. Scenario preparation exposes one shared e-mail opt-in for scenario-ready, scenario-interrupted, cover-ready, preview-interrupted and completed-preview milestones.
2. Scenario notifications are idempotent, customer-authenticated and never make scenario generation fail if WooCommerce e-mail delivery is temporarily unavailable.
3. Scenario, cover and interior generation show the same three-role Calitiki journey. The active architect, editor, illustrator or publisher follows the durable job step rather than a decorative timer.
4. The mascot sprite is local, transparent and contains no customer or child data.
5. A technical preview failure after scenario approval now stays in the preview recovery flow. It no longer reopens scenario review with an ambiguous scenario error.
6. Calitiki Bridge `0.7.4` adds localized scenario-ready and scenario-interrupted e-mails while preserving the existing signed milestone endpoint.
7. Every structured Responses or Chat request now states the JSON requirement inside the provider-visible input as well as selecting JSON mode. This repairs the observed `draft:text:page:1` provider rejection without discarding the preserved blueprint.

## Verification completed locally

- Focused notification, scenario-worker, plugin-package and deletion suite passes: 85 tests, 0 failures.
- Scenario success and failure tests prove the opt-in, event idempotency and retry-state payload.
- Browser visual checks cover the scenario and cover journeys on desktop.
- Full suite passes: 241 tests, 0 failures.
- Final diff verification remains the last publication gate.

## Next verification target

1. Publish the focused PR only after the full suite passes; do not merge until the customer confirms that no scenario or preview is generating because Render will restart.
2. After merge, install Calitiki Bridge `0.7.4`, then request one new scenario with the e-mail box checked and close the creator tab.
3. Verify one scenario-ready e-mail and its private deep link. Repeat with a bounded technical failure to verify the localized free-retry message.
4. Verify that the active mascot role advances with Render stages and that a later cover/book failure opens the preview recovery panel rather than a scenario error.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
