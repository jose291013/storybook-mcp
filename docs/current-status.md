# Calitiki current status

Last updated: 2026-07-24

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/preview-milestone-emails`
- Latest merged checkpoint: PR #54 — causal scenario handoff and cover guidance (`c195978`)
- Current focused checkpoint: visible pre-cover progress and opt-in milestone e-mails for cover approval and generation interruption
- Pull request: not published yet; do not merge while project `db895f92-d075-4799-bac2-6f4a67bdf581` is generating
- WordPress Bridge source/package: `0.6.9`
- WordPress theme source: `1.1.5`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

Production confirms that the PR #53 credit-purchase return restores the originating book correctly. PR #54 is now deployed and is being exercised by a real book. Its long whole-book planning call remains active, but the creator-facing progress stayed at 5%, making healthy work look blocked.

## Current product brick: preview milestone communication

1. The progress bar names whole-book harmonization, scenario fidelity checking, bounded repair and cover creation instead of appearing frozen at 5%.
2. The existing e-mail opt-in explicitly covers three useful events: cover awaiting approval, generation interruption and complete preview ready.
3. Cover and failure messages use a new signed Bridge endpoint so Render may deploy before Bridge 0.6.9 without an older plugin sending the wrong “book ready” copy.
4. Each message carries a private reauthentication link to the exact persisted screen and a unique event id; repeated callbacks cannot send the same message twice.
5. A regenerated cover or a genuinely new technical attempt may send a new notification, while notification failure never changes generation state or spends credit.

## Verification completed locally

- Browser and server syntax checks pass.
- The Bridge 0.6.9 PHP source parses successfully and its ZIP contains portable forward-slash paths.
- Full `npm.cmd test`: 135 passed, 0 failed.

## Next verification target

1. Finish the current real-book test without deploying this branch.
2. Publish the completed Bridge 0.6.9 and milestone-notification work as a draft pull request.
3. Before merging, warn that Render may restart and confirm that no preview or targeted modification is generating.
4. After deployment and Bridge 0.6.9 installation, verify one cover-ready e-mail, one retryable-failure e-mail and the existing complete-preview e-mail.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
