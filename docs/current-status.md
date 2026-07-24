# Calitiki current status

Last updated: 2026-07-24

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/hard-scene-fidelity`
- Latest merged checkpoint: PR #55 — preview milestone e-mails and visible long-running stages (`9f1030b`)
- Current focused checkpoint: deterministic reader-visible cast checks, blocking identity-fusion detection and natural parent appellations
- Pull request: PR #56 — `Block scene cast and identity defects`, updated on the merged PR #55 checkpoint
- WordPress Bridge source/package: `0.6.9`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

Production confirms that PR #54 produces and preserves the approved three-act scenario. A completed real book nevertheless exposed three downstream defects: a parent acted physically in prose without appearing in the paired image, one illustration fused the mother's human body with the dog's head, and the child referred to her mother by her civil name inside dialogue.

PR #55 is merged. It adds visible manuscript/coherence/cover stages and idempotent cover-ready, generation-failure and complete-preview e-mails through Bridge 0.6.9. The current branch preserves those changes while adding the stricter scene-fidelity rules below.

## Current product brick: hard scene fidelity

1. The final manuscript receives a deterministic comparison against the creator-approved scene presences in addition to the semantic audit.
2. A named character absent from the approved scene cannot be introduced in its prose; thought, memory and voice characters cannot receive current physical actions.
3. Parent relationships are retained with localized preferred appellations, so narration may say the civil name while the child's dialogue and thoughts use **Maman**, **Papa**, **Mamá** or **Dad**.
4. Image prompts map each human or animal reference to one complete separate individual and explicitly forbid head, body, species or identity fusion.
5. A missing required named character, wrong central actor or identity fusion remains blocking after the final image attempt. Only subjective style, likeness and minor composition differences may be retained with a warning.
6. Story-plan fidelity version 2 rebuilds older checkpoints before reusing their manuscript and illustration contracts.

## Verification completed locally

- Server syntax checks pass.
- Focused scenario and image-policy tests: 25 passed, 0 failed.
- Full combined `npm.cmd test`: 139 passed, 0 failed.

## Next verification target

1. Merge PR #56; the combined tests pass and the creator confirmed that no preview or targeted modification is generating.
2. Install Bridge 0.6.9, then verify one cover-ready e-mail, one retryable-failure e-mail and the existing complete-preview e-mail.
3. Test one scene containing a photographed parent and animal together, plus one recalled nonphysical guide and one child line using the parent's family appellation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
