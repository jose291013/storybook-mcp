# Calitiki current status

Last updated: 2026-07-24

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/hard-scene-fidelity`
- Latest merged checkpoint: PR #54 — causal scenario handoff and cover guidance (`c195978`)
- Current focused checkpoint: deterministic reader-visible cast checks, blocking identity-fusion detection and natural parent appellations
- Pull request: draft PR #56 — `Block scene cast and identity defects`; draft PR #55 for preview milestone e-mails remains separate on `codex/preview-milestone-emails`
- WordPress Bridge source/package: `0.6.8`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

Production confirms that PR #54 produces and preserves the approved three-act scenario. A completed real book nevertheless exposed three downstream defects: a parent acted physically in prose without appearing in the paired image, one illustration fused the mother's human body with the dog's head, and the child referred to her mother by her civil name inside dialogue.

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
- Full `npm.cmd test`: 137 passed, 0 failed.

## Next verification target

1. Inspect the stored contracts for the reported pages if the creator provides the authenticated console extract; the correction already covers either source branch (wrong prose cast or missing required image cast).
2. Publish this branch as its own draft PR without mixing the separate PR #55 milestone-email brick.
3. Before either merge, warn that Render may restart and confirm that no preview or targeted modification is generating.
4. After deployment, test one scene containing a photographed parent and animal together, plus one recalled nonphysical guide and one child line using the parent's family appellation.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
