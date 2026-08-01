# Calitiki current status

Last updated: 2026-08-01

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/canonical-passage-recovery`
- Production/main checkpoint: PR #131 merged at `2afef50`; deterministic canonical-gate diagnostics deployed
- Current focused checkpoint: connect canonical `passage_discovery_missing` diagnostics to the generic discovery-before-crossing repair and restore one policy-versioned recovery to the preserved canary project
- Pull request: being prepared; not merged
- WordPress Bridge source and installed production package: `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #131 are merged on `main`. The last verified production modes were `CHILD_SAFETY_MODE=enforce` and `STORY_SENSITIVITY_MODE=observe`; verify Render before changing this operational checkpoint.

## Current product brick: canonical passage recovery

1. A missing passage discovery now points to its first concrete crossing scene instead of only the global passage registry.
2. Canonical diagnostics reuse the existing generic discovery-before-crossing repair; stable passage ids are aligned without changing unrelated scenes.
3. Scenario retry policy version 2 grants one new creator-free recovery to projects exhausted before this fix, including the preserved canary project.
4. Child Safety, sensitivity contracts and private bounded diagnostics remain unchanged.

## Verification

- Focused passage, compiler and retry-policy tests: passing.
- Complete `npm test`: 369/369 passing.
- Complete npm production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.

## Next verification target

1. Publish and deploy this brick without deleting project `1a76ebc1-b389-4453-8f01-0205e7b4c206`.
2. Reopen the preserved project; its free retry must be visible again through the policy-versioned recovery.
3. Confirm the retry reaches scenario review and the canonical compiler no longer reports `passage_discovery_missing`.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
