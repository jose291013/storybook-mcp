import crypto from "node:crypto";

import { UNIVERSE_OPTIONS } from "../config/bookOptions.js";
import { buildCanonicalStoryMechanics } from "../contracts/buildCanonicalStoryMechanics.js";
import { buildCreationIntent } from "../contracts/creationIntent.js";
import {
  canonicalDigest,
  compileCanonicalStoryGraph,
  parseStoryConceptWire,
} from "../contracts/narrativeV3Canonical.js";
import { NarrativeV3StateMachine } from "./narrativeV3StateMachine.js";

export const NARRATIVE_V3_SYNTHETIC_SHADOW_VERSION = 1;
export const NARRATIVE_V3_SYNTHETIC_PAGE_COUNTS = Object.freeze([24, 28, 32, 36, 40, 44]);
export const NARRATIVE_V3_SYNTHETIC_LANGUAGES = Object.freeze(["FR", "ES", "EN"]);

const PURPOSE_TEXT = Object.freeze({
  FR: Object.freeze({
    title: "Le chemin des essais",
    premise: "L'enfant observe, choisit et ajuste sa méthode avec confiance.",
    themeProof: "Ses décisions successives produisent une réussite qu'il comprend.",
    desire: "Trouver sa propre façon d'avancer.",
    doubt: "Il craint de ne pas réussir immédiatement.",
    choice: "Il compare les indices puis choisit.",
    change: "Il sait désormais essayer et ajuster.",
    summary: "Moment narratif synthétique",
    emotion: "progression synthétique",
    image: "composition synthétique",
  }),
  ES: Object.freeze({
    title: "El camino de los intentos",
    premise: "El niño observa, elige y ajusta su método con confianza.",
    themeProof: "Sus decisiones sucesivas producen un logro que comprende.",
    desire: "Encontrar su propia manera de avanzar.",
    doubt: "Teme no lograrlo inmediatamente.",
    choice: "Compara las pistas y luego elige.",
    change: "Ahora sabe intentar y ajustar.",
    summary: "Momento narrativo sintético",
    emotion: "progresión sintética",
    image: "composición sintética",
  }),
  EN: Object.freeze({
    title: "The path of attempts",
    premise: "The child observes, chooses, and adjusts with confidence.",
    themeProof: "Successive decisions produce an achievement the child understands.",
    desire: "Find a personal way forward.",
    doubt: "The child fears not succeeding immediately.",
    choice: "The child compares the clues and chooses.",
    change: "The child can now try and adjust.",
    summary: "Synthetic narrative moment",
    emotion: "synthetic progression",
    image: "synthetic composition",
  }),
});

function actForIndex(index, total) {
  const actOneCount = Math.max(1, Math.floor(total * 0.3));
  const actTwoEnd = Math.max(actOneCount + 1, Math.min(total - 1, Math.floor(total * 0.75)));
  if (index < actOneCount) return 1;
  if (index < actTwoEnd) return 2;
  return 3;
}

function artifactRef(artifact) {
  return {
    artifactId: artifact.id,
    artifactType: artifact.artifactType,
    artifactDigest: artifact.payloadDigest,
  };
}

function validateFixture(rawFixture = {}) {
  const language = String(rawFixture.language || "FR").toUpperCase();
  const universeId = String(rawFixture.universeId || "");
  const pageCount = Number(rawFixture.pageCount);
  if (!NARRATIVE_V3_SYNTHETIC_LANGUAGES.includes(language)) throw new Error("synthetic_shadow_language_unsupported");
  if (!UNIVERSE_OPTIONS.some((entry) => entry.id === universeId)) throw new Error("synthetic_shadow_universe_unsupported");
  if (!NARRATIVE_V3_SYNTHETIC_PAGE_COUNTS.includes(pageCount)) throw new Error("synthetic_shadow_page_count_unsupported");
  return Object.freeze({
    fixtureId: `synthetic-${language.toLowerCase()}-${universeId}-${pageCount}`,
    language,
    universeId,
    pageCount,
  });
}

export function buildNarrativeV3SyntheticFixture(rawFixture = {}) {
  const fixture = validateFixture(rawFixture);
  const sourceDigest = canonicalDigest({ version: 1, fixture });
  const intent = buildCreationIntent({
    language: fixture.language,
    audienceAge: 8,
    pageCount: fixture.pageCount,
    universeId: fixture.universeId,
    intentionId: "synthetic_learn_by_trying",
    approachId: "synthetic_observe_choose_adjust",
    sensitivityLevel: 1,
    castRefs: [
      { characterKey: "hero", profileRef: "synthetic-profile:hero", role: "hero", kind: "human" },
      { characterKey: "guide", profileRef: "synthetic-profile:guide", role: "guide", kind: "human" },
      { characterKey: "family", profileRef: "synthetic-profile:family", role: "family", kind: "human" },
      { characterKey: "companion", profileRef: "synthetic-profile:companion", role: "companion", kind: "animal" },
    ],
    seriesRef: null,
    previousCanonDigest: null,
    questionnaireDigest: sourceDigest,
    safetyAssessmentDigest: canonicalDigest({ version: 1, fixture, assessment: "synthetic-safe" }),
  });
  const text = PURPOSE_TEXT[fixture.language];
  const total = (fixture.pageCount - 2) / 2;
  const crossingIndex = Math.floor(total * 0.3);
  const climaxIndex = Math.max(crossingIndex + 1, Math.floor(total * 0.75));
  const returnIndex = Math.min(total - 2, climaxIndex + 1);
  const beats = Array.from({ length: total }, (_, index) => {
    let purpose = actForIndex(index, total) === 1 ? "desire" : "attempt";
    if (index === 0) purpose = "opening";
    if (index === crossingIndex) purpose = "crossing";
    if (index === climaxIndex) purpose = "climax";
    if (index === returnIndex) purpose = "return";
    if (index === total - 1) purpose = "resolution";
    const participantKeys = ["hero", "guide"];
    if ([0, returnIndex, total - 1].includes(index)) participantKeys.push("family");
    if (index > crossingIndex && index < returnIndex && index % 2 === 0) participantKeys.push("companion");
    return {
      beat_key: `beat_${String(index + 1).padStart(2, "0")}`,
      purpose,
      summary: `${text.summary} ${index + 1}.`,
      emotional_shift: `${text.emotion} ${index + 1}`,
      distinctive_image: `${text.image} ${index + 1}`,
      participant_keys: participantKeys,
    };
  });
  const concept = parseStoryConceptWire({
    schema_version: 1,
    contract_id: "calitiki.story-concept-wire.v1",
    language: fixture.language,
    title: text.title,
    premise: text.premise,
    theme_proof: text.themeProof,
    hero_arc: {
      desire: text.desire,
      initial_doubt: text.doubt,
      decisive_choice: text.choice,
      earned_change: text.change,
    },
    beats,
  });
  return Object.freeze({ fixture, intent, concept });
}

async function ensureRootIntent({ artifactStore, projectId, intent }) {
  const result = await artifactStore.createArtifact({
    projectId,
    artifactType: "creation_intent",
    payload: intent,
    provenance: { producer: "v3_synthetic_shadow", producerVersion: "v1", operationId: "build-intent" },
  });
  const promotion = await artifactStore.promoteArtifact({
    projectId,
    artifactType: "creation_intent",
    artifactId: result.artifact.id,
    expectedPointerRevision: 0,
  });
  if (!promotion.promoted) throw new Error(`synthetic_shadow_intent_promotion_${promotion.reason || "failed"}`);
  return result.artifact;
}

async function commitSyntheticStep({ machine, runStore, artifactStore, projectId, runKey, stepKey, stepType, inputArtifact, payload }) {
  const pointer = await artifactStore.getCurrentPointer(projectId, stepType === "parse_story_concept" ? "story_concept" : "canonical_story_graph");
  const queued = await machine.enqueue({
    projectId,
    runKey,
    steps: [{
      stepKey,
      stepType,
      expectedPointerRevision: Number(pointer?.pointerRevision || 0),
      inputs: [artifactRef(inputArtifact)],
      maxAttempts: 1,
    }],
  });
  const currentRun = await runStore.getRun(queued.run.id);
  if (currentRun?.status !== "completed") {
    const workerId = `shadow-${stepKey}`;
    const lease = await runStore.claimNext({ workerId });
    if (!lease || lease.runId !== queued.run.id) throw new Error("synthetic_shadow_step_not_claimed");
    await machine.commitArtifact({
      stepId: lease.id,
      workerId,
      artifact: {
        payload,
        provenance: {
          producer: "v3_synthetic_shadow",
          producerVersion: "v1",
          runId: queued.run.id,
          stepId: lease.id,
          operationId: stepKey,
        },
      },
    });
  }
  const outputType = stepType === "parse_story_concept" ? "story_concept" : "canonical_story_graph";
  const current = await artifactStore.getCurrentPointer(projectId, outputType);
  if (!current) throw new Error("synthetic_shadow_output_pointer_missing");
  return artifactStore.getArtifact(current.artifactId);
}

export async function runNarrativeV3SyntheticShadowFixture({
  projectId = crypto.randomUUID(),
  artifactStore,
  runStore,
  fixture: rawFixture,
} = {}) {
  if (!artifactStore || !runStore) throw new Error("synthetic_shadow_local_stores_required");
  const { fixture, intent, concept } = buildNarrativeV3SyntheticFixture(rawFixture);
  const machine = new NarrativeV3StateMachine({ artifactStore, runStore });
  const intentArtifact = await ensureRootIntent({ artifactStore, projectId, intent });
  const conceptArtifact = await commitSyntheticStep({
    machine,
    runStore,
    artifactStore,
    projectId,
    runKey: `${fixture.fixtureId}-concept-v1`,
    stepKey: "parse-concept",
    stepType: "parse_story_concept",
    inputArtifact: intentArtifact,
    payload: concept,
  });
  const mechanics = buildCanonicalStoryMechanics({ intent, concept });
  const graph = compileCanonicalStoryGraph({ concept, mechanics });
  const graphArtifact = await commitSyntheticStep({
    machine,
    runStore,
    artifactStore,
    projectId,
    runKey: `${fixture.fixtureId}-graph-v1`,
    stepKey: "compile-graph",
    stepType: "compile_story_graph",
    inputArtifact: conceptArtifact,
    payload: graph,
  });
  const actCounts = Object.fromEntries([1, 2, 3].map((act) => [act, graph.scenes.filter((scene) => scene.act === act).length]));
  const movementCounts = graph.scenes.reduce((counts, scene) => {
    for (const movement of scene.movements) counts[movement.kind] = (counts[movement.kind] || 0) + 1;
    return counts;
  }, {});
  return Object.freeze({
    version: NARRATIVE_V3_SYNTHETIC_SHADOW_VERSION,
    fixtureId: fixture.fixtureId,
    language: fixture.language,
    universeId: fixture.universeId,
    pageCount: fixture.pageCount,
    sceneCount: graph.scenes.length,
    actCounts,
    movementCounts,
    artifactDigests: {
      creationIntent: intentArtifact.payloadDigest,
      storyConcept: conceptArtifact.payloadDigest,
      canonicalStoryGraph: graphArtifact.payloadDigest,
    },
    providerCalls: 0,
    paidModelCalls: 0,
    customerRoutesTouched: false,
    status: "passed",
  });
}

export function narrativeV3SyntheticShadowMatrix() {
  return NARRATIVE_V3_SYNTHETIC_LANGUAGES.flatMap((language) => (
    UNIVERSE_OPTIONS.flatMap((universe) => (
      NARRATIVE_V3_SYNTHETIC_PAGE_COUNTS.map((pageCount) => ({ language, universeId: universe.id, pageCount }))
    ))
  ));
}
