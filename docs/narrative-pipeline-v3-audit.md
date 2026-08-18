# Narrative pipeline V3 — structural audit and replacement plan

Last updated: 2026-08-18

Status: architecture decision record for the next generation pipeline. This
document does not activate V3, migrate a customer project, spend AI credits or
change production behavior.

## Executive decision

The current pipeline is not made unreliable by one missing rule. It has several
competing representations of the same book and repeatedly transforms them with
normalizers, repair agents and compatibility branches. A locally correct fix can
therefore invalidate a different representation later in the journey.

V3 must be built beside the current pipeline. New V3 test projects will use one
typed, immutable artifact chain; V2 remains read-only for existing projects.
Production generation must not be switched until the synthetic and sampled
model gates in this document pass. The failed private projects that motivated
this audit are evidence fixtures, not migration targets.

The intended flow is:

```text
CreationIntent
  -> StoryConcept              creative semantic proposal
  -> CanonicalStoryGraph       deterministic physical and causal compilation
  -> NarrativeBookSpec         immutable approved release
  -> ManuscriptArtifact        text bound to scene/spec digests
  -> VisualStoryboardArtifact  one exact visible instant per illustration
  -> ImageCandidate
  -> AcceptedIllustration      explicit machine/customer decision
  -> DeliveryManifest
```

Every arrow creates a new versioned artifact. No stage rewrites its parent and no
consumer reparses a canonical artifact as model output.

## Audit scope

The audit followed the production path from questionnaire answers through
scenario generation, retry recovery, canonical compilation, blueprint,
manuscript, storyboard, image prompting, visual QA, targeted repair and preview
persistence. It also inspected the durable generation ledger, project aggregate,
retry policies and existing V2 documentation/tests.

The following remain outside this architecture replacement unless an interface
must change: WooCommerce checkout/accounts, paid narration, private-object
delivery, child-safety policy, deletion receipts and print fulfillment.

## Proven findings

### P0 — wire and canonical scenario schemas are conflated

`normalizeStoryScenario` is used both for raw model output and for persisted
canonical scenarios. Raw model output uses fields such as `location_before` and
`character_presences`; canonical storage uses `locationBefore` and
`characterPresences`. The normalizer accepts aliases inconsistently.

A local round-trip proof produced:

```json
{
  "first": {"before":"Maison","after":"Jardin","presences":1,"action":"Noa sort."},
  "second":{"before":"","after":"","presences":0,"action":"Noa sort."}
}
```

Thus a retry can erase locations and physical presences without a model call.
The recent 858 ms failure — `deterministic checkpoint refresh changed the
creator-visible story surface` — is the guard correctly detecting this damage.
Adding another recovery version cannot make this boundary safe.

V3 requirement: separate `parseStoryConceptWire` from
`loadCanonicalStoryGraph`. The first accepts exactly one strict wire schema; the
second validates exactly one canonical schema. Neither calls the other.

### P0 — several objects claim authority over the same facts

The current preview may simultaneously depend on:

- the approved scenario;
- `NarrativeBookSpec`;
- the final blueprint, which embeds `approved_scenario` again;
- a visual storyboard;
- a story scene plan;
- manuscript page text and manuscript review;
- scene contracts copied back into mutable blueprint pages;
- render snapshots compiled partly from the spec and partly from the legacy
  scenario.

For example, `compileSpecDrivenIllustrationPlan` receives `spec`, `blueprint` and
`approvedScenario`. A supposedly spec-driven contract can therefore disagree
with either of its other two inputs. Later the route binds prose, copies the
result into `final_blueprint.pages` and clears another storyboard checkpoint.

V3 requirement: one parent digest per derivation. The visual storyboard is
compiled from `NarrativeBookSpec` plus an approved manuscript digest only. It
must not read a blueprint or a legacy scenario.

### P0 — persistence is a mutable aggregate, not an artifact ledger

`book_projects.continuity_snapshot` contains scenario state, generation state,
specs, candidates, character canons, visual bible, notifications and a large
preview checkpoint. `preview_result` and `final_blueprint` are additional large
JSONB authorities. Project updates read and rewrite broad blobs without an
optimistic row version, so concurrent workers can overwrite unrelated fields.

Rejected full scenarios are stored as arbitrary JSON in generation-candidate
metadata rather than as a typed artifact. The durable run/step ledger records
work, but the product artifacts themselves remain mutable blobs.

V3 requirement: append-only `narrative_artifacts` with type, schema version,
project id, revision, parent artifact ids/digests, payload digest, state,
timestamps and provenance. Promotion to current uses an atomic pointer update
with compare-and-swap. Large assets remain in private object storage.

### P0 — generation is not a durable step worker end to end

Scenario generation has a worker, while preview generation still creates a
Render-local JSON job, creates a PostgreSQL run and starts a long asynchronous
closure in the HTTP process. The recovery worker can expose a retry after an
expired lease but cannot resume every exact provider operation. A deployment can
therefore separate the local job, durable run and project checkpoint.

V3 requirement: HTTP routes only authorize and enqueue. A durable worker claims
one idempotent step, persists its provider request id before polling, commits one
artifact, and releases the lease. A restart resumes the same step; it does not
rerun the whole book.

### P1 — the model is asked to invent both story and mechanics

The scenario prompt is roughly 25,600 characters and asks one creative model to
produce acts, scenes, locations, transitions, character movements, causal graph,
object lifecycle, passages, outfits, symbols and emotional progression. Output
uses JSON-object mode rather than a strict JSON Schema response. Deterministic
compilers then try to repair the same mechanics.

V3 requirement: the creative model returns only a bounded semantic concept:
characters' goals, turning points, attempts, decision, consequence, resolution,
tone and distinctive imagery. It never authors ids, page bindings, transition
coordinates, possession ledgers, passage endpoints, act numbers or visual
cardinality. The server compiles those fields.

### P1 — repair budgets and product promises disagree

Runtime policy permits an architect, editor, structural repair, editorial
repair, canonical repair and final audits. Retry policy versions, lifecycle
recoveries and object-render recoveries add further entitlements. The code now
contains dozens of policy/version constants. This contradicts the simpler
product promise of one bounded repair and makes cost and customer state hard to
predict.

V3 requirement: no whole-book repair loop. A failed deterministic compilation
is a software/schema defect and blocks the V3 canary. A semantic concept can
receive at most one model revision before release. Downstream retries resume a
single artifact step and never rewrite an approved ancestor.

### P1 — visual QA mixes objective and probabilistic judgments

One image can receive a technical inspection, scene-fidelity inspection, style
inspection, identity comparison, revision non-regression inspection and focused
cast arbitration. The first inspection is low-detail; suspected missing cast can
trigger another high-detail model call. Free-text findings are then classified
with regular expressions into blocking, repairable or advisory categories.

Some important defects are detectable — duplicated people, gross wardrobe
state, broken anatomy — but the controller remains probabilistic. It has already
produced both false missing-character tasks and missed duplications. A targeted
edit can also change identity because image editing is stochastic, after which a
second probabilistic controller arbitrates the result.

V3 requirement:

- deterministic preflight owns contract completeness, exact cast list, wardrobe
  state, objects, topology and prompt projection before generation;
- file integrity checks may block automatically;
- vision judgments never become customer tasks from one observation;
- high-confidence identity/cast findings require agreement from a focused
  verification using the exact identity evidence;
- uncertain findings are internal sampling data, not customer-facing defects;
- an accepted illustration is immutable and is never an adjacent reference
  merely because a status defaulted to accepted;
- targeted edits create new candidates and never overwrite the accepted source.

### P1 — tests validate components but not the production contract chain

The suite contains hundreds of focused tests and a 108-case structural matrix,
but it did not test `normalize(normalize(raw))` or a strict wire-to-canonical
round trip. The matrix performs no provider call and therefore cannot measure
end-to-end first-pass success. Many tests prove individual repair bricks while
the interactions among those bricks remain under-specified.

V3 requirement: contract tests at every boundary, property tests for compiler
purity/determinism, replay tests from persisted artifacts, concurrency tests,
and an explicitly paid sampled model evaluation distinct from `npm test`.

## V3 artifact model

| Artifact | Author | May contain | Must not contain |
| --- | --- | --- | --- |
| `CreationIntent.v1` | server | normalized questionnaire, child/audience profile refs, selected universe/intention, cast refs | generated story mechanics |
| `StoryConcept.v1` | creative model | premise, desire, attempts, choice, consequence, resolution, emotional/message proof, distinctive scene ideas | ids, pages, movements, object ledgers, passage coordinates |
| `CanonicalStoryGraph.v1` | pure compiler | typed scenes, acts, topology, cast presence, movements, objects, outfits, causal dependencies | prose, image prompt, audit result |
| `NarrativeBookSpec.v2` | pure compiler | immutable release graph, page bindings, illustration instants, digests | mutable runtime/checkpoint data |
| `Manuscript.v1` | writer + language review | one text per scene/page, spec/scene digest | rewritten mechanics |
| `VisualStoryboard.v1` | pure compiler | one visible instant, exact cast/outfit/object/location, composition and prompt projection | legacy blueprint/scenario copies |
| `ImageCandidate.v1` | image provider | private asset key, prompt digest, references, generation provenance | acceptance by implication |
| `IllustrationDecision.v1` | policy/customer | accepted/rejected/quarantined, evidence, candidate id | mutable candidate pixels |
| `DeliveryManifest.v1` | pure assembler | accepted artifact ids and private delivery keys | generation checkpoints |

Each payload has a JSON Schema and a canonical serializer. The SHA-256 digest is
calculated from that serializer, never from insertion-order JSON. A child
artifact records all direct parent digests. Loading an artifact never performs a
migration or repair.

## Canonical compiler rules

1. Universe topology, available mechanisms, page count and act allocation are
   server-owned configuration.
2. The concept supplies semantic beats; the compiler expands them into a fixed
   scene-role template appropriate to age, intention and length.
3. Every scene has exactly one `locationBeforeId`, `locationAfterId` and visible
   phase. Movement endpoints are derived from those locations and the selected
   mechanism.
4. Character presence is phase-aware. Traveler, witness, greeter, remote and
   evoked roles are distinct types, not prose conventions.
5. Object lifecycle is an event stream. Render visibility is a projection of
   canonical ownership/presence, never a mutation of global state.
6. Wardrobe and conditional equipment are state machines keyed by character and
   physical zone. The image contract receives the resolved state for the exact
   visible instant.
7. Passages and unique landmarks are registered once. Scenes reference ids and
   cannot redefine endpoints.
8. The compiler is total for every supported configuration. An ambiguity is a
   compiler/configuration failure, not an invitation for a repair model to guess.
9. Compiling the same input twice yields byte-identical canonical output.
10. No compiler pass changes creator-visible semantic text.

## State machine and execution

V3 project states are centrally declared and transitions are enforced:

```text
intent_ready
  -> concept_generating -> concept_ready
  -> spec_compiling -> spec_ready
  -> manuscript_generating -> manuscript_ready
  -> storyboard_compiling -> storyboard_ready
  -> images_generating -> images_reviewing -> preview_ready
  -> purchased
```

Every generating state has `interrupted` and `failed_internal` exits. Customer
actions cannot manually skip a parent artifact. Technical retries keep the same
step idempotency key and provider request id. A row version prevents concurrent
project-pointer updates. The customer sees progress and support guidance, not
internal compiler findings.

## Migration and deletion strategy

### Keep and adapt

- WooCommerce ownership, checkout, credit reservation and access-code rules;
- child-safety and sensitivity gates;
- private object storage and signed/authenticated delivery;
- book/page-count, age/intention and universe configuration after schema review;
- the pure ideas in `NarrativeBookSpec`, digest signing, page plan and
  spec-driven visual beats;
- generation run/step/candidate tables after adding artifact ownership and true
  resumability;
- cost attribution and private asset cleanup.

### Replace for V3

- current scenario model schema, mixed normalizer and stabilizer chain;
- scenario-wide canonical/editor/repair/recovery version stack;
- `continuitySnapshot` as the artifact store;
- local JSON preview job as production orchestration;
- blueprint/storyboard/story-scene-plan duplication;
- mutation of blueprint pages after approval;
- regex classification of free-text QA as sole blocking evidence.

### Legacy handling

- V2 projects remain readable and purchasable when already complete.
- No implicit conversion occurs during page load, retry or deployment.
- Incomplete V2 projects may keep their existing support path; they are not fed
  into V3 by reparsing their JSON.
- If business later requires migration, build an explicit offline adapter that
  emits a migration report and never overwrites the source project.
- Runtime recovery-version branches are frozen. They may be removed only after
  the retention/support window and a production inventory.

## Delivery phases

### Phase 0 — freeze and observability

- Freeze new V2 narrative/repair bricks except security, privacy, commerce and
  data-loss defects.
- Add content-free metrics for first-pass success, artifact stage, provider
  calls, cost, latency, retries, false review flags and customer overrides.
- Turn the known failures into anonymized synthetic fixtures; never copy child
  photos or customer prose into the repository.

### Phase 1 — schemas, storage and compiler

- Introduce the artifact table, canonical serializer, digest and parent links.
- Define strict schemas for intent, concept, graph and spec.
- Implement the pure concept-to-graph compiler and property tests.
- Add the central V3 state machine and CAS pointer promotion.

### Phase 2 — shadow scenario path

- Generate one StoryConcept under an explicit tester allowlist.
- Compile graph/spec without changing the creator journey.
- Compare structural results and cost against V2 using synthetic projects.
- Treat every compiler ambiguity as a release-blocking defect.

### Phase 3 — manuscript and storyboard

- Generate prose only from the immutable spec.
- Compile the storyboard only from spec plus manuscript digest.
- Validate exact text/visual bindings locally.
- Remove blueprint and legacy scenario inputs from the V3 image path.

### Phase 4 — images and internal acceptance

- Generate candidates from one signed storyboard beat at a time.
- Store candidate before QA; record decisions separately.
- Calibrate vision gates on labelled positive/negative fixtures.
- Keep uncertain visual findings internal and continue unaffected pages.

### Phase 5 — canary and promotion

- Enable V3 only for internal/synthetic projects, then explicit testers.
- Promote by configuration after acceptance gates pass; keep an immediate
  configuration rollback to V2 for new requests only.
- Do not convert projects already in flight between pipelines.

## Acceptance gates

Before an external canary:

- 100% strict schema validation at every artifact boundary;
- 100% canonical round-trip and compiler idempotency/property tests;
- zero whole-book automatic repair loops;
- zero creator-visible mutation during a technical retry;
- zero unversioned artifact loads or runtime migrations;
- deterministic first-pass success on all supported age × intention × universe ×
  page-count configurations;
- restart/replay and concurrent-worker tests prove exactly-once artifact
  promotion;
- no customer or child data in fixtures/logs.

Before general availability, measured on a representative, explicitly budgeted
evaluation set:

- at least 98% scenario/spec first-pass completion, then a 99% production target;
- at least 95% complete preview first-pass completion before raising the target;
- fewer than 1% false creator-facing visual review tasks;
- no confirmed mechanical false positive;
- bounded p95 latency and cost per page count;
- adult evaluators confirm age fit, intention delivery, narrative quality and
  originality independently.

The 99% target must not be reached by making stories generic. Creativity is
measured on semantic diversity in `StoryConcept`; stability is enforced only on
mechanics in the compiler. A distinctive premise, imagery, emotional metaphor
and solution remain model-authored, while geography, state and continuity are
server-owned.

## First implementation brick

The first code brick after approval of this audit should be deliberately small:

1. strict `StoryConcept.v1` and `CanonicalStoryGraph.v1` schemas;
2. separate wire parser and canonical loader;
3. canonical serializer/digest;
4. property tests proving parse/load separation and deterministic compilation;
5. no route, UI, Render variable, model call or customer migration.

Only after this foundation passes should the artifact table and shadow worker be
introduced. This ordering prevents V3 from becoming another compatibility layer
inside the current mutable scenario pipeline.
