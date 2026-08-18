# Calitiki current status

Last updated: 2026-08-18

Operational memory only. `docs/product-roadmap.md` remains the product-direction authority and `AGENTS.md` remains the repository working agreement.

## Git checkpoint

- Repository: `jose291013/storybook-mcp`
- Local folder: `C:\Dev\storybook-mcp`
- Current branch: `codex/narrative-v3-delivery-manifest`
- Production/main checkpoint: Narrative V3 deterministic object lifecycle (`3d54984`, PR #223)
- Current focused checkpoint: strict page-complete `DeliveryManifest.v1` compiled only from one fully accepted immutable V3 lineage; no production route or paid model enabled
- Pull requests: #150 through #223 merged
- WordPress Bridge source candidate: `0.7.8`; installed production package last recorded as `0.7.5`
- WordPress theme source candidate: `1.2.2`; installed production theme last recorded as `1.2.0`
- Render: `https://storybook-mcp.onrender.com`
- Storefront: `https://calitiki.com`

PR #55 through #223 are merged on `main`. The V3 audit reproduced the root
pipeline-boundary defect locally: passing a canonical scenario through the
raw-output normalizer erased its locations and physical presences. The first
side-by-side V3 implementation now establishes strict incompatible model-wire,
canonical concept, server-mechanics and canonical graph contracts without
connecting them to a production route. Further V2 repair bricks remain frozen
except for security, privacy, commerce and data-loss defects.

## Current architecture decision: Narrative V3

1. V3 uses immutable typed artifacts with strict wire/canonical boundaries and
   parent digests.
2. Creative models author semantic concepts; deterministic compilers own acts,
   topology, movements, presences, objects, outfits and page bindings.
3. HTTP routes enqueue durable idempotent steps. A retry resumes one step and
   cannot rewrite an approved ancestor.
4. Manuscript and visual storyboard derive from the released spec; they do not
   read duplicated blueprint or legacy scenario authorities.
5. Vision QA uncertainty remains internal. Only deterministic evidence or
   focused confirmed objective defects can block a page.
6. Existing V2 projects are not implicitly migrated or used as V3 canaries.

Next verification target: execute the complete V3 chain in shadow across the
language/universe/format matrix, enforce quality, cost and concurrency gates,
then add a production canary that remains disabled by default.

## Product brick: Narrative V3 delivery manifest

1. `DeliveryManifest.v1` is compiled only from the exact released spec,
   manuscript, storyboard and illustration-decision artifacts.
2. A single rejected or missing image prevents readiness; no stale candidate,
   parent approval or public asset fallback can enter delivery.
3. Every physical page appears exactly once and in order. Text pages reference
   the exact manuscript-page digest; image pages reference the accepted
   decision and its private file metadata.
4. Per-page and whole-manifest digests reject reorder, replacement and tamper.
5. The append-only ledger enforces all four ordered parents. The leased
   `assemble_delivery_manifest` step is restart-idempotent and migration 025 is
   isolated from V2/customer aggregates.
6. The anonymous 18-case matrix reaches ten immutable artifacts and replay
   preserves every current pointer without provider, credit or route access.

Verification: 13 focused delivery/lifecycle tests and the complete 645-test
suite pass.

## Product brick: Narrative V3 illustration evidence

1. `ImageCandidateSet.v1` records one candidate per exact beat with a provider
   response id and private storage key plus file digest, type and dimensions.
2. Candidate response ids, private keys and file hashes must be unique across
   the book; public asset URLs and a candidate from another beat fail closed.
3. `IllustrationEvaluationWire.v1` permits only bounded objective defect codes.
   Subjective labels or a foreign candidate digest are rejected at the wire.
4. `IllustrationDecisionSet.v1` rejects only confirmed objective evidence.
   Uncertainty stays internal and cannot ask the parent to arbitrate or spend.
5. Accepted decisions copy the exact private asset; rejected decisions expose
   no asset and remain an internal incomplete-generation state.
6. Exact storyboard/candidate ancestry is enforced by the append-only ledger;
   two leased idempotent steps and migration 024 remain isolated from V2.
7. The 18-case anonymous matrix reaches nine immutable artifacts with zero
   production provider calls, paid calls or customer routes.

Verification: 15 focused illustration/lifecycle tests and the complete
640-test suite pass.

## Product brick: Narrative V3 deterministic visual storyboard

1. `VisualStoryboard.v1` has exactly one released-spec and one manuscript
   source and is compiled locally without a creative model or compatibility
   normalizer.
2. Every scene produces exactly one image beat bound to the exact spread,
   text/image pages, source scene, prose page and complete object-state digest.
3. The beat copies the single physical instant, medium, required/forbidden
   cast, wardrobe/equipment, every object state and main action.
4. Consecutive beats store reciprocal digests and incoming/outgoing locations;
   an unexplained jump, reordered scene or stale neighbor fails closed.
5. A deterministic whole-book composition sequence varies scale, viewpoint,
   placement, depth and energy while reserving peak energy for the climax and
   settling the return.
6. The ledger requires exact ordered V3 spec/manuscript parents. The leased
   `compile_visual_storyboard` step is idempotent and migration 023 changes only
   isolated V3 constraints.
7. The anonymous 18-case matrix now reaches seven immutable artifacts with no
   route, provider, credit, customer project, environment or Render change.

Verification: 20 focused manuscript/storyboard/lifecycle tests and the complete
633-test suite pass.

## Product brick: Narrative V3 strict manuscript contract

1. `ManuscriptWire.v1` is the only model-facing representation. It accepts one
   exact released-spec digest, one supported language and every text page once.
2. The parser rejects missing, duplicate, invented or stale pages, unknown
   fields, a foreign language and text outside the age-bound word tolerance.
3. `Manuscript.v1` binds every scene page to the exact released source-scene
   and complete object-state digests; opening and closing pages remain explicit.
4. Canonical loading revalidates page order, bindings, word counts and artifact
   digest and never normalizes or repairs persisted content.
5. The append-only ledger permits the artifact only behind one exact
   `narrative_book_spec_v3` parent. The leased `write_manuscript` step commits it
   idempotently, and migration 022 changes only isolated V3 constraints.
6. The 18-case anonymous object matrix now reaches six immutable artifacts.
   No route, V2/customer project, provider call, credit, series canon,
   environment variable or Render configuration changes.

Verification: 20 focused manuscript/release/lifecycle tests and the complete
627-test suite pass.

## Product brick: Narrative V3 object-aware release spec

1. `NarrativeBookSpec.v3` is a new strict contract; V2 remains immutable and
   keeps its own artifact type, parents, pointers and behavior.
2. The new release has exactly three ordered immutable parents: CreationIntent,
   CanonicalStoryGraph and ObjectLifecycleProjection.
3. Compilation rejects a projection from another graph, a changed object
   registry, stale source-scene evidence, stale event evidence or incomplete
   per-scene object state before any manuscript or image work.
4. Every released scene carries the complete ordered state of every object and
   one digest shared with its illustration instant. Quantity, owner, location
   and visibility therefore have one deterministic authority.
5. The append-only ledger adds the isolated `narrative_book_spec_v3` type and
   proves both intent ancestry and graph-to-projection ancestry. The durable
   state machine requires all three exact inputs in order.
6. Migration 021 expands only isolated V3 artifact, pointer and step checks.
   No production route, V2/customer project, model call, credit, series canon,
   environment variable or Render configuration changes.
7. The 18-case object matrix now reaches five immutable artifacts with 54
   projected objects and 90 stable adversarial rejections.

Verification: 23 focused V2/V3 release and lifecycle tests, the complete
621-test suite and `npm run check:narrative-v3-objects` pass.

## Product brick: Narrative V3 deterministic object lifecycle

1. `ObjectLifecycleProjection.v1` projects every registered object through
   every canonical scene with exact quantity, state, owner, location,
   required/forbidden illustration visibility and a deterministic reason.
2. The compiler consumes only one sealed `CanonicalStoryGraph.v1`; it reads no
   prose, invokes no model and never repairs its input.
3. Every unique plot object starts at quantity one. State and owner transitions
   must be explicit and continuous; consumption is terminal, fixed objects
   cannot move, and an event owner must be visible at the event location.
4. Portable objects follow their canonical owner through graph movements.
   Off-camera ownership forbids rendering without inventing a loss, transfer or
   duplicate.
5. The append-only ledger stores the projection behind its exact graph parent.
   The durable state machine adds one idempotent compile step and migration 020
   expands only isolated V3 type constraints.
6. `npm run check:narrative-v3-objects` exercises 18 anonymous 32-page fixtures
   across FR/ES/EN and all six universes. Three objects per fixture and five
   deliberate corruptions produce 90 stable adversarial rejections.
7. The current release-spec schema is not mutated. It still fails closed for
   objects until its next version binds this projection as an immutable parent.
8. No route, V2/customer project, provider call, credit, series canon,
   environment variable or Render configuration changes.

Verification: 8 focused lifecycle tests, 18 matrix fixtures with 90 adversarial
rejections, and the complete 615-test suite pass.

## Product brick: Narrative V3 deterministic release spec

1. `NarrativeBookSpec.v2` is a new strict artifact compiled only from one sealed
   CreationIntent, one sealed CanonicalStoryGraph and exact immutable private
   profile bindings. It does not accept the legacy scenario or blueprint.
2. Each released character binds the intent-authorized profile reference to one
   positive revision, profile digest, display name and private visual-identity
   reference/digest. Missing, foreign, duplicate or ambiguous identities fail
   before release.
3. The compiler calculates every opening, closing, text and image page locally.
   Each canonical scene receives one alternating spread binding and a digest of
   its exact unchanged source scene.
4. Each scene resolves one illustration instant with one phase, location,
   universe physical medium, exact visible/forbidden cast, wardrobe/equipment
   states, object-event evidence and main action. It never reads prose keywords.
5. Objects deliberately fail closed in this compiler version: a non-empty
   object registry cannot be released until the next graph contract proves
   versioned quantity, ownership, location and visible state. No placeholder or
   heuristic projection is allowed.
6. The ledger stores the release spec with the exact ordered intent and graph
   parents. The durable state machine adds one idempotent release step and
   migration 019 expands only isolated V3 type constraints.
7. The synthetic runner now commits four artifacts through the real chain and
   continues to report zero provider calls, paid calls and customer routes.
8. No production worker, V2 project, customer project, series canon, credit,
   environment variable or Render configuration is changed.

Verification: 9 focused release-spec tests, the 108-case synthetic chain and
the complete 607-test suite pass.

## Product brick: Narrative V3 synthetic shadow runner

1. A local runner executes the real append-only artifact ledger and durable
   state machine from `CreationIntent` through `StoryConcept` to
   `CanonicalStoryGraph` using anonymous in-memory semantics and temporary JSON
   stores only.
2. The exhaustive matrix covers FR, ES and EN, all six universes and all six
   sellable page counts: 108 structural fixtures with exact scene, act,
   crossing and return cardinality.
3. Every fixture commits the exact immutable ancestry and promotion pointers.
   Replaying the same fixture creates no duplicate artifact and leaves all
   pointer revisions at 1.
4. Reports contain only fixture identifiers, structural counters and canonical
   digests. Profile references, story prose and generated content are absent.
5. The runner imports no route, server, credit or model client, reads no
   environment variable and reports zero provider/paid calls and zero customer
   routes touched.
6. No production worker, V2 project, customer project, series canon, credit,
   environment variable or Render configuration is changed.

Verification: 4 focused tests and the complete 597-test suite pass. The CLI
command is `npm run check:narrative-v3-shadow`.

## Product brick: Narrative V3 deterministic mechanics builder

1. Every supported page count produces exactly `(pageCount - 2) / 2` semantic
   scenes; the server assigns three contiguous acts by fixed boundaries.
2. A concept must begin with `opening`, end with `resolution`, contain exactly
   one act-3 climax, and use either one complete act-2 crossing/act-3 return pair
   or no passage at all. Partial or duplicated mechanics fail before compilation.
3. The builder resolves each cast member's canonical initial side from first
   participation, moves only explicit travelers, returns every outbound traveler,
   and keeps departure witnesses and adventure-local companions on their side.
4. All six universe contracts supply one stable origin/adventure topology and,
   when needed, one passage registry. No model supplies or repairs endpoints.
5. Wardrobe is resolved for the visible instant. Adventure clothing starts at
   preparation, persists through return, and underwater travelers receive their
   individual breathing/communication state only inside the passage window.
6. Visible cast, forbidden cast, physical presences, movements and wardrobe
   cardinality are compiled from the same state. The result passes the strict
   canonical graph compiler without normalization.
7. Canonical names remain neutral semantic aliases in this isolated shadow
   layer; immutable private profile/display-name binding belongs to the later
   release-spec brick and is not inferred here.
8. No route, V2 project, credit, series canon, environment variable, customer
   data or model call is changed.

Verification: 23 focused V3 tests and the complete 593-test suite pass. The
matrix compiles all 36 universe/format combinations twice with byte-identical
mechanics and valid canonical graphs.

## Product brick: Narrative V3 canonical creation intent

1. `CreationIntent.v1` is a strict immutable server artifact containing only
   language, age/reading band, supported format, universe and narrative-goal
   identifiers, bounded profile references, continuity references and source
   digests.
2. The constructor deterministically derives the reading band and rejects
   unsupported pages, duplicate character keys, missing/multiple heroes,
   generated mechanics, customer prose and unknown fields.
3. Names, photos and questionnaire text never enter the artifact; only opaque
   private profile references and SHA-256 source digests are persisted.
4. The artifact ledger accepts `creation_intent` as a parentless root. Every new
   `story_concept` must name exactly that root as its immutable direct parent.
5. The `parse_story_concept` state-machine step now consumes the exact intent
   artifact id and digest. Step inputs are translated explicitly to ledger
   parent digests during idempotent commit.
6. Migration 018 expands only the isolated V3 artifact/pointer type checks. No
   customer route, V2 project, credit, series canon, environment variable or
   model call is changed.

Verification: 34 focused V3 tests and the complete 588-test suite pass,
including strict privacy boundaries, digest tamper detection, exact intent
ancestry and restart after promotion.

## Product brick: Narrative V3 durable step state machine

1. Dedicated V3 run, step, ordered input and commit tables bind every operation
   to exact immutable input/output artifact ids and digests.
2. Workers claim only the earliest unfinished step with a lease and
   `FOR UPDATE SKIP LOCKED`; a concurrent worker cannot execute the same active
   step, and only its owner can renew the lease heartbeat.
3. A model-backed logical step may persist one provider response id. A restart
   polls that same response instead of creating another paid request.
4. Artifact creation and pointer promotion remain idempotent. If the process
   stops after promotion but before step completion, the reclaimed step records
   the same artifact and pointer revision without duplicating either.
5. A completed step has one immutable commit; a competing output fails closed.
   Later steps remain unclaimable until every earlier sequence is complete.
6. Only `parse_story_concept` and `compile_story_graph` exist, both bound to
   strict artifact types. The state machine is not connected to HTTP, workers,
   customer projects or model calls in production.

Verification: 28 focused V3 tests pass, including provider-id idempotence,
two-worker claiming and crash recovery after artifact promotion.

## Product brick: Narrative V3 append-only artifact ledger

1. PostgreSQL stores each strict V3 artifact as a new immutable row with project,
   type, schema version, monotonically allocated revision, canonical payload
   digest, bounded provenance and lifecycle state.
2. Ordered parent links have database foreign keys to the exact parent project
   and digest. A graph cannot be stored unless its one persisted concept parent
   matches `sourceConcept.artifactDigest` exactly.
3. Current project state is a separate pointer. Promotion locks the project and
   uses compare-and-set pointer revisions, so concurrent workers cannot both
   publish competing descendants or roll a pointer back to an older artifact
   revision.
4. Retrying the same write or promotion is idempotent; a rejected or quarantined
   artifact can never become current.
5. Every read revalidates schema, digest, revision and ancestry. Persisted
   corruption fails closed instead of entering a normalizer or migration.
6. The local JSON implementation is development-only; production selects
   PostgreSQL through the existing `DATABASE_URL`. No new environment variable,
   route, model call, customer migration, credit or V2 mutation is introduced.

Verification: 22 focused V3 contract/ledger tests pass, including restart replay
and a concurrent two-writer compare-and-set race with exactly one winner.

## Product brick: Narrative V3 strict contract foundation

1. The creative-model wire format and canonical `StoryConcept.v1` are separate,
   strict and intentionally incompatible schemas; only one explicit parser may
   cross that boundary.
2. The server owns a separate strict mechanics contract for topology,
   movements, physical presences, object events, wardrobe and illustration
   state. Unknown or misspelled fields fail closed instead of being normalized.
3. `CanonicalStoryGraph.v1` is compiled deterministically from one validated
   concept plus server mechanics. It enforces exact beat binding, contiguous
   scenes and acts, physical handoffs, movement origins, visible cast, wardrobe,
   object and passage integrity.
4. Canonical JSON serialization and SHA-256 digests bind parser/compiler
   versions; loaders verify the digest and return deeply immutable artifacts.
5. Replaying the same persisted inputs is byte-identical and neither compiler
   nor loader repairs, migrates or mutates its input.
6. The implementation is isolated under `src/contracts`: no production route,
   customer project, credit, series canon, environment variable or V2 behavior
   changes.

Verification: 13 focused V3 tests, the complete 567-test suite and production
dependency audit pass; `npm audit --omit=dev` reports 0 vulnerabilities.

## Product brick: whole-checkpoint mechanical refresh

1. A deterministic object recovery rebuilds hidden mechanics for every scene of the preserved private candidate instead of restoring stale non-target ledgers after stabilization.
2. A bounded narrative-surface assertion guarantees that title, summary, scene title/action/locations and visible presence modes remain byte-for-value unchanged.
3. The migration route invokes no architect and no repair model; it permits exactly one fresh semantic audit because the legacy structural failure never reached that gate.
4. Old semantic diagnostics cannot roll back newly compiled mechanics or reintroduce the former `6 -> 9 -> rollback` cycle.
5. Object-render recovery version 3 grants one free retry to the project exhausted under version 2.
6. No environment variable, customer credit, series-canon mutation or creator-visible rewrite is introduced.

Verification: 131 focused scenario/compiler/worker tests and the complete 554-test suite pass.

## Product brick: causal/render object-state arbitration

1. The causal graph remains the global authority for possession, while one shared deterministic function derives whether that possessed object is visible in each scene.
2. A worn, held or carried object is locally absent with quantity zero only while its canonical owner is physically off camera; no transfer, loss or duplicate is invented.
3. Structural lifecycle validation consumes that same projection instead of contradicting it with the global state.
4. The semantic auditor may discard only an object-visibility suspicion coordinated to exact entity ids and compiler-certified `owner_off_camera` scene states; duplication, quantity, transformation and uncoordinated findings remain blocking.
5. Object-render recovery version 2 reopens one free private-checkpoint retry for failures exhausted under version 1, without rerunning the questionnaire or architect.
6. No environment variable, credit, customer-data migration or series-canon change is introduced.

Verification: 129 focused scenario/worker tests and the complete 552-test suite pass. After deployment, project `94a8c52b-9537-4e8a-b5f4-25eff24f1c4e` should expose one free retry, reuse its private semantic checkpoint and complete without another architect call if its only remaining findings are the former off-camera possession contradictions.

## Product brick: gross active-wardrobe continuity gate

1. Every visible human's resolved per-scene wardrobe lock enters the existing scene-fidelity contract using neutral visual aliases.
2. The already-budgeted scene QA call rejects only a clear outfit-state/category contradiction; approximate color, tiny details, occlusion, simplification and removed branding remain non-blocking.
3. `wardrobe_state_mismatch` is a high-confidence objective code eligible for one existing targeted image edit, with no systematic extra QA or image call.
4. A quarantined wardrobe candidate is not an accepted adjacent-scene reference, so one casual-clothing error cannot contaminate later adventure scenes.
5. The targeted edit changes only the affected person's clothes and preserves identity, body, pose, composition and every unaffected subject.
6. The brick applies only to future generations; it does not inspect, regenerate, charge or otherwise mutate the current Mathéo book.

## Product brick: durable object-checkpoint retry entitlement

1. Retry eligibility accepts the same private semantic checkpoint in either its original generation field or the preserved retry request.
2. The queued recovery reuses that exact checkpoint pointer and existing candidate; it does not restart the architect or questionnaire.
3. A failed scenario already visible to the creator now labels the available action explicitly as a free retry in FR, ES and EN.
4. The object-only recovery remains single-use and audit-only under retry policy version 9.
5. No customer data migration, credit, environment variable, model call or series-canon change is introduced.

## Product brick: deterministic off-camera object projection

1. The causal graph keeps global possession unchanged when a character is outside the illustrated frame.
2. The render ledger projects that worn, held or carried object as absent with quantity zero only for the off-camera scene.
3. When the owner returns, the object returns to its canonical state without a fabricated transfer, retrieval, loss or duplicate.
4. Retry policy version 9 opens one audit-only recovery for exhausted object-only private checkpoints and skips another architect rewrite.
5. Render receives only the compiler version, affected count and scene numbers; no environment variable, credit or series canon changes.

## Product brick: transactional editorial repair

1. The internal semantic editor receives only the scenes coordinated by its own bounded audit.
2. Its global object and causal registries remain eligible, but the complete result must pass deterministic validation before replacing the prior candidate.
3. A failed mechanical result rolls back atomically; a remaining semantic result is kept only when it strictly reduces issues without adding a scene or category.
4. A missing final audit also rolls back, so no unverified editorial candidate becomes the private recovery checkpoint.
5. Render receives a content-free transaction summary that makes a rejected 22-error cascade operationally visible.

## Product brick: unified repair transaction recovery

1. Structural, editorial and private-checkpoint repairs share one content-free transaction decision.
2. An invalid candidate is retained only when it strictly reduces issue count without introducing a scene or category; otherwise the previous private candidate is restored atomically.
3. Retry policy version 8 opens exactly one recovery for exhausted object-only semantic checkpoints created before this common transaction.
4. That recovery starts from the latest private checkpoint, reruns mechanical and semantic validation, and cannot reopen again.
5. No customer story, credit, environment variable or series canon is changed by deployment.

## Product brick: initial named-cast arbitration

1. A low-detail cast finding on an ordinary generated page is a suspicion, not a customer correction.
2. Only a suspected page receives one high-detail structured arbitration with its private identity references; unaffected pages add no call.
3. Zero, two-or-more, an explicit fused state or one candidate id shared by two names confirm objective cast defects.
4. One unique separate candidate per required identity clears contradictory free-text findings; uncertain or incomplete arbitration remains advisory.
5. Independent action, location, object and topology defects remain blocking, while retouch evidence keeps its existing fail-closed protection.

## Product brick: exact cast cardinality after targeted repair

1. A targeted cast or identity repair receives one focused high-detail count for every named person and animal.
2. Zero occurrences remain missing, one is valid and two-or-more become the objective `identity_duplicate` defect.
3. Canonical identity references outrank the defective source image for face, hair, species, coat and markings, while the source still preserves composition and unaffected content.
4. A structured revision comparison separates identity/cast claims from unrelated invariant regressions, preventing a confirmed complete cast from becoming a false customer task.
5. Persisted defect codes drive precise FR/ES/EN creator messages instead of free-text keyword matching.
6. Creator-requested illustration alternatives use the same exact-cast gate, preventing a manual correction from adding a second Eva or preserving a substituted Kovu.

## Product brick: identity-aware paid illustration repair

1. Paid illustration adjustments edit the preserved source locally and must keep exactly one complete instance of every required named identity.
2. The focused high-detail controller receives the matching private identity references and cannot assign one candidate person to two different aliases.
3. Its complete result replaces contradictory anonymous missing/duplicate findings; action, location, object and topology findings remain independent.
4. An incomplete focused response preserves the earlier evidence rather than silently approving or inventing a conclusion.
5. A failed candidate releases its credit reservation, while capture remains after successful private generation and before explicit creator approval.

## Product brick: settled final-return composition

1. The exact illustrated phase outranks a scene-wide travel event when the final `return_home_and_moral` beat is already at its end location.
2. A return shown during the crossing keeps the reverse threshold profile; a return shown after arrival receives the quiet moral composition at energy 1 or 2.
3. Visual-composition plan version 3 and illustration-plan version 12 invalidate the contradictory saved composition deterministically.
4. An interrupted project rebuilds only its signed storyboard from the approved scenario, blueprint and saved manuscript; it does not request another narrative model call.
5. The whole-book rhythm still blocks a genuinely energetic unresolved return before any illustration request.

## Product brick: deterministic physical chronology

1. A scene that approaches and then discovers a passage keeps the ordinary approach before the stationary discovery.
2. The compiler reuses an explicit discovery event instead of inserting a duplicate before the travelers arrive.
3. One stable passage return collapsed into a later final location is split into the reverse crossing plus one already established ordinary outer route.
4. Competing passage pairs, missing outer routes or competing routes remain blocking; the deterministic pass never invents geography.
5. Diagnostics point to the crossing that introduces the third endpoint, and retry policy version 7 opens one lifecycle-v2 recovery from the existing private candidate.

## Product brick: global passage-lifecycle recovery

1. A missing or collapsed crossing route is resolved from the one stable endpoint pair used by the same passage throughout the complete scenario.
2. The direction is accepted only when a known event endpoint or the scene's incoming/outgoing location establishes it; otherwise the candidate remains blocked.
3. Multi-step scenes may therefore preserve their ordinary approach or departure leg while the inner passage receives its exact coordinates.
4. Several distinct global endpoint pairs remain ambiguous and are never guessed or merged.
5. Retry policy version 6 reopens one private canonical-checkpoint recovery for projects exhausted before this lifecycle resolver, without another questionnaire or a generic replay.

## Product brick: deterministic passage-envelope completion

1. A focal `cross_passage` or `return_travel` whose hidden route coordinates are incomplete inherits the scene's canonical `locationBefore` and `locationAfter` when that is the only physical route available.
2. Matching passage movements inherit the completed pair in the same immutable pre-compilation pass, before any canonical model-repair budget is consumed.
3. An ordered scene with another explicit route or several competing passage routes remains blocking; the compiler never guesses which inner leg the passage represents.
4. The submitted scenario remains unchanged, reverse crossings keep their stable passage id and no environment variable or additional model call is introduced.
5. A failed project whose private candidate still offers a free retry can reuse that candidate after deployment instead of restarting the questionnaire.

## Product brick: lossless image-contract preflight

1. Every current signed beat is independently projected into the exact compact contract used by the image prompt before any image request.
2. The preflight compares action, named and generic cast, required elements, object states, causal frame, topology, equipment, fixed entities, prohibitions, composition and density.
3. Any array truncation, missing field or changed quantity stops privately before the cover or interior image path.
4. Zero-quantity absent objects remain zero instead of being silently converted to quantity one.
5. Names remain safely neutralized for image generation while the full canonical meaning is proven equivalent locally, with no model call.

## Product brick: deterministic scene density

1. Every beat receives an age-bounded visual hierarchy with one main action and at most two or three high-salience entities.
2. Canonical supporting cast and required elements remain complete but visually subordinate; visible object states become low-salience context.
3. Non-canonical decorative accents are limited from one for ages 1-3 to five for ages 12-14.
4. The hierarchy never removes a required person, object or location and explicitly forbids decorative people, duplicate landmarks and a second focal action.
5. The density plan is signed, validated and sent through the existing image prompt without another model call.

## Product brick: whole-book visual rhythm

1. Every composition carries a bounded scale family and an energy level from 1 to 5.
2. A complete book must use at least three scale families and cannot repeat one family across four consecutive scenes.
3. At least one attempt gains visible energy; the climax alone carries the unique level-5 peak composition.
4. The scene after the climax must release intensity, and the final return settles at level 1 or 2.
5. The whole-book rhythm is validated with the signed storyboard before any illustration request and adds no model call.

## Product brick: deterministic visual variety

1. Every new Narrative V2 scene receives a deterministic composition derived from its story role and physical transition.
2. The contract fixes square framing, shot scale, viewpoint, subject placement, depth, rhythm and cast readability without changing canonical facts.
3. Adjacent scenes cannot repeat the same composition; all six sellable lengths receive at least seven distinct composition patterns.
4. A passage crossing uses a spatial threshold view that keeps departure, boundary and destination visually separate.
5. The composition is signed into the visual beat, validated before image generation and added to the compact image prompt with no new model call.

## Product brick: manuscript-to-visual-beat fidelity

1. The existing whole-manuscript language-editor call receives each signed visual beat and must attest every paired text page against its exact digest.
2. A local wording correction is allowed only when it restores the approved visible instant without changing the event; the complete corrected page must be returned and actually applied.
3. Missing, duplicated, stale, unexpected or rejected fidelity evidence stops internally before any illustration request.
4. A correction may introduce a canonical name only when that person is already authorized in the paired beat's visible cast.
5. This consumes no additional model call; manuscript review checkpoint version 2 prevents an older review from bypassing the new contract.

## Product brick: adjacent storyboard handoffs

1. Scene numbers must be contiguous and each scene's final location must equal the next scene's initial location.
2. When world topology is active, the outgoing physical zone must equal the next incoming zone.
3. Every beat carries the same complete object registry even while individual states change causally.
4. Text/image page pairs cannot overlap the following spread.
5. A fixed landmark's declared next-scene visibility must match its actual next-scene registry state.

## Product brick: signed storyboard-to-manuscript binding

1. Every visual beat receives a SHA-256 digest over its immutable scene, cast, action, objects, causal frame, physical snapshot and forbidden elements.
2. Text binding may add only the paired source prose; it cannot change the signed visual payload.
3. Before cover or interior image generation, a local gate verifies versions, artifact ownership, unique scene/page bindings, complete text and every beat digest.
4. A stale artifact, missing page, mismatched prose binding or visual mutation stops internally before any image cost.
5. Version-1 storyboard checkpoints continue through the compatibility path instead of being silently upgraded mid-book.

## Product brick: storyboard-first visual beat contract

1. For Narrative V2 books, every scene receives a deterministic visual beat immediately after the approved blueprint and before any manuscript call.
2. Each beat freezes the single visible phase, camera zone and medium, cast, main action, object states, required and forbidden elements.
3. Manuscript batches write from both the canonical scene and this visual beat; the language editor receives the same immutable coordinates.
4. Reader text is bound into the already-sealed storyboard afterward and cannot mutate its visual instructions.
5. A pre-manuscript checkpoint makes retries idempotent; projects with an older partial manuscript continue on their compatibility path.

## Product brick: six-universe physical topology

1. Every universe defines an origin zone, adventure zone, transition zone and physical medium for each side.
2. The first stable `cross_passage` fixes the boundary; the same id returns to the origin and cannot be replaced by ordinary travel.
3. A universe-native story without a boundary stays wholly on its declared adventure side.
4. Scene planning, image prompts and final audit receive exact camera/opposite zones as well as physical media.
5. Legacy non-ocean contracts do not acquire this topology during regeneration; the prior coral-ocean compatibility fallback remains.

## Product brick: age × intention narrative contract

1. Five deterministic age profiles bound conceptual complexity, metaphor and emotional reasoning from ages 1 through 14.
2. Eight fixed milestones map the adult's selected intention and seed fields to exact narrative roles without copying private answer text into the contract.
3. The child owns at least two distinct attempts and the decisive choice; a guide may enable but never solve the climax.
4. The message must be demonstrated through consequences and may be stated explicitly only once near the resolution.
5. New scenarios persist the server contract; targeted repair never migrates a legacy scenario implicitly.

## Product brick: deterministic act allocation

1. Every sellable length receives three contiguous acts from a server-owned story-role mapping.
2. New scenario page plans carry the exact act; model-authored act values are ignored during normalization.
3. New scenarios persist `actPlanVersion: 1`, and deterministic validation rejects later boundary tampering.
4. Manuscript batches consume the deterministic page plan while legacy scenarios retain their saved act compatibility.
5. The 108-case local stability guard now validates each act contract without a model call.

## Product brick: narrative stability matrix

1. A synthetic matrix covers 6 universes × 6 sellable page counts × FR/ES/EN, for 108 exact combinations.
2. Local inspection validates normalization, universe contracts, page plans and illustrated-scene counts without a model or network call.
3. The optional paid benchmark accepts exactly one named matrix case and one named Sol, Terra or Luna variant; no bulk mode exists.
4. This is the measurement foundation for deterministic acts, complete universe topology and storyboard-first prose. It changes no customer project or production generation path.

## Current product brick: narration-ready reader return

1. The narration-choice page polls a paid narration while it is queued or generating.
2. A ready active narration exposes a direct authenticated return to the interactive reader.
3. My creations distinguishes narration ready, generating and failed states on the purchased eBook card.
4. The reader button becomes an explicit listen action when private narration audio is ready.
5. Calitiki Bridge 0.7.8 packages this WooCommerce account journey; no new AI request is introduced.

## Candidate product brick: illustrated-instant cast and mobility roles

1. Illustration cast is filtered by the selected before/during/after phase instead of every physical scene presence.
2. Movement participants are travelers; departure witnesses and arrival greeters remain local supporters.
3. Local supporters keep ordinary reference clothing and never inherit traveler outfits or equipment.
4. A low-detail missing-cast suspicion requires a second high-detail confirmation before it can block the customer.
5. All other objective visual and identity guardrails remain unchanged.

## Current focused brick: private canonical-candidate checkpoint

1. A canonical compiler rejection stores its full candidate only in the private durable generation ledger.
2. The next free recovery starts from that exact candidate and exposes only the compiler's affected scenes to the repair agent.
3. Unrelated scenes and creator choices remain immutable through the existing repair scope.
4. The canonical compiler and semantic editor still have to approve the recovered candidate before creator review.
5. Retry policy version 5 closes numeric legacy migrations: no checkpoint means no hidden full-story replay.

## Current focused brick: private semantic-audit checkpoint

1. A final rejected scenario candidate is stored only in the private durable generation ledger.
2. Global audit findings inherit their concrete affected scenes from matching repair directives.
3. One free recovery starts from the checkpoint and changes only those scenes; a coordinate-free finding receives an audit-only recovery.
4. The visible project and series canon never receive rejected candidate prose.
5. Retry policy version 4 opens one migration recovery, and exhausted copy no longer claims every failure was attempt two.

## Current product brick: unified resume and deterministic series passages

1. Scenario e-mails and My creations use the same signed `project_resume` destination.
2. Reused passage ids are split deterministically by endpoint pair; reverse returns preserve their original id.
3. The first affected crossing is recorded in compiler diagnostics instead of scene 0.
4. A prior passage-only exhausted automatic repair receives one versioned recovery.
5. Series episodes freeze and reuse bounded character, universe, location and passage canon from their purchased source.
6. Calitiki Bridge 0.7.7 packages the corrected library handoff.

## Current candidate brick: explainable scenario findings

1. Preparing, inviting and sharing are recognized as distinct causal stages rather than duplicate narrative functions.
2. Precise bounded semantic diagnostics survive a failed automatic repair.
3. Each red scene card displays its own creator-safe reason.
4. Passage, progression, repetition, emotion, cast, travel and incomplete failures from the former policy receive one new versioned recovery; physical object and order ambiguity remain closed.

## Current product brick: validated before presentation

1. Mechanical/canonical correction and post-editor semantic correction each have one independent bounded budget.
2. A canonical repair whose mandatory audit finds a semantic defect now flows into the targeted semantic repair and a fresh final audit.
3. No invalid initial candidate is stored or shown; one free technical retry remains available.
4. A rejected revision preserves the exact previous scenario, and approval never overwrites a visible proposal with new red diagnostics.
5. The architect and auditor explicitly lock family-role equivalence, communication mechanisms and post-disembark location/presence state.
6. One versioned recovery remains available to eligible legacy automatic-repair failures created before this publication gate.

## Current product brick: retry with visible scenario corrections

1. A dirty failed scenario uses a fresh revision request instead of replaying the saved failed request.
2. The button distinguishes an unchanged technical retry from applying visible corrections.
3. Editing action or location sends the visible focal location as part of the same physical correction.
4. Stale transition destinations, movements and end-phase presences are rebuilt deterministically from the creator's location.
5. Scenario worker failures are localized through stable error codes; raw English server messages are no longer displayed.

## Candidate product brick: ordered multi-step scenario revisions

1. A repaired return, arrival and disembark chain is preserved when it reaches the creator's visible final location.
2. Travel wording keeps the original departure instead of silently turning the entire scene into the new location.
3. One focal transition may represent one actual step in an ordered movement chain; physical end presences still have to match the scene destination.
4. A rejected replacement stores no candidate prose and leaves the previous reviewable scenario untouched.
5. Its bounded scene/category diagnostic is shown separately so the creator knows the correction was received and why the replacement stayed private.

## Current product brick: per-character arrivals and targeted repair isolation

1. Explicit movements are projected in sequence for each physical character.
2. Every end-phase character still at an intermediate location receives exactly one final leg to the visible scene destination.
3. An earlier passage crossing no longer hides a missing later disembark or local arrival.
4. Automatic repair derives one immutable target-scene set from its bounded failure plan.
5. Non-target scenes and global creator choices are restored after every normalization pass, so a targeted repair cannot introduce unrelated scene regressions.

## Current product brick: canonical movement origins

1. Every explicit movement is replayed from each character's last canonical position rather than trusting a stale model-written origin.
2. Travelers with different actual origins are split into distinct movement groups.
3. A redundant movement is removed when a traveler is already at its destination.
4. The final-arrival normalizer then completes the remaining local leg without changing the creator-visible scene.

## Current product brick: progressive repair convergence

1. Each automatic-repair result is compared with the prior bounded validation set.
2. Only a strictly improved candidate becomes the next private checkpoint.
3. One final targeted pass receives only the remaining current scenes and uses distinct provider checkpoint ids.
4. A failed second pass preserves the best intermediate scenario with its newest diagnostics instead of restoring stale red cards.
5. Recovery policy version 3 opens this bounded convergence once for eligible existing projects.

## Current product brick: deterministic compiler movement rules

1. A pure canonicalizer replays hidden movements from the last canonical character position.
2. It splits incompatible traveler origins, removes redundant legs and adds only an unambiguous final leg.
3. The approved scenario text and digest are never mutated.
4. Rollout is isolated behind `NARRATIVE_MOVEMENT_CANONICALIZER_MODE`, default `off`; historical projects are excluded from automatic migration.

## Current product brick: independent canonical passage gate

1. A focal passage transition is aligned with its single matching physical movement before passage ids are registered.
2. Distinct real endpoint pairs remain split; ambiguous multi-route scenes are never guessed.
3. Structural and canonical repairs each retain one independent bounded model budget.
4. Retry policy version 3 reopens one exact saved-request attempt for projects exhausted under the former shared-budget gate.

## Verification

- Focused active-wardrobe, scene-plan and image-QA tests: 105/105 passing.
- Focused scenario transaction, compiler and recovery tests: 94/94 passing.
- Narrative V3 V2/V3 release and lifecycle focused tests: 23/23 passing.
- Narrative V3 object matrix: 18/18 fixtures, 54 objects and 90/90 adversarial rejections.
- Complete `npm test`: 621/621 passing.
- Production dependency audit: 0 vulnerabilities.
- `git diff --check`: passing.
- Narrative stability matrix: 108/108 structurally valid with 0 model calls.

## Next verification target

1. Compile a strict versioned manuscript artifact only from one sealed
   `NarrativeBookSpec.v3` parent.
2. Bind every text page to its exact scene, page and released object-state
   digest without reading legacy scenario or blueprint state.
3. Prove deterministic batching, idempotent restart and language/age bounds on
   synthetic fixtures before introducing any provider call.
4. Keep every V2 project on its existing path and require an explicit rollout
   decision before the first V3 canary.

## Protected local state

- Never commit, reset, overwrite or clean `data/jobs.json`, `data/credits.json`, `output/`, uploads, generated books, child photos, customer data, secrets or credentials.
- Preserve unrelated user changes and inspect `git status` before staging.
