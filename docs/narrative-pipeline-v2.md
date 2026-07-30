# Calitiki Narrative Pipeline V2

Status: architecture contract, not connected to production

Contract version: `calitiki.narrative-book-spec.v1`

Last updated: 2026-07-30

## Why V2 exists

The current pipeline asks several language models to restate and then re-audit the
same mechanical facts. The approved scenario, blueprint, manuscript, speech
segments and illustration scene contracts can therefore disagree even when the
underlying story did not change. Re-running a probabilistic whole-book audit can
also discover a new issue in an untouched scene.

V2 separates two concerns:

- **Mechanical truth** is compiled once and checked deterministically.
- **Creative realization** writes prose and composes images inside that immutable
  truth.

The target is not to remove editorial intelligence. It is to prevent editorial
intelligence from changing facts such as who is present, where a character is,
who owns an object or whether a passage has already been crossed.

## Non-negotiable product boundaries

1. WooCommerce remains responsible for accounts, checkout and commerce.
2. The Node application remains responsible for projects, private assets,
   generation state and narrative continuity.
3. Child photos, questionnaire answers, generated books and the canonical
   contract remain private.
4. No rejected preview becomes series canon.
5. A technical failure preserves the project and never consumes another credit
   without an explicit authorized action.
6. The existing Child Safety and Story Sensitivity systems are retained. V2 does
   not weaken, replace or reinterpret them.

## Safety remains outside and inside the narrative pipeline

Child Safety is a separate gate, not a narrative style hint.

| Boundary | Required action |
| --- | --- |
| Parent intention | Assess before persistence, generation or credit reservation. |
| Suggestions | Reassess before generating three story directions. |
| Scenario request and approval | Reassess before the canonical contract can be compiled. |
| Manuscript | Reassess generated reader-visible prose before the first image. |
| Preview authorization | Reassess before reserving a credit. |
| Paid local modification | Reassess the request and the resulting text before application. |

An enforced `support` or `refuse` decision stops before a Narrative Book Spec is
created. An allowed protective-education contract is referenced immutably by
identifier, version and digest in the spec. The submitted family wording and
free-form classifier rationale are never copied into the canonical contract.

Story Sensitivity remains complementary:

- level 1: light, action-led treatment;
- level 2: gentle emotional treatment;
- level 3: symbolic, prudent and open-ended treatment;
- restricted acute-safety input: no canonical contract is compiled.

## One authoritative artifact

After creator approval, Calitiki compiles exactly one `NarrativeBookSpec`.
Everything downstream reads it; nothing downstream may silently rewrite it.

```text
questionnaire
    |
    +--> Child Safety / Sensitivity gate
    |
scenario architect -> deterministic scenario validation -> creator approval
                                                          |
                                                          v
                                             NarrativeBookSpec v1
                                               /      |       \
                                              /       |        \
                                      prose writer  image     delivery
                                           |        compiler
                                           v          |
                                  deterministic       v
                                  prose checks     image model
                                           \          /
                                            quality review
```

The spec contains:

- immutable provenance for the approved scenario;
- sanitized safety contract references;
- canonical registries for characters, locations, passages and objects;
- exact page bindings;
- one scene specification per illustrated spread;
- physical and nonphysical presence modes;
- ordered character movement;
- object state, quantity and ownership at every scene;
- passage discovery and crossing state;
- the exact visible instant represented by the illustration;
- required and forbidden visual elements;
- versioned deterministic and semantic validation evidence.

## Ownership of decisions

| Decision | Owner |
| --- | --- |
| Child Safety intervention | Safety gate |
| Sensitivity level and narrative treatment | Sensitivity gate |
| Story premise, meaning and scene order | Approved scenario |
| Character identity and family relationship | Creator registry |
| Location, movement, presence and object state | Canonical compiler |
| Page prose | Writer, constrained by the spec |
| Dialogue speaker metadata | Writer output, deterministically checked |
| Visible cast and illustration requirements | Image contract compiler |
| Composition, lighting and artistic expression | Image model |
| Literary nuance | Semantic editor, bounded and cached |
| Purchase or series canon | Creator/customer action |

## Compiler rules

The compiler is pure and deterministic:

```text
same approved scenario digest
+ same compiler version
+ same book format
= same NarrativeBookSpec digest
```

It must not call an AI model. It may reject an approved scenario only when an
invariant cannot be compiled safely. That rejection is an internal product
defect or a genuine unresolved creator choice, not an invitation for another
model to guess.

Each registered object is represented exactly once in every scene. `absent`
means quantity `0`; every other state means a positive quantity. This prevents a
planted seed, stored doll or destroyed key from reappearing through omitted
state.

Each physical character has one explicit scene phase and location. Thought,
memory and voice presences cannot move or appear in the visible cast.

The illustration's `visibleCharacterIds` is derived from physical presences. It
is never authored by the planner. `evokedCharacterIds` is derived from thought,
memory and voice presences. A character in neither list is absent from that
visible moment.

## Generation rules

### Prose

The writer receives only the scene's canonical facts plus bounded neighboring
continuity. It may choose language, sensory detail and rhythm. It may not add a
named character, move an object, alter a relationship or merge two moments.

The response contains:

- reader-visible prose;
- structured dialogue/thought segments with canonical speaker ids;
- no copy of the illustration contract.

Deterministic checks run first. A semantic review may assess meaning, age fit,
subtlety and literary quality, but it cannot override mechanical truth.

### Illustration

Code compiles the image contract directly from the scene:

- exact visible named cast;
- exact main visible action;
- object state and quantity;
- required environment and spatial relations;
- explicit forbidden characters, duplicate bodies and impossible simultaneous
  moments.

The image model controls visual composition only inside those constraints.

### Repair

A repair is local:

1. identify the affected scene and artifact type;
2. preserve every unaffected byte-addressed artifact;
3. create at most one bounded candidate for the affected artifact;
4. run deterministic validation on that scene;
5. run semantic validation only if the semantic input digest changed;
6. let the creator compare when artistic judgment remains.

There is no whole-book probabilistic re-audit after an unrelated local repair.

## Audit caching and idempotency

Validation evidence is keyed by:

```text
artifact digest + validator version + policy version
```

An identical artifact under the same validator is never submitted again.
Changing a validator creates a new evidence namespace without deleting older
evidence. Changing scene 8 invalidates scene 8 and derived book evidence, but it
does not invalidate the cached scene 11 decision.

Semantic audit output must be structured and bounded. It may block only the
declared semantic categories. Mechanical findings produced by a semantic model
are advisory telemetry because the deterministic compiler and validators own
those categories.

## Persistence and migration

V2 is introduced side by side:

- existing projects keep their legacy pipeline and remain readable;
- no existing approved scenario is silently converted;
- new V2 test projects persist the canonical spec and its digest;
- downstream artifacts record the exact spec digest and scene id they used;
- a changed spec creates a new revision rather than mutating an approved one;
- activation is controlled by a future server-side feature flag and tester
  allowlist.

The first architecture brick deliberately adds no production flag and changes no
customer journey.

## Observability

Private structured logs may contain:

- project id, run id and scene id;
- contract id, revision and digest prefixes;
- compiler and validator versions;
- model route, token usage, duration and bounded error code;
- cache hit/miss and affected artifact type.

They must not contain questionnaire text, child photos, generated prose, raw
prompts, classifier rationale or unsafe submitted wording.

Every downstream usage/cost record must include the canonical spec digest and
scene id so cost can be attributed without exposing internal cost to customers.

## Acceptance gates before production

1. The same approved scenario compiles to the same digest in repeated runs.
2. All registry references resolve.
3. Scene numbers and page bindings are unique and ordered.
4. Visible cast equals physical presence exactly.
5. Nonphysical characters never move or appear visibly.
6. Every tracked object has one state in every scene.
7. Passage crossing cannot precede discovery.
8. Movement origins match the previous canonical location.
9. Unchanged artifacts are never re-audited.
10. A local repair changes only its declared scene artifacts.
11. Child Safety boundary tests pass in FR, ES and EN.
12. At least 100 diverse scenario fixtures pass deterministic invariants.
13. Repeated end-to-end runs do not produce new mechanical findings for an
    unchanged canonical spec.
14. Preview completion and cost targets are measured before rollout.

Initial operational targets:

- `100%` deterministic mechanical validation before generation;
- `0` whole-book semantic audits for unchanged content;
- maximum `1` automatic prose repair per affected scene;
- first-pass preview completion above `95%`;
- median preview AI cost below `$2.00`, then below `$1.50`.

## Delivery sequence

1. **Contract foundation** — this document, JSON Schema, deterministic validator,
   reference fixture and tests.
2. **Compiler** — approved scenario to immutable NarrativeBookSpec, still behind
   tests only.
3. **Shadow mode** — compile new scenarios beside the legacy pipeline and compare
   without affecting customers or credits.
4. **V2 prose** — scene-local writer and deterministic prose checks.
5. **V2 illustration contract** — code-built prompts and image validation.
6. **Tester rollout** — new test books only, with legacy projects untouched.
7. **Production rollout** — only after acceptance gates and cost thresholds pass.
