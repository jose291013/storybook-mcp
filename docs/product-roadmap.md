# Product roadmap and durable handoff

Last updated: 2026-08-22

## Narrative V3 structural replacement direction

The current narrative pipeline is frozen for new product repair bricks except
for security, privacy, commerce and data-loss defects. The structural audit in
`docs/narrative-pipeline-v3-audit.md` proved that wire model responses and
canonical persisted scenarios are interpreted through the same mixed
normalizer. A canonical retry can therefore erase locations and character
presences without a provider call. The audit also found several simultaneous
authorities for story and illustration facts, mutable JSONB aggregate
persistence, a hybrid local/durable preview worker and probabilistic visual QA
being asked to arbitrate deterministic state.

Narrative V3 will be built beside V2 as a typed, immutable artifact chain:
creation intent, creative story concept, deterministically compiled canonical
story graph, released NarrativeBookSpec, manuscript, visual storyboard, image
candidates, illustration decisions and delivery manifest. Each artifact has one
strict schema, canonical digest and explicit parent digests. Routes enqueue
idempotent durable steps; they do not run long generation closures. A technical
retry resumes one step and cannot rewrite an approved ancestor.

V2 projects are never migrated implicitly during read, retry or deployment.
They remain readable through the legacy path. V3 begins with strict concept and
graph schemas, separate wire/canonical loaders, canonical serialization and
property tests; it does not begin with another recovery policy. Shadow and
canary rollout are allowed only after the audit's deterministic, restart,
concurrency, cost and narrative-quality gates pass.

## Narrative V3 customer cutover

The synthetic full-chain and real-project shadow gates are complete. New book
projects are now assigned once at creation to Narrative V3, which is the
default. The assignment is stored with the project and cannot be changed by a
retry, deployment or environment-variable update. Unassigned projects are
treated as V2 legacy projects; derived series drafts inherit the exact engine
of their purchased source episode. `NARRATIVE_DEFAULT_ENGINE=v2` is therefore
an emergency pre-creation kill switch, not a migration mechanism.

For a V3 project, the scenario worker obtains only a strict semantic concept.
If that response violates the semantic wire or story-shape contract, one
separate bounded correction may run before persistence. No invalid candidate
is promoted or replayed as a technical retry. The deterministic compiler then
owns every mechanical fact and persists the five immutable ancestors through
`NarrativeBookSpec.v3`. The customer-visible scenario is a compatibility view,
not a second authority; approval binds its audit digest to the exact immutable
spec. Preview, manuscript and illustration planning consume that spec and its
identity, location, medium, wardrobe, cast-cardinality and object-state facts.
The legacy V3 production shadow is skipped for customer V3 projects, avoiding
one redundant model call and competing artifact pointers.

This cutover introduces no commerce, credit, account, private-asset or series
canon mutation. A technical failure still releases the preview reservation;
series canon still changes only after the existing explicit purchase/approval
rules. The first production acceptance is two new 32-page books in materially
different universes. Existing V2 projects are compatibility controls and are
never silently upgraded.

## NarrativeBrief.v1 semantic source authority

The creative concept model is no longer fed a loose collection of partly
overlapping questionnaire fields. Before any model call, the server compiles
`NarrativeBrief.v1` from the normalized project questionnaire, immutable
`CreationIntent.v1` and typed `WorldLawContract.v1`. This artifact is the single
semantic source of truth for the adult's objective and the child's story.

The brief preserves sixteen authoritative values with deterministic precedence
and explicit provenance: situation, understanding, desired change, protective
doubt, accessible first step, motivation, earned reward, message, story starting
point, progressive effort, child-owned action, adventure adaptation, peak
moment, resolution, transformation and emotional tone. It also fixes the hero
profile and age-complexity limits, the actual travelers versus origin witnesses,
all eight narrative/emotional milestones, and one complete ordered scene spine
for every sellable length. Typed zones, media, gravity, locomotion, posture,
passage endpoints, survival mechanisms, native/forbidden elements and
capabilities are included as facts, not prompt inspiration.

The model's creative freedom is deliberately downstream of those decisions: it
authors the title, premise, dramatic realization and distinctive scene imagery,
but it cannot paraphrase the approved hero arc or alter scene ids, purposes or
participants. The server validates this exact binding before character state,
mechanics, graph or artifact persistence. A request carrying questionnaire data
different from the project snapshot fails closed rather than silently mixing
two sources. New StoryConcept artifacts cite both CreationIntent and
NarrativeBrief, while legacy concepts retain their one-parent compatibility.

Migration 033 only adds the new isolated V3 artifact/pointer type. It changes no
environment variable, commerce, credit, account, private-asset or series-canon
rule. Production acceptance remains two new books in materially different
universes; their scenario cards must show the selected intention, correct
travelers, explicit preparation/crossing/return chronology and feasible world
physics before illustration starts. Repository verification: 722/722 tests
pass.

## Narrative V3 universal invariant engine

V3 structural validity is expressed as the conjunction of independent domains,
not as an ordered list of mutually replacing templates. Narrative role owns
dramatic energy, physical topology owns spatial geometry, the canonical graph
owns cast and movement, wardrobe/equipment owns worn state, and the object
lifecycle owns quantity, identity and location. A valid scene must satisfy all
applicable constraints simultaneously. In particular, `climax + passage`
retains the unique narrative peak and overlays readable boundary geometry;
`attempt + passage` retains attempt energy instead of becoming a weaker generic
threshold scene.

Every unexpected invariant failure creates a content-free counterexample
fingerprint before image generation. The durable checkpoint may contain only
stage, stable issue codes and bounded structural enums/numbers; customer prose,
names, photos and asset locations are forbidden. These fingerprints drive a
permanent generated regression corpus rather than another book-specific repair
policy. The initial exhaustive corpus covers all sellable lengths, every scene
position and every supported transition, including the production-discovered
climax/passage collision.

Storyboard plan version 14 recompiles older failed V3 plans locally from their
approved immutable spec. The scenario and manuscript stay unchanged and no
additional model or credit is consumed. Existing V2 projects retain their
legacy plan path.

## Narrative V3 single scene-render authority

The structural audit is maintained in
`docs/narrative-v3-universal-invariants-audit.md`. It defines the complete
world, narrative, chronology, cast, wardrobe/equipment, object, scene, prose,
visual, evidence, repair and operational invariant catalogue. The release goal
is not a subjective promise that a generative model always produces the most
beautiful image; it is the enforceable guarantee that a confirmed objective
contradiction cannot enter delivery and that internal uncertainty does not
become customer work.

Spec-driven illustration plan version 15 now projects the exact V3 character
registry, required/forbidden cast ids and structured wardrobe/equipment states.
`SceneRenderContract.v1` resolves every active outfit into one concrete
renderable description, validates the full cast partition and signs the exact
physical/cast/wardrobe/object state supplied to both image generation and QA.
The V3 adapter may no longer reconstruct an active adventure outfit from a
photo or legacy blueprint. Every V3 interior page receives a focused
high-detail identity-cardinality and categorical wardrobe check.

This closes the competing-authority image boundary but intentionally does not
rewrite an approved immutable book. Remaining V3 phases are a sealed
`VisualIntent`, explicit character-state transition events, a fully typed
`WorldLawContract`, manuscript fact evidence and strict non-fail-open
illustration evidence. They are architecture phases, not book-specific repair
policies.

`VisualIntent.v1` is now implemented for new V3 scenarios as an immutable
artifact parented by the exact `CreationIntent.v1`. The mechanical compiler
uses the selected or preserved wardrobe state and fails closed on an outfit
from another universe. Existing approved artifacts remain immutable. The next
phase is `CharacterStateTimeline.v1`; until it lands, the chosen state is
authoritative but its don/remove transition still follows the existing
deterministic scene window.

`CharacterStateTimeline.v1` is now compiled from the exact visual intent and
semantic concept before the canonical graph. It gives every character a full
state after every scene and records explicit causal don/remove/equip/unequip
events. Only the cast that actually crosses receives travel wardrobe changes;
departure witnesses no longer inherit the travelers' clothes. Knowledge and
emotion advances are explicit hero events bound to each semantic beat. The
next structural phase is the data-driven `WorldLawContract.v1`.

`WorldLawContract.v1` is now the structured authority for universe topology and
physical rendering constraints. The same compiler consumes data for all six
universes: zones and media, passage geometry and camera side, gravity and
locomotion, per-person survival equipment, time continuity, scale, native and
forbidden elements, capabilities and landmark cardinality. Character equipment
is derived from the declared medium rather than from a universe id or prose
keyword.

`ScenePhysicalState.v1` is now the exact per-scene projection of that world law,
the `CharacterStateTimeline.v1`, the scene timeline and the illustrated cast.
It seals visible zone/location, ambient medium, gravity, allowed locomotion and
postures, survival mechanisms and forbidden environmental elements. Underwater
scenes consequently require buoyancy-aware movement, drifting hair/fabric and
rising bubbles; ordinary dry-land standing or walking is forbidden unless the
sealed law explicitly permits seabed contact. The same generic contract covers
space, protected cloud habitats and ordinary-gravity worlds without universe-
name keyword tests.

A passage concept must now contain one explicit preparation beat before the
first crossing. Only actual travellers change into the selected universe outfit
and receive individual survival equipment; departure/arrival witnesses stay in
their ordinary photo clothing. Return scenes remove/store conditional equipment
only after the physical boundary has been completed. The exact active outfit
scene interval is projected to scenario review and the blueprint, eliminating
the historical first-visible-scene fallback that dressed non-travellers.

New fully covered canonical graphs and released specs use compiler version 2;
existing persisted graphs without this additive state remain readable on
compiler version 1 and are never silently rewritten. The released spec, render
snapshot, compact image contract, storyboard audit and illustration evidence
all consume this one state, so later stages cannot infer a different medium,
posture or outfit from prose or an adjacent image. This phase adds no database
migration, environment variable, credit, commerce or series-canon mutation.
Verification: the complete repository suite passes 716/716 tests.

`ManuscriptFactEvidence.v1` is now compiled after the immutable manuscript and
before the visual storyboard. It binds every page text digest to one released
scene, checks all registered named character/location/object mentions against
physical, evoked, transition and lifecycle facts, and projects exact visual
requirements for the next stage. A new storyboard must cite this evidence as
an immutable parent; the old two-parent lineage is read-only compatibility.

`StrictIllustrationEvidence.v2` now requires explicit evidence for all eleven
objective image domains: asset integrity, identity cardinality, forbidden cast,
wardrobe, equipment, physical medium, location boundary, main action, object
cardinality, landmarks and style continuity. A confirmed defect rejects the
candidate; insufficient evidence quarantines it internally. Neither outcome
exposes an asset or becomes unpaid customer review work.

`DeliveryManifest.v2` now accepts only strict V2 decisions whose eleven domains
all pass. It binds the exact released spec, manuscript, manuscript-fact,
storyboard and strict-decision ancestry, and every physical page cites its exact
fact evidence. Rejected and quarantined scenes cannot expose an asset or compile
a deliverable book.

The V3 production rendering authority now applies that same chain inside the
real authenticated preview worker. Every interior candidate is checked at high
detail against its immutable scene render contract and private identity,
cover/style and adjacent-continuity references. All eleven domains must be
explicitly verified; missing or ambiguous evidence remains private and is not
turned into a vague customer review request. Legacy V2 projects retain their
existing review workflow.

An accepted production candidate retains its private storage key, content
digest, MIME type, dimensions, byte length, provider model and versioned domain
evidence in the durable generation ledger. Before credit capture or delivery,
the worker recompiles the real page text into the immutable manuscript, fact
evidence, visual storyboard and continuity plan, then records the exact image
candidate set, strict decision set and five-parent `DeliveryManifest.v2`.
Delivery fails closed on a missing page, uncertain domain or foreign ancestor.
Previously generated V3 image pages without version-2 strict evidence are
regenerated rather than silently reused.

The production worker now uses a bounded best-candidate search driven by the
complete strict domain vector rather than the legacy first matching defect.
A candidate with several failed domains, any insufficient evidence, or one
structural world/action/boundary failure consumes the remaining second full
generation with the exact findings attached. A targeted image edit is allowed
only after the evidence has converged to one confirmed local cast, wardrobe,
equipment, object, landmark or style defect. Thus one page can use at most two
full candidates plus one final local edit; no repair can reopen the scenario,
manuscript or an unaffected page.

An exhausted V3 page is recorded as a private strict quarantine, not as a
creator review. Its accepted neighbours and all immutable ancestors remain
reusable, and recovery resumes only that page. Legacy V2 customer review keeps
its existing behavior. This orchestration adds no environment variable,
database migration, commerce change, customer credit use or series-canon
mutation.

Provider-safety refusal is also isolated at the page boundary. Generation may
move only through three strictly safer, bounded requests: full approved
references, approved cover/style reference only, then the immutable render
contract without source pixels. The independent QA boundary still uses every
private canonical identity/style reference, so making the generation request
safer cannot weaken delivery proof. If no candidate exists after those stages,
the worker checkpoints a private missing-page coordinate, continues every
independent page and never exposes or propagates a rejected asset. A resume
targets only that gap and may use the nearest accepted previous and following
illustrations as secondary continuity evidence. Retry policy version 17 grants
one migration resume to books exhausted before this page-isolation rule. This
adds no environment variable, migration, commerce, credit or series-canon
change.

Strict V3 quality quarantine is a non-terminal page state. Checkpoint reuse may
consider an image complete only when its persisted page has accepted version-2
evidence. A quarantined, repair-pending or legacy-unverified image stays private
and is queued for full regeneration from its unchanged render contract; the
cover and nearest accepted pages on both sides remain reusable continuity
evidence. Recovery uses three bounded full candidates while ordinary new pages
retain two, then atomically replaces the same page number. Empty targeted scopes
cannot erase the exact failed-domain codes. Retry policy version 18 opens one
resume for books exhausted before this rule. This recovery never rewrites the
scenario, manuscript, accepted illustrations, commerce, credits or series
canon and adds no migration or environment variable.

Visual-reference arbitration version 19 makes each remaining generation
attempt materially different instead of replaying the same conflicting source
pixels. A strict V3 adjacent illustration is eligible only when its sealed
physical medium, ambient/camera zone, location and every shared character's
wardrobe and equipment state are compatible with the current render contract.
After a confirmed state, identity or style rejection, the worker follows one
monotonic authority ladder: compatible full references, then compatible
adjacent scenes plus face-focused identities, then the approved style anchor
plus identities, and finally the immutable render contract plus identities.
The independent delivery QA always retains the complete canonical reference
set. A one-domain targeted edit is therefore deferred until the available
distinct generation input has been tried; it is no longer the first response
to a local wardrobe defect. Source-photo clothing is not copied while a
different contract outfit is active, and face-focused identity crops suppress
more non-authoritative garment pixels. Retry policy version 19 opens one bounded
resume for books exhausted under version 18. Accepted pages and immutable story
ancestors remain unchanged. This adds no migration, environment variable,
commerce, credit, private-asset exposure or series-canon change.

Creator-facing scenario locations and passages now use localized FR/ES/EN
product wording instead of internal topology labels. The waiting screen states
that Calitiki is checking characters, clothing, objects and physical laws. This
adds no environment variable, migration, commerce rule or series-canon change.
Repository verification for this integration checkpoint: 710/710 tests pass.

The complete counterexample matrix now exercises this strict chain over all 108
language, universe and format combinations. Its current passing gate digest is
`080038fde2b50651b729d584ae79e04c0f00f2a108f71c9d9895af8e65a84fe9`,
with zero provider calls, zero paid calls, no customer route and successful
idempotent replay. Production observation remains required after deployment;
the synthetic gate proves structure and durability, not model accuracy.

## Monotonic PostgreSQL migration ledger

Production migrations are append-only operations, not a desired-schema replay.
The application records every applied SQL filename with its SHA-256 checksum in
`app_schema_migrations`, runs pending files in filename order inside individual
transactions and serializes concurrent Render instances with a session-level
PostgreSQL advisory lock. An applied file whose bytes change, or whose file is
removed, fails closed before a later migration can run.

Databases created before this ledger are baselined from their actual schema.
The artifact-type constraint identifies the last successfully deployed V3
milestone; a production schema containing `delivery_manifest` is therefore
recorded through migration 025 and executes only migration 026. A genuinely
empty database executes all migrations once. This replaces the previous startup
behavior that replayed older widening constraints and could narrow a populated
artifact table during deployment. It adds no environment variable and changes
no customer, commerce, credit or narrative behavior.

## Narrative V3 strict-contract foundation checkpoint

The first V3 code is deliberately isolated from production orchestration. A
creative model may emit only `StoryConceptWire.v1`, whose snake-case semantic
payload contains no topology, movement, presence, object, wardrobe or page
mechanics. One explicit parser maps it to immutable `StoryConcept.v1`; the wire
and canonical schemas are strict and intentionally reject one another.

All mechanics enter through the separate server-owned
`CanonicalStoryMechanics.v1` contract. The pure compiler binds each semantic
beat exactly once, assigns contiguous scene numbers, and produces
`CanonicalStoryGraph.v1`. Its validator fails closed on unknown fields,
non-contiguous acts, broken physical handoffs, incorrect movement origins,
unregistered passage endpoints, cast/presence mismatches, wardrobe gaps and
invalid object events. No shared normalizer or model-authored mechanic is used.

Canonical serialization recursively orders object keys while preserving array
order. SHA-256 artifact digests include parser/compiler versions, loaders verify
them before returning deeply immutable values, and repeated persisted replays
are byte-identical. This foundation changes no route, worker, customer project,
credit, series canon, environment variable or V2 behavior. The next brick is
append-only V3 artifact persistence with compare-and-set project pointers;
production model calls remain out of scope until restart and concurrency tests
pass.

## Persistent visual entity-state checkpoint

Persistent visual facts are compiled as data before illustration. The
whole-book planner proposes semantic entities for unique, recurring, created,
manipulated or counted elements; a deterministic compiler assigns their stable
identity and locks exact cardinality, creation scene and visible appearance.
Every scene receives exactly one state and one location for every registered
entity. Absence or a hidden/stored state means zero visible instances. A
visible semantic entity must use its immutable registry quantity. A canonical
causal event may change a lifecycle object's quantity explicitly; the compiler
projects that declaration without inventing another change. A transformation
requires a distinct resulting entity rather than silently changing the original.

Existing causal object ids remain authoritative and absorb matching semantic
proposals, preventing a named ball from being registered twice. Persistent
sets are first-class entities: three drawn circles remain exactly three with
the same size, colors, material and distinguishing details wherever that set is
carried forward. The compact image contract, adjacent-reference policy,
story-plan audit and scene-fidelity QA all consume the same ledger. A focused
high-detail count confirms suspected duplication, absence or appearance
conflicts; uncertain vision findings cannot create customer work. Gross active
wardrobe state remains a separate blocking scene contract, while minor garment
details stay advisory. No environment variable or migration is introduced.

## Narrative V3 append-only artifact-ledger checkpoint

V3 product artifacts now have a separate PostgreSQL ledger beside the mutable
V2 project aggregate. Each row records its project, strict type and schema
version, monotonically allocated type revision, canonical payload and digest,
immutable state, bounded operational provenance and creation time. Ordered
parent rows carry foreign keys to the exact parent project and digest, so a
canonical graph cannot claim a missing, foreign or altered StoryConcept.

The released/current state is not written into an artifact. A separate project
pointer is promoted atomically under a project lock and compare-and-set pointer
revision. Two workers starting from the same revision therefore produce exactly
one winner; an identical retry returns the already-current result idempotently,
and a delayed worker cannot roll the pointer back to an older artifact revision.
Rejected and quarantined artifacts remain inspectable but cannot be promoted.

Every load reruns the strict artifact loader and verifies payload digest,
revision and ancestry. A changed stored payload is rejected rather than repaired
or migrated. Local JSON persistence exists only as the repository's development
fallback; production uses the existing PostgreSQL configuration. Nothing calls
this store from a customer route yet, and there is no new environment variable,
model call, credit event, V2 migration or series-canon change. The next V3 brick
is the leased step state machine that commits and promotes one artifact exactly
once across restart and worker concurrency.

## Narrative V3 durable-step state-machine checkpoint

V3 orchestration now has dedicated run, step, ordered-input and immutable commit
tables. A step names one strict operation and output artifact type, records the
exact input artifact ids and digests, captures the expected current-pointer
revision, and is claimable only after all earlier steps in its run complete.
PostgreSQL workers use expiring leases and `FOR UPDATE SKIP LOCKED`, so one
active logical step has one owner, only that owner can renew its heartbeat, and
an expired lease remains recoverable.

A model-backed step may checkpoint one provider response id and cannot replace
it with another id on retry. Artifact creation and pointer promotion are already
idempotent: if Render stops after promotion but before the step commit, a new
worker reuses the same payload artifact, observes the same current pointer and
records the single immutable commit. A completed step cannot later commit a
different output. Tests reproduce this exact interruption locally.

The implemented operation vocabulary is intentionally limited to parsing a
strict StoryConcept and compiling its canonical graph. No HTTP route enqueues
these runs, no production worker executes them, and no paid model call,
environment variable, credit event, customer migration or V2 mutation is
introduced. The next brick defines `CreationIntent.v1` and deterministic server
mechanics builders before a synthetic-only shadow runner is considered.

## Narrative V3 canonical creation-intent checkpoint

`CreationIntent.v1` is the parentless root of the V3 artifact chain. It is built
by the server from already-authorized stable identifiers and digests, not by a
creative model. Its strict payload records language, audience age and derived
reading band, supported page count, selected universe, narrative-goal and
approach identifiers, sensitivity level, bounded character/profile references,
optional series continuity references, and digests of the questionnaire and
safety assessment. It contains no generated topology, movement, presence,
object, wardrobe or page mechanics.

The builder rejects unknown fields, free customer prose, unsupported formats,
duplicate character keys and any cast without exactly one hero. Names, photos
and raw questionnaire answers are deliberately absent: the immutable artifact
uses only opaque private references. A sealed intent is digest-verified on every
load and cannot be normalized or repaired.

The V3 ledger and PostgreSQL type constraints now include the new root type.
Every new StoryConcept has exactly one direct `creation_intent` parent, while a
canonical graph still has exactly one StoryConcept parent. The leased
`parse_story_concept` step consumes that exact intent id and digest; no implicit
project aggregate is consulted during commit or retry. This remains isolated
from production routes, V2 projects, credits, series canon and paid model calls.
The next brick is the pure deterministic server-mechanics builder, followed by
a synthetic-only shadow runner.

## Narrative V3 deterministic mechanics-builder checkpoint

The server now converts one sealed CreationIntent plus one sealed StoryConcept
into strict `CanonicalStoryMechanics.v1` without a repair model. Supported page
counts map to exactly `(pageCount - 2) / 2` semantic scenes and three contiguous
server-owned acts. The concept must provide one opening, one final resolution,
one act-3 climax, and either a complete act-2 crossing/act-3 return pair or no
passage. A partial pair, duplicate mechanical purpose, incorrect scene count,
unknown cast key or off-side participant is a bounded configuration failure.

For all six configured universes, the builder owns the origin and adventure
zones, the unique passage endpoints, initial character sides, traveler sets,
return sets and visible scene phase. Departure witnesses remain at origin,
adventure-local companions are not silently transported, and every outbound
traveler returns deterministically. A universe-native concept with no passage
stays wholly on the configured adventure side.

The same physical snapshot produces presences, movements, visible and forbidden
cast, wardrobe and equipment. Adventure outfits begin during preparation and
remain stable through the return scene. In the coral-ocean topology, each visible
human receives the breathing/communication equipment state only from crossing
through return. No text heuristic decides these states.

The current isolated builder uses semantic character keys as neutral canonical
names. Binding immutable private profile revisions and display names is deferred
to the release-spec layer; the mechanics compiler never reads a mutable customer
aggregate. The 36 universe/format combinations compile to byte-identical valid
graphs in synthetic tests. No production route, V2 project, paid model call,
credit, environment variable or customer migration is introduced. The next
brick is a synthetic-only state-machine shadow runner and structural report.

## Narrative V3 synthetic shadow-runner checkpoint

The strict V3 chain can now be exercised end to end without a creative model or
a customer project. The synthetic runner builds an anonymous CreationIntent,
parses a deterministic semantic concept fixture, compiles server-owned physical
mechanics and commits the canonical graph through the real JSON artifact ledger,
compare-and-set pointers, leased run store and state-machine commit path.

The matrix covers FR, ES and EN across every configured universe and supported
page count, for 108 complete runs. Each result checks exact scene and act counts,
one crossing/return pair, immutable parent digests and idempotent replay. A
second execution of the same fixture reuses exactly three artifacts and leaves
all current-pointer revisions unchanged.

The emitted report is content-free: stable fixture ids, structural counts and
canonical artifact digests only. It contains no names, profile references,
questionnaire text, story prose or images. The runner uses explicit temporary
local stores, imports no server route, credit or provider client, reads no
environment variable and records zero provider calls, zero paid calls and zero
customer routes touched. It is a verification command, not a production shadow
hook. The next brick is the deterministic released `NarrativeBookSpec`
compiler; production model traffic remains unauthorized.

## Narrative V3 deterministic release-spec checkpoint

`NarrativeBookSpec.v2` now seals the creator-approved mechanical result without
consulting a mutable scenario, blueprint or runtime checkpoint. Its two direct
immutable parents are the exact CreationIntent and CanonicalStoryGraph. The pure
compiler additionally receives bounded private profile bindings and verifies
that every character key, role and profile reference was authorized by the
intent and exists once in the graph.

The released character registry fixes each display name, positive profile
revision, profile digest and private visual-identity reference/digest. The
server computes all page numbers and alternating text/image sides from the
selected format. Every released scene copies semantic and physical facts
unchanged, records its exact source-scene digest and resolves one illustration
instant: phase, location, physical medium, visible and forbidden cast, wardrobe,
conditional equipment, object-event evidence and main action.

Object-bearing graphs currently fail closed at this boundary. Canonical graph
version 1 does not yet prove initial quantity, ownership, location and projected
visibility for every registered object, so the release compiler refuses to
invent those states. The next brick extends that deterministic object lifecycle
before manuscript or storyboard work begins.

The append-only ledger accepts the release artifact only behind its ordered
intent and graph parent digests. One new leased state-machine operation commits
and promotes it idempotently; migration 019 changes only the isolated V3 type
constraints. The 108-case synthetic runner now exercises this fourth artifact
without a route, environment switch, provider call, credit or customer project.
Production model traffic remains unauthorized.

## Narrative V3 deterministic object-lifecycle checkpoint

`ObjectLifecycleProjection.v1` now derives one complete immutable state for
every registered plot object after every canonical scene. The projection is
compiled only from `CanonicalStoryGraph.v1`; it records exact quantity,
canonical owner, canonical location, state id, required/forbidden illustration
visibility and a bounded deterministic reason. It reads no prose and performs
no repair.

Every object is one unique entity with quantity one until an explicit terminal
consumption. Its first causal event establishes the initial state and location.
Acquisition, release, ownership transfer, reveal, transformation, storage and
consumption must continue the exact prior state and owner. An owner involved in
an event must be physically visible at that event location. Fixed objects cannot
move, consumed objects cannot reappear, and one object cannot change twice in
the same scene. A portable object follows its canonical owner through compiled
movements; if that owner is off camera, the object is forbidden rather than
duplicated or silently transferred.

The projection has the exact canonical graph as its sole parent in the
append-only ledger. The leased `compile_object_lifecycle` step commits and
promotes it idempotently; migration 020 expands only isolated V3 artifact and
step constraints. A dedicated 32-page matrix covers all three languages and six
universes with a portable map, fixed landmark and consumable seed. Ninety
adversarial mutations prove that duplicate acquisition, silent owner changes,
post-consumption reappearance, fixed-object movement and broken state chains
fail with stable codes.

The command is `npm run check:narrative-v3-objects`. It uses temporary local
stores and reports zero provider calls, paid calls and customer routes. The
existing `NarrativeBookSpec.v2` remains immutable and continues to reject
object-bearing graphs; the next release-spec version will bind this projection
as a required parent before manuscript work begins. No production route,
environment switch, credit, V2 project or customer project is changed.

## Narrative V3 object-aware release-spec checkpoint

`NarrativeBookSpec.v3` is a new strict released artifact rather than an
in-place mutation of V2. Its three exact ordered parents are the sealed
CreationIntent, CanonicalStoryGraph and ObjectLifecycleProjection. The ledger
uses the explicit `narrative_book_spec_v3` type, so V2 artifacts, pointers and
retries cannot be silently reinterpreted under the new contract.

The compiler proves that the projection descends from the same graph, that its
object registry preserves every canonical id, name, kind and order, and that
each projected scene binds the exact source-scene and object-event digests.
Every released scene carries the complete ordered object state plus its digest;
the illustration instant points to that same digest instead of independently
inventing quantity, ownership, location or visibility.

Migration 021 adds only the isolated V3 artifact, pointer and release-step
constraints. The leased `release_narrative_book_spec_v3` operation requires all
three ancestors in order and promotes its output idempotently. The synthetic
object matrix now commits five artifacts for all 18 language/universe cases;
54 objects and 90 adversarial corruptions pass with zero provider calls, paid
calls or customer routes. No production route, rollout switch, credit, series
canon, customer project or Render configuration changes. The next brick is a
strict manuscript artifact compiled only from this released V3 specification.

## Narrative V3 strict-manuscript checkpoint

`ManuscriptWire.v1` is the only representation that a prose model may return.
It contains the exact released-spec digest, one supported book language and
one page-number/text pair for every released text page. Unknown fields,
duplicate pages, omitted pages, invented pages, a foreign language or a stale
spec digest are rejected at this wire boundary rather than normalized.

One explicit parser produces immutable `Manuscript.v1`. Every canonical page
copies its exact opening, closing or scene binding from
`NarrativeBookSpec.v3`; a scene page also records the source-scene and complete
object-state digests. The server derives the word target and tolerance from the
sealed audience age and checks the actual word count before persistence. The
canonical loader revalidates every binding and digest and never repairs a
changed artifact.

The append-only ledger accepts `manuscript` only behind one exact
`narrative_book_spec_v3` parent. The leased `write_manuscript` operation commits
and promotes it idempotently; migration 022 expands only isolated V3 artifact,
pointer and step constraints. The anonymous object matrix now reaches six
immutable artifacts without any route, provider call, paid call, customer
project, environment variable or Render change. The next artifact is a
deterministic `VisualStoryboard.v1` compiled from this exact spec and
manuscript.

## Narrative V3 deterministic visual-storyboard checkpoint

`VisualStoryboard.v1` is compiled locally from exactly one
`NarrativeBookSpec.v3` and its exact `Manuscript.v1`; it has no model-facing
wire representation. Every released scene becomes one image beat with the
exact spread and page pair, source-scene digest, object-state digest and paired
manuscript-page digest.

Each beat copies one physical before/visible/after frame, physical medium,
required and forbidden cast, exact wardrobe/equipment states, every projected
object state and the signed main action. Adjacent beats carry reciprocal
previous/next beat digests and locations, so a location jump or stale scene
cannot be hidden by prose or an image prompt. A deterministic composition
sequence supplies bounded scale, viewpoint, placement, depth and energy while
the existing whole-book rhythm rules keep the climax unique and the ending
settled.

The ledger accepts `visual_storyboard` only behind the exact ordered released
spec and manuscript parents. The leased `compile_visual_storyboard` operation
commits it idempotently; migration 023 changes only isolated V3 constraints.
The 18-case anonymous matrix now reaches seven immutable artifacts with no
route, provider call, paid call, customer project, environment variable or
Render change. The next checkpoint records immutable image candidates and
deterministic illustration decisions against these exact beat digests.

## Narrative V3 visual-continuity-plan checkpoint

Before any candidate is accepted, `VisualContinuityPlan.v1` now inserts a
deterministic previous-current-next window between the storyboard and image
generation. Its current snapshot is a complete authority for physical medium,
location, exact visible/forbidden cast, wardrobe, equipment, objects and main
action. Incoming and outgoing transitions separately enumerate changes in
cast, outfit, equipment, objects, location and medium and carry reciprocal
digests, so a local prompt cannot silently erase or reintroduce state.

Canonical visual-identity bindings are the only identity authority. A previous
accepted illustration is allowed only as secondary continuity evidence for
identity, established world details and lighting/palette. It is explicitly
forbidden from controlling cast cardinality, location, medium, wardrobe,
equipment, object state, action, pose or composition. The following scene is
prospective constraints only; it prevents the current image from making the
next scene impossible without asking a not-yet-generated image to become an
authority.

The append-only ledger stores `visual_continuity_plan` behind the exact released
spec and storyboard. Image-candidate ingestion requires both the storyboard and
that plan as exact ordered parents. The leased
`compile_visual_continuity_plan` step and migration 026 remain isolated from V2,
customer routes, credits and provider calls.

The anonymous matrix reaches eight immutable artifacts at this boundary. The
next checkpoint records image candidates only after this exact plan has been
committed.

## Narrative V3 illustration-evidence checkpoint

`ImageCandidateSet.v1` records exactly one generated candidate per storyboard
beat. Every candidate is bound to the beat digest and provider response id and
contains only a private object-storage key, file digest, MIME type, dimensions
and byte length. Public URLs are structurally impossible; response ids, storage
keys and file digests must be unique across the book, preventing an exact image
or response from being silently reused for another scene.

The vision boundary accepts only `IllustrationEvaluationWire.v1`, whose issue
codes are limited to objective file, identity, physical-medium, wardrobe and
object-state defects. The explicit parser creates
`IllustrationDecisionSet.v1`: a candidate is rejected only when at least one
objective issue is confirmed. Uncertain evidence remains recorded internally
but cannot reject the page, trigger creator review or expose a paid repair. An
accepted decision copies the exact private candidate asset; a rejected decision
exposes no asset.

The ledger stores candidate sets behind their exact storyboard and visual
continuity plan, and decision sets behind the exact ordered
storyboard/candidate parents. The leased
`record_image_candidates` and `decide_illustrations` operations are idempotent;
migration 024 changes only isolated V3 constraints. The anonymous matrix now
reaches ten immutable artifacts without a production provider or customer
route. The next checkpoint assembles a delivery manifest only when every
illustration decision is accepted.

## Narrative V3 delivery-manifest checkpoint

`DeliveryManifest.v1` is the first artifact that may declare a V3 book ready.
It has four exact ordered sources: released spec, manuscript, visual storyboard
and illustration decisions. Compilation fails while any illustration is
rejected or missing; it never substitutes an older candidate or asks the
customer to approve an internal uncertainty.

The manifest covers every physical page exactly once and in order. Text pages
reference the digest of their exact immutable manuscript page. Image pages
reference the exact accepted decision digest and copy only its private storage
asset metadata. No public URL or duplicated prose becomes a second narrative
authority. Every page has its own digest and the canonical loader fails closed
on reordering, replacement or tampering.

The append-only ledger requires the exact spec, manuscript, storyboard and
decision parents. The leased `assemble_delivery_manifest` step commits and
promotes the artifact idempotently; migration 025 changes only isolated V3
constraints. The anonymous matrix reaches eleven immutable artifacts and replay
reuses them without regenerating accepted work. Production routing and canary
activation remain separate and disabled until the final shadow gate.

## Narrative V3 full-shadow and guarded-canary checkpoint

The complete V3 chain is now exercised by `npm run check:narrative-v3-full`
across 108 combinations: FR/ES/EN, all six universes and all six sellable page
counts. Every fixture reaches eleven immutable artifacts through the real local
ledger and leased state machine, ends with a ready delivery manifest and
rejects five deliberate object-lifecycle corruptions. One fixture is replayed
against the same stores to prove that completed steps and pointers are reused.

The release evaluator requires all 108 fixtures, eleven artifacts per fixture,
complete delivery, all adversarial rejections, zero provider/paid calls, no
customer route and successful replay. The current passing gate digest is
`a72882e4497862d7986b2e90d1a77d04d8df9b9a935db22041d68db2677f9d49`.
This digest is structural synthetic evidence, not permission to spend or deploy.

The deterministic `narrativeV3RolloutAssignment` supports off, shadow, canary
and on modes, preserves an existing project assignment and hashes project ids
into stable buckets. It cannot enable V3 unless a 64-character release-gate
digest is also configured. Production defaults remain
`NARRATIVE_V3_ROLLOUT_MODE=off`, `NARRATIVE_V3_ROLLOUT_PERCENT=0` and an empty
`NARRATIVE_V3_RELEASE_GATE_DIGEST`. No current route calls this assignment, so
merging the checkpoint deploys contracts and verification only; customer books
continue on the existing path until a separately reviewed integration decision.

PRs #224 through #229 are merged on `main`. Render was verified Live on the
final guarded-canary commit `0ac5fc8` on 2026-08-19. The release remains safely
inactive: the default mode is `off`, its percentage is zero, its gate digest is
unset in production, and no customer route calls the assignment. This live
checkpoint proves deployability of the isolated chain; it does not authorize a
customer canary, provider spend, credit reservation or V2 project migration.

## Narrative V3 allowlisted production-shadow checkpoint

The first real V3 production shadow is connected only to an authenticated
preview request after the normal V2 generation has been durably queued. V2
remains the sole customer-visible and credit-bearing path. The shadow performs
one creative provider call for StoryConcept wire, then deterministically
commits StoryConcept, CanonicalStoryGraph, ObjectLifecycleProjection and
NarrativeBookSpec.v3 beneath the sealed CreationIntent root. It deliberately
stops before manuscript, storyboard and images.

Activation requires all three independent conditions: rollout mode shadow,
the exact approved 108-fixture gate digest, and the authenticated Woo customer
id in NARRATIVE_V3_SHADOW_CUSTOMER_IDS. The allowlist is exact and server-side;
email addresses and customer content are never logged. Shadow failures are
content-free internal observations and cannot block V2, consume another credit,
alter series canon or become visible to the customer.
Series projects remain excluded from this first real shadow because their
previous-canon input is not yet part of the sealed V3 concept request.

The dedicated worker leases only production-shadow-v1 runs, heartbeats long
provider work, persists the Responses API identifier, and retrieves that same
response after a Render restart. Each deterministic successor is a separately
idempotent run bound to immutable input digests. A recovery scan closes the
commit-before-successor-enqueue crash window. The kill switch is
NARRATIVE_V3_SHADOW_WORKER_ENABLED=false; production defaults remain off and
the tester allowlist defaults empty.

## Durable object-checkpoint retry entitlement

An older targeted retry can legitimately move the private semantic-checkpoint
pointer from the generation root into its durable request. Eligibility and
queue construction now resolve both representations of that same pointer, so
the object-only version-9 recovery promised to an exhausted project remains
available after page reload, device change and deployment. The recovery starts
from the preserved candidate and never restarts the architect or questionnaire.

When the rejected scenario is already visible, the creator action is labelled
explicitly as a free retry in French, Spanish and English. The entitlement is
still single-use and audit-only; projects without a real private checkpoint are
not reopened. This is a compatibility fix only: it adds no data migration,
credit, environment variable, model call or series-canon change.

## Deterministic off-camera object projection checkpoint

The causal graph keeps the real whole-story state of every portable object:
an object that Eva carries remains Eva's object when she is outside the camera
frame. The scene render ledger is now compiled separately. A worn, held or
carried object is projected as absent with quantity zero whenever its canonical
owner is not physically present in that scene, then becomes visible again when
the owner returns, without inventing a transfer, storage, loss or retrieval.

This separation removes the repeated object cascade produced when a correct
global possession state was copied into every focal scene. Location-bound
objects, transformations, quantities and narrative causal events keep their
existing rules. Scenario retry policy version 9 grants one deterministic,
audit-only recovery to exhausted object-only private checkpoints, so the
existing dinosaur-valley project can be recompiled without another architect
rewrite. Render logs expose only counts and scene numbers. No customer text,
credit, environment variable or series canon changes.

## Transactional editorial-repair checkpoint

The scenario editor may change only the concrete scenes coordinated by its
own bounded audit. Its object and causal registries remain repairable because
they are global authorities, but every proposed editorial result is now a
private transaction: deterministic validation and a fresh semantic audit must
prove the result before it can replace the previous mechanically valid
candidate.

A deterministic failure rolls the entire editorial proposal back. A remaining
semantic finding is retained only when its issue count strictly decreases and
it introduces neither a new scene nor a new category; an approval commits the
transaction normally. Thus one local object finding cannot become a persisted
whole-book cascade of carried or worn states. Render logs record only the
bounded transaction decision, counts, scenes and categories, never scenario
prose or customer data. This adds no model call and no environment variable.

## Unified repair-transaction recovery checkpoint

Structural, editorial and private semantic-checkpoint repair now use one
atomic progress rule. A still-invalid proposal can replace its private
baseline only when it has fewer issues and introduces neither a new affected
scene nor a new category. A regression or unchanged result restores the exact
prior private candidate; Render receives only the bounded transaction summary.

Retry policy version 8 grants one migration recovery to exhausted object-only
semantic checkpoints created before this common transaction. It starts from
the newest private checkpoint, requires fresh deterministic and semantic
validation and writes its recovery version into the request so it cannot
repeat. This adds no model call beyond the already authorized recovery and no
environment variable.

## Age × adult-intention narrative contract checkpoint

New scenarios receive one server-owned contract joining the exact child age to
the adult's confirmed intention and selected adventure seed. Five age profiles
bound conceptual complexity, metaphor, concurrent goals, emotional reasoning
and causal depth. Eight milestones then point to the authoritative intake field
and the fixed scene roles where desire, protective doubt, anticipation, first
step, attempts, the child's own choice, earned reward and inner realization must
become observable.

The contract never duplicates the family's private answer text: it stores only
stable source-field names and narrative coordinates. It requires at least two
distinct child attempts, prevents a guide from solving the climax, and permits
one explicit formulation of the message only after it has been demonstrated by
action and consequence. The architect and independent editor receive the same
immutable contract. New scenarios persist it under version 1; legacy scenarios
remain readable and targeted repair never migrates them implicitly. No model
call, environment variable or customer-visible review step is added.

## Deterministic three-act allocation checkpoint

New scenarios no longer let a narrative model choose or move act boundaries.
The server maps every fixed story role to one of three contiguous acts: setup and
guide relationship; plan, attempts and consequential choice; then climax,
earned transformation and resolution. The exact act travels with the page plan,
and scenario normalization ignores a conflicting model value.

The versioned act contract records exact scene ranges for every sellable length.
New scenarios persist the contract version, deterministic validation rejects
later boundary tampering, and manuscript batching uses the server-owned page
plan. Legacy approved scenarios keep their existing act values when no versioned
contract is present. All 108 local stability cases now verify the act contract
without adding a model call or changing a customer project.

## Narrative stability matrix checkpoint

The narrative redesign is measured first against a synthetic 108-case matrix:
all six server-owned universes, all six sellable page counts and FR/ES/EN. The
matrix contains no customer project, questionnaire, photo or generated book. Its
local structural inspection performs no model or network call and verifies the
exact universe contract, normalized language, page count and illustrated-scene
count for every combination.

Paid model evaluation remains a separate explicit operation. The stability
benchmark accepts exactly one named matrix case and one named model variant per
command; it has no bulk or implicit mode. This prevents a routine test or typo
from launching 108 or 324 paid generations. The matrix establishes the baseline
for the 99% no-customer-technical-intervention objective before deterministic
acts, complete universe topology and storyboard-first prose are introduced.

## Illustrated-instant cast and mobility-role checkpoint

Every illustration receives one phase-aware visible cast rather than every physical participant mentioned anywhere in the scene. Start-only departure witnesses, end-only arrivals and throughout characters are projected against the selected before/during/after instant; only declared transition or movement participants are travelers. A local departure witness or arrival greeter never inherits the travelers' universe outfit or conditional equipment merely because they share a scene.

The deterministic NarrativeBookSpec illustration plan labels recurring characters as main actors, travelers or local supporters and uses the same set in image prompting and plan audit. A low-detail vision suspicion that a required character is missing is not exposed as a blocking customer correction until a separate high-detail cast-only confirmation agrees. The confirmation is invoked only for suspected missing-cast findings, fails open for that unconfirmed suspicion and never weakens fusion, duplication, substitution, action, object or physical-environment controls.

## Initial named-cast arbitration checkpoint

An ordinary first-generation page treats low-detail missing, duplication, fusion and substitution wording as a suspicion, never as sufficient evidence for a creator-facing correction. Only a page carrying one of those cast suspicions receives one additional high-detail cast-only inspection with the private identity references; pages without cast suspicion add no quality call and no illustration call.

The structured inspection returns exactly one observation per required named identity, an exact cardinality state and stable local candidate ids. Zero occurrences confirm a missing character, two-or-more confirm duplication, an explicit fused state or one candidate id assigned to two names confirms fusion, and one separate unique candidate per required name clears the suspicion. An uncertain or incomplete result cannot create a customer task from the original low-detail wording, while independently proven action, location, object and topology defects remain blocking. Retouch paths keep their stricter source-preserving rule: an incomplete focused result never erases prior repair evidence.

## Private canonical-candidate checkpoint

A scenario rejected by the canonical compiler is preserved only as a private generation candidate together with bounded compiler coordinates and repair directives. It never becomes the creator-visible scenario or series canon. When at least one concrete scene is identified, exactly one free recovery starts from that candidate, exposes only the targeted scene set to the repair agent, restores every unrelated scene and reruns the canonical compiler plus the mandatory semantic editor.

Retry policy version 5 no longer reopens an exhausted project merely because its numeric policy version is old. An exhausted scenario can be resumed only from a real private semantic or canonical checkpoint; legacy failures without a checkpoint stay closed instead of silently rerunning the architect. A failed checkpoint recovery cannot open a loop, while a successful canonical recovery may still create one distinct semantic checkpoint if the subsequent editor finds an actionable narrative defect.

## Private semantic-audit checkpoint

A scenario that reaches the final semantic audit but remains rejected is preserved as a private generation candidate, never as the creator-visible scenario or series canon. Its bounded validation, actionable repair directives and canonical evidence are checkpointed in the durable generation ledger. Every blocking audit issue must identify one scene or inherit a concrete scene set from its matching directive; an uncoordinated global rejection is treated as a non-actionable audit failure rather than being silently summarized as `incomplete`.

Retry policy version 4 grants one migration recovery to older exhausted scenario failures. Once a private semantic checkpoint exists, the next free recovery starts from that exact candidate and edits only its affected scenes; if no safe scene coordinate exists, it re-audits the checkpoint without rerunning the architect. The checkpoint remains private and may open this targeted path only once. Creator-facing failure copy exposes the bounded safe explanation and no longer assumes that every exhausted recovery was the second technical attempt.

## Independent canonical passage-gate checkpoint

Passage coordinates are synchronized deterministically before passage ids are registered or any model repair budget is consumed. When one focal passage transition conflicts with the scene's single matching physical crossing, the physical movement ledger supplies the canonical endpoint pair; missing movement coordinates may conversely inherit the synchronized transition pair. The source candidate remains immutable, genuinely distinct endpoint pairs still receive distinct stable passage ids, and ambiguous multi-route scenes remain blocking rather than guessed.

Structural, editorial and canonical model repairs now have three independent single-call ceilings. Deterministic passage synchronization normally avoids the canonical call entirely; if a genuinely undecidable compiler defect remains after a structural repair, it may use its one separate canonical repair instead of failing with `repairBlockedByBudget`. Retry policy version 3 grants one saved-request recovery to projects whose two technical attempts were exhausted under the shared-budget policy.

Passage synchronization also reasons over the complete lifecycle of one stable mechanism. If every completed crossing of that mechanism proves one unordered endpoint pair, a missing, partial or collapsed route may inherit that pair only when its own endpoint or scene boundary fixes the direction. This repairs inner passage legs inside ordered multi-step scenes without confusing them with ordinary approach/departure travel. Competing endpoint pairs or absent directional evidence remain blocking. Scenario retry policy version 6 grants one private canonical-checkpoint recovery to projects exhausted before this lifecycle resolver; it neither replays projects without a candidate nor adds a model call.

## Deterministic physical-chronology compiler checkpoint

Scene movement is now compiled as an ordered physical transaction rather than a
single prose transition. When a scene approaches a passage and then discovers
it, the ordinary approach remains the scene transition and the stationary
discovery remains ordered after arrival. The canonical compiler reuses that
explicit discovery instead of injecting a duplicate at the beginning of the
movement ledger.

The first unique `cross_passage` pair fixes the two endpoints of one stable
mechanism. A later return that collapses the passage and an already established
outer route into one impossible leg is split deterministically into the reverse
passage crossing followed by the known ordinary route. This is allowed only
when the passage pair is unique, the traveler set is unchanged and exactly one
ordinary route already connects the canonical endpoint to the declared final
location. Competing passage pairs, missing routes or competing ordinary routes
remain private blocking defects and are never guessed.

Compiler diagnostics now point to the later crossing that introduces a third
endpoint instead of blaming the first valid crossing. The physical chronology
pass runs again after targeted checkpoint scoping so an unambiguous dependent
return scene cannot be restored to its stale coordinates. Scenario retry policy
version 7 and lifecycle recovery version 2 open exactly one private-candidate
recovery for projects exhausted under the former resolver. No model call,
environment variable or customer-visible review step is added.

## Deterministic passage-envelope completion checkpoint

When a generated focal `cross_passage` or `return_travel` and its matching physical ledger both omit or collapse their hidden coordinates, the precompiler now completes the route from the scene's canonical `locationBefore` and `locationAfter` before canonical compilation. This inference is permitted only when every other explicit physical route in the scene agrees with that same unordered endpoint pair. Matching incomplete passage movements inherit the completed directed pair in the same immutable pass.

The completion adds no model call and consumes no repair budget. It does not flatten an ordered multi-step scene: any other explicit route with different endpoints, or several competing passage routes, keeps the passage ambiguous and blocking. Existing private canonical candidates with an unused technical retry benefit on their next attempt without migrating or rewriting an approved project.

## Deterministic movement-compiler extension checkpoint

The existing NarrativeBookSpec compiler gains a pure pre-compilation canonicalizer for hidden character movements. It replays the physical ledger from canonical character positions, splits one movement when travelers actually begin in different places, removes legs for travelers already at the destination, infers only an unambiguous final leg to an end-phase physical presence, and resynchronizes the focal transition. The approved narrative text and its source digest remain authoritative and unchanged; only the in-memory mechanical clone may be normalized.

`NARRATIVE_MOVEMENT_CANONICALIZER_MODE=off|observe|enforce` controls rollout and defaults to `off`. `off` preserves current compilation exactly. `observe` computes the same private bounded report without changing the compiled candidate. `enforce` compiles the canonicalized mechanical clone and remains unavailable in production until synthetic property tests and controlled new-book comparisons are satisfactory. Historical projects are not migrated automatically.

## Progressive bounded scenario-repair checkpoint

Automatic scenario repair now converges monotonically instead of restarting from the last creator-visible failure. The orchestrator compares bounded validation coordinates after each targeted pass. A candidate becomes the new private checkpoint when it strictly reduces the issue count or resolves at least one previously flagged scene. Findings newly revealed on structurally unchanged non-target scenes are treated as the next audit frontier, not as a rewrite regression. A second and final targeted pass receives only those current findings and uses distinct provider checkpoint keys. If it succeeds, the scenario is published normally; if it fails or regresses on the current targets, no third model call is allowed.

When the bounded convergence stops after a measurable improvement, the best intermediate scenario replaces the stale invalid proposal with `needs_revision` status and the latest creator-safe diagnostics. Thus a repaired scene 21 remains repaired while the interface moves on to genuine findings in scenes 10 and 15. The previous scenario is still retained when no measurable improvement occurred. Recovery policy version 3 grants one migration attempt to eligible open projects exhausted under the earlier non-progressive policy.

## Canonical per-character movement-origin checkpoint

The character location ledger is authoritative for the origin of every hidden movement. Before a scene is validated, Calitiki replays its explicit movements in order, replaces stale model-written origins with each traveler's last canonical position, removes a redundant leg when that traveler is already at its destination, and splits a shared movement when its travelers actually begin in different places. Passage semantics are retained only for the compatible focal route; unrelated incoming legs become ordinary or join travel without borrowing the passage mechanism. The creator's visible action and location remain unchanged.

This closes the four-per-character travel failure seen when scene 21 visibly returned the full group to Noa's rooftop but its hidden ledger still departed from a shortened vehicle label. The deterministic final-arrival step then completes any remaining disembark or local leg, and whole-scenario validation still runs afterward.

## Per-character arrival and repair-scope checkpoint

Ordered scenario movements are now simulated per physical character before the final scene presence is validated. Participating in an early crossing no longer implies that the same traveler completed a later disembark or local arrival. After applying every explicit movement in order, Calitiki adds one deterministic final leg only for each end-phase physical character whose projected location still differs from the creator's visible destination. Existing travelers use ordinary continuation travel from their actual intermediate location; genuinely incoming characters retain join-travel semantics.

Automatic scenario repair is a targeted patch, not permission to rewrite the whole proposal. Its immutable target set is derived from the bounded plan's scene numbers, diagnostics, issues and repair directives. After every model and deterministic normalization stage, all non-target scenes and global creator choices are restored byte-for-structure from the previous proposal. Targeted causal registries may still change when required to repair an object or passage event, and the complete scenario remains subject to fresh validation. This prevents a repair aimed at scenes 15, 17 or 21 from introducing a new defect into scene 8.

## Ordered multi-step scenario revision checkpoint

A creator-edited scene may contain several physical movements in one causal beat, such as crossing the established return passage, arriving in a vehicle and then disembarking at the final visible location. The visible location remains the authoritative end of the scene, but it no longer collapses a valid ordered movement ledger into one synthetic trip. The deterministic normalizer preserves a repaired movement chain when it reaches that destination, keeps the original departure when the edited action explicitly declares travel, and only discards a ledger whose coordinates remain stale.

The focal transition may represent one explicit movement inside that ordered chain while `locationBefore` and `locationAfter` describe the complete scene envelope. Validation still requires that the transition match an actual canonical movement and that every physical presence end at its declared location; this permits multi-step return and disembark scenes without weakening teleportation or passage checks.

When a revised candidate fails the final private audit, the previously reviewable scenario still remains authoritative and no rejected candidate prose is stored. A separate bounded failure summary records only creator-safe category, scene number and explanation. The interface confirms that the correction was received, distinguishes the rejected replacement from the older visible diagnostics and explains that the exact saved request can be retried without credit use. Worker logs include only bounded category and scene coordinates, never candidate prose or customer text.

## Explainable scenario findings and bounded metadata recovery checkpoint

The semantic scenario audit distinguishes an ordered causal chain such as **prepare or create -> invite or offer -> share or celebrate** from a true repeated event. A deterministic reconciliation removes only this narrow false-positive family when every cited scene advances through a distinct ordered stage; an actually repeated action, flat emotional beat or unchanged outcome remains blocking. The auditor prompt carries the same rule so new audits and deterministic reconciliation agree.

Every red scenario card now carries its own creator-safe **why this scene is flagged** block. It prefers the precise persisted audit explanation and otherwise displays the localized category reason for that scene. A failed automatic repair preserves those bounded semantic diagnostics instead of collapsing them into an unhelpful generic failure. No private compiler path, hidden object identity or customer wording is exposed.

An automatic repair exhausted under the former policy receives exactly one versioned recovery when all remaining categories are safe scenario metadata or editorial categories: passage, progression, repetition, emotion, cast, travel or incomplete. Object-state and ordering ambiguities remain closed because guessing could change physical canon. The new counter is independent from the former passage-only recovery so an already-open project can benefit once, while every request remains free, bounded and incapable of opening a retry loop.

## Creator-edited scenario retry checkpoint

A failed scenario update preserves both the prior server proposal and the creator's unsent visible edits. The retry action has two explicit modes: an unchanged technical retry reuses the exact saved request, while any edited title, action, location, presence or general instruction changes the button to **Apply my corrections** and creates a fresh revision request from the currently visible fields. Dirty creator input always takes priority over technical retry state.

Scene action and focal location form one physical correction contract. Editing either sends the displayed location; the server treats the selected final location as authoritative, discards stale hidden movement coordinates, aligns the transition destination and end-phase physical presences, then rebuilds the movement ledger before validation. This lets a creator correct an arrival or return without needing to understand hidden transition metadata. Scenario job failures are mapped to localized creator messages instead of exposing internal English worker text.

## Unified resume and deterministic series-passage checkpoint

Scenario-ready e-mails and every unfinished-project action in **My creations** now use the same signed `project_resume` destination. Both paths authenticate with the WooCommerce account and restore the exact customer-owned server project; the generic creator callback is no longer used for library cards, so a second device cannot fall back to its empty browser draft.

Before canonical NarrativeBookSpec compilation, the deterministic passage precompiler normalizes a reused mechanism id by its unordered pair of endpoints. A true reverse crossing keeps the same id, while a mistakenly reused id for a different location pair receives a stable derived id and its nearest compatible discovery is aligned. This repair is code-only, immutable with respect to the submitted candidate and consumes no model call. Compiler diagnostics point to the first affected crossing instead of the registry root. A project whose earlier bounded automatic repair ended specifically on this passage ambiguity receives one versioned recovery attempt under the new precompiler; unrelated exhausted repairs remain closed.

Every new series episode freezes a bounded narrative canon from the purchased source episode: canonical characters, universe, established locations and passage ids. The scenario worker also reconstructs this canon from the source project for episodes created before this checkpoint. The architect must preserve these identities while still creating a distinct new plot, and a genuinely new passage must use a new id. No questionnaire prose, generated scene text or private asset is copied into the canon contract.

## Reader-integrated final review checkpoint

Uploaded participant previews show the complete source image inside a larger portrait-aware frame instead of cropping it to a square. Selecting the preview opens an accessible browser-only lightbox with the full image; it uploads nothing new and adds no model call.

Quality review is performed beside the spread being inspected. The top review area is a compact index of flagged pages, while opening a page places the reason, creator explanation, available text/image actions, candidate comparison and keep/apply decisions directly under the reader. After a decision, the reader advances to the next unresolved spread and ends with a clear completion summary. The same server endpoints and cost ceilings remain authoritative, and the original spread is never changed until explicit selection.

The second technical attempt is a distinct bounded strategy rather than a blind replay. Failures are stored as private categorical codes plus a one-way fingerprint of the normalized creator instruction; no creator wording is added to diagnostics. A temporary provider or storage failure permits a source-preserving recovery strategy. A request that conflicts with approved location, cast, chronology, object state or main action is not resent unchanged: Calitiki asks for a reformulation or suggests the other correction scope without spending another attempt. Unknown technical failures retain the existing single bounded retry and then stop for manual support.

## Success-counted creator allowances checkpoint

The intention assistant allowance belongs to one opaque new-book session as well as its normalized age, situation and interface language. The server first reserves exactly one batch, allows no competing batch for that session, and increments the three-batch counter only after three valid perspectives have actually been produced. A failed request releases its reservation; an interrupted reservation expires after ten minutes. The durable ledger remains numeric and one-way: it stores neither parent wording nor generated perspectives. Consequently, the first three cards of a genuinely new creation are shown as the first batch even when the parent previously used the same wording in another book.

A creator quality-review alternative is likewise counted as used only when its private candidate has been saved durably. A technical failure leaves the current double-page untouched and permits exactly one controlled retry for the same text or illustration scope; two failed technical attempts stop automatic spend and direct the customer to Calitiki. Legacy pages whose former counter was advanced by a failure, including already-open reviews, are recognized from their failure-without-candidate state and receive this single recovery. The customer message now distinguishes a ready proposal, an available retry, a technical stop and a genuinely consumed successful proposal.

## Locked adjacent visual-continuity checkpoint

Interior illustrations are generated sequentially. Every new image scene receives the nearest previously accepted interior illustration as a bounded `adjacent_scene` reference, in addition to the approved-cover style anchor and private identity references. The adjacent image preserves recurring identity, established world details and only the physical states that truly carry forward; it never overrides the current structured scene contract and must not copy a previous action, pose, composition, camera, obsolete location or obsolete equipment. This adds no second illustration call. Each generated page records the continuity-contract version and source page number for private diagnosis.

The exact paired reader text now contributes a bounded, name-neutralized evidence excerpt and a deterministic list of visible facts to both the image prompt and scene QA. The single render snapshot still controls the one illustrated instant. A plan, memory, feeling, metaphor or future possibility cannot become a physical object unless the structured required-elements or object-state contract declares it visible.

Every technical repair, free quality alternative and paid customer illustration adjustment is a non-destructive image edit. The current accepted image is Reference 1 and controls its existing composition, identity likeness and unaffected content; the cover controls the broad medium, and the nearest accepted scenes on both sides supply local continuity evidence. A low-resolution candidate-versus-source gate blocks a clear identity replacement, cast regression or unrelated redesign of a stable physical invariant. Every cast- or identity-sensitive automatic repair, every creator-requested free illustration alternative and every paid illustration adjustment then receives one focused high-detail identity-cardinality check. The proposed image is compared with the matching private identity references, and each required named person or animal must appear exactly once; one candidate person cannot satisfy two aliases, and a repair cannot solve a missing-character suspicion by adding a duplicate. This complete result replaces contradictory anonymous cast findings while preserving independent action, location, object and topology findings. An incomplete or unavailable focused result never erases prior evidence. A failed paid generation releases its reservation; capture occurs only after a complete private candidate exists, and the candidate becomes current only after explicit approval. Retouch paths always receive this focused check when cast or identity is in scope; an ordinary first-generation page receives it only to arbitrate a low-detail cast suspicion before any creator-facing review.

## Cross-device project-resume checkpoint

Every scenario, cover, interruption and completion e-mail opens a durable project-resume entry before authentication. The entry carries only the opaque project id and displays no title, questionnaire, photo or generated content. On a device without a Creator draft or customer session, it explains that the book is saved and asks the customer to connect with the same WooCommerce account. Authentication uses the dedicated signed `project_resume` destination, then the Creator loads the customer-owned server project directly by id.

Browser local storage is never an authority for e-mail resume. A successful account-bound lookup restores the exact persisted decision state, including scenario review. A missing project, wrong account or failed lookup stays on the dedicated resume screen with a path to **My creations** and never falls through to an empty new-book questionnaire. The link itself grants no access to private assets and starts no generation, credit reservation or model call.

## Visible adventure-choice handoff checkpoint

Selecting an intention is an authoritative completed choice before the creator reaches the universe screen. As soon as a universe is chosen, the adventure-proposal area remains visible while its three suggestions are prepared, and `Continuer` is disabled until that bounded request finishes. The interface explicitly confirms that the intention is saved instead of reusing the missing-inspiration wording for two different decisions.

Suggestion request failures remain visible after rendering and expose the existing retry action; they are never replaced by a misleading request to choose an unavailable card. This browser-state correction changes no credit, ideation-limit or persistence authority and adds no model call.

## Canonical fixed-landmark continuity checkpoint

Every recurring named monument or place-bound visual landmark is one `track_every_scene` location-bound entity with one stable id, one exact home and global quantity 1. The causal validator rejects duplicated fixed quantities, and the scenario contract forbids twins, miniatures, decorative copies and relocation to a nearby setting. Existing portable-object mechanics remain unchanged.

The physical render snapshot compiles each fixed entity against the camera location and camera side as `visible_once`, `other_side_only`, `absent_elsewhere` or `absent`. It also carries the same entity's expected status for the previous, current and next scenes. A landmark on the opposite side may be glimpsed at most once only beyond the established bounded passage; it cannot appear on the dry beach merely because the underwater world is visible nearby. This registry is deterministic, enters the image prompt and whole-book audit, and adds no paid model call.

The existing vision pass checks each current image against that registry. A clearly duplicated unique landmark or a landmark visibly placed at the wrong home/camera side receives a stable high-confidence defect code and enters the existing one-shot targeted automatic repair. Ambiguous composition remains accepted, and only an unresolved bounded repair reaches the creator.

## Camera-side world topology checkpoint

All six universe contracts define a deterministic two-zone topology: one named origin, one named adventure zone, one transition zone and an explicit physical medium for each. When a story begins outside its adventure world, the first approved `cross_passage` with a stable id establishes the boundary. Every later scene inherits its side from the ordered scenario; crossing that same id toggles sides and `return_travel` through it restores the origin. `ordinary_travel` may move characters inside a side but can never silently replace the world boundary. A universe-native story with no crossing stays wholly on its declared adventure side.

Each physical render snapshot carries the camera side and zone, opposite side and zone, both media and a precise boundary rule. The scene planner, compact image contract, continuity prompt and deterministic final audit all consume these coordinates, so a landmark, safety state or complete environment cannot leak across the threshold. The coral-ocean specialization remains strict: a dry preparation scene may show the reef only beyond a clearly bounded portal or sealed opening; water, fish, coral, buoyancy and underwater lighting cannot surround the characters or dry furniture. Conditional equipment remains independently validated, so wearing breathing equipment before entry is valid preparation while missing worn equipment on the underwater side is an objective repairable contradiction. New projects persist their complete topology; legacy non-ocean projects do not acquire one implicitly during regeneration.

## Storyboard-first visual beat checkpoint

For every new Narrative V2 book, Calitiki deterministically compiles the approved scenario and blueprint into one sealed visual beat per spread before requesting manuscript prose. The beat fixes the exact single visible phase, camera zone and physical medium, main action, visible cast, object states, required elements and forbidden alternatives. This is structured planning rather than an extra generated image or model call, so it adds neither image cost nor another creative interpretation.

Each manuscript batch receives its canonical scene and matching visual beat, and the final language editor receives the same coordinates. The prose is then bound back into the already-sealed storyboard as evidence without changing any visual field; both the later image prompt and reader text therefore descend from one common artifact. The empty storyboard is checkpointed before prose for idempotent retries. A project whose manuscript already began under the older order stays on its compatibility path instead of being silently migrated mid-book.

Every version-2 storyboard beat is independently signed with a SHA-256 digest of its immutable visual payload. Before any cover or interior illustration call, a zero-model binding gate verifies the storyboard version and source, ownership by the exact approved NarrativeBookSpec artifact, unique scene/text/image page coordinates, complete paired prose, exact prose binding and every visual digest. Adding reader text therefore cannot silently alter a location, phase, cast member, action, object, zone or forbidden element. A failed integrity check is an internal technical failure before image spend; version-1 in-progress checkpoints remain on their compatibility path.

The same local gate validates every adjacent beat as one ordered handoff: scene numbers are contiguous, the outgoing location and physical zone become the next incoming location and zone, object registry identities remain complete, page pairs never overlap and each fixed landmark's predicted next-scene visibility equals its actual next state. State changes and movement remain valid only through the already-approved causal events. This catches the common “suddenly elsewhere on the next spread” defect before an illustration request and adds no model call.

The existing final language-editor call also returns one semantic fidelity attestation for every signed visual beat. It copies the beat digest exactly and declares the paired prose aligned, locally corrected or rejected. A correction must return the complete page text, remain within the approved event and be demonstrably applied; it may name only characters already authorized by that beat. Missing, duplicated, stale, unexpected or unresolved evidence stops privately before image generation. This closes the gap between structurally bound prose and semantic meaning without adding a model call, while older storyboard formats retain their explicit compatibility path.

Each new Narrative V2 beat also carries a deterministic visual-composition plan derived from its server-owned story role and physical transition. The plan specifies square framing, shot scale, viewpoint, subject placement, depth layers, visual rhythm and cast readability. Adjacent scenes cannot reuse the same composition, every sellable length receives a broad minimum repertoire, and an actual world crossing receives a profile threshold view that keeps departure, passage and destination spatially distinct. Composition may make the book more expressive but can never alter the signed action, phase, cast, location or object states. It is part of the beat digest, verified locally and sent through the existing compact image prompt, so diversity adds no planning model call and no customer decision.

The composition sequence is validated as one whole-book rhythm rather than a bag of independent frames. Every beat carries a bounded scale family and energy level; a complete book uses at least three scales, cannot remain at one scale through four consecutive scenes, lets at least one attempt gain visible energy, reserves the unique level-5 composition for the climax and releases intensity immediately afterward. The final return settles at a quiet level. These rules diversify pacing while keeping illustration quality subjective: they validate Calitiki's own deterministic plan before generation and do not turn a customer's aesthetic preference into an automatic paid retry.

The final-return composition follows the exact signed visible phase rather than the existence of travel somewhere in the same scene. A `return_home_and_moral` beat illustrated during the crossing keeps the reverse threshold profile; when its signed instant is after arrival, the quiet role composition takes precedence and the physical route remains preserved in the causal frame and manuscript. Versioned storyboard reuse requires the current deterministic illustration-plan version as well as the same artifact digest and contract source. An older contradictory plan is rebuilt locally from the approved scenario, blueprint and saved manuscript, without another narrative-model call or a new creator decision.

Every beat also receives an age-bounded scene-density plan. The signed main-action subject and target are the only maximum-salience focus for younger books, with one optional additional focus for older readers. Every required supporting person and element remains complete and readable but subordinate, while visible object states become low-salience context. Non-canonical decorative accents are capped from one at ages 1-3 to five at ages 12-14, and may never add people, duplicate landmarks or create a second action. This preserves exceptional world detail without letting decoration obscure the message or remove a canonical fact; the hierarchy is compiled and validated locally and uses the existing image call.

Before cover or interior generation, a zero-model projection preflight proves that every current signed visual beat survives the compact image boundary without semantic loss. It independently compares main action, named and generic cast, required elements, quantities and object states, causal and physical snapshots, world topology, equipment, fixed entities, prohibitions, spatial relationships, composition and density after safe name neutralization. A truncated array, missing field or changed value stops privately before image spend. This check also preserves the meaningful zero quantity of an absent object instead of coercing it to one. Safety-only fallback remains a separately bounded exceptional path after a provider safety rejection; it does not redefine the normal lossless contract.

## Bounded intention perspectives checkpoint

The no-credit intention assistant may generate at most three batches of three perspectives for one normalized age, situation and interface language. The first action explicitly asks for three ways to clarify the intention; later actions announce another batch and their position within the three-batch allowance. Every successful batch remains available in a three-card pager, so requesting alternatives never erases an earlier choice. After nine perspectives, generation is disabled and the parent chooses one perspective or keeps their own idea.

The ceiling is enforced before the intention model call by a private numeric server ledger keyed by the anonymous HTTP-only draft owner and a one-way fingerprint of the new-book session plus its input. A short-lived reservation prevents concurrent generation, but only a successfully generated three-card batch advances the counter; failure releases the round. The ledger stores no parent wording and no generated text. Browser state is not authoritative for cost control, and the existing IP window remains a secondary abuse ceiling. Changing the new-book session, normalized age, situation or language creates a new allowance; whitespace and casing changes within one session do not. Later batches receive bounded summaries of earlier generated perspectives and must be materially different rather than paraphrases.

## Physical render snapshot checkpoint

Every modern interior illustration contract now compiles one deterministic physical render snapshot after the full before/during/after causal frame is known. The full frame remains available to planning and audit, but image generation receives only the selected visible phase, canonical location, physical medium, main action, physical cast, exact conditional-equipment states and explicit forbidden alternatives. This prevents one illustration from combining preparation, crossing, arrival, removal and storage into a multi-instant montage.

Conditional safety equipment is separate from persistent wardrobe. Its canonical per-character object state overrides an outfit description: equipment marked stored or absent is stripped from the current wardrobe prompt, while fully underwater people retain exactly one worn breathing mechanism each. Structured physical medium overrides keyword inference from prose, so a breathable room below water may show fish outside sealed windows without re-equipping people merely because the text mentions water. The visual quality gate treats a wrong physical medium, conflicting or duplicated conditional equipment and a multi-phase composite as high-confidence objective defects eligible for the existing bounded automatic targeted repair before creator review. Both the NarrativeBookSpec illustration compiler and the compatibility planner emit the same versioned snapshot, and older cached story plans are invalidated by the new contract versions.

## Scene causal-frame continuity checkpoint

The final whole-book plan now preserves a deterministic before/during/after causal frame for every modern approved scenario scene. The frame is derived from the approved scenario rather than authored freely: it carries the incoming location, exact approved action, transition kind and stable mechanism id, outgoing location, one visible phase and one visible location. The deterministic plan audit rejects a frame that diverges from the approved scene and rejects any adjacent handoff where scene N's outgoing location is not scene N+1's incoming location. Legacy scenarios without structured before/after locations remain readable under their compatibility path.

The authoritative audit contract and the compact image contract both include this causal frame. Reader prose and the single illustrated instant must therefore agree on whether the characters are before, during or after a crossing; an image prompt may not show a destination before its approved preparation or passage. These objective defects enter the existing bounded whole-book repair and fresh-audit path before any interior image generation. They are internal quality failures, not creator questions; creator review remains reserved for genuine creative ambiguity or a bounded repair that cannot determine one safe canonical result.

## Narrative V2 delivery checkpoint

Before a fresh scenario is shown to the creator, its final audited candidate must compile into the deterministic NarrativeBookSpec contract. One bounded internal canonical repair and one fresh semantic audit may resolve a mechanical compiler finding. A remaining compiler defect interrupts scenario preparation as a freely retryable technical failure; it is never exposed as red scene cards asking the parent to diagnose hidden state. The successful candidate stores only bounded private compiler evidence until explicit approval. Child Safety and Story Sensitivity remain independent, immutable gates.

When that bounded repair successfully restores the canonical contract but the required fresh semantic audit still rejects the story, the result is not a compiler failure. Calitiki preserves the audit's structured narrative findings and returns the reviewable scenario without another model call. Only a candidate that still fails deterministic compilation remains a private `scenario_contract_invalid` technical failure. This distinction prevents an empty `finalIssues` compiler report from hiding a real editorial finding while preserving the absolute one-repair ceiling.

The causal contract now receives priority over editorial correction. After base structural validation, strictly identical causal events are removed deterministically and NarrativeBookSpec compiles before the narrative editor runs. A genuine canonical ambiguity may consume the single scenario-wide paid repair; its fresh semantic audit then replaces the redundant ordinary editor pass. If the ordinary editor instead consumes that repair, its candidate is recompiled once in code with no further model call. This keeps the absolute one-repair ceiling while preventing a late object-state finding from being starved by an earlier editorial correction.

NarrativeBookSpec compiler version 3 and mechanical validator version 2 preserve the complete ordered version-2 object history instead of collapsing each object to one event per scene. Several physical changes in one scene are valid when their declared order forms one continuous chain: each compiled event begins at the preceding event's state, owner, quantity and progress, and the scene snapshot references only the final event. A contradictory predecessor, duplicate ordered step, terminal reappearance or silent change still fails deterministically. Location-bound fixtures continue to exist at their canonical home while their illustration visibility is projected from the focal scene location. Model-authored scene snapshots remain non-authoritative. These mechanical projections never consume a model-repair call and are not exposed to the parent as narrative corrections.

Location-bound existence is also causal. A true static fixture that has no appearance event is normalized as present at its canonical home, but an entity produced by a transformation or explicitly introduced, acquired or installed later remains absent until that declared event. The deterministic ledger therefore cannot expose a completed bridge, installed lamp or other future result merely because the scene already occurs at its eventual home location. This distinction is enforced in code before semantic review and never consumes an AI repair call.

The pre-editor compilation is explicitly mechanical and non-persistent. It refreshes an ephemeral in-memory audit digest only to let the strict compiler inspect the exact candidate shape; stale or absent workflow metadata is never sent to the scenario model as a narrative repair. The independent editor still produces the only authoritative audit evidence, and the final persisted contract continues to require that evidence to match the exact approved scenario.

## Product flow

1. An anonymous visitor first supplies only the child's age so Calitiki can calibrate vocabulary, emotional nuance, expected autonomy and the size of the first achievable step. The visitor then describes in ordinary words what they would like to help the child live, try or overcome, or selects a concrete example. This meaning-led intention still comes before the child's name, personality, interests and visual universe. A dedicated no-credit assistant proposes exactly three positive, non-diagnostic interpretations using only the supplied age and situation; it uses conditional language, treats hesitation as protective rather than defective and never claims a therapeutic result. Changing the age invalidates previously generated interpretations so advice for one maturity level is never silently reused for another. The parent confirms one interpretation or keeps fully free input through **I already have my own idea**, then provides the remaining essential child details. The visitor next chooses the story universe from six likeness-comparable examples built with the same synthetic child. Only after the intention, child and universe are known does Calitiki return exactly three genuinely different universe-aware adventure cards: a **relational** route based on dialogue and mutual help, a **symbolic/magical** route based on mystery and metaphor, and a **concrete/action** route based on an observable challenge. Stable legacy ids remain `teamwork`, `discovery` and `creation`. Each concise card exposes its starting point, objective, difficulty, child's active role, adventure, resolution, message demonstrated through action and emotional tone. Selecting a card pre-fills the editable story promise. Interpretations and suggestions are cached in the browser draft and are regenerated only on explicit request.

   A private, versioned editorial sensitivity profile is introduced before narrative generation. A multilingual deterministic floor and a bounded AI classifier classify new parent-intention requests as level 1 everyday, level 2 emotionally significant, level 3 major life event, or restricted acute-safety context. Version 2 makes direct self-harm, suicide, abuse and immediate-danger wording an age-independent deterministic floor, including accents, ordinary separators and selected common FR/ES/EN misspellings; the AI remains responsible for contextual nuance but can never lower that floor. Private structured logs distinguish the deterministic, classifier and final levels without copying the family's wording. The result contains no diagnosis or free-form rationale and remains private inside the draft. In `observe`, it does not alter the journey or narrative prompts. In `guided`, level 1 remains unchanged, level 2 receives an internal action-led gentle contract, and level 3 receives a symbolic, open-ended contract that forbids definitive, diagnostic or therapeutic promises; the adult sees a prudent notice and must explicitly acknowledge it before continuing. Restricted acute-safety input pauses creation before persistence, generation or credit reservation and redirects the adult toward real human help. The same immutable contract accompanies intentions, suggestions, scenario, blueprint, manuscript and scene planning so it cannot disappear between agents. If the classifier is unavailable or slow, deterministic metadata is retained. Persisted legacy profiles, drafts, scenarios and books are never silently reclassified.

   Child sexual safety is a separate, stricter gate rather than another sensitivity level. It combines multilingual deterministic patterns, a bounded private classifier and OpenAI's moderation signal. Protective body-autonomy education remains allowed under an immutable narrative contract; a possible abuse disclosure pauses creation and presents child-protection resources; any attempt to normalize, romanticize, conceal or facilitate sexualized adult-child conduct is refused. The gate is repeated before draft persistence, suggestions, scenario creation or approval, preview authorization, whole-manuscript illustration, and paid targeted changes. A refusal occurs before credit reservation and stores neither the submitted unsafe wording nor a free-form rationale. Generated prose is rechecked before the first illustration, so an unsafe transformation cannot pass merely because the initial request was benign. `observe` supports a controlled corpus review; production enforcement uses `enforce`. Every enforced response also carries a localized human-readable fallback for a creator tab opened before a deployment, while the current client exposes an assertive, keyboard-focusable support or refusal notice and brings it into view. Support resources come from a dated, versioned registry of verified official sources. The adult must select the country where the child is physically located now; Calitiki never infers it from interface language, nationality or IP address. The first registry covers France, Spain, Belgium, Switzerland, the United Kingdom, the United States and Canada, plus the EU-wide 112 fallback. An unlisted country receives an honest instruction to contact local emergency, health or child-protection services rather than an invented or potentially wrong number.
2. The visitor completes the remaining personal story details, chooses the visual finish and format, and may add up to five photos. Page-count cards show age-aware recommendations, illustrated-scene count, estimated shared-reading duration and likely one-sitting or multi-moment use; all six lengths remain selectable because the parent retains the final choice. A longer book must earn its length with more events, decisions and consequences rather than descriptive filler. The first portrait is the story child and therefore the hero. Every secondary reference requires two distinct explicit choices instead of silent defaults: its relationship to the child (mascot, friend, family or other) and its narrative role (guide, ally, companion, supporter or guest). Family and Other also require a concrete relationship such as brother, sister or mother. Both creator choices remain authoritative for scenario distribution and visual casting. This photo registry is the sole creation point for personalized story characters; the former free questionnaire field asking who accompanies the child is removed for new projects, while its persisted legacy value remains readable. The selected universe carries a deterministic story contract defining its adventure zone, entry rule, physical rules and mechanisms that must appear before use.
3. When the visitor requests an AI preview, the draft is preserved and WooCommerce authentication is required.
4. An authenticated customer sees the exact preview price and may apply a single-use access code. This confirmation prepares the story scenario; it does not yet reserve or spend a credit.
5. Calitiki converts the answers into a persisted structured scenario before writing the manuscript. The confirmed parent intention is authoritative alongside the selected adventure: desire leads to a protective doubt, positive anticipation, an accessible first step, progressive imperfect attempts, the child's own courageous choice, a causally earned reward and an inner realization. A guide or magical mechanism may encourage or enable the journey but never performs the decisive action for the child. A separate versioned cast-participation contract is derived only from the photo registry: the hero receives an active scene, a companion shares several stages, a guide contributes meaningful advice without taking the climax, an ally or supporter performs concrete help, and a guest receives at least one useful moment. The validator counts distinct scenes with explicit actions and enforces physical appearances only for roles that require them; thought, memory or voice can satisfy a guide's meaningful participation without entering the illustration cast. A missing selected participant is therefore a deterministic scenario defect before approval, eligible for the same single bounded repair rather than silently disappearing from the finished book. Generic inhabitants created for the selected world remain separate from this personalized registry. During review, only photographed characters can be assigned through per-scene presence dropdowns; arbitrary names are rejected by the API and generic world presences are preserved when the parent edits the creator cast. The scenario also carries an editorial contract: private personal depth remains implicit while the adventure is understandable to an outside reader; every scene has one distinct narrative function, dominant emotion, emotional shift and observable story change; recurring symbolism is limited to one primary and at most two secondary symbols; and the moral is demonstrated through the child's actions before one concise formulation near the resolution. Calitiki may ask up to three adaptive clarifying questions, then validates chronology, location transitions, passage discovery and crossing, physical versus remembered/thought character presence, one authoritative state for recurring objects, the motivation arc, the selected universe contract and these objective editorial fields. Scenario schema version 2 adds a versioned per-character movement ledger independently from the focal scene transition. Each scene may contain several ordered movement groups with their own origin, destination, travelers and mechanism, while presence phases distinguish the beginning, whole duration and end of the visible scene. The deterministic simulator therefore supports arrivals from several origins, parallel travel, departures, group separation, residents left behind and later reunions; it verifies every traveler's current location before applying the next event and never moves a thought, memory or voice. Persisted version-1 scenarios remain compatible through their legacy transition. Every passage has one stable causal id shared by discovery, crossing and return even when the visible wording changes. Before any paid semantic audit, a deterministic passage precompiler enforces the ordered lifecycle: characters may arrive at a location and then discover its passage as a zero-distance end-of-scene event; a later scene may cross it and a return must reuse the same id. The discovery event never erases or rewrites the arrival movement. Safely inferable discoveries and arrivals are compiled in code without another model call; an unresolved lifecycle stops before the editor instead of entering a repair loop. Genuine choices with no safe inference still return to the creator. A semantic audit rejects a merely decorative universe, an incompatible literal activity or object, a missing safety/communication mechanism, a nonphysical character performing a physical action, instant success without an attempt, a guide solving the climax, a reward unrelated to the child's actions, duplicate-function scenes, passive explanation, exposed sensitive context, symbol accumulation, repeated moralizing or a clearly age-inappropriate level. The visible universe and editorial rules accompany the three-act review. Every creator-facing scenario field uses the authoritative book language; technical role slugs are never exposed. The creator may approve the visible valid scenario directly when all suggested clarification answers remain unchanged. Editing any clarification, scene or presence requires a scenario update first, while a clarification without an answer remains blocking.

   New scenarios contain an authoritative version-2 causal graph produced before visible scene prose. Every plot-critical object has a stable entity id; every discovery, possession change, planting, use, consumption, destruction or transformation has one ordered event id. The model declares each initial state and each state-changing event only once, including the canonical character owner for a possessed state and its quantity. It no longer authors a parallel object lifecycle or per-scene object ledger. Code deterministically carries the graph through every scene and derives both legacy lifecycle compatibility metadata and the complete scene snapshots consumed by validation, the canonical compiler and illustration contracts. A contradictory model-supplied snapshot is ignored instead of triggering another probabilistic repair. Same-name physical copies remain distinct by entity id. Transformations form an acyclic source-to-result chain. A result starts absent, has exactly one producer and cannot appear before that event; a source has at most one terminal outcome and cannot return afterwards. Generic deterministic invariants verify the graph, then an independent narrative editor returns structured scene/entity repair directives to the architect for bounded semantic correction. Structural, editorial and canonical phases share one scenario-wide model-repair budget with a maximum of one paid repair call. If that allowance has already been used, every later unresolved defect fails fast instead of launching a cascading repair; a successful repair must still pass deterministic validation and a fresh final semantic audit before the scenario can be valid. Only a genuine creative ambiguity or a contradiction that remains after this bounded dialogue reaches the parent. Persisted version-1 graphs and scenarios without the graph remain readable under their compatibility paths and are never silently rewritten.

   Narrative model routing is role-specific and uses the Responses API with bounded reasoning: a high-reasoning flagship model acts as scenario architect, an independent flagship call acts as narrative editor, a balanced model plans the whole book, an independent balanced auditor checks the completed plan, and a balanced writer realizes page text. Legacy utility calls remain isolated behind `TEXT_MODEL`. The routes are configurable through environment variables and their effective model names and reasoning levels are logged at server start without customer content. This architecture reserves the expensive flagship editor for the approved scenario while deterministic preflight and the balanced auditor protect the later pre-cover stage.

   Scenario preparation is a durable asynchronous task rather than a long browser request. The authenticated request runs child-safety checks first, then persists a sanitized private request checkpoint and returns a job id without reserving credit. A run first uses the non-claimable `created` staging state while its matching project checkpoint is persisted, then becomes `queued`; this prevents a worker from claiming an incomplete request. PostgreSQL migrations keep that staging state compatible with both existing and newly provisioned orchestration tables. A leased worker executes the architect, deterministic validation, independent editor and final persistence stages while renewing its lease. The browser polls authenticated job metadata, shows those three editorial phases and may be closed safely. The creator may enable the same persisted e-mail preference used for preview generation while preparation is running: the notification checkbox remains interactive even though scenario-editing fields stay locked. An idempotent localized message announces either a scenario ready for review or an interrupted preparation with its exact retry state. E-mail delivery failure never changes the scenario result. The architect, editor and their bounded JSON repair use Responses background mode: each logical call stores only its provider response id, bounded status and timestamps in the private run metadata. A Render restart leaves the project in **scenario generating**; after the lease expires, the new process reclaims the same run from PostgreSQL and retrieves that exact provider response instead of starting another paid reasoning request. Temporary retrieval failures retry only the status lookup. Completion stores the scenario once and removes the duplicated request payload. A bounded technical failure preserves the exact private request, keeps any previous scenario reviewable and exposes one explicit free retry. Operational logs include only run id, project id, stage, duration, bounded error code and provider request id—never the questionnaire, feedback or generated scenario.

   Background execution explicitly keeps `store=false`, but OpenAI temporarily retains response state for roughly ten minutes so asynchronous polling can work. Calitiki does not expose that state publicly, does not persist provider output in orchestration metadata and must disclose this temporary processor-side retention in its production privacy information. Deployments using an OpenAI project with strict data-residency or Zero Data Retention controls must verify background-mode compatibility before activation.
6. Scenario approval starts preview generation and only then reserves the displayed credit. Calitiki prepares the manuscript and scene contracts, then tells the creator explicitly that the cover is being prepared first and must be approved before any interior illustration. The creator may safely close the page and return from **My creations** to that persisted decision. One medium-quality cover is generated as a visual proof; one additional cover proof in the same selected style is included without a second wallet reservation. Only explicit cover approval changes the generation state to interior illustrations. That approval now creates a private versioned visual bible: the approved cover becomes the primary artistic reference for every interior illustration, automatic repair and creator-requested alternative. Original photos remain secondary identity-only evidence and may never redefine the rendering medium, lighting, background or undeclared wardrobe. A categorical rendering-family break receives one bounded regeneration, then enters preserved quality review instead of being silently accepted or discarding the rest of the book. Existing completed previews are not rewritten. The reservation remains reserved during this review, is captured only when the complete preview succeeds and is released after a technical failure.

   The creator's explicit **book language** is a separate canonical property from the interface locale. On a visitor's first new creation, the first supported browser language initializes the storefront, Creator interface and book language together; the localized storefront also passes both language defaults explicitly to the Creator. An explicit storefront or Creator choice, a saved draft and an existing project's persisted language always take precedence afterward, and unsupported browser languages fall back to French. Changing the interface may update the new-book default only until the creator explicitly changes the book-language field; it never rewrites an existing draft or project. The persisted `book_language` choice is authoritative across scenario, blueprint, manuscript, page plan, delivery and narration; a missing legacy alias may fall back only through the documented canonical resolver, never silently to the interface language. Before any image call, deterministic checks require the blueprint language and the dominant reader-visible manuscript language to match that choice. A mismatch is a technical product defect, not a creator modification. New generation stops without spending an image call. A non-purchased legacy or interrupted preview with a proven mismatch exposes one no-charge whole-manuscript repair: Calitiki translates every text page exactly once, reruns child-safety review, recomposes only text assets and the title overlay when needed, and preserves all private photos, approved illustration pixels, quality-review decisions and commerce state. A narrow compatibility rule also covers early previews whose interface fallback was incorrectly persisted into every language field: only a substantial approved scenario with strong evidence for another language may recover the intended language; a foreign title or short phrase alone can never trigger the free repair.
7. The approved scenario remains authoritative for every later narrative agent. Before cover generation, the whole-book planner realizes each approved scene function and emotional shift, removes repeated explanations, praise formulas and moral statements, and repurposes any redundant fixed-length spread into a new action, obstacle, decision, consequence or sensory discovery. It keeps private meaning implicit and uses only the approved symbol ledger. A final bounded audit compares the reader-visible manuscript and illustration contracts with that scenario. It verifies the order of journeys and passage discoveries, the exact physical cast and the nonphysical status of thought, memory and voice characters. A deterministic companion check rejects a named character introduced outside the approved scene and any physical action assigned to a thought, memory or voice presence. Parent relationships remain part of the canonical registry: narration may use the civil name, while the child's dialogue and thoughts use the localized family address such as **Maman**, **Papa**, **Mamá** or **Dad**. The whole-book plan now carries a versioned intermediate speech representation: each direct line or thought declares its canonical speaker, mode and exact words alongside the reader prose. A deterministic narrative compiler normalizes hard linguistic conventions from that structure before audit, remains idempotent and preserves civil names in narration or another adult's dialogue. Saved legacy plans without speaker metadata remain compatible through issue-scoped repair when an auditor identifies the exact scene. Compiler-fixable issues are separated from creative contradictions: a locally proven repair consumes no new planner or auditor call, while only the unresolved creative subset returns to the bounded full-plan repair. That repair updates reader prose and every dependent scene-contract field together. An unresolved contradiction still stops before any image call. The creator's visual choice separates three likeness levels from the artistic medium: **maximum likeness** (photoreal fairy-tale), **illustrated and recognizable** (watercolor, gouache, pastel or ink, recommended), and **clearly cartoon** (soft cartoon 3D or paper cut). Every style card compares an actual output against the same synthetic reference portrait and labels the expected likeness honestly. Legacy style ids remain valid.
   Compiler version 2 extends that legacy compatibility to audits saved before stable issue codes existed. A free-form audit is classified as a family-address defect only when its bounded instruction contains both a canonical parent's civil name and localized preferred address. One unambiguous unattributed quotation may then be normalized; multiple unattributed adult quotations remain unresolved rather than being guessed.
8. Cover identity references combine the full figure with a face-focused crop. After cover approval, interior identity inputs use a face-focused crop that suppresses lower clothing details; the approved cover remains the identity-and-style reference. Image prompts preserve stable facial geometry independently from the selected medium and map every supplied person or animal to one complete separate body. Every neutral recurring-character alias carries an explicit human, non-human animal or plush-toy entity type and preserves the available animal species. Creator-supplied child, family and human-friend roles and sibling/parent relationships are authoritative before any visual-description keyword, so an animal motif or hobby can never turn a human relative into an animal; a genuine non-human companion can never be substituted with a human child. An accidental fusion of identities, exchanged human/animal anatomy, clearly impossible extra or duplicated limbs, a missing required named character, a wrong central actor, or one recurring named identity rendered twice in the same visible instant is an objective blocking defect: bounded regeneration may repair it, but a low-detail cast assertion must first be confirmed by the structured high-detail named-cast arbiter before it can create a customer review. A reflection, portrait, memory, vision or deliberate time montage is exempt only when the structured scene contract explicitly requires it. Ambiguous or uncertain identity assignment, perspective, normally occluded limbs, subjective likeness, broad-style polish, scale, tiny jewelry visibility and minor composition checks remain advisory after their bounded retry so a preference disagreement cannot destroy a whole book. If the original identity pixels trigger a safety rejection before a cover continuity frame exists, generation stops with an actionable request for a clear non-branded portrait rather than silently creating a generic child. After cover approval, an interior safety fallback uses only that approved private cover and a minimal neutral visual contract.
9. The customer receives a low-definition, watermarked preview stored in **My creations**.
10. The customer may purchase an ebook, a printed book, or a future bundle. After buying an eBook, the customer may separately purchase AI narration with a chosen voice and narration style.
11. After ebook payment, the unwatermarked PDF is available in the customer library and by a secure email link.
12. After print payment, high-definition production starts. The production range and shipping range are shown before payment and snapshotted on the order.

## Wardrobe continuity

- At the private character-photo step, each human reference may keep the generic unbranded clothing visible in the photo, accept the recommended universe outfit, or choose one of three curated examples. This choice never changes the face, body identity or role.
- Universe outfit catalogs are deterministic product configuration, not free-form model invention. They include physically appropriate protection already required by the universe contract, such as a stable breathing mechanism underwater or a protected suit in open space.
- The approved scenario owns a versioned wardrobe plan. It names the active outfit and the scene where it becomes visible. When the adventure begins outside its universe, any clothing change happens before entry or crossing and remains stable afterward.
- Cover and page prompts carry a per-scene wardrobe lock. A cover may preview the adventure outfit while earlier home scenes still use the photo outfit; the cover continuity reference cannot overwrite this declared state.
- Human wardrobe rules never apply to animals or plush toys. Legacy projects without an explicit wardrobe decision preserve their reference-photo clothing and keep their existing preview fingerprint.
- Every visible human's active per-scene wardrobe lock also enters the existing scene-fidelity QA contract. That same already-budgeted vision call may reject only a gross state contradiction—such as casual clothes instead of the required space suit, protective suit, exploration uniform or sleepwear—not an approximate shade, hidden seam, small accessory, harmless simplification or removed brand mark. A confirmed mismatch is quarantined before it can become an adjacent-scene reference and receives the existing one-shot targeted image edit. This applies to future generations only and never scans or regenerates an existing book automatically.

## Recurring-object identity and lifecycle

- Every plot object declares one spatial contract independently from its lifecycle. A `portable` object follows its canonical owner and may change location only through an explicit causal event. A `location_bound` fixture owns one canonical home location: it is visible when the focal scene is at that location and absent from scenes elsewhere without being retrieved, carried, installed again or destroyed. Returning to the home location reveals the same fixture in its latest canonical state. This distinction is compiled deterministically into NarrativeBookSpec and remains model-independent.
- Repeated work on the same object is represented by bounded monotonic progress (`progressTotal` plus ordered `progressStep` events), not by repeating an acquisition, discovery, placement or installation. Progress may advance while the coarse state remains unchanged, can never decrease or exceed its declared total, and is projected by code into every scene snapshot.
- A recurring physical object is not identified by its display name alone. When several characters each own an identically named object or safety mechanism, the owner distinguishes the copies; when only one copy exists, it remains the same object even if it is explicitly handed to another physically present character.
- Owner-specific universe safety equipment follows deterministic product configuration rather than model improvisation. Each copy is absent before introduction, prepared and activated in a physical scene before entry into the relevant adventure zone, kept active for its owner while required, and stored after exit.
- The scenarist still describes these events naturally, but the scenario stabilizer repairs invisible object metadata and adds the minimal localized preparation sentence when the required mechanism was omitted. This repair happens before creator review and never asks the creator to correct every scene individually.
- Lifecycle metadata distinguishes the actual introduction event from later preservation: only the event scene may be labelled as the first physical appearance. A later scene always preserves the already established state.
- Scenario-validation summaries are versioned and retain a bounded creator-safe explanation from the semantic editor for each rejected scene, while internal prompts and private questionnaire text remain hidden.
- A legacy scenario is automatically revalidated without another AI call only when every rejected scene matches the former repeated-first-appearance metadata defect and every current deterministic invariant passes; unrelated or genuine semantic failures remain blocked.
- Object-state validation uses the stable instance identity, continues to reject two simultaneous states for the same copy, rejects an ambiguous owner when several copies exist, and preserves ordinary transferred objects and unrelated matching accessories.
- A plot object that can be discovered, planted, installed, consumed, transformed, destroyed or used up owns a versioned causal lifecycle. Its exact state is propagated through every approved scene: it remains absent before introduction, stays planted after planting, and can never reappear intact after a terminal event unless an explicit compatible retrieval was planned.
- Transformations link the source object to a named result. The result remains absent until the transformation scene, while the source becomes irreversibly transformed. A deterministic multilingual inference layer repairs this metadata before creator review when the scenarist described the event naturally but omitted the structured lifecycle.
- The scenario controller rejects an unearned or immediate transformation, a result visible before its cause, a planted or consumed object held again, and any undeclared second copy. The whole-book audit repeats the same invariant against reader-visible prose so a later writing pass cannot reintroduce the object.

## Ownership boundaries

- WooCommerce: account, authentication source, cart, checkout, payment, order, subscription, transactional email trigger.
- Storybook service: draft, project, photos, blueprint, previews, print assets, ebook, credit ledger, access-code redemption, child profile, series memory.
- The WooCommerce bridge will issue a short-lived HMAC-signed customer token. The Storybook service never stores WooCommerce passwords.

## Internal production-cost control

- Every OpenAI response that exposes billable usage inside a persisted book workflow is attributed to the private project, generation run, stage, model and attempt category. Amounts are stored as integer millionths of a US dollar and rounded only for the internal display.
- Normal manufacture, technical retries, quality repairs and customer-requested changes remain distinguishable. A missing or unknown price never becomes a silent estimate: the recorded event is marked incomplete and the internal total is labelled partial.
- The versioned application pricing table is an operational calculation layer, not accounting authority. It must be updated when OpenAI pricing or model routing changes and may later be reconciled against the provider usage/cost export. Successful paid Speech generation is attributed to its originating book and order one scene at a time. Because the Speech endpoint returns binary audio without a provider `usage` object, Calitiki measures the real MP3 duration, derives the published `gpt-4o-mini-tts` audio-token equivalent and marks those rows as estimated (`~`). Cached customer-requested samples are not assigned to a book, while scenes already present in a narration checkpoint produce neither another Speech call nor another ledger event.
- The durable ledger stores numeric usage metadata only. It never stores questionnaire answers, prompts, manuscript text, photos, illustrations or generated output. Its rows intentionally survive customer project deletion so aggregate economics remain measurable without retaining the deleted creative content.
- Cost data is strictly confidential to Calitiki. It is never returned by customer creation, preview, credit, checkout or reader APIs and never appears in **My creations Calitiki**. The only product UI is a WooCommerce administration screen protected by `manage_woocommerce`; WordPress obtains its data server-to-server through a short-lived HMAC-signed internal endpoint with private no-store headers.
- The first pricing snapshot is `openai-standard-2026-07-30`. The non-retroactive `openai-standard-2026-07-30-luna-reduction` snapshot applies OpenAI's announced 80% Luna reduction and 20% Terra reduction to events recorded after the application update; historical ledger rows keep their original price version. Snapshot `openai-standard-2026-08-10-tts-duration` adds the official `gpt-4o-mini-tts` text/audio token rates and transparent duration-based Speech attribution. Deploying the cost-ledger foundation requires database migration `013_openai_cost_ledger.sql`; narration visibility in the WooCommerce-only report requires Calitiki Bridge `0.7.6`. It introduces no customer-visible cost or price.

## Public positioning and trust

- Calitiki is presented first as a way for an adult to turn something they would like to transmit to a child into an adventure in which the child is the hero. Personalization technology, universes and formats support that promise; they are not the homepage's primary message.
- The public journey must use concrete before-and-after examples: an adult intention or family situation, the corresponding adventure, and what the child discovers through action. Examples invite creation without claiming a therapeutic result.
- The homepage explains the method before the catalog: describe the situation, choose an approach, validate the scenario, then discover the book. The creator remains in control of the scenario and visual proof.
- AI assistance is disclosed clearly and calmly wherever it matters. Text, images and optional synthetic narration are AI-generated under the creator's choices and validation; disclosure must remain understandable without disrupting the fictional experience.
- Customer photos, answers and books are private assets and are never made public by Calitiki. Public copy must link to the applicable privacy information and must not promise stronger guarantees than the implemented authenticated or signed access controls.
- Optional AI narration is positioned as a separate paid way to listen to an already purchased eBook, with a voice and narration style chosen by the customer.
- Every creator step exposes an easy authenticated return to **My creations Calitiki**, so a customer can close the browser, follow an email, buy credits or resume a persisted decision without losing the project.

## Series rules

- A `child_profile` contains the stable identity selected by the parent.
- A `series` contains its world, characters, approved continuity facts, and current progression.
- A `book_project` may be standalone or reference a series and episode number.
- Every episode has its own beginning, obstacle, resolution, and moral.
- A project stores a frozen continuity snapshot so later profile edits cannot change an old book.
- A preview becomes series canon only after explicit validation or purchase.
- A paid eBook creation exposes **Create a new adventure** in WooCommerce My Account. The action authenticates through the signed bridge and creates the next editable episode without an AI call or wallet debit.
- The new episode copies the questionnaire, configuration and private character-photo references. The customer may change the new obstacle, dream, roles, cast or photos before requesting a separately priced preview.
- Repeating the action for the same source book is idempotent: it reopens the existing unfinished next episode instead of creating duplicates.

## Future product line: preteen adventures

- The launch product remains focused on younger children and must not silently stretch the same picture-book experience to every age.
- A distinct **Calitiki Aventure** line may later serve approximately ages 10–13 after dedicated customer testing. It is a separate product evolution, not part of the current launch scope.
- This line should favor a graphic-novel, illustrated-novella or interactive-adventure format, with more mature visual direction, subtler personalization and a message experienced through the protagonist's choices rather than stated as an adult lesson.
- The preteen protagonist retains strong agency; parents and guides may support but do not solve the conflict. Any educational or emotional intention remains indirect, respectful and non-diagnostic.
- The existing scenario, continuity, privacy and character-consistency foundations may be reused, but page composition, writing tone, visual examples, age positioning and commerce packaging require their own validation before release.

## Post-preview experience and credit wallet

- From **My creations**, an authenticated owner may permanently delete a creation that has no currently paid book purchase and has never entered series canon. The action requires an explicit irreversible confirmation and is refused while a generation job is actively progressing. Deletion releases any still-reserved preview credit, removes project-bound rebates/reservations, preserves the append-only wallet history, deletes private preview assets and only deletes reference photos that no other project uses. A paid eBook or print order and approved series canon remain protected. A cancelled, failed or refunded order is retained as immutable commerce history but no longer makes the private creation look purchased or prevents its customer-facing deletion: the project row is retained only as a tombstoned foreign-key anchor. The persistent deletion receipt is an immediate authoritative tombstone, so customer reads and listings exclude the project as soon as the receipt commits while private-object cleanup runs in the durable background queue.
- After a successful preview, the questionnaire and generation controls are replaced by one action center directly below the book reader. The original preview is immutable and a second generation can never be triggered accidentally.
- The connected creator header shows the current wallet balance at every step. Immediately before preview, a separate confirmation button displays the exact amount that will be used; promotion codes remain available before that decision. The WooCommerce **My account** area shows the same balance, recent ledger history and a **Buy credits** action.
- The post-preview action center shows the remaining credit balance, **Request a change**, **Regenerate**, **Buy the eBook**, **Buy the printed book**, and **Buy credits**. Production and delivery estimates are shown beside the printed-book action before checkout.
- Preview credit is stored as a euro-cent wallet. The configured preview prices are **EUR 2.50 / 3.00 / 3.50 / 4.00 / 4.50 / 5.00 including tax** for 24 / 28 / 32 / 36 / 40 / 44 pages. The amount is snapshotted on reservation.
- A Render restart or lost background job is an infrastructure interruption, not a consumed customer attempt. The persisted checkpoint must remain eligible for a free idempotent resume even when a previous technical retry had already started.
- Promotion codes have a configurable euro-cent value of EUR 2.50 or more. A campaign code may be redeemed once per WooCommerce customer; an individual code can use the same mechanism with a single intended customer. If the code does not cover the selected preview, the missing wallet credit must be purchased before generation.
- Every successful preview consumes its reserved wallet amount and creates an equal purchase rebate tied to that book project. Multiple previews remain possible while the wallet is funded; their successful charges accumulate as purchase rebate for that project only. A targeted modification creates a new revision and must quote the affected spreads before reservation.
- A targeted modification is available only for a completed, unpurchased preview and one narrative double-page at a time. Its fixed tax-inclusive wallet prices are **EUR 0.50 for text**, **EUR 1.00 for one illustration**, and **EUR 1.50 for both**. The creator sees the selected page numbers, exact price, wallet balance and any missing amount before confirming. The request may improve local wording or visual treatment but may not silently change approved chronology, physical cast, location, object state or a major story event; those changes require a new full preview. A deterministic preflight recognizes a request to add a canonical character absent from the approved scene or a new family/person/animal character absent from the scenario. It refuses that local request before creating a revision or reserving credit, explains that the character must first be added through a new full scenario, and also closes the paid retry path for legacy incompatible requests. A modification cannot start while a project checkout reservation is active.
- The current preview remains buyable and immutable while the targeted candidate is generated in a separate private revision. Checkout is blocked only while that candidate is generating or awaiting a decision. A successful candidate captures its reservation once and adds the same project purchase rebate as any other successful preview spend. The creator must explicitly apply it before it becomes the current buyable revision, or reject it to preserve the prior revision. A technical failure releases the reservation and the same request can be resumed idempotently without a second debit.
- When a technical failure released the original wallet reservation, a later successful idempotent retry settles that same reservation exactly once: it reapplies the original preview debit and creates the equal project rebate. A legacy completed-but-unpurchased preview is reconciled before checkout. An already purchased project is never changed automatically, because its paid WooCommerce order and any coupon already used remain authoritative.
- Credits are purchased through WooCommerce products. A signed paid-order webhook grants append-only entries in the Storybook credit ledger.
- A credit purchase launched from the creator keeps a bounded project-and-surface context through the WooCommerce product, cart and order. Product, cart and checkout expose a reassuring signed return action; the order confirmation distinguishes credited, synchronizing, pending, failed and cancelled outcomes. Returning reauthenticates through the existing bridge, restores the exact owned project, reopens preview authorization, the completed-book action center or the targeted-modification panel, and refreshes the wallet without automatically spending credit or starting generation.
- Credits may also be applied to an eBook or printed-book checkout at their snapshotted monetary value. The Storybook service reserves the selected balance and issues a short-lived signed credit application to WooCommerce; WooCommerce applies it as an order discount and collects any remainder by its configured payment methods. A paid/cancelled/refunded webhook captures or releases the reservation.
- WooCommerce remains authoritative for tax, invoice, refund and payment presentation. Storybook remains authoritative for available, reserved and spent credit ledger entries. Every grant, reservation, capture, release and checkout conversion is idempotent and auditable.
- A text or illustration correction never overwrites a purchased or explicitly approved revision. Series canon changes only when the customer approves or purchases the new revision.

## Delivery phases

1. Persistent draft foundation: PostgreSQL schema, anonymous ownership, draft API, local autosave, and Woo identity contract.
2. Account gate and **My creations**: claim anonymous draft after login and list customer projects. **Implemented:** previews that are generating, interrupted or ready appear beside purchased books through a signed metadata-only bridge. Creations without a currently paid book purchase can be permanently deleted through a signed, confirmed and idempotent owner-only workflow; paid books and series canon remain protected, while cancelled/refunded order history is retained behind an invisible deletion tombstone.
3. Preview entitlements: credit ledger, per-customer promotion codes, reservation/capture/release, project purchase rebate, idempotent retry. **Core implementation present behind `PREVIEW_ENTITLEMENTS_ENABLED`; WooCommerce paid credit fulfillment remains phase 4.**
4. WooCommerce checkout: credit products, configuration token, partial credit application, order metadata, signed webhooks, and payment-triggered finalization. **Paid credit products, signed wallet grants, project-bound eBook/print cart creation, preview-rebate reservation and paid/cancelled/refunded settlement are implemented. Applying unused wallet balance beyond the project preview rebate and production fulfillment remain.**
5. Fulfillment: secure ebook links, print-ready files, editable production rules, delivery estimate snapshots. **Paid eBook fulfillment, private S3-compatible storage, expiring download links, retryable WooCommerce notification and the purchased eBook account view are implemented; production storage credentials must be configured. Print production remains.**
6. Series experience: **foundation implemented** with purchased-book canon, child profiles, approved memory, private character reuse and an idempotent editable next-episode draft. A richer episode planner and series library remain.
7. Subscription: recurring credits and family plans after the series value is visible.

## Narrative Pipeline V2 direction

The legacy pre-cover chain has reached its architectural limit: the approved
scenario, blueprint, manuscript, speech metadata and illustration contracts
repeat mechanical facts, while successive probabilistic audits may disagree
about an unchanged scene. New local repair variants are frozen as a product
direction. Existing books remain readable and are not migrated silently.

V2 introduces one immutable, versioned `NarrativeBookSpec` compiled
deterministically from the exact approved scenario. It is the sole downstream
authority for canonical characters and family addresses, locations, ordered
movement, physical versus nonphysical presence, passage discovery and crossing,
object identity/state/quantity/ownership, page binding and the exact visible
illustration moment. Prose and image models may realize that contract creatively
but may not restate or change its mechanical fields. The illustration contract
is compiled by code from physical presences and object snapshots rather than
authored by the planner.

Each canonical illustration now targets one explicit scene phase (`start`,
`during` or `end`). Its visible cast is derived only from physical presences at
that phase, while ordered movements independently prove every declared physical
location. Object causal events carry complete before/after state, owner and
quantity values; a silent ownership or quantity change is rejected even when
the coarse object state is unchanged. The JSON Schema is executed in automated
tests rather than treated only as documentation. Protective-education specs
must reference the immutable `body_safety_v1` contract, while ordinary stories
must not carry a stray body-safety reference.

Child Safety remains an independent repeated gate at intention, suggestions,
scenario creation and approval, preview authorization, generated manuscript and
paid modification boundaries. An enforced support/refusal decision stops before
canonical compilation. Allowed protective-education and sensitivity contracts
are referenced immutably by sanitized id, version and digest; submitted family
wording and classifier rationale are never copied into the canonical artifact.

Deterministic validation owns cast, presence, movement, passage and object
continuity. Semantic AI review is bounded to literary meaning, age fit, subtlety
and sensitive treatment; it cannot override mechanical truth. Audit evidence is
cached by artifact digest, validator version and policy version. An unchanged
artifact is never re-audited, and a local repair invalidates only the affected
scene artifacts rather than restarting whole-book review.

Delivery is side by side: contract and invariant tests first, then a pure
approved-scenario compiler, shadow comparison on new scenarios, V2 prose and
image compilers, a tester-only rollout, and finally production activation after
the documented reliability and cost gates pass. No production feature flag is
introduced by the contract-foundation brick. The normative design is
`docs/narrative-pipeline-v2.md`; the machine-readable contract is
`src/contracts/narrativeBookSpec.v1.schema.json`.

The pure compiler brick is implemented behind tests only. It requires the exact
approved-scenario audit, movement ledger v1 and a supported causal graph v1 or v2; derives stable
registries, format page bindings, one explicit visible phase and a complete
per-scene object ledger; and returns only after deterministic NarrativeBookSpec
validation. It performs no AI, network, persistence, route, credit or
customer-flow operation. Transformations are projected into linked
source/result causal events without asking a model to guess. Character
registries resolve both a stable model id and the approved display name to one
canonical id, while ambiguous aliases still fail closed. A `return_travel`
reversing a previously approved ordinary route with the same endpoints and
mechanism is normalized to `ordinary_travel`; only a true discovered/crossed
passage keeps canonical passage-return semantics. Free-form object ownership is
projected to `ownerCharacterId` only when it resolves to a declared character.
An unresolved place, group or contextual attribution is removed from
non-possession states, while `held`, `carried` and `worn` still require exactly
one canonical character owner and fail closed otherwise. Shadow compilation
is implemented as a separate disabled-by-default phase and cannot affect legacy
generation outcomes. `NARRATIVE_V2_SHADOW_MODE=observe` still requires an exact
project id in `NARRATIVE_V2_SHADOW_PROJECT_IDS`; an eligible approved scenario
is compiled privately and any failure stores only bounded issue codes and schema
paths. A separate explicit local command compares a chosen subset of Sol, Terra
and Luna on synthetic fixtures only, so customer books never receive duplicate
benchmark calls. A cheaper model may replace a production role only after
semantic quality, deterministic compilation and cost gates pass. Benchmark
report version 2 measures provider
execution, scenario validity and canonical compilation separately, preserves
the other model result after one variant fails and never emits generated prose
or diagnostic explanations. Its six-case FR/ES/EN synthetic corpus covers
simple narrative, object lifecycle, passage return, staggered physical and
memory presence, prudent level-3 treatment and protective education. Paid runs
require both an explicit single-fixture choice or full-corpus acknowledgement
and an explicit `sol`, `terra`, `luna` or `all` variant choice. The CLI rejects
every unknown, misspelled, duplicated or contradictory option before a provider
call and prints the exact paid-run count before execution.

Compiler version 2 removes three remaining probabilistic dependencies from the
fresh-scenario gate. For causal graph v2, the graph alone determines every
per-scene object state, quantity and owner; contradictory model snapshots are
ignored. Physical presence locations are admitted into the canonical location
registry, and a scene whose physical cast exists only at the beginning compiles
an explicit `start` illustration phase instead of inventing an end-of-scene
cast. A missing presence action inherits the already approved scene action.
These are lossless mechanical projections and therefore consume no repair call.
If the bounded gate still cannot compile, the run stores only capped issue codes,
schema paths, scene numbers and whether its repair/audit allowances ran. It never
persists generated prose or customer wording in diagnostics, remains freely
retryable and never exposes hidden compiler mechanics as red creator cards.

Canonical passage failures preserve the concrete path of the first crossing
rather than collapsing the defect into a global registry error. The generic
scenario controller consumes that structured diagnostic, finds a safe earlier
scene at the crossing origin, records discovery without traversal and aligns the
stable passage id on the later crossing. If an earlier discovery already exists
under the same approved mechanism wording, only the invisible ids are aligned.
Unrelated character movements and creator choices remain untouched. Scenario
retry policy version 2 grants one bounded creator-free recovery to projects that
exhausted their earlier attempts before this invariant was available.

Fresh V2 scenario approval now promotes the successfully gated candidate into
one immutable private NarrativeBookSpec. Its semantic evidence is sealed against
the exact artifact digest and preview authorization fails closed if that contract
is missing, invalid or belongs to another scenario. Manuscript generation receives
one compact shared registry plus only the canonical contract of each requested
scene. It no longer needs the full mutable scenario in every act prompt. Existing
approved projects without the V2 activation marker continue on the legacy path.

The same activated V2 contract now compiles every interior illustration contract
without a second whole-book narrative-planning call. Visible cast, focal action,
object quantity/state, passage/location context and forbidden elements come from
the sealed registries and scene ledger. Visual QA uses an explicit severity split:
technical corruption, identity fusion/duplication, missing required cast, wrong
focal action and object-state contradictions remain blocking; aesthetic, minor
accessory, wardrobe and ambiguous likeness/style findings cannot destroy a complete
book. A standalone likeness warning is advisory on the first coherent image and
does not buy a second low-yield generation; objective substitution, fusion,
duplication and cast failures remain on the blocking scene/technical path. The cover remains creator-approved
visual evidence and the legacy planner remains available for pre-V2 projects.

An internal economic governor reads only the private attributed cost ledger. Before
each interior image it also reserves the configured estimated cost of every required
image still missing plus the contemplated optional retry. The private stretch target
is `$1.50`, the soft target is `$2.00` and the completion-first threshold is `$3.00`;
all are configurable without changing customer prices. Crossing or projecting a threshold never blocks
the creator and never suppresses Child Safety, mandatory pages or objective
mechanical repair. It suppresses only optional retries for style, uncertain
likeness, wardrobe and composition preferences. Customer APIs and WordPress cards
receive neither raw cost nor governor mode.

Narrative V2 rollout is assigned once per project at scenario approval and stored
with that project. `NARRATIVE_V2_ROLLOUT_MODE=off` is the safe default;
`canary` uses a stable hash bucket and `NARRATIVE_V2_ROLLOUT_PERCENT`; `on` enrolls
all newly approved projects. Changing Render variables never moves a project that
already started between legacy and V2. Emergency rollback therefore affects only
new assignments and cannot invalidate a book in progress. Recommended production
progression is `off`, then a small canary, then 50%, then `on`, with completion,
quality-review and private cost metrics reviewed at each step.

## Current implementation checkpoint

- Calitiki Bridge 0.6.0 adds **Create a new adventure** to every paid eBook in **My creations**. The Storybook service creates or reuses the series and child profile, marks the purchased source as episode 1, freezes its continuity memory, and opens episode 2 with the original questionnaire, book choices and authenticated private reference photos. No generation begins until the customer edits the draft, reviews it and explicitly confirms a new preview debit.
- Calitiki Bridge 0.6.1 turns **My creations Calitiki** into the customer library for paid previews as well as purchased books. A fresh HMAC-signed server-to-server request returns only project id, title, lifecycle status, page count, locale, update time and retry availability; questionnaires, photos, prompts and private asset URLs never leave the Storybook service. Purchased order cards remain authoritative for PDF delivery and are deduplicated from preview cards.
- Calitiki Bridge 0.6.2 exposes projects whose scenario needs clarification or approval in **My creations Calitiki**. Closing the creator does not lose the work: **Vérifier le scénario** reauthenticates the customer and restores the persisted review screen. The approved scenario is fingerprinted against the current questionnaire and configuration; any later edit requires a new approval before generation.
- Calitiki Bridge 0.6.3 adds **Supprimer définitivement** only to non-purchased project cards. A WordPress nonce, browser confirmation, fresh signed server-to-server request and Node ownership check protect the action. Active generation, any commerce order and approved series continuity each block deletion; project-specific assets and entitlements are cleaned idempotently while shared photos and wallet history remain.
- Calitiki Bridge 0.6.4 makes deletion-result notices independent from WooCommerce's frontend notice session. The `admin-post.php` handler stores only a bounded status in a short-lived customer transient, redirects safely, then renders the localized success or refusal inside **My creations**. It never calls `wc_add_notice()` from the admin-post context.
- Calitiki Bridge 0.6.5 treats `cleanup_pending` as a completed customer action with secondary technical work, not as a customer error. The account confirms that the creation is removed, remaining files stay private while Calitiki finalizes deletion, and no customer action is required; genuine refusals remain red errors.
- Calitiki Bridge 0.6.6 accompanies a durable automatic cleanup worker. A failed private-object deletion is leased from PostgreSQL, retried with bounded exponential delays, and marked complete without customer intervention. After the configured maximum, the receipt becomes `manual_review` and Render logs the project id plus the bounded storage error for Calitiki; the customer project remains deleted and its remaining assets remain private. The worker starts with the service and also resumes receipts created before deployment.
- Calitiki Bridge 0.6.7 makes deletion non-blocking end to end. Node returns `202 Accepted` immediately after the durable tombstone is committed, the WordPress card disappears without waiting for S3, and the worker owns every physical-file attempt. Historical rows that coexist with a deletion receipt are excluded defensively from project reads and customer listings. Legacy PostgreSQL `photo_refs` values are normalized whether they are arrays, object maps or nested wrappers, so a historical row cannot abort deletion while shared private photos remain protected. WordPress distinguishes an expired confirmation, a connection failure and a server refusal, while Render logs the project id plus a bounded unexpected error instead of collapsing every failure into one generic message.
- Calitiki Bridge 0.6.8 preserves a creator-originated credit purchase through the WooCommerce session, cart item and private order metadata. A signed **Return to my book** action remains available before checkout completion and on the order confirmation. The generator restores the originating project and credit surface, displays a localized payment outcome, refreshes the wallet immediately and briefly monitors a still-synchronizing paid-order webhook. No return path starts generation or consumes credit.
- Calitiki Bridge 0.7.2 makes WooCommerce’s current paid-order set the retroactive purchase authority for the customer library. The server-to-server creation listing and deletion request carry the complete, sorted project-id snapshot inside their HMAC signature. Render revokes only stale paid commerce rows absent from that authoritative snapshot, restores the affected project to its preview lifecycle and retains the old order row as auditable non-paid history. A complete WooCommerce snapshot is mandatory for reconciliation: if the order query is unavailable, the Bridge falls back to the older read-only request and Render removes no purchase protection.
- Scenario review now applies the authoritative book-language directive to all generated creator-facing values and hides raw page-plan role slugs. A valid visible scenario can be approved immediately with its unchanged suggested clarification answers; the server records those accepted defaults and clears the pending questions atomically. Any creator edit still requires an explicit scenario update, and unanswered clarifications remain blocking.
- Scenario validity now has one authoritative semantic checkpoint. When the editor requests a causal repair, the repaired candidate must pass a final editor audit before the parent can see it as valid. The server stores a versioned digest of the exact audited narrative content; unchanged approval reuses that evidence instead of paying for or exposing a later, potentially different audit. Any narrative change invalidates the digest and returns through the audited revision flow. Object-lifecycle review distinguishes identity, existence, possession and plot-critical irreversible events from ordinary reversible properties: explicit partial wording such as “un poco”, “sigue cerrada”, “un peu”, “reste fermé”, “a little” or “still closed” cannot be promoted into a completed opening, release or transformation.
- Scenario validation is deterministic rather than left only to prompt wording. Each page-plan scene declares its predecessor and prerequisites, location before and after any transition, discovered/crossed passages, physical or nonphysical character presence, and exactly one state for every tracked personal object. A guide appearing only as a thought or memory is excluded from the illustration cast, and a wearable declared as held cannot also be rendered as worn.
- Scenario revision is a visibly blocking operation: the creator sees progress, cannot submit a duplicate request, and keeps the previous validated scenario plus unsent feedback if the update fails. A generated candidate that fails any deterministic, canonical or independent semantic check remains quarantined and is never persisted as the creator-facing Act 1/2/3 proposal. Without a prior validated scenario the customer stays on the saved preparation state and receives one free technical retry; with a prior validated scenario that exact proposal remains visible. Rejected replacement diagnostics stay private and are never mixed into the preserved scenario. Invisible structural metadata is stabilized deterministically before validation. A physical presence inherits the scene's canonical location string while the independent traveler-state check continues to reject real teleportation.
- A reviewable invalid scenario may offer a dedicated **Repair automatically** action when the diagnostics describe a technical contradiction and no creator clarification is pending. The server recomputes deterministic plus stored semantic findings, creates a private structured repair plan and permits exactly one targeted `story_repair` call. It then requires a fresh deterministic validation, independent editor audit and canonical compilation with no secondary repair loop. Success atomically replaces the proposal; any rejection, timeout or compiler failure preserves the exact previous scenario, disables automatic technical retry and consumes no customer credit. Child-safety enforcement remains unchanged, and genuine creative choices always stay with the parent.
- An inconclusive automatic repair is a durable terminal state, not another invitation to retry. The project stores only a creator-safe category and the affected scene numbers; the browser replaces the repair action with a localized explanation and a manual-update path, while the API rejects every repeated automatic request until a creator-authored revision creates a new scenario generation. Older failed projects without the new summary receive an honest generic fallback. This prevents both customer confusion and repeated paid model calls.
- Initial scenario preparation is visually distinct from revision. Before the first validated proposal exists, the creator sees only a three-step preparation state derived from the questionnaire and photo-cast registry; empty feedback and approval controls remain hidden. The wording never claims to be checking a creator modification at this stage. A failed or internally rejected first candidate remains on that preparation screen, confirms that the work is saved and offers an explicit free retry; an unvalidated provisional scenario is never displayed.
- Scenario character presence is creator-controlled rather than inferred only from prose feedback. Every scene always distinguishes physically present characters from characters evoked by thought, memory or voice. The creator assigns one explicit per-scene mode—physical, thought, memory, voice or absent—to characters already prepared in the private photo registry. A new personalized person cannot be typed into the scenario review; their photo, name, relationship and narrative role must first be prepared through a new-book flow. Those selections are deterministic constraints reapplied after model generation; nonphysical characters never enter the illustration cast or transition traveler list, while untouched generic world inhabitants are preserved. Only browser fields actually changed by the creator become authoritative scene edits, so an untouched displayed action cannot accidentally cancel a general revision request. Any unsaved scenario change blocks approval until the updated scenario is persisted and validated.
- Visual style selection now uses seven real, comparable examples derived from one synthetic child reference. Desktop hover or keyboard focus reveals the reference portrait; mobile exposes an explicit **View reference photo** control. The former **Gentle 3D** is labelled **Soft cartoon 3D** so parents understand that it intentionally interprets facial traits. Scenario approval and creator-added characters are unchanged. Generation checkpoints persist the visual-proof decision, so closing the browser while the cover awaits approval is safe and the existing **My creations** `preview_generating` card reopens it without a Bridge version change.
- The creation funnel now starts with six universe cards derived from that same synthetic child reference. After the four essential child answers, a dedicated no-credit inspiration call returns exactly one teamwork, one discovery and one creation proposal. The chosen seed remains editable but is persisted as an explicit narrative constraint. Every universe defines a server-owned causal contract; deterministic validation plus a whole-scenario semantic audit enforce entry, travel, safety, communication, physical presence and object compatibility before scenario approval.

- The generator, low-definition preview, ebook PDF, print finalization, multilingual book output, visual styles, page counts, and book reader exist.
- The installable interactive reader under `/interactive-reader/` now accepts either its public demonstration manifest or an authenticated `?project=<id>` book. A completed preview is converted without AI calls into a private manifest containing its cover, opening text, correctly paired narrative spreads and closing moral. The manifest, every illustration and every purchased narration file remain authenticated and `no-store`; the service worker never caches `/api/` responses. Without the paid option, the reader keeps using the free voice installed on the customer device.
- Paid books created before raw illustration assets were stored privately can reuse their already-private composed illustration pages in the interactive reader. This compatibility path never calls image generation and never spends credits.
- Anonymous questionnaire choices are restored from browser storage, and a server-side project is created before preview generation.
- The project store uses PostgreSQL when `DATABASE_URL` is configured and a local JSON fallback during development.
- Anonymous projects can be claimed and listed through the signed WooCommerce customer-token contract.
- The installable `wordpress/calitiki-bridge` plugin sends logged-in customers back from WooCommerce with a five-minute HMAC identity token. The generator exchanges it for its own HTTP-only customer session and resumes the saved preview request.
- Preview generation requires an authenticated customer-owned project. The preview credit/code gate is implemented behind `PREVIEW_ENTITLEMENTS_ENABLED`; private object storage and the customer-library UI remain for later phases.
- Personalized eBook and print products can no longer be added directly to the cart. Their product pages lead to the creator; only a short-lived signed link issued after a completed preview can select the matching page-count variation and attach the project to the WooCommerce cart.
- Successful preview spend is reserved as a project rebate when checkout starts, deducted from the configured book line, captured on payment, and released after cancellation, failure or refund.
- Preview spending requires a distinct customer confirmation after authentication and after wallet/code choices are displayed. The creator header exposes the live balance, and Calitiki Bridge 0.4.0 adds a signed wallet/history page to WooCommerce My account.
- The WordPress theme is prepared for TranslatePress with an accessible flag-and-language dropdown. Active languages keep the same page context, and links to the external Creator carry the selected FR/ES/EN interface and new-book language explicitly. TranslatePress Multiple Languages is required to publish all three languages simultaneously.
- The storefront is mobile-first: on a visitor's first visit the browser language selects an available TranslatePress language, while an explicit language choice is remembered and takes precedence afterward. The mobile navigation must cover the page instead of being clipped by it, and WooCommerce account navigation scrolls the requested account panel into view on small screens.
- Long passages in the interactive reader keep the customer's selected typography and scroll directly inside the text card; no separate “read more” expansion step is required.
- The interactive reader is installable from iPhone and compatible browsers only after a private customer book has loaded successfully. Its per-book manifest carries the non-secret project id in the installed start URL, because iPhone Home Screen apps may not share Safari storage. It also remembers only that project id on the device, never private assets or credentials. An expired private session uses the existing signed WooCommerce bridge to reauthenticate and return to the same book. The public demonstration cannot be installed, iPhone installation guidance is visible in the reader, and service-worker upgrades reload the app automatically.
- The launch offer is presented as one **Calitiki digital pack**: the downloadable PDF and the private interactive reader are included in the same eBook purchase. Calitiki Bridge 0.5.6 independently keeps the printed WooCommerce product non-purchasable by default, labels it **Coming soon** in the catalog, and blocks direct or signed checkout attempts. It can later be enabled from WooCommerce > Calitiki Bridge when the print supplier is ready; Render's `PRINT_BOOK_ENABLED` flag must be enabled at the same time.
- The external creator header provides a localized return to Calitiki. It remembers a trusted Calitiki referrer path without retaining query parameters or commerce authentication tokens, and otherwise falls back to the FR, ES or EN storefront home.
- A paid personalized eBook order now creates one idempotent commerce record, generates the low-definition unwatermarked PDF, stores it in a private S3-compatible bucket and returns an expiring signed link. WooCommerce sends a separate localized “eBook ready” email and exposes a fresh link under **My creations Calitiki**. Processing/completed orders with a zero total after coupons follow the exact same paid flow; failed callbacks are retried with WP-Cron, and refunded deliveries are revoked.
- Purchased cards in **My creations Calitiki** use the authoritative project/cover title instead of the generic WooCommerce variation name. Existing orders resolve it from the authenticated Storybook creation library; new order items also retain a private stable title metadata fallback.
- Purchase protection is reconciled against current paid WooCommerce book orders instead of trusting a historical `purchased` project status. A cancelled, failed or refunded last book order restores the project to its preview state; an older inconsistent project with no paid order is exposed as deletable. Deletion keeps non-paid order history as a tombstoned database anchor but removes the creation and its private assets from the customer library. If a legacy preview points to expired Render-local assets, the reader detects the failed images, restores the authoritative project page count, explains that the temporary preview is unavailable and disables reading, modification and checkout rather than presenting blank pages as a valid book.
- eBook assembly is distinct from print imposition: after the cover and opening, every narrative spread is ordered **text then illustration**, followed by the closing moral. Existing paid PDFs with the legacy print-side alternation are detected from their storage key and rebuilt in the background from the same private preview assets, without regenerating illustrations. **My creations Calitiki** automatically retries a ready-message that was never recorded and provides an authenticated **Resend email** action with an explicit SMTP failure notice.
- New preview covers and composed pages are copied to the same private S3-compatible storage as soon as they are generated. The reader serves them through a customer-authenticated route, and paid eBook assembly reads those durable objects instead of relying on Render's ephemeral filesystem. Legacy previews created before this checkpoint must be rebuilt once if their local source files were lost.
- New reference photos are normalized and written directly to the same private object storage before a draft may be generated. The AI receives an in-memory private image payload rather than a public child-photo URL, and generation is rejected before credit reservation if any reference object is missing. Legacy previews affected by Render's former ephemeral upload directory may use one controlled, no-charge rebuild after the customer uploads the photos again.
- Every new draft illustration passes a low-cost technical file check before it reaches the reader. Only corrupted, blank, striped or visibly incomplete outputs are regenerated automatically, with two attempts by default; minor wardrobe detail, cast ambiguity, composition and aesthetic preferences never trigger an automatic retry. The separate scene-fidelity gate may quarantine one high-confidence gross active-wardrobe contradiction for the same bounded targeted repair used by other objective contract defects. Before purchase, the customer may report a suspected technical defect. The server inspects the existing private asset first and regenerates it only when an objective defect is confirmed. Each successfully completed page check is counted once, at most three pages per project can be checked, and only bounded confirmed repairs may launch image generation (maximum two image attempts per request). A first failed repair consumes neither wallet credit nor the customer's free retry: its page becomes explicitly retryable and the exact server-side failure category is logged for support. A second failed repair on the same page stops automatic costs and requires manual support. Purchased revisions are never overwritten. Aesthetic improvement remains a separate paid modification.
- The image-facing contract is deliberately smaller than the persisted story contract. It contains neutral visual roles, the central visible action, required cast/elements, object state, scale, spatial constraints and one bounded name-neutralized excerpt of the exact paired reader text as supporting evidence. Historical story beats and `planned_image_context` remain private provenance and never cross the image-generation boundary. Dialogue is evidence only and cannot create a second instant, visible speech text or an undeclared physical object. Brand inscriptions and product comparisons become generic unbranded details. Scene-fidelity QA rejects only explicit contradictions; affirmative confirmations accidentally returned as issues cannot trigger regeneration.
- Automatic book generation treats style comparison as a bounded continuity aid rather than a fatal gate. A first categorical mismatch triggers one regeneration with the locked cover medium emphasized. A technically coherent second result is persisted with an `approved-with-style-warning` diagnostic instead of failing the preview. Retry-policy version 6 grants projects exhausted under earlier image or story-fidelity policies one checkpointed recovery, reusing every completed page and narrative checkpoint. A post-cover safety retry changes both inputs: original photo pixels are removed, the approved cover is retained, and the prompt becomes a smaller positive-only specification. The fallback is bounded and cannot repeat.
- OpenAI calls now have explicit bounded timeouts and no hidden SDK retries by default. The larger whole-book coherence and scene-contract pass has its own six-minute limit, separate from ordinary text calls, and logs its start, completion time and exact failure step. Text agents require JSON mode and also state the JSON-object requirement explicitly inside every provider-visible input, accept a safely extracted balanced object if a model adds formatting, and rebuild an invalid response once with the original task context and schema. This explicit input contract applies equally to Responses and Chat routes because provider validation does not always count a separate instruction field. Image attempts are logged with the job and page number. A transient image-provider server, network, timeout or rate-limit failure consumes the next already-configured product-level image attempt instead of aborting after attempt 1; it never increases the configured attempt ceiling, while invalid requests and other permanent failures still stop immediately. The no-credit questionnaire improvement helper follows the same classification with exactly one retry, then returns a localized, actionable message while retaining only structured request diagnostics in server logs. After a deployment or a generation with no progress, the same customer project can recover its abandoned job: every still-reserved preview credit is released idempotently before the technical retry, so the customer is never charged twice.
- Preview generation now checkpoints the narrative agents, character canons, approved blueprint, written page text, cover and every completed page in PostgreSQL/private storage. Losing an ephemeral Render job never restarts generation automatically: the customer sees a reassuring failure state and may explicitly use one free technical retry, which resumes at the first missing step. A failed second technical attempt is stopped for manual support so it cannot create an unbounded API bill. During scenario and preview generation, an authenticated customer may opt into WooCommerce transactional e-mails for five persisted lifecycle outcomes: scenario ready, scenario interruption, cover awaiting approval, preview interruption and complete preview ready; quality-review attention remains a separate persisted notification. Each signed event is idempotent and its private deep link reauthenticates the customer, inspects current project state and opens the exact scenario review, cover review, retry/support panel or finished reader. Render uses a separate milestone endpoint so a rolling deployment cannot make an older Bridge mislabel one stage as another. The same preference is visible beside scenario and preview progress and remains synchronized for the project. WhatsApp remains a later channel requiring explicit opt-in and a configured Business provider.
- Whole-book planning, causal fidelity audit and targeted full-plan repair use the story-duration client and Responses background execution rather than the short technical-QA timeout. Before an AI audit, deterministic cast, presence, relationship and irreversible-object checks run locally; an obvious mechanical defect therefore returns directly to the planner without paying for an auditor call. The independent auditor uses the balanced `story_auditor` route and runs only on a mechanically coherent candidate. A semantic rejection goes directly to one bounded full-plan repair instead of passing through another incomplete intermediate audit, so the normal pipeline uses at most two paid model audits. Compiler version 1 runs on fresh and resumed candidates before the audit. It consumes structured speaker metadata, classifies family-address defects as locally repairable and can apply the same scoped repair to a legacy candidate from the auditor's structured issue. When all returned issues are compiler-fixable and local invariants pass afterward, the existing audit is considered satisfied without another paid call; mixed results preserve only the creative remainder. Compiler logs contain version, counts, affected page numbers and avoided-retry state, never prose. The full-plan repair remains responsible for genuinely creative changes to cast, required and forbidden elements, object state, continuity and exact visible instant. Before each audit, Calitiki persists the complete private planning candidate and only the provider response id plus bounded status timestamps. A timeout, provider delay or Render restart therefore preserves all sequential page texts and the exact candidate; the explicit free retry resumes provider polling or compiles that candidate instead of rewriting the book or creating another paid reasoning call. A final `targeted-plan` candidate cannot enter another creative repair loop. Successful audit promotes the compiled candidate to the authoritative scene plan and removes its temporary provider checkpoints. Preview retry policy version 10 grants one recovery to projects exhausted under policy 9.
- The private quality-cost governor targets at most USD 2.00 of attributable preview AI cost first, then USD 1.50 after measured production calibration. These values are internal operating targets, never customer-visible prices or customer-facing blocks. Scenario creation uses one premium architect and one initial premium editor audit. Mechanical/canonical repair and semantic repair have independent one-call ceilings, so a structural normalization can no longer consume the only correction available after the editor's audit; only a repaired candidate receives the mandatory final editor re-audit, and no phase can create an unbounded rebuild loop. Manuscript prose is generated in at most three act batches instead of one paid call per text page, then receives one economical whole-book language pass restricted to grammar, malformed wording, broken names and family forms of address. That pass cannot alter chronology, cast, physical presence, object state, action or outcome. Whole-book planning uses one ordinary planner and at most one balanced targeted repair. A hard call ceiling stops repeated automatic paid retries, preserves the project and credit state, and routes the customer to the existing free recovery or support path.
- The premium scenario architect is used only when no scenario exists for the current request fingerprint. Once a proposal has been persisted, creator feedback, clarification changes and scene edits begin on the balanced `story_repair` route; deterministic validation and the independent final editor audit remain mandatory, so the routing change removes repeated full architecture without weakening approval. Cost attribution labels these later calls as customer changes rather than normal manufacture.
- Compiler version 2 supersedes compiler version 1 for fresh and resumed whole-book candidates. It normalizes legacy free-form family-address audit codes from the canonical character registry without using language-specific explanation templates, and preview retry policy version 11 grants one recovery to projects exhausted under policy 10. Compiler logs remain structured and private.
- Whole-book audit contract version 1 projects each saved scene contract onto the exact categories that can affect illustration generation: scene/page identity, focal action, visible named and generic cast, required elements, authoritative object states, spatial relationships and forbidden elements. Earlier story beats, source prose, draft image context and planner continuity notes remain private provenance and cannot reject a book because they are not rendered. Reader-visible page text is still audited independently against the approved scenario, so causal, cast and object-state contradictions remain blocking. Preview retry policy version 12 grants one creator-free recovery to projects exhausted under policy 11 so a preserved targeted candidate can be re-audited without regenerating the scenario or manuscript.
- Durable provider checkpoints for the whole-book auditor are namespaced by the audit-contract version. Changing the authoritative audit projection therefore creates a new compatible provider call instead of retrieving a completed response produced from obsolete inputs. Existing response ids remain private and preserved but are ignored by the new namespace; the saved scenario, manuscript and planning candidate are still reused. Preview retry policy version 13 grants one creator-free recovery to projects exhausted under policy 12.
- Blueprint compilation now has its own economical Responses route and durable provider checkpoint. Its versioned logical step stores only the provider response id and bounded status timestamps in the private preview checkpoint. A timeout, explicit retry or Render restart retrieves that same response while reusing intake, portraits, story brand, world and style instead of restarting the blueprint or scenario. Preview retry policy version 14 grants one creator-free recovery to projects exhausted under policy 13.
- Targeted whole-book repair contract version 2 serializes the saved plan back into the model's declared `page_texts`, `speech_segments` and `scene_contracts` schema. Each rejected scene also receives a bounded repair target containing its exact paired pages, audit instructions, approved action, physical cast and object states. The normalizer independently removes absent canonical characters from all image-facing cast, action, required-element and spatial fields. A preserved version-1 targeted candidate is repaired once through a new versioned provider step rather than being discarded or silently re-audited forever; unaffected pages remain unchanged. Preview retry policy version 15 grants one creator-free recovery to projects exhausted under policy 14.
- A partially successful version-2 whole-book repair may leave only reader-prose defects while its illustration contracts are already correct. Version 3 routes only those remaining paired text pages to the existing economical story writer, together with the immutable approved scene and bounded audit directives. Corrected prose and its exact structured dialogue/thought speakers are returned and checkpointed atomically; every unrelated page and every existing scene contract remains reusable. One newly namespaced final audit verifies the result, after which no further automatic repair loop is allowed. Preview retry policy version 16 grants one creator-free recovery to projects exhausted under policy 15.
- Scenario, cover and interior-book waits share a local Calitiki production journey rather than a generic spinner. Four fixed mascot roles—architect, editor-in-chief, illustrator and publisher—are mapped to real durable job stages; only the current role animates, reduced-motion preferences are honored and no invented percentage or customer data enters the asset. A technical failure after scenario approval remains attributed to preview generation and opens its preserved retry/support state instead of incorrectly returning to scenario review.
- Preview orchestration is moving from the Render-local job file to a PostgreSQL generation ledger. Every run has a durable status, input fingerprint, current step, heartbeat and expiring worker lease. Every checkpoint is also represented as an idempotent step, and generated candidates have their own durable record so a later quality decision cannot erase the underlying asset. The customer job endpoint reads this ledger when the local process state is absent. An expired lease is reclaimable with `FOR UPDATE SKIP LOCKED`, while an active lease prevents two Render workers from executing the same work. The existing project checkpoint remains the authoritative product snapshot during the migration and local JSON remains a development-only fallback.
- A recovery worker starts with Render and polls the durable ledger. When a preview worker lease has genuinely expired, it atomically marks that run interrupted, releases the reserved credit, preserves the exact project checkpoint and exposes one free resume from the first missing step. The customer therefore sees a clear interruption instead of an indefinitely frozen progress screen. This worker never restarts an image call by itself after an uncertain provider response, preventing duplicate cost.
- Every coherent generated image candidate is copied to private durable storage before its quality decision is finalized. Visual QA policy version 2 assigns each finding a stable private defect code, severity, confidence and repair eligibility. Only high-confidence objective interior-page defects may trigger automatic repair: duplicated, fused, substituted or missing required identities, a forbidden visible element, a contradictory object state, or the wrong main-action subject. Composition, scale, style-family and likeness preferences are local or advisory findings and never spend another automatic image call. An eligible first coherent candidate is quarantined immediately instead of receiving a second full regeneration. Generation continues through all unaffected pages, then exactly one targeted image edit receives that preserved candidate as its authoritative edit source together with the approved cover and identity references. The edit must retain the camera, composition, lighting, background, unaffected cast and unaffected objects. Its scoped QA checks only the original defect codes, permanent severe identity guardrails and technical file integrity; it cannot reopen unrelated style, likeness, gesture or composition critique. A successful edit replaces the provisional candidate. An inconclusive edit or unavailable provider enters `preview_quality_review`: all completed pages and candidates remain preserved, the preview credit remains reserved rather than captured, and purchase stays unavailable until the affected pages are resolved. The private generation ledger records codes, confidence, repair mode and outcome so cost and success can be compared without exposing Calitiki operating cost to customers.
- Targeted visual-repair policy version 3 closes the cast-cardinality gap exposed by a repair that added a second copy of an existing person. Every targeted cast or identity edit now receives one focused high-detail count for each named person or animal: zero remains missing, one is valid and two-or-more is an objective duplicate. The same bounded repair also rechecks all available canonical identity references, which outrank the defective source image for face, hair, species, coat and markings; the source continues to lock only composition and unaffected content. Structured defect codes are persisted with the page and translated directly for the creator, so an identity substitution or non-regression finding can no longer be mislabeled as a missing character by free-text matching. This focused verification runs only after an already-authorized targeted cast/identity edit and therefore adds no call to unaffected pages.
- Targeted visual-repair policy version 4 adds `wardrobe_state_mismatch` as a high-confidence objective defect only when the current illustration clearly uses the wrong active outfit category for a visible named human. The repair edits that person's clothing in place while preserving identity, body, pose, composition and unaffected subjects. The candidate remains excluded from adjacent continuity until the same scene-fidelity call verifies the corrected wardrobe. No retrospective audit, migration, environment variable or additional QA call is introduced.
- Quality review is a creator decision rather than a dead end. Each flagged double-page can be opened directly or explicitly accepted without another AI call. Before requesting a correction, the creator must explain what does not match and choose either **Adjust the illustration** or **Adjust the text to this image**. Each scope has one bounded free candidate, so a previously generated image alternative does not prevent a cheaper local text proposal. A scope is consumed only after its candidate is durably available; a first technical failure permits one controlled retry, while a second failure stops automatic spend and routes to support. A text proposal may reword a minor gesture to match an otherwise successful illustration, but it must preserve the approved chronology, physical cast, location, object state, main action, outcome and named-character mentions. Image and text candidates are private, durable and may coexist without changing the current spread. The creator compares each proposal with its source, then explicitly keeps the current spread or applies exactly one candidate; all underlying assets and the decision remain preserved. An interrupted or unsuccessful correction never discards an existing candidate and cannot trigger repeated automatic image spend. The preview reservation is captured, its purchase rebate is created and commerce unlocks only after the final flagged page is resolved. Internal prompt/audit history is a later observability brick and is not exposed with child or customer data in this customer-facing workflow.
- A purchased digital creation can issue up to three simultaneous private family invitations. Each invitation uses a 256-bit unguessable token stored only as a hash, expires after 7 or 30 days, is revocable immediately and exchanges into a read-only HTTP-only guest session for exactly one interactive book. Guest manifests and assets remain private, `no-store` and non-indexable; the secret invitation disappears from the browser address after exchange. The raw link is shown to the owner only once. If AI narration was purchased, the same protected family reader may play it without exposing the S3 object.
- Paid AI narration is a separate WooCommerce variable product (`narration-ia-calitiki`, SKU `CAL-NARRATION`) available only from a paid eBook creation. The customer selects one of four voices and one of four narration styles, hears an explicitly requested cached sample, acknowledges that the voice is synthetic, and then checks out. No narration API call for the full book occurs before payment. This line never receives or consumes the preview rebate. Render uses the dedicated Speech endpoint, with the exact scene text isolated from delivery instructions; Spanish books request neutral European Spanish from Spain rather than a Latin American accent. It generates one private MP3 per interactive scene, checkpoints the delivery manifest after every scene, and resumes from the first missing scene after interruption without a second purchase or duplicate API spend. A ready narration may be replaced through a new WooCommerce order (including a merchant coupon); the previous ready version remains active until the replacement is complete. A queued or generating narration blocks duplicate checkout, while a failed paid narration exposes an explicit free technical retry that resumes its existing checkpoint.
- Narration completion remains visible after checkout. The narration-choice page polls only the private order state while generation is active and exposes the authenticated interactive reader as soon as an active narration is ready. The WooCommerce My creations card also distinguishes ready, generating and failed narration states and turns the reader action into an explicit listen action when narrated audio is available. This status journey creates no additional Speech request and never exposes a private audio object URL.
- Every 21 x 21 cm page remains fully visible on phone, tablet and desktop. Creator previews and the purchased interactive reader use a contain-fit square canvas rather than cropping the illustration to the viewport. Mobile portrait mode centers the square vertically in the usable reading stage, balances spare space around it and reserves the navigation area outside the printed composition; desktop keeps the complete square beside the reading panel.
- `data/jobs.json` remains a local development store and must not be committed.
- Permanent deletion of an unpaid creation is intentionally a separate product brick. It must remove the project and its private assets idempotently, preserve purchased books and commerce records, and require explicit confirmation in the customer library.

## Product brick: V3 preflight delivery authority V20

The final text authority is now a precondition rather than an end-of-run
reconstruction. Before any cover or interior image call, production compiles
and persists the exact `manuscript`, `manuscript_fact_evidence`,
`visual_storyboard` and `visual_continuity_plan` derived from the released V3
specification and final reviewed page text. The delivery stage consumes those
prepared pointers verbatim and is limited to binding accepted visual evidence;
it cannot regenerate prose or replace a textual ancestor after image spend.

Resume evidence is project-wide but fail-closed. A strict accepted candidate
from an earlier run is reusable only when its private storage key is identical
to the image storage key retained by the current draft page. This preserves
approved pages across interruption while excluding stale or foreign images.
If an existing derived pointer is invalid under the current strict contract,
production records a new immutable valid revision and advances only that
derived pointer; it never mutates the released specification, approved
scenario, cover or source artifact. Structured terminal diagnostics name the
artifact, error code, affected page and bounded issues so another generic patch
is not inferred from an opaque final failure.

Retry policy version 20 allows one bounded resume for projects exhausted under
V19. There is no migration, environment-variable, commerce, credit,
private-asset exposure or series-canon change. Verification: focused V20
authority and checkpoint suites pass 22/22; the complete repository suite
passes 735/735.

## Product brick: V3 manuscript word preflight normalizer V21

Every strict V3 manuscript now passes an explicit physical-page word-range
preflight after final storyboard text binding and before the V20 immutable text
authority or any image generation. The gate derives its target and tolerance
from the released book age and page kind, reports the physical page plus actual,
minimum and maximum word counts, and leaves every already-valid page byte
unchanged.

Only out-of-range pages enter the economical manuscript-editor route, with two
bounded attempts maximum. The request contains the existing text, adjacent
prose, canonical scene and exact visual beat. A response must return the exact
requested page set and preserve all canonical named-character and family-form
mentions. The normalized text is rebound to the same storyboard and must still
pass language, child safety, visual binding, fact evidence and strict V20
authority before a cover or illustration can be requested. Checkpoint evidence
contains only page numbers and word counts; it does not duplicate manuscript
prose.

Retry policy version 21 opens one bounded recovery for V20 projects stopped at
the early manuscript authority. Their accepted illustrations remain eligible
only through the exact retained private storage-key rule. There is no migration,
environment variable, commerce, credit, private-asset exposure or series-canon
change. Focused V21/V20/checkpoint verification passes 29/29.
The complete repository suite passes 742/742.

## Product brick: V3 scene prose authority V22

The released scene presence ledger is now the single prose-cast authority. For
each scene it projects physical characters, evoked characters and the complete
forbidden remainder of the immutable character registry. Movement or passage
participation is contextual mechanical evidence only; it cannot authorize a
name on a page whose exact scene presence does not contain that character.

The manuscript writer receives only this page authority, and
ManuscriptFactEvidence uses the same canonical-name and family-address matcher.
Strict production runs a bounded scene-cast preflight before word-range
normalization, text persistence, cover generation or illustration spend. It
leaves valid prose byte-stable and rewrites only pages with a confirmed absent
named character, while preserving every authorized mention, action, location,
object, quantity, physical medium, wardrobe and emotional outcome.

Retry policy version 22 grants one resumable attempt to V21 failures. No
approved scenario ancestor, accepted image, customer credit, commerce state,
private asset or series canon is changed. There is no migration or new
environment variable. Verification: 45/45 focused and 750/750 complete tests
pass.

## Product brick: V3 adventure participation authority V23

The adventure proposal is now a real upstream participation contract rather
than descriptive copy. Each generated proposal carries opaque participant
references drawn from the prepared cast, and the customer sees the matching
names before selection. The hero and every explicitly selected `ally` or
`companion` must be present in that contract; stale, unknown or incomplete
participant references fail before the scenario can be built.

CreationIntent preserves the narrative role chosen in the questionnaire as the
canonical story role. A family relationship therefore no longer silently
turns a selected companion into a non-traveling family witness. NarrativeBrief
builder version 2 makes the proposal's participant promise authoritative by
unioning it with deterministic traveler inference. Passage topology, scene
presences, adventure equipment and wardrobe consume that one traveler set.

The behavior applies only to new artifacts. NarrativeBrief builder version 1
remains schema-compatible and immutable, so no in-progress or purchased book
is rewritten or migrated. There is no new environment variable, database
migration, model call, commerce rule, credit effect, private-asset exposure or
series-canon mutation.

Verification: 23/23 focused tests and 753/753 complete repository tests pass.

## Product brick: V23.1 backward-compatible preview resume

Request fingerprints follow an explicit append-only compatibility protocol.
When a release introduces a new optional answer authority, preview startup may
also calculate a documented legacy projection that removes that authority only
while its value is empty. This preserves approved scenarios and resumable
checkpoints created before the field existed without treating a real customer
change as equivalent. A non-empty participant authority continues to require a
new scenario approval.

After a compatible match, the immutable fingerprint stored on the approved
scenario remains the sole checkpoint authority for the run. The server neither
rewrites the scenario nor migrates customer content. A rejected preview-start
request is shown as localized live feedback beside the retry control rather
than appearing to ignore the click. No retry or credit is consumed before a
preview job actually starts.

There is no migration, environment variable, model call, commerce rule,
private-asset exposure or series-canon change.

Verification: 173/173 focused tests and 755/755 complete repository tests pass.

## Product brick: V23.2 durable blueprint QA and repair

Every model call between blueprint construction and final blueprint approval
is now a durable, idempotent Responses step. Initial QA, repair attempts one
through three and each verification QA use stable versioned checkpoint keys.
If Render restarts or a provider response exceeds the local wait window, the
next run retrieves that same response id; it does not repeat the whole
blueprint request or silently consume a final customer retry.

The generation checkpoint records only the repair attempt, lifecycle status
and a bounded enum-like set of QA issue families. Transient provider errors at
this boundary are classified as `preview_interrupted`, release the credit
reservation and remain recoverable. Deterministic contract failures remain
ordinary quality failures and cannot be mislabeled as infrastructure trouble.
Retry policy version 23 opens one bounded migration resume for V22 projects
that exhausted their retry at the former non-durable `qa:repair` boundary.

This brick changes durability, not creative acceptance criteria. It introduces
no database migration, environment variable, commerce change, private-asset
exposure or series-canon mutation.

Repository verification: 101/101 focused tests and 758/758 complete tests pass.

## Product brick: V23.3 provider-billing recovery

Provider-account exhaustion is a distinct operational state, even when OpenAI
transports it as HTTP 429. The preview worker, durable blueprint boundary and
SDK retry policy share one bounded classifier for billing hard limits,
inactive billing, insufficient quota, payment-required responses and the
provider's no-credit message. These conditions never enter transient retry or
blueprint-interruption loops. Public project and job payloads expose only
`preview_provider_billing_unavailable`; raw provider text and administrative
billing links remain private server diagnostics.

The project releases its Calitiki reservation, preserves every completed
scenario/manuscript/checkpoint and remains freely resumable at the first
missing image regardless of a previously consumed technical retry. Retry
policy version 24 grants one compatibility resume to V23 projects recorded as
generic exhausted failures before this classifier existed. FR/ES/EN messaging
states that the illustration service is temporarily unavailable and that the
book will resume from the cover after restoration. Calitiki does not promise a
successful provider call until the OpenAI API organization has usable credit.

This brick introduces no database migration, environment variable, extra model
call, commerce-rule change, private-asset exposure or series-canon mutation.
Repository verification: 762/762 complete tests pass.

## Product brick: V24 wardrobe visual authority

Strict Narrative V3 must establish visual clothing identity before generating
interior scenes. Textual wardrobe state remains the semantic authority, but it
is no longer expected to reproduce an identical garment across independent
image calls. For each canonical human/adventure-outfit pair,
`WardrobeVisualAuthority.v1` creates one private full-body model sheet from the
exact identity source and approved cover style, then accepts it only after a
dedicated identity, cardinality, wardrobe and style check.

The accepted sheet is the sole pixel authority for that person's active
garment design, colors, material and footwear. It is selected by exact
character and outfit-state ids, never by proximity or prose similarity, and it
survives every bounded reference-arbitration stage. Ordinary clothing keeps
the private identity photo as its full-body authority. Initial illustration,
automatic repair, creator quality alternatives and paid local edits all consume
the same checkpointed authority.

Authority creation is fail-closed and occurs before interior-page spend. A
conflicting outfit description, missing private identity/style source or
unaccepted model sheet stops privately without exposing an unstable page.
Retry policy 25 reopens one bounded resume for projects quarantined under the
former text-only wardrobe policy while preserving every accepted page. There
is no database migration, new environment variable, commerce change, credit
entitlement change or series-canon mutation. The authority images remain
private assets. Verification: 767/767 complete repository tests pass.

## Product brick: V24.1 wardrobe-authority acceptance boundary

Production evidence separates the purpose of the private outfit sheet from the
quality of a delivered illustration. The sheet is accepted only when identity,
exactly-one-person cardinality and canonical wardrobe all pass. A style
comparison on this neutral technical sheet is retained as advisory evidence;
it cannot exhaust the book after the three authority domains have passed.
Every cover and interior page continues to use the approved style reference and
must pass the existing strict rendering-family evidence before delivery.

The active generation checkpoint is persisted as
`wardrobe-visual-authority` before the first sheet call, including any already
accepted assets. A failure therefore resumes at its true boundary. Retry policy
26 grants one compatibility resume to V25 projects. This adds no model call,
database migration, environment variable, commerce or credit change,
private-asset exposure, final-page acceptance relaxation or series-canon
mutation. Repository verification: 769/769 complete tests pass.

## Product brick: V24.2 nominative wardrobe evidence

Wardrobe evidence at final illustration QA is now attributed to canonical
people instead of ending at one book-wide status. For every required human the
same QA response must copy the canonical character id and active outfit-state
id and return only a bounded pass, fail or uncertain observation. The runtime
binds that observation to the exact private wardrobe-authority id already
selected for the scene. It persists and logs only ids and enum evidence; names,
garment prose, image content and free-form model reasoning are excluded.

The aggregate eleven-domain gate remains fail-closed. A confirmed per-person
wardrobe contradiction can tighten its wardrobe domain, while missing
diagnostic detail cannot relax any result. A targeted wardrobe edit is allowed
only when wardrobe is the sole confirmed failed domain, every required human
has determinate evidence and one or more exact character/outfit targets are
identified. The edit prompt changes only those target ids and preserves every
other person. Without complete attribution the page remains private instead of
spending a blind edit.

Retry policy 27 grants one compatibility resume to V26 quarantines and reuses
all accepted pages. This brick adds no model call, database migration,
environment variable, commerce or credit rule, customer-data exposure,
acceptance relaxation or series-canon mutation. Repository verification:
81/81 focused tests and 774/774 complete tests pass.

## Product brick: V25 canonical all-outfit visual authority

The wardrobe authority boundary applies uniformly to adventure and ordinary
clothing. Each canonical human/outfit pair owns one private combined identity
and outfit sheet selected by exact character, state and authority ids. For an
ordinary outfit, the sheet copies only the broad garment categories, dominant
colors, layering and footwear from the private identity source while removing
logos. For an adventure outfit, the universe registry remains authoritative
and the private photo supplies identity only.

After acceptance, the combined sheet is the generation pixel authority for
both identity and clothing. The raw human source photo remains accessible to
the strict evidence controller but is marked ineligible for scene generation,
so contradictory source-photo garments cannot outvote the active state.
Policy-1 adventure sheets remain reusable only when every immutable authority
field matches; ordinary authorities missing from that old plan are generated
before interior pages continue.

Wardrobe-only automatic recovery follows an isolated reference plan. A
single-character mismatch edits the preserved candidate with only the cover
anchor and that character's exact sheet. A multi-character mismatch excludes
the defective candidate and adjacent scenes and recomposes the immutable scene
from the cover plus complete canonical sheets. Missing exact authority evidence
fails closed. Retry policy 28 grants one bounded compatibility resume and
retains all accepted pages.

This deliberately spends one private image call per previously absent
ordinary human/outfit authority to remove repeated blind page repairs. It adds
no separate QA call, schema migration, environment variable, commerce or
credit change, private-asset exposure, acceptance relaxation or series-canon
mutation.

Verification: 51/51 focused tests pass; the complete repository suite passes.

## Product brick: V25.1 split identity and wardrobe authority

Production evidence disproved the combined generated face/outfit sheet as a
safe precursor: its stochastic face could fail identity before a book page was
generated, or become a weaker identity source than the customer's original
private photo. Identity and clothing therefore have separate authorities.

The original private reference photo is the immutable identity authority. For
`private_identity_binding` ordinary clothing, that same durable source is also
the direct broad-clothing authority and no model sheet is generated. For every
adventure outfit, Calitiki creates one anonymous garment-only sheet on a
headless mannequin. It contains no person, face, hair, skin or named-character
likeness and is checked only for garment-only composition, exactly-one-outfit
cardinality and the canonical clothing description. Style remains advisory on
this private technical sheet; delivered pages still pass strict style evidence.

Scene generation combines the original identity photo, the exact garment-only
authority, the approved cover style and the immutable scene contract. An
identity-bearing ordinary authority suppresses its duplicate raw-photo input;
a garment-only adventure authority never suppresses the separate identity
photo. The same distinction applies to isolated wardrobe repair: adventure
repairs retain the exact identity reference, while ordinary repairs use the
direct identity/outfit source.

Policy-1 and policy-2 generated people are intentionally incompatible and are
not reused. Retry policy 29 grants one bounded compatibility resume to books
blocked under policy 28 while retaining accepted manuscript, cover and page
checkpoints. There is no schema migration, environment variable, commerce or
credit rule change, private-asset exposure, acceptance relaxation or
series-canon mutation.

Verification: 53/53 focused split-authority tests and 784/784 complete
repository tests pass.

## V26 universal journey lifecycle authority

Portal-style adventures must no longer depend on prose inference for their
physical beginning and ending. `JourneyLifecycle.v1` is compiled from the exact
NarrativeBrief, WorldLaw and VisualIntent before StoryConcept. It owns one
ordered lifecycle for every supported universe and sellable length:

1. ordinary life in original clothing, with the passage still hidden;
2. an accidental or magical event reveals the passage and one complete
   adventure outfit per traveler beside it;
3. preparation on the origin side, where ordinary clothes are folded and the
   travelers put on their adventure outfits and required equipment;
4. all travelers cross the same passage outward while origin witnesses stay;
5. the adventure obeys the universe's physical medium and keeps outfits stable;
6. all travelers cross the same passage in reverse, still in adventure dress;
7. only after returning, they retrieve and wear their ordinary clothes and
   visibly store the adventure outfits and conditional equipment.

The server binds every concept beat to its exact lifecycle phase, rejects any
creative reinterpretation, and projects outfit/equipment state through the
character timeline. Canonical mechanics translate lifecycle facts into bounded
visual proof sentences. V3 compiler version 3 seals those proofs in the final
illustration instant so generation and QA consume the same authority. A matrix
test covers all six universes and all six sellable page counts, plus the Santi
counterexample that previously compressed discovery, preparation and return.

Migration 034 expands only V3 artifact and pointer type constraints for the new
`journey_lifecycle` artifact. Existing immutable artifacts remain readable.
There is no new environment variable, model call class, commerce or credit
rule, customer-data exposure, acceptance relaxation or series-canon mutation.

## V26.1 deterministic dual wardrobe authority

The clothing description visible in a customer's private reference and the
scenario-selected adventure clothing are two independent immutable facts. A
single mutable blueprint field must never represent both. The locked blueprint
therefore records an ordinary and an adventure outfit for every personalized
human, plus an auditable dual-state wardrobe registry. `outfit_lock` remains a
backward-compatible alias of the ordinary state only.

The canonical character timeline remains the sole selector of the active state
for each cover or illustrated scene. Ordinary states bind to the original
private photo authority; adventure states bind to the universe outfit registry
and its anonymous garment-only authority. Strict scene compilation never mixes
the ordinary image source with an adventure description. During recovery of a
legacy checkpoint, the private photo canon wins over a contaminated legacy
field for `ordinary_outfit`, so accepted pages and manuscript checkpoints can
be reused safely.

Retry policy 30 grants one bounded resume to books exhausted under policy 29.
This brick adds no migration, environment variable, model call, credit or
commerce rule, private-asset exposure, acceptance relaxation or series-canon
mutation.

## New environment variables

- `NARRATIVE_MOVEMENT_CANONICALIZER_MODE=off|observe|enforce`: isolated deterministic pre-compilation normalization for hidden character movements; defaults to `off`. Observation never changes a book, and enforcement should be enabled only after controlled new-book verification.

- `DATABASE_URL`: PostgreSQL connection string. When absent, local draft JSON is used for development.
- `DATABASE_SSL=true`: enable PostgreSQL TLS with Render-compatible certificate handling.
- `STORY_SENSITIVITY_MODE=off|observe|guided`: disable the editorial sensitivity layer, persist observation-only profiles, or apply the versioned level-2/level-3 narrative contracts and acute-safety pause. `guided` is opt-in and existing projects are not silently reclassified.
- `STORY_SENSITIVITY_TIMEOUT_MS`: maximum classification wait before deterministic fallback; defaults to 8000 ms and is bounded to 1–30 seconds.
- `CHILD_SAFETY_MODE=off|observe|enforce`: independent child sexual-safety gate; `observe` emits private structured decisions without changing the journey, while `enforce` refuses exploitative normalization and pauses possible disclosures before persistence, generation or credit reservation.
- `CHILD_SAFETY_TIMEOUT_MS`: maximum wait for the classifier and moderation assessment before the deterministic floor takes over; defaults to 10000 ms and is bounded to 1–30 seconds.
- `OPENAI_MODERATION_MODEL`: moderation model used only by the child sexual-safety gate; defaults to `omni-moderation-latest`.
- `DRAFT_SESSION_DAYS`: anonymous draft-cookie lifetime, default 7 days.
- `DRAFT_TTL_DAYS`: anonymous draft retention, default 7 days.
- `WOOCOMMERCE_BRIDGE_SECRET`: shared secret used to verify short-lived customer identity tokens.
- `WOOCOMMERCE_BRIDGE_URL`: public connection URL displayed in WooCommerce > Calitiki Bridge.
- `WOOCOMMERCE_CHECKOUT_URL`: optional WooCommerce checkout bridge base URL. When empty, it is derived from `WOOCOMMERCE_BRIDGE_URL`.
- `PRINT_BOOK_ENABLED`: feature flag for printed-book selection and checkout. It defaults to `false`, leaving the format visible as **Coming soon** while the eBook remains purchasable.
- `CUSTOMER_SESSION_DAYS`: lifetime of the generator's HTTP-only customer session, default 7 days.
- `PREVIEW_ENTITLEMENTS_ENABLED`: activates the preview wallet gate after promotion codes or paid credit fulfillment are configured.
- `PREVIEW_PROMO_CODES`: comma-separated `CODE:AMOUNT_IN_EURO_CENTS` campaign codes; each code can be redeemed once per WooCommerce customer.
- `WOOCOMMERCE_CREDITS_URL`: WooCommerce URL used by the generator's **Buy credits** action.
- `PRIVATE_STORAGE_BACKEND=s3`: private production delivery backend. `local` is allowed only for local development.
- `PRIVATE_STORAGE_ENDPOINT`, `PRIVATE_STORAGE_REGION`, `PRIVATE_STORAGE_BUCKET`, `PRIVATE_STORAGE_ACCESS_KEY_ID`, `PRIVATE_STORAGE_SECRET_ACCESS_KEY`, `PRIVATE_STORAGE_FORCE_PATH_STYLE`: credentials and compatibility options for the private S3-compatible bucket.
- `DELIVERY_SIGNING_SECRET`: secret used for expiring eBook links; minimum 32 characters and preferably different from the WooCommerce bridge secret.
- `FAMILY_SHARE_SIGNING_SECRET`: optional dedicated secret for family-reader sessions. When absent, `DELIVERY_SIGNING_SECRET` is reused; a separate 32+ character value is preferred in production.
- `EBOOK_LINK_DAYS`: emailed eBook link lifetime, default 7 days. Customers can request a fresh link from their account.
- `SHARP_CONCURRENCY`, `SHARP_CACHE_MEMORY_MB`: cap native image-processing concurrency and cache usage on memory-constrained Render instances (defaults: 1 and 16 MB).
- `IMAGE_CONTENT_QA_ENABLED`: enables visual content inspection of generated illustrations (default enabled; set to `false` only for local troubleshooting).
- `IMAGE_MODEL`, `DRAFT_IMAGE_MODEL`: image models for unreferenced generation and draft previews. Both default to `gpt-image-2`; a configured production value remains authoritative.
- `REFERENCE_IMAGE_MODEL`: image-edit model whenever at least one identity or continuity reference is supplied; default `gpt-image-2`.
- `IMAGE_QA_MODEL`: vision model used for the economical illustration check, default `gpt-4.1-mini`.
- `IMAGE_LIKENESS_QA_ENABLED`: enables the bounded identity-fidelity comparison for photorealistic and faithfully illustrated modes (default enabled; set to `false` only for local troubleshooting).
- `IMAGE_GENERATION_ATTEMPTS`: maximum automatic attempts for a technically defective illustration, default 2.
- `IMAGE_SCENE_QA_ENABLED`: enables the economical structured-scene fidelity check (default enabled). It checks only clear action/cast/quantity/scale contradictions and fails open if the QA service itself is unavailable.
- `OPENAI_REQUEST_TIMEOUT_MS`, `OPENAI_IMAGE_TIMEOUT_MS`, `OPENAI_QA_TIMEOUT_MS`: maximum duration of general, image and technical-QA calls (defaults 180000, 180000 and 60000 ms).
- `OPENAI_REQUEST_MAX_RETRIES`, `OPENAI_IMAGE_MAX_RETRIES`, `OPENAI_QA_MAX_RETRIES`: SDK-level retries for the corresponding calls (default 0; the product-level idempotent retry remains authoritative).
- `OPENAI_STORY_TIMEOUT_MS`: dedicated maximum duration for the whole-book coherence and scene-contract response, default 360000 ms.
- `OPENAI_STORY_MAX_RETRIES`: SDK-level retries for that whole-book pass, default 0; keep it at zero so the checkpointed customer retry remains authoritative.
- `OPENAI_SCENARIO_TIMEOUT_MS`: dedicated maximum duration for one high-reasoning scenario architect or editor call, default 600000 ms.
- `OPENAI_SCENARIO_MAX_RETRIES`: SDK-level retry count for an individual scenario call, default 0; the durable product-level retry remains authoritative.
- `OPENAI_SCENARIO_BACKGROUND_POLL_MS`: interval between retrievals of an existing provider background response, default 2000 ms and bounded to 0.5–10 seconds. This never creates another reasoning request.
- `OPENAI_SCENARIO_BACKGROUND_MAX_WAIT_MS`: absolute maximum wait for one provider background response, default 1800000 ms and bounded to 1–60 minutes.
- `STORY_SCENARIO_WORKER_ENABLED`: enables the durable in-process scenario worker, default `true`; disable only for local troubleshooting.
- `STORY_SCENARIO_WORKER_INTERVAL_MS`: polling interval for queued or lease-expired scenario runs, default 2000 ms and minimum 1000 ms.
- `STORY_ARCHITECT_MODEL`, `STORY_ARCHITECT_REASONING_EFFORT`: scenario-architecture model and Responses reasoning level; defaults `gpt-5.6-sol` and `high`.
- `BLUEPRINT_MODEL`, `BLUEPRINT_REASONING_EFFORT`: economical approved-input-to-blueprint Responses route; defaults `gpt-4.1-mini` with no reasoning parameter. Both variables are optional.
- `STORY_EDITOR_MODEL`, `STORY_EDITOR_REASONING_EFFORT`: independent whole-scenario editor model and reasoning level; defaults `gpt-5.6-sol` and `high`.
- `STORY_REPAIR_MODEL`, `STORY_REPAIR_REASONING_EFFORT`: bounded causal scenario or story-plan repair route; defaults `gpt-5.6-terra` and `medium`.
- `STORY_PLANNER_MODEL`, `STORY_PLANNER_REASONING_EFFORT`: approved-scenario-to-book planner route; defaults `gpt-5.6-terra` and `high`.
- `STORY_AUDITOR_MODEL`, `STORY_AUDITOR_REASONING_EFFORT`: independent pre-cover whole-book audit route; defaults `gpt-5.6-terra` and `high`. Deterministic preflight runs before this paid call.
- `STORY_WRITER_MODEL`, `STORY_WRITER_REASONING_EFFORT`: page prose and bounded text-repair route; defaults `gpt-5.6-terra` and `medium`.
- `MANUSCRIPT_EDITOR_MODEL`, `MANUSCRIPT_EDITOR_REASONING_EFFORT`: economical final language-only review; defaults `gpt-5.6-luna` and `medium`.
- `PREVIEW_AI_TARGET_USD`, `PREVIEW_AI_STRETCH_TARGET_USD`: private operating targets, defaults USD 2.00 and USD 1.50; never exposed to the customer.
- `PREVIEW_ESTIMATED_INTERIOR_IMAGE_USD`: private estimate reserved for each required low-quality interior image still missing before an optional retry is allowed; defaults to USD 0.05 and is never exposed to the customer.
- `UTILITY_TEXT_MODEL`, `UTILITY_REASONING_EFFORT`: reserved economical route for later migration of no-credit helpers; defaults `gpt-5.6-luna` and `low`. Existing helpers remain on `TEXT_MODEL` until evaluated.
- `NARRATIVE_V2_SHADOW_MODE=off|observe`: disabled-by-default V2 diagnostic compilation after creator approval. `observe` still does nothing unless the project id is explicitly allowlisted.
- `NARRATIVE_V2_SHADOW_PROJECT_IDS`: comma-separated private tester project ids eligible for shadow compilation. An empty value disables all shadow compilation even when mode is `observe`.
- `NARRATIVE_BENCHMARK_SOL_MODEL`, `NARRATIVE_BENCHMARK_SOL_REASONING_EFFORT`, `NARRATIVE_BENCHMARK_TERRA_MODEL`, `NARRATIVE_BENCHMARK_TERRA_REASONING_EFFORT`, `NARRATIVE_BENCHMARK_LUNA_MODEL`, `NARRATIVE_BENCHMARK_LUNA_REASONING_EFFORT`: explicit synthetic benchmark routes; they do not change production routing and default to Sol/high, Terra/high and Luna/high.
- `PREVIEW_STALE_MINUTES`: no-progress period after which a preview job can be recovered, default 15 minutes.
- `GENERATION_RECOVERY_ENABLED`: enables automatic detection of expired durable preview leases, default `true`.
- `GENERATION_RECOVERY_INTERVAL_MS`: durable generation-recovery polling interval, default 60000 ms and minimum 30000 ms.
- `GENERATION_RECOVERY_BATCH_SIZE`: maximum expired preview runs recovered per cycle, default 10 and bounded between 1 and 50.
- `PREVIEW_MODIFICATION_STALE_MINUTES`: no-progress period after which an interrupted targeted modification releases its reservation and becomes freely retryable, default 15 minutes.
- `PROJECT_DELETION_CLEANUP_ENABLED`: starts the durable private-asset cleanup worker, default `true`.
- `PROJECT_DELETION_CLEANUP_INTERVAL_MS`: polling interval for due deletion receipts, default 60000 ms and minimum 30000 ms.
- `PROJECT_DELETION_CLEANUP_MAX_ATTEMPTS`: maximum cleanup cycles before Calitiki manual review, default 8 and bounded between 2 and 20.
- `PROJECT_DELETION_CLEANUP_BATCH_SIZE`: maximum receipts leased per cycle, default 10 and bounded between 1 and 50.
- `REFERENCE_PHOTO_RECOVERY_CUTOFF`: optional ISO timestamp limiting the one-time free rebuild to legacy previews created before durable reference-photo storage was deployed.
- `NARRATION_TTS_MODEL`: Speech-endpoint model used only for paid narration generation and cached voice samples; defaults to `gpt-4o-mini-tts`. The former conversational `NARRATION_MODEL` setting is intentionally ignored.

## Causal/render object-state arbitration checkpoint

Global causal possession and local illustrated visibility are now two explicit
layers of one deterministic contract. The causal graph remains authoritative
for identity, owner, quantity and lifecycle. A single shared projection then
marks a worn, held or carried object absent with quantity zero only while its
canonical owner is physically outside the selected scene. Structural lifecycle
validation consumes that same projection, so it cannot demand that an
off-camera possession be drawn while simultaneously accepting the owner as
absent.

The projected state carries bounded machine evidence (`owner_off_camera` plus
the canonical owner) for the semantic checkpoint. The final auditor may clear
only a visibility suspicion whose matching directive cites exact causal entity
ids and scenes that all have that compiler-certified evidence. Missing ids,
visible owners, duplicates, quantities, transfers and irreversible lifecycle
changes remain blocking. Object-render recovery version 2 grants one free
private-checkpoint retry to object-only failures exhausted under version 1; it
reuses the preserved candidate and does not rerun the architect. This adds no
environment variable, systematic model call, credit use or canon mutation.

## Whole-checkpoint mechanical refresh checkpoint

Migration recovery for an object-only private checkpoint now recompiles hidden
mechanics across the complete preserved scenario. It no longer applies the
ordinary targeted-editor scope after stabilization, because that scope restores
the stale movement and object ledgers of non-target scenes and can turn a local
six-finding checkpoint into a nine-finding mechanical regression. The recovery
starts from the exact private candidate and never invokes the architect or a
repair model.

A deterministic narrative-surface projection proves that the title, summary,
scene titles, actions, locations and physical/nonphysical presence choices are
unchanged by the refresh. Only after the full mechanical and canonical gates
pass does one fresh semantic audit run; legacy structural failures had never
reached that audit. The old diagnostic set is not used as a rollback baseline
for newly compiled mechanics. Object-render recovery version 3 opens one free
attempt for checkpoints exhausted under version 2. This adds no environment
variable, customer credit, series-canon change or creator-visible rewrite.

## Resume prompt for a new Codex task

> Continue the Storybook MCP project from `docs/product-roadmap.md` and `AGENTS.md`. Inspect Git status and open PRs first. Preserve `data/jobs.json`. Continue the first incomplete delivery phase, run tests, then publish a focused draft PR.
