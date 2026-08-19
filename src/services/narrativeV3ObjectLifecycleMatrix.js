import crypto from "node:crypto";

import { UNIVERSE_OPTIONS } from "../config/bookOptions.js";
import { getWordsTargetByAge } from "../config/readingGuidance.js";
import { buildCanonicalStoryMechanics } from "../contracts/buildCanonicalStoryMechanics.js";
import {
  canonicalStoryGraphDigest,
  compileCanonicalStoryGraph,
} from "../contracts/narrativeV3Canonical.js";
import {
  compileObjectLifecycleProjection,
} from "../contracts/objectLifecycleProjection.js";
import { compileNarrativeBookSpecV3 } from "../contracts/narrativeBookSpecV3.js";
import { parseManuscriptWire } from "../contracts/manuscriptV1.js";
import { compileVisualStoryboard } from "../contracts/visualStoryboardV1.js";
import { compileVisualContinuityPlan } from "../contracts/visualContinuityPlanV1.js";
import {
  parseIllustrationEvaluationWire,
  recordImageCandidateSet,
} from "../contracts/illustrationEvidenceV1.js";
import { compileDeliveryManifest } from "../contracts/deliveryManifestV1.js";
import {
  buildNarrativeV3SyntheticFixture,
  NARRATIVE_V3_SYNTHETIC_LANGUAGES,
} from "./narrativeV3SyntheticShadow.js";
import { NarrativeV3StateMachine } from "./narrativeV3StateMachine.js";

export const NARRATIVE_V3_OBJECT_MATRIX_VERSION = 1;

function artifactRef(artifact) {
  return {
    artifactId: artifact.id,
    artifactType: artifact.artifactType,
    artifactDigest: artifact.payloadDigest,
  };
}

async function commit({ machine, runStore, artifactStore, projectId, runKey, stepKey, stepType, inputs, payload }) {
  const outputTypes = {
    parse_story_concept: "story_concept",
    compile_story_graph: "canonical_story_graph",
    compile_object_lifecycle: "object_lifecycle_projection",
    release_narrative_book_spec_v3: "narrative_book_spec_v3",
    write_manuscript: "manuscript",
    compile_visual_storyboard: "visual_storyboard",
    compile_visual_continuity_plan: "visual_continuity_plan",
    record_image_candidates: "image_candidate_set",
    decide_illustrations: "illustration_decision_set",
    assemble_delivery_manifest: "delivery_manifest",
  };
  const outputType = outputTypes[stepType];
  const pointer = await artifactStore.getCurrentPointer(projectId, outputType);
  const queued = await machine.enqueue({
    projectId,
    runKey,
    steps: [{
      stepKey,
      stepType,
      expectedPointerRevision: Number(pointer?.pointerRevision || 0),
      inputs: inputs.map(artifactRef),
      maxAttempts: 1,
    }],
  });
  const currentRun = await runStore.getRun(queued.run.id);
  if (currentRun?.status !== "completed") {
    const workerId = `object-matrix-${stepKey}`;
    const lease = await runStore.claimNext({ workerId });
    if (!lease || lease.runId !== queued.run.id) throw new Error("object_matrix_step_not_claimed");
    await machine.commitArtifact({
      stepId: lease.id,
      workerId,
      artifact: {
        payload,
        provenance: {
          producer: "v3_object_matrix",
          producerVersion: "v1",
          runId: queued.run.id,
          stepId: lease.id,
          operationId: stepKey,
        },
      },
    });
  }
  const current = await artifactStore.getCurrentPointer(projectId, outputType);
  return artifactStore.getArtifact(current.artifactId);
}

function addEvent(scene, event) {
  scene.objectEvents.push({ sequence: scene.objectEvents.length + 1, ...event });
}

function syntheticManuscriptWire(spec) {
  const word = { FR: "aventure", ES: "aventura", EN: "adventure" }[spec.book.language];
  return {
    schema_version: 1,
    contract_id: "calitiki.manuscript-wire.v1",
    source_spec_digest: spec.validation.artifactDigest,
    language: spec.book.language,
    pages: spec.pages
      .filter((page) => ["opening_text", "scene_text", "closing_text"].includes(page.kind))
      .map((page) => {
        const guidance = getWordsTargetByAge(spec.book.audienceAge, page.kind === "scene_text" ? "text" : page.kind);
        return { page_number: page.pageNumber, text: Array(guidance.target).fill(word).join(" ") };
      }),
  };
}

function syntheticImageCandidates(storyboard, fixtureId) {
  return storyboard.beats.map((beat) => ({
    sceneNumber: beat.sceneNumber,
    beatDigest: beat.beatDigest,
    attempt: 1,
    providerModel: "synthetic-image-v1",
    providerResponseId: `${fixtureId}-image-${beat.sceneNumber}`,
    asset: {
      storageKey: `private/narrative-v3/${fixtureId}/scene-${beat.sceneNumber}.webp`,
      sha256: crypto.createHash("sha256").update(`${fixtureId}:image:${beat.sceneNumber}`).digest("hex"),
      mimeType: "image/webp",
      width: 2048,
      height: 2048,
      byteLength: 100000 + beat.sceneNumber,
    },
  }));
}

function syntheticEvaluationWire(storyboard, candidateSet) {
  return {
    schema_version: 1,
    contract_id: "calitiki.illustration-evaluation-wire.v1",
    source_storyboard_digest: storyboard.validation.artifactDigest,
    source_candidate_set_digest: candidateSet.validation.artifactDigest,
    decisions: candidateSet.candidates.map((candidate) => ({
      scene_number: candidate.sceneNumber,
      candidate_digest: candidate.candidateDigest,
      issues: [],
    })),
  };
}

export function buildNarrativeV3ObjectFixture(rawFixture = {}) {
  const fixture = buildNarrativeV3SyntheticFixture({
    language: rawFixture.language || "FR",
    universeId: rawFixture.universeId || "dinosaur_valley",
    pageCount: Number(rawFixture.pageCount || 32),
  });
  const mechanics = structuredClone(buildCanonicalStoryMechanics({ intent: fixture.intent, concept: fixture.concept }));
  mechanics.registries.objects = [
    { id: "object_unique_map", name: "Unique synthetic map", kind: "portable" },
    { id: "object_fixed_landmark", name: "Fixed synthetic landmark", kind: "fixture" },
    { id: "object_consumable_seed", name: "Consumable synthetic seed", kind: "consumable" },
  ];
  const purposeIndex = (purpose) => fixture.concept.beats.findIndex((beat) => beat.purpose === purpose);
  const crossingIndex = purposeIndex("crossing");
  const climaxIndex = purposeIndex("climax");
  const returnIndex = purposeIndex("return");
  const preparationIndex = Math.max(0, crossingIndex - 1);
  const adventureIndex = Math.min(climaxIndex - 1, crossingIndex + 1);
  addEvent(mechanics.scenes[preparationIndex], {
    objectId: "object_unique_map",
    kind: "acquire",
    fromState: "stored",
    toState: "carried",
    toOwnerCharacterId: "character_hero",
  });
  addEvent(mechanics.scenes[adventureIndex], {
    objectId: "object_fixed_landmark",
    kind: "reveal",
    fromState: "hidden",
    toState: "revealed",
  });
  addEvent(mechanics.scenes[adventureIndex], {
    objectId: "object_consumable_seed",
    kind: "acquire",
    fromState: "available",
    toState: "held",
    toOwnerCharacterId: "character_hero",
  });
  addEvent(mechanics.scenes[climaxIndex], {
    objectId: "object_consumable_seed",
    kind: "consume",
    fromState: "held",
    toState: "consumed",
    fromOwnerCharacterId: "character_hero",
  });
  const graph = compileCanonicalStoryGraph({ concept: fixture.concept, mechanics });
  return Object.freeze({
    ...fixture,
    graph,
    indexes: Object.freeze({ preparationIndex, adventureIndex, climaxIndex, returnIndex }),
  });
}

function refreshedGraph(graph) {
  const copy = structuredClone(graph);
  copy.validation.artifactDigest = canonicalStoryGraphDigest(copy);
  return copy;
}

export function narrativeV3ObjectAdversarialCases(graph, indexes) {
  const cases = [];
  const push = (id, expectedCode, mutate) => {
    const candidate = structuredClone(graph);
    mutate(candidate);
    cases.push({ id, expectedCode, graph: refreshedGraph(candidate) });
  };
  push("duplicate-acquisition", "object_acquire_invalid", (candidate) => {
    addEvent(candidate.scenes[indexes.adventureIndex], {
      objectId: "object_unique_map",
      kind: "acquire",
      fromState: "carried",
      toState: "carried",
      toOwnerCharacterId: "character_hero",
    });
  });
  push("silent-owner-change", "object_owner_discontinuity", (candidate) => {
    candidate.scenes[indexes.climaxIndex].objectEvents.find((event) => event.objectId === "object_consumable_seed").fromOwnerCharacterId = "character_guide";
  });
  push("consumed-object-reappears", "object_event_after_terminal", (candidate) => {
    addEvent(candidate.scenes[indexes.returnIndex], {
      objectId: "object_consumable_seed",
      kind: "reveal",
      fromState: "consumed",
      toState: "available",
    });
  });
  push("fixed-landmark-moves", "object_fixture_location_changed", (candidate) => {
    addEvent(candidate.scenes[indexes.returnIndex], {
      objectId: "object_fixed_landmark",
      kind: "reveal",
      fromState: "revealed",
      toState: "revealed",
    });
  });
  push("state-chain-breaks", "object_state_discontinuity", (candidate) => {
    const event = candidate.scenes[indexes.climaxIndex].objectEvents.find((entry) => entry.objectId === "object_consumable_seed");
    event.fromState = "missing_state";
  });
  return cases;
}

export async function runNarrativeV3ObjectLifecycleFixture({
  projectId = crypto.randomUUID(),
  artifactStore,
  runStore,
  fixture: rawFixture,
} = {}) {
  if (!artifactStore || !runStore) throw new Error("object_matrix_local_stores_required");
  const fixture = buildNarrativeV3ObjectFixture(rawFixture);
  const machine = new NarrativeV3StateMachine({ artifactStore, runStore });
  const intentArtifact = (await artifactStore.createArtifact({
    projectId,
    artifactType: "creation_intent",
    payload: fixture.intent,
    provenance: { producer: "v3_object_matrix", producerVersion: "v1", operationId: "build-intent" },
  })).artifact;
  await artifactStore.promoteArtifact({ projectId, artifactType: "creation_intent", artifactId: intentArtifact.id, expectedPointerRevision: 0 });
  const conceptArtifact = await commit({
    machine, runStore, artifactStore, projectId,
    runKey: `${fixture.fixture.fixtureId}-object-concept-v1`,
    stepKey: "parse-object-concept",
    stepType: "parse_story_concept",
    inputs: [intentArtifact],
    payload: fixture.concept,
  });
  const graphArtifact = await commit({
    machine, runStore, artifactStore, projectId,
    runKey: `${fixture.fixture.fixtureId}-object-graph-v1`,
    stepKey: "compile-object-graph",
    stepType: "compile_story_graph",
    inputs: [conceptArtifact],
    payload: fixture.graph,
  });
  const projection = compileObjectLifecycleProjection({ graph: fixture.graph });
  const projectionArtifact = await commit({
    machine, runStore, artifactStore, projectId,
    runKey: `${fixture.fixture.fixtureId}-object-projection-v1`,
    stepKey: "compile-object-lifecycle",
    stepType: "compile_object_lifecycle",
    inputs: [graphArtifact],
    payload: projection,
  });
  const releaseSpec = compileNarrativeBookSpecV3({
    intent: fixture.intent,
    graph: fixture.graph,
    objectProjection: projection,
    profileBindings: fixture.profileBindings,
  });
  const releaseArtifact = await commit({
    machine, runStore, artifactStore, projectId,
    runKey: `${fixture.fixture.fixtureId}-object-release-v3`,
    stepKey: "release-object-book-spec-v3",
    stepType: "release_narrative_book_spec_v3",
    inputs: [intentArtifact, graphArtifact, projectionArtifact],
    payload: releaseSpec,
  });
  const manuscript = parseManuscriptWire({ spec: releaseSpec, wire: syntheticManuscriptWire(releaseSpec) });
  const manuscriptArtifact = await commit({
    machine, runStore, artifactStore, projectId,
    runKey: `${fixture.fixture.fixtureId}-manuscript-v1`,
    stepKey: "write-object-manuscript-v1",
    stepType: "write_manuscript",
    inputs: [releaseArtifact],
    payload: manuscript,
  });
  const storyboard = compileVisualStoryboard({ spec: releaseSpec, manuscript });
  const storyboardArtifact = await commit({
    machine, runStore, artifactStore, projectId,
    runKey: `${fixture.fixture.fixtureId}-visual-storyboard-v1`,
    stepKey: "compile-object-visual-storyboard-v1",
    stepType: "compile_visual_storyboard",
    inputs: [releaseArtifact, manuscriptArtifact],
    payload: storyboard,
  });
  const continuityPlan = compileVisualContinuityPlan({ spec: releaseSpec, storyboard });
  const continuityArtifact = await commit({
    machine, runStore, artifactStore, projectId,
    runKey: `${fixture.fixture.fixtureId}-visual-continuity-plan-v1`,
    stepKey: "compile-object-visual-continuity-plan-v1",
    stepType: "compile_visual_continuity_plan",
    inputs: [releaseArtifact, storyboardArtifact],
    payload: continuityPlan,
  });
  const candidateSet = recordImageCandidateSet({
    storyboard,
    continuityPlan,
    candidates: syntheticImageCandidates(storyboard, fixture.fixture.fixtureId),
  });
  const candidateArtifact = await commit({
    machine, runStore, artifactStore, projectId,
    runKey: `${fixture.fixture.fixtureId}-image-candidates-v1`,
    stepKey: "record-object-image-candidates-v1",
    stepType: "record_image_candidates",
    inputs: [storyboardArtifact, continuityArtifact],
    payload: candidateSet,
  });
  const decisions = parseIllustrationEvaluationWire({
    storyboard,
    candidateSet,
    wire: syntheticEvaluationWire(storyboard, candidateSet),
  });
  const decisionArtifact = await commit({
    machine, runStore, artifactStore, projectId,
    runKey: `${fixture.fixture.fixtureId}-illustration-decisions-v1`,
    stepKey: "decide-object-illustrations-v1",
    stepType: "decide_illustrations",
    inputs: [storyboardArtifact, candidateArtifact],
    payload: decisions,
  });
  const deliveryManifest = compileDeliveryManifest({
    spec: releaseSpec,
    manuscript,
    storyboard,
    decisions,
  });
  const deliveryArtifact = await commit({
    machine, runStore, artifactStore, projectId,
    runKey: `${fixture.fixture.fixtureId}-delivery-manifest-v1`,
    stepKey: "assemble-object-delivery-manifest-v1",
    stepType: "assemble_delivery_manifest",
    inputs: [releaseArtifact, manuscriptArtifact, storyboardArtifact, decisionArtifact],
    payload: deliveryManifest,
  });
  const adversarial = narrativeV3ObjectAdversarialCases(fixture.graph, fixture.indexes).map((entry) => {
    try {
      compileObjectLifecycleProjection({ graph: entry.graph });
      return { id: entry.id, status: "unexpected_pass", expectedCode: entry.expectedCode };
    } catch (error) {
      return { id: entry.id, status: error.code === entry.expectedCode ? "rejected" : "wrong_rejection", expectedCode: entry.expectedCode, actualCode: String(error.code || "") };
    }
  });
  if (adversarial.some((entry) => entry.status !== "rejected")) throw new Error("object_matrix_adversarial_case_failed");
  return Object.freeze({
    version: NARRATIVE_V3_OBJECT_MATRIX_VERSION,
    fixtureId: fixture.fixture.fixtureId,
    language: fixture.fixture.language,
    universeId: fixture.fixture.universeId,
    pageCount: fixture.fixture.pageCount,
    sceneCount: projection.scenes.length,
    objectCount: projection.objects.length,
    adversarialCases: adversarial.length,
    deliveryReady: deliveryManifest.book.ready,
    artifactDigests: {
      creationIntent: intentArtifact.payloadDigest,
      storyConcept: conceptArtifact.payloadDigest,
      canonicalStoryGraph: graphArtifact.payloadDigest,
      objectLifecycleProjection: projectionArtifact.payloadDigest,
      narrativeBookSpecV3: releaseArtifact.payloadDigest,
      manuscript: manuscriptArtifact.payloadDigest,
      visualStoryboard: storyboardArtifact.payloadDigest,
      visualContinuityPlan: continuityArtifact.payloadDigest,
      imageCandidateSet: candidateArtifact.payloadDigest,
      illustrationDecisionSet: decisionArtifact.payloadDigest,
      deliveryManifest: deliveryArtifact.payloadDigest,
    },
    providerCalls: 0,
    paidModelCalls: 0,
    customerRoutesTouched: false,
    status: "passed",
  });
}

export function narrativeV3ObjectLifecycleMatrix() {
  return NARRATIVE_V3_SYNTHETIC_LANGUAGES.flatMap((language) => (
    UNIVERSE_OPTIONS.map((universe) => ({ language, universeId: universe.id, pageCount: 32 }))
  ));
}
