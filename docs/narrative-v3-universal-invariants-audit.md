# Narrative V3 universal story algorithm audit

Last updated: 2026-08-20

## What “universal” can and cannot guarantee

The deterministic system can guarantee that every released artifact is internally
consistent with one typed authority and that a candidate with a confirmed
objective contradiction is never delivered. It cannot mathematically guarantee
that a generative image is beautiful, moving or preferred by every customer.
Those remain creative quality goals. The product target is therefore:

1. zero known objective contradiction in a delivered book;
2. no customer arbitration of an internal uncertainty;
3. bounded internal regeneration or a private technical failure;
4. creative diversity inside the valid state space, never outside it.

The algorithm is universal only if every universe-specific rule is data consumed
by the same generic compilers. No universe, book or production incident may add
a special-case repair branch.

## Single-authority artifact chain

Every downstream fact must have exactly one owner and one immutable source:

`Customer inputs -> CreationIntent -> StoryConcept -> CanonicalStoryGraph ->`
`Object/Character/World state timelines -> NarrativeBookSpec -> Manuscript ->`
`VisualStoryboard -> SceneRenderContract -> ImageCandidate -> Evidence -> Delivery`

An adapter may rename or redact a fact, but it may not infer, normalize, repair or
replace it. Every projection carries the exact parent digest and a projection
test proves that no required fact was lost.

## Exhaustive invariant catalogue

### 1. Customer intent and immutable identity

- Language, age, reading level, page count, universe and product format.
- Adult intention, desired child change, emotional sensitivity and chosen story
  approach.
- Exact spelling and stable id of every named character.
- One hero, bounded supporting cast, relationship and narrative role.
- One private identity revision per recurring character.
- Species, age class, body type and stable physical traits.
- Customer wardrobe preference for every human: preserve the photo, automatic
  universe outfit or one selected outfit id.
- Physical accommodations and safety needs that illustrations must respect.
- Series ancestry and the exact previously accepted canon revision.
- No mutable questionnaire, photo or customer aggregate may be read after the
  intent and private identity bindings are sealed.

### 2. Universe laws

Every universe needs one versioned `WorldLawContract`, not prose instructions:

- locations and zones;
- physical medium at each location: breathable air, underwater, vacuum, cloud,
  ordinary land or another declared medium;
- gravity, buoyancy, locomotion and allowed body posture;
- breathable/survival conditions and mandatory personal equipment;
- passage endpoints, direction, capacity, boundary geometry and camera side;
- whether a portal/window reveals another medium without changing the medium
  surrounding the characters;
- time-of-day and time-flow rules;
- scale ranges for people, animals, vehicles, buildings and creatures;
- native fauna/flora and forbidden incompatible elements;
- technology/magic capabilities and limitations;
- unique fixed landmarks and their canonical home;
- laws for entering, leaving and returning.

The generic topology compiler validates these fields. It must not recognize a
universe by keywords in the story text.

### 3. Narrative structure and meaning

- Exact scene count derived from the sellable page count.
- Three contiguous acts with one opening, challenge, decisive climax, return or
  settling phase, and resolution.
- Every scene has one semantic purpose and changes at least one declared story
  state.
- The adult's message is demonstrated through action and consequence, not merely
  stated in dialogue.
- The hero makes the decisive choice; a guide may support but cannot solve it.
- Escalation is monotonic until the unique climax.
- No repeated attempt, duplicated resolution or epilogue that reopens the problem.
- Emotional state, knowledge and decisions evolve causally.
- Age-appropriate risk, vocabulary, sentence length, agency and reassurance.
- Originality dimensions are selected inside constraints: setting details,
  obstacle, strategy, sensory motif, relationship gesture and resolution image.

### 4. Physical chronology and movement

- Every physical character has exactly one location after every scene.
- A character changes location only through one explicit movement event.
- Every movement has origin, destination, mechanism, travelers, witnesses and
  resulting side.
- Departure, transit and arrival are distinct phases unless one declared visible
  instant intentionally shows exactly one of them.
- Nobody boards a vehicle, crosses a passage, becomes submerged or returns home
  without a matching event.
- A character absent from the camera remains in the graph; absence is not a
  teleportation.
- Re-entry after absence is legal only when the character's canonical location
  matches the visible scene.
- Previous scene end equals current scene start; current scene end equals next
  scene start.

### 5. Character presence and cardinality

- Required and forbidden recurring cast partition the complete released cast.
- Every required recurring identity has exact image quantity one unless an
  explicit reflection, portrait, memory or montage representation has its own id.
- Every forbidden recurring identity has exact image quantity zero.
- A generic background person has a local id and may not substitute a recurring
  identity.
- No fusion, duplicated body, exchanged face, changed species or human/animal
  substitution.
- Narrative mention, physical presence, off-camera presence and remembered
  mention are separate states.
- The main actor, observer and recipient remain distinct roles.

### 6. Wardrobe and equipment

- Every visible character has exactly one `outfitStateId` and one concrete,
  renderable garment description.
- The state records garment categories, colors, materials, footwear, accessories
  and protected features at a level that vision QA can verify.
- An identity photo is evidence for identity and for ordinary clothing only when
  `preserve_photo` is the active state.
- An adjacent illustration is secondary evidence and cannot choose a wardrobe.
- Outfit state changes only through an explicit don/remove/change event.
- A preparation scene must state or visibly establish the change; an index-based
  silent change is invalid.
- Equipment is per character, with worn/held/stored/absent state and exact
  quantity. Shared safety equipment cannot replace individual equipment.
- Returning through a boundary deterministically resolves conditional equipment
  at the declared visible phase.

### 7. Objects and persistent visual entities

- One stable id per causal or recurring object.
- Exact whole-image cardinality, including zero when hidden, stored or absent.
- One owner, one location, one state and one appearance after every scene.
- Creation, transfer, transformation, consumption, breakage and repair require
  explicit lifecycle events.
- An object cannot appear before creation, after consumption or in two positions
  to imply motion.
- A set is one first-class entity with an exact member count. Three circles stay
  three circles with the same locked appearance until an explicit event changes
  them.
- A transformed object becomes either a new versioned state or a distinct entity;
  the rule is declared, never inferred from prose.
- Fixed landmarks have global quantity and location limits.

### 8. Per-scene physical instant

Each image binds one and only one instant containing:

- before/during/after phase;
- camera location, side and ambient medium;
- required and forbidden cast;
- character location, posture, outfit, equipment and action;
- object states and spatial relationships;
- main subject, verb and target;
- visible boundary geometry;
- time, weather and lighting state;
- narrative energy and emotional expression;
- what must remain outside the frame.

No prompt may combine preparation, transit and arrival, or current action with a
future possibility mentioned by the prose.

### 9. Manuscript-to-image binding

- Text and image are siblings derived from the same released scene, not one
  inferred from the other.
- Every named mention, physical action, object count, location, outfit change and
  transition in the prose is checked against the scene state.
- Metaphors, wishes, plans and memories are tagged non-physical unless an explicit
  representation is requested.
- The manuscript cannot introduce an unregistered place, object, capability,
  character or movement.
- The image cannot depict a sentence from a different causal phase.
- A deterministic evidence projection states which prose claims are visually
  required, optional or forbidden.

### 10. Visual language and composition

- One approved style bible controls medium, proportions, palette and surface
  treatment.
- Identity references control identity only.
- Current render contract outranks cover and adjacent-scene references for state.
- Composition varies deterministically while preserving action readability.
- One unique visual climax carries the maximum energy.
- Age-bound scene density limits high-salience elements and decoration.
- Camera, crop and pose may vary; stable state may not.
- Text, logos, watermarks and undeclared branded elements are forbidden.

### 11. Candidate verification and evidence

Every V3 page needs mandatory, focused evidence for:

- complete square technical file and safe anatomy;
- exact required identity count and zero duplicates/fusions;
- absence of forbidden recurring identities;
- broad wardrobe state per visible human;
- conditional equipment per person;
- physical medium, camera side and boundary;
- main action subject/verb/target;
- object and persistent-entity cardinality;
- unique landmarks and location;
- style-family continuity.

One broad low-resolution opinion is not sufficient. Objective domains use
separate high-detail checks with structured enums. `uncertain` is not a customer
defect: it triggers internal evidence escalation or bounded regeneration. A QA
timeout cannot silently approve a V3 invariant.

### 12. Repair, cost and delivery

- Repair targets one rejected candidate and one exact defect set.
- The immutable render contract never changes during image repair.
- A repair source controls unaffected pixels; identity references outrank it for
  identity; the current contract outranks both for state.
- The repaired candidate reruns every protected invariant, not only the requested
  change.
- Failed technical work consumes no additional customer entitlement.
- No rejected or uncertain candidate becomes adjacent continuity evidence.
- Delivery references only accepted candidate digests with complete evidence.
- Series canon changes only after explicit customer acceptance or purchase.

### 13. Operational correctness

- Every provider step is leased, idempotent and restartable.
- Retries reuse immutable parents and provider response ids.
- PostgreSQL artifacts and private assets are append-only or content-addressed.
- No child photo, name, prose or asset path enters diagnostic fingerprints.
- Costs are bounded per step and optional retries cannot consume the mandatory
  remaining-book budget.
- A deployment never changes the engine assignment of an existing project.

## Required gates at every pipeline step

| Step | Sole owner | Must verify before commit |
| --- | --- | --- |
| Normalize request | server input schema | supported values, exact names, photo ownership, wardrobe selections |
| Seal intent | CreationIntent/VisualIntent | privacy-safe refs, cast uniqueness, series ancestry, all customer choices retained |
| Author concept | creative model wire | semantic completeness only; no model-authored mechanics |
| Compile graph | deterministic mechanics | acts, chronology, topology, movement, presence, state transitions |
| Project world/objects/characters | deterministic state compilers | complete per-scene state, lifecycle causality, quantities, laws |
| Release spec | immutable compiler | exact parent digests, complete registries and scene partitions |
| Write manuscript | constrained model + deterministic checker | every factual claim bound to released state |
| Compile storyboard | deterministic compiler | one image page per scene, complete instant, whole-book rhythm |
| Compile SceneRenderContract | deterministic compiler | concrete cast/outfit/equipment/world/object instructions, lossless digest |
| Generate image | image provider | prompt contains only the exact render contract plus secondary references |
| Evaluate candidate | focused vision evidence | all objective domains checked; uncertainty remains internal |
| Repair | bounded targeted edit | immutable contract preserved and every protected domain rechecked |
| Deliver | manifest compiler | accepted evidence and private asset digest for every page |

## Confirmed structural gaps before this brick

1. `CreationIntent.v1` does not retain per-character wardrobe preference or
   selected outfit id.
2. The mechanics builder chooses the universe's first outfit instead of the
   customer's normalized choice.
3. Wardrobe changes are index-window based rather than explicit state-change
   events.
4. The illustration adapter received abstract outfit ids while its legacy path
   independently reconstructed clothing from photos and blueprint fields.
5. Forbidden cast degraded to prose instead of remaining a structured exact-zero
   contract.
6. High-detail cast/wardrobe arbitration was reactive rather than mandatory on
   every V3 page.
7. Scene fidelity calls could fail open after a QA service error.
8. The manuscript and physical snapshot could disagree about which side of a
   boundary the camera occupied.
9. Existing approved immutable specs cannot be silently rewritten to acquire
   missing intent or transition evidence.

## SceneRenderContract.v1 brick delivered by this branch

- Spec-driven plan version 15 projects universe id, complete character registry,
  visible ids, forbidden ids and structured wardrobe/equipment states.
- `SceneRenderContract.v1` validates the cast partition and resolves every active
  outfit id to one concrete description before image generation.
- Universe outfit descriptions come only from the versioned universe registry;
  ordinary clothing comes only from the private identity binding.
- The V3 prompt and scene-fidelity QA receive the same signed render contract.
- Legacy photo/blueprint wardrobe cannot override an active universe state.
- Every V3 interior image invokes focused high-detail required-cast and wardrobe
  verification, including a categorical outfit result per visible identity.
- Unknown outfit states and stale legacy page casts fail before paid image
  generation.

This brick closes the contradictory image-adapter boundary. It does not yet
solve gaps 1, 2, 3, 7 and 8 above; those require new immutable visual-intent,
character-state-event, strict evidence and text/state-binding artifacts rather
than changes to an already approved spec.

## Remaining implementation phases

1. **VisualIntent.v1**: seal outfit preference, selected outfit, ordinary outfit
   digest, accommodations and per-character visual choices before concept work.
2. **CharacterStateTimeline.v1**: explicit outfit/equipment/knowledge/emotion
   events with before/after state and causal evidence.
3. **WorldLawContract.v1**: version every universe's physical laws as structured
   data and compile topology/medium/equipment only from it.
4. **ManuscriptFactEvidence.v1**: parse every physical prose claim and prove it
   against the released scene before storyboard compilation.
5. **StrictIllustrationEvidence.v2**: mandatory domain-specific evidence without
   fail-open acceptance; internally retry uncertain checks.
6. **Delivery gate and rollout**: new-book-only assignment behind a release digest,
   multi-universe canary and emergency pre-creation switch.

## Universal regression strategy

The complete natural-language space is infinite, so verification combines:

- exhaustive finite matrices for languages, formats, universes, scene positions,
  transitions, visible phases, cast cardinalities and wardrobe states;
- property-based generation for valid and deliberately corrupted state graphs;
- pairwise coverage for role, universe law, movement, outfit, equipment, object
  lifecycle, camera and composition combinations;
- anonymized fingerprints for every production counterexample;
- golden contract projections, never golden prose or customer images;
- provider canaries across at least portal/non-portal, ordinary/hostile medium,
  small/large cast, no-object/object-heavy and single/series stories.

Release requires zero deterministic invariant failures, zero projection loss,
zero accepted deliberate corruption, idempotent replay and no objective defect
in the bounded human-reviewed canary sample. New counterexamples extend the
matrix; they do not create book-specific runtime rules.

