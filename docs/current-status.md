# Calitiki current status

Last updated: 2026-07-29

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `main`
- Latest merged checkpoint: PR #89 — irreversible lifecycle for discoverable, consumable and transformable plot objects
- Current focused checkpoint: production verification of transformable-object causal lifecycle
- Pull request: PR #89 merged
- WordPress Bridge source candidate: `0.7.2`; installed production package remains `0.7.1`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #89 are merged. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: transformable-object causal lifecycle

1. Plot objects may now carry explicit lifecycle events such as introduction, planting, consumption and transformation instead of only a simultaneous held/worn state.
2. The stabilizer infers common French, Spanish and English lifecycle wording, keeps the object absent before discovery and propagates irreversible states through every scene.
3. A transformation links one source to one result: the source becomes transformed and the result cannot appear before the transformation scene.
4. Validation rejects a planted or terminal object that is held again, an undeclared result, a premature transformation and a result visible before its cause.
5. The final scene-plan audit repeats the invariant against reader-visible prose before illustration generation.

## Verification completed locally

- Targeted scenario tests pass: seed discovery, planting, transformation, linked result, explicit consumable lifecycle, multilingual inference and lexical false positives.
- Full local suite passes: 221 tests, 0 failures.
- The production dependency audit previously reported 0 known vulnerabilities after the Sharp 0.35.3 upgrade.

## Next verification target

1. Let Render deploy the PR #89 checkpoint.
2. Create one story whose object is discovered, used over several scenes, then irreversibly transformed.
3. Verify in scenario review and the finished manuscript that the source is absent before discovery, cannot return after transformation, and the result appears only after the earned transformation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
