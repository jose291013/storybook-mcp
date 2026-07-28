# Calitiki current status

Last updated: 2026-07-28

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/child-safety-notice`
- Latest merged checkpoint: PR #84 — child sexual-safety gate
- Current focused checkpoint: visible localized support/refusal feedback for enforced child-safety decisions
- Pull request: focused follow-up in preparation; PR #84 is merged
- WordPress Bridge source candidate: `0.7.2`; installed production package remains `0.7.1`
- WordPress theme source candidate: `1.2.1`; installed production theme is `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through PR #84 are merged. The meaning-led storefront is live and its Spanish translation has been entered in WordPress.

## Current product brick: child sexual-safety gate

1. Child sexual safety is classified separately from editorial sensitivity as general, protective education, possible disclosure or exploitative normalization.
2. Multilingual deterministic rules form an immutable floor; a bounded AI classifier and the moderation endpoint may raise but never lower the decision.
3. Protective requests about body autonomy, boundaries, unsafe secrets and trusted adults remain possible under a versioned narrative contract.
4. A possible disclosure pauses personalized creation and points the adult to child-protection help; exploitative normalization is refused.
5. The same gate runs before persistence, story suggestions, scenario generation and approval, preview authorization, generated-manuscript illustration, and paid local modifications.
6. A refusal reserves no credit, persists no unsafe request, and logs no family wording or free-form rationale.
7. Production `observe` classifications matched the controlled corpus; `enforce` correctly returned support for a possible disclosure, but a creator page left open across deployment did not explain the resulting `422`. The follow-up gives stale clients a localized server message and makes current clients focus and scroll to the accessible protection notice.

## Previous security brick: Sharp 0.35

1. Render's production install reported GitHub advisory `GHSA-f88m-g3jw-g9cj` against direct dependency Sharp 0.34.5.
2. Calitiki processes customer-supplied images, so the inherited libvips decoder advisory is relevant even though no exploitation has been observed.
3. Sharp is upgraded explicitly to 0.35.3 instead of using `npm audit fix --force`.
4. Node 22.22 satisfies Sharp 0.35's Node requirement, and the repository does not use the APIs removed by the 0.35 release.
5. A dependency test pins both `package.json` and `package-lock.json` to the patched version.

## Current product brick: sensitivity observation

1. New parent-intention requests may receive a private version-2 editorial sensitivity profile when `STORY_SENSITIVITY_MODE=observe`.
2. A multilingual deterministic floor tolerates accents, separators and selected common misspellings for acute self-harm, suicide, abuse and immediate-danger wording; a bounded AI classifier may raise but never lower it.
3. The stored profile contains only normalized level/category/flags, no diagnosis, explanation or copied parent text.
4. A slow or unavailable classifier falls back without blocking the existing three-intention response.
5. Private observation logs separate deterministic, classifier and final decisions without copying the family's wording.
6. This brick does not display or enforce the profile and does not pass it to scenario or manuscript prompts; persisted version-1 observations remain unchanged.

## Current product brick: age-calibrated intentions

1. The creator asks only the child's age before the parent describes the situation or message.
2. The no-credit intention assistant receives the exact age and adapts vocabulary, emotional nuance, autonomy and the first achievable step.
3. The child's name, personality, interests and universe remain deliberately unknown during this interpretation.
4. Changing the age clears previously generated interpretations and adventure suggestions so advice is never silently reused across maturity levels.
5. Existing drafts retain their persisted age, answers and current seven-step position.

## Previous product brick: intention-first flow alignment

1. The creator starts with the adult's situation or message, before asking who the child is or showing a visual universe.
2. The no-credit intention assistant works only from that situation and does not invent child or world details.
3. Child details come second; universe choice and the three personalized adventure approaches come third.
4. Existing version-3 browser drafts retain their saved step and answers while new drafts use flow version 4.
5. Theme 1.2.1 keeps the intention note, arrow and adventure caption separately visible and selectable in TranslatePress.

## Previous product brick: meaning-led storefront

1. The homepage starts with the adult's intention and shows how it becomes an adventure experienced by the child.
2. Three concrete examples connect an adult concern, an adventure and a discovery made through action.
3. The public flow explains scenario validation, AI assistance, private assets and optional paid synthetic narration without overpromising.
4. The creator header exposes a localized, strictly validated return to **My creations Calitiki** at every step.
5. Theme 1.2.0 packages the new responsive storefront; the Render creator carries the matching FR, ES and EN navigation and trust copy.

## Previous product brick: orphaned purchase reconciliation

1. A project is protected from deletion only by a currently paid eBook/print order or series canon, not by a stale `purchased` status.
2. Cancelling, failing or refunding the last paid book order restores the project to its preview lifecycle.
3. Non-paid order history remains auditable behind a project deletion tombstone while the creation and private files disappear from the customer account.
4. The creator restores the authoritative page count and explains expired legacy preview assets instead of rendering blank pages as a valid purchasable book.
5. Production showed one older Render commerce row still marked paid although WooCommerce no longer exposed a paid order card. Bridge 0.7.2 therefore sends a complete signed snapshot of the customer’s currently paid project ids so Render can reconcile this legacy mismatch before listing or deletion.

## Verification completed locally

- Previous merged checkpoint: 184 tests, 0 failures.
- Intention-first funnel and theme integration tests pass.
- Wide-desktop visual check confirms zero overlap between the intention note and the adventure caption.
- Mobile visual check confirms a vertical, overflow-free composition.
- Theme 1.2.1 archive contains the expected top-level `calitiki-theme` folder.
- Full local suite passes: 184 tests, 0 failures.
- Sensitivity corpus covers representative FR, ES and EN everyday, emotional, major-life-event and acute-safety wording.
- Full local suite after the observation brick passes: 189 tests, 0 failures.
- Sharp 0.35.3 compatibility passes the reference-photo, composed-page and eBook PDF tests.
- `npm audit` reports 0 known vulnerabilities after the controlled dependency upgrade.
- Full local suite with the security pin passes: 190 tests, 0 failures.
- Render reports 0 known production vulnerabilities after deploying PR #82.
- A production reference-photo upload succeeds and displays every normalized private thumbnail.
- The version-2 critical-floor targeted suite passes: 10 tests, 0 failures.
- Full local suite with the version-2 floor passes: 195 tests, 0 failures.
- `npm audit` remains at 0 known vulnerabilities.
- Child sexual-safety targeted suite passes: 24 tests, 0 failures.
- Full local suite with the child sexual-safety gate passes: 203 tests, 0 failures.
- Production observation corpus returned the expected general, protective, disclosure and exploitative decisions.
- Child-safety notice follow-up targeted suite passes: 26 tests, 0 failures.
- Full local suite with the localized stale-client fallback passes: 204 tests, 0 failures.

## Next verification target

1. Publish the focused child-safety notice follow-up without merging it.
2. After explicit merge and deployment, hard-refresh the creator and repeat the disclosure plus exploitative-normalization tests in `enforce`.
3. Verify the localized notice, 119 link, unchanged project list and unchanged credit balance.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
