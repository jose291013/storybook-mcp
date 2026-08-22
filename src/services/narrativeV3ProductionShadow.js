import crypto from "node:crypto";

import { narrativeV3ConceptAgent } from "../agents/narrativeV3Concept.js";
import { buildCanonicalStoryMechanics } from "../contracts/buildCanonicalStoryMechanics.js";
import { buildCreationIntent } from "../contracts/creationIntent.js";
import { buildVisualIntentV1 } from "../contracts/visualIntentV1.js";
import {
  canonicalDigest,
  compileCanonicalStoryGraph,
  parseStoryConceptWire,
} from "../contracts/narrativeV3Canonical.js";
import { compileNarrativeBookSpecV3 } from "../contracts/narrativeBookSpecV3.js";
import { compileObjectLifecycleProjection } from "../contracts/objectLifecycleProjection.js";
import { normalizeBookRequest } from "./normalizeBookRequest.js";
import { withOpenAICostContext } from "./openaiCostContext.js";
import { projectStore } from "./projectStore.js";
import { databaseEnabled } from "./database.js";
import { narrativeV3ArtifactStore } from "./narrativeV3ArtifactStore.js";
import {
  JsonNarrativeV3RunStore,
  NarrativeV3StateMachine,
  PostgresNarrativeV3RunStore,
} from "./narrativeV3StateMachine.js";

export const NARRATIVE_V3_PRODUCTION_SHADOW_VERSION = 1;
export const NARRATIVE_V3_APPROVED_RELEASE_GATE_DIGEST = "849bb68b690840309381de3fadce00f5b4e19ae6f23faad8ad47def0e635a523";
export const NARRATIVE_V3_PRODUCTION_RUN_PREFIX = "production-shadow-v1:";

const productionRunStore = databaseEnabled()
  ? new PostgresNarrativeV3RunStore()
  : new JsonNarrativeV3RunStore();
const productionMachine = new NarrativeV3StateMachine({
  runStore: productionRunStore,
  artifactStore: narrativeV3ArtifactStore,
});

function clean(value, maximum = 160) {
  return String(value || "").trim().slice(0, maximum);
}

function canonicalKey(value, fallback) {
  return clean(value, 120).normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || fallback;
}

function exactAllowlist(value = process.env.NARRATIVE_V3_SHADOW_CUSTOMER_IDS) {
  return new Set(String(value || "").split(",").map((entry) => clean(entry, 80)).filter(Boolean));
}

export function narrativeV3ProductionShadowEligibility({ project, identity } = {}, env = process.env) {
  if (clean(env.NARRATIVE_V3_ROLLOUT_MODE).toLowerCase() !== "shadow") {
    return Object.freeze({ eligible: false, reason: "rollout_not_shadow" });
  }
  if (clean(env.NARRATIVE_V3_RELEASE_GATE_DIGEST).toLowerCase() !== NARRATIVE_V3_APPROVED_RELEASE_GATE_DIGEST) {
    return Object.freeze({ eligible: false, reason: "release_gate_mismatch" });
  }
  const wooCustomerId = clean(identity?.wooCustomerId, 80);
  if (!wooCustomerId || !exactAllowlist(env.NARRATIVE_V3_SHADOW_CUSTOMER_IDS).has(wooCustomerId)) {
    return Object.freeze({ eligible: false, reason: "customer_not_allowlisted" });
  }
  if (!project?.id || project.customerId == null) {
    return Object.freeze({ eligible: false, reason: "owned_project_required" });
  }
  if (project.seriesId) {
    return Object.freeze({ eligible: false, reason: "series_shadow_not_yet_supported" });
  }
  return Object.freeze({ eligible: true, reason: "allowlisted_shadow" });
}

const CANONICAL_ROLE_BY_SELECTED_ROLE = Object.freeze({
  guide: "guide",
  ally: "peer",
  companion: "companion",
  supporter: "family",
  guest: "family",
});

export function canonicalNarrativeCastRole(photo = {}) {
  if (photo.role === "mascot") return "companion";
  const selectedRole = clean(photo.story_role || photo.storyRole, 40).toLowerCase();
  if (CANONICAL_ROLE_BY_SELECTED_ROLE[selectedRole]) return CANONICAL_ROLE_BY_SELECTED_ROLE[selectedRole];
  if (photo.role === "family") return "family";
  return "peer";
}

function buildCast(project, normalized) {
  const used = new Set(["hero"]);
  const heroPhoto = normalized.photos.find((photo) => photo.role === "child");
  const cast = [{
    characterKey: "hero",
    profileRef: heroPhoto ? `reference-photo:${heroPhoto.id}` : `project:${project.id}:hero`,
    role: "hero",
    sourceRef: "hero",
    kind: "human",
    displayName: clean(normalized.answers.hero_name, 120) || "Hero",
    photo: heroPhoto || null,
  }];
  for (const [index, photo] of normalized.photos.filter((entry) => entry.role !== "child").slice(0, 7).entries()) {
    const base = canonicalKey(photo.name || photo.story_role || photo.role, `character_${index + 2}`);
    let key = base;
    let suffix = 2;
    while (used.has(key)) key = `${base.slice(0, 112)}_${suffix++}`;
    used.add(key);
    cast.push({
      characterKey: key,
      profileRef: `reference-photo:${photo.id}`,
      role: canonicalNarrativeCastRole(photo),
      sourceRef: clean(photo.participant_ref || photo.id, 160),
      kind: photo.role === "mascot" ? "animal" : "human",
      displayName: clean(photo.name, 120) || `Character ${index + 2}`,
      photo,
    });
  }
  return cast;
}

export function buildNarrativeV3ProjectSource(project = {}) {
  const normalized = normalizeBookRequest({ questionnaire: project.questionnaire, photos: project.photoRefs });
  const cast = buildCast(project, normalized);
  const sceneCount = (normalized.answers.page_count - 2) / 2;
  const actOneCount = Math.max(1, Math.floor(sceneCount * 0.3));
  const actTwoEnd = Math.max(actOneCount + 1, Math.min(sceneCount - 1, Math.floor(sceneCount * 0.75)));
  const climaxScene = actTwoEnd + 1;
  const returnScene = Math.min(sceneCount - 1, climaxScene + 1);
  const previousCanon = project?.continuitySnapshot?.seriesContext?.narrativeCanon || null;
  let promisedParticipantRefs = [];
  if (normalized.answers.story_seed_participant_refs) {
    try {
      const parsed = JSON.parse(normalized.answers.story_seed_participant_refs);
      if (!Array.isArray(parsed)) throw new Error("participant refs must be an array");
      promisedParticipantRefs = [...new Set(parsed.map((entry) => clean(entry, 160)).filter(Boolean))];
    } catch {
      throw new Error("The selected adventure contains an invalid participant contract.");
    }
  }
  const castBySourceRef = new Map(cast.map((entry) => [entry.sourceRef, entry.characterKey]));
  const unknownParticipantRef = promisedParticipantRefs.find((entry) => !castBySourceRef.has(entry));
  if (unknownParticipantRef) throw new Error("The selected adventure refers to a character who is no longer available.");
  const promisedTravelerKeys = promisedParticipantRefs.map((entry) => castBySourceRef.get(entry));
  const semanticSource = {
    language: normalized.answers.language,
    audienceAge: Math.max(2, Math.min(14, Number.parseInt(normalized.answers.age, 10) || 7)),
    sceneCount,
    universe: {
      id: normalized.answers.universe_id,
      name: normalized.answers.universe,
      instructions: normalized.answers.universe_instructions,
      storyContract: normalized.answers.universe_story_contract,
    },
    hero: {
      key: "hero",
      name: normalized.answers.hero_name,
      personality: normalized.answers.personality,
      interests: normalized.answers.favorite_activities,
      dream: normalized.answers.dream,
      challenge: normalized.answers.challenge,
    },
    creatorGoal: {
      situation: normalized.answers.creator_situation,
      message: normalized.answers.story_intent_message || normalized.answers.message,
      understanding: normalized.answers.story_intent_understanding,
      desiredChange: normalized.answers.story_intent_desired_change,
      protectiveDoubt: normalized.answers.story_intent_protective_doubt,
      firstStep: normalized.answers.story_intent_first_step,
      motivation: normalized.answers.story_intent_motivation,
      reward: normalized.answers.story_intent_reward,
    },
    storySeed: {
      title: normalized.answers.story_seed_title,
      approach: normalized.answers.story_seed_approach,
      startingPoint: normalized.answers.story_seed_starting_point,
      firstStep: normalized.answers.story_seed_first_step,
      effort: normalized.answers.story_seed_effort,
      activeRole: normalized.answers.story_seed_active_role,
      reward: normalized.answers.story_seed_reward,
      resolution: normalized.answers.story_seed_resolution,
      adaptation: normalized.answers.story_seed_adaptation,
      moment: normalized.answers.story_seed_moment,
      transformation: normalized.answers.story_seed_transformation,
      message: normalized.answers.story_seed_message,
      emotionalTone: normalized.answers.story_seed_emotional_tone,
      promisedTravelerKeys,
    },
    cast: cast.map((entry) => ({
      key: entry.characterKey,
      name: entry.displayName,
      role: entry.role,
      kind: entry.kind,
      relationship: clean(entry.photo?.relationship, 120),
      selectedStoryRole: clean(entry.photo?.story_role || "hero", 40),
    })),
    requiredStructure: {
      crossingSceneRange: [actOneCount + 1, actTwoEnd],
      climaxScene,
      returnScene,
      resolutionScene: sceneCount,
    },
    ...(previousCanon ? {
      seriesContinuity: {
        previousTitle: clean(previousCanon.title, 200),
        universeId: clean(previousCanon.universeId, 120),
        characters: (previousCanon.characters || []).slice(0, 30).map((character) => ({
          name: clean(character?.name, 120),
          role: clean(character?.role || character?.storyRole, 80),
          relationship: clean(character?.relationship, 120),
        })).filter((character) => character.name),
        establishedLocations: (previousCanon.locations || []).slice(0, 40).map((value) => clean(value, 160)).filter(Boolean),
      },
    } : {}),
  };
  const questionnaireDigest = canonicalDigest(semanticSource);
  const safetyAssessmentDigest = canonicalDigest({
    childSafety: project.questionnaire?.child_safety_profile || null,
    sensitivity: project.questionnaire?.story_sensitivity_profile || null,
  });
  const intent = buildCreationIntent({
    language: semanticSource.language,
    audienceAge: semanticSource.audienceAge,
    pageCount: normalized.answers.page_count,
    universeId: normalized.answers.universe_id,
    intentionId: canonicalKey(normalized.answers.story_intent_id, "creator_goal"),
    approachId: canonicalKey(normalized.answers.story_seed_id || normalized.answers.story_seed_approach, "semantic_story"),
    sensitivityLevel: Math.max(1, Math.min(3, Number(project.questionnaire?.story_sensitivity_profile?.level || 1))),
    castRefs: cast.map(({ characterKey, profileRef, role, kind }) => ({ characterKey, profileRef, role, kind })),
    seriesRef: project.seriesId || null,
    previousCanonDigest: previousCanon ? canonicalDigest(previousCanon) : null,
    questionnaireDigest,
    safetyAssessmentDigest,
  });
  const profileBindings = cast.map((entry) => ({
    characterKey: entry.characterKey,
    profileRef: entry.profileRef,
    profileRevision: 1,
    profileDigest: canonicalDigest({ profileRef: entry.profileRef, displayName: entry.displayName, role: entry.role, kind: entry.kind }),
    displayName: entry.displayName,
    visualIdentityRef: `${entry.profileRef}:identity`,
    visualIdentityDigest: canonicalDigest({ profileRef: entry.profileRef, photoId: entry.photo?.id || null, storageKey: entry.photo?.storageKey || null }),
  }));
  const visualIntent = buildVisualIntentV1({
    creationIntent: intent,
    characters: cast.map((entry) => {
      if (entry.kind !== "human") {
        return {
          characterKey: entry.characterKey,
          profileRef: entry.profileRef,
          kind: entry.kind,
          identityDigest: canonicalDigest({ profileRef: entry.profileRef, photoId: entry.photo?.id || null }),
          naturalAppearanceDescription: "the exact canonical natural appearance from the private identity reference, with no invented human clothing",
        };
      }
      const preference = entry.photo?.outfit_preference || "preserve_photo";
      return {
        characterKey: entry.characterKey,
        profileRef: entry.profileRef,
        kind: entry.kind,
        outfitPreference: preference,
        ordinaryOutfitDescription: "the exact generic, unbranded everyday clothing established by the private identity reference",
        ordinaryOutfitDigest: canonicalDigest({
          profileRef: entry.profileRef,
          photoId: entry.photo?.id || null,
          source: "private_identity_reference",
        }),
        adventureOutfitId: entry.photo?.outfit_id || "",
        accommodationIds: [],
      };
    }),
  });
  return Object.freeze({ normalized, semanticSource, intent, visualIntent, profileBindings });
}

// Compatibility export for the already deployed, isolated shadow worker.
export const buildNarrativeV3ShadowSource = buildNarrativeV3ProjectSource;

function artifactRef(artifact) {
  return { artifactId: artifact.id, artifactType: artifact.artifactType, artifactDigest: artifact.payloadDigest };
}

async function ensureRootIntent(projectId, intent, artifactStore = narrativeV3ArtifactStore) {
  const current = await artifactStore.getCurrentPointer(projectId, "creation_intent");
  if (current) {
    const artifact = await artifactStore.getArtifact(current.artifactId);
    if (artifact?.payloadDigest !== intent.validation.artifactDigest) throw new Error("narrative_v3_shadow_intent_conflict");
    return artifact;
  }
  const created = await artifactStore.createArtifact({
    projectId,
    artifactType: "creation_intent",
    payload: intent,
    provenance: { producer: "v3_production_shadow", producerVersion: "v1", operationId: "seal_intent" },
  });
  const promoted = await artifactStore.promoteArtifact({
    projectId,
    artifactType: "creation_intent",
    artifactId: created.artifact.id,
    expectedPointerRevision: 0,
  });
  if (!promoted.promoted) throw new Error(`narrative_v3_shadow_intent_${promoted.reason || "promotion_failed"}`);
  return created.artifact;
}

const STAGES = Object.freeze({
  parse_story_concept: { output: "story_concept", key: "concept" },
  compile_story_graph: { output: "canonical_story_graph", key: "graph" },
  compile_object_lifecycle: { output: "object_lifecycle_projection", key: "objects" },
  release_narrative_book_spec_v3: { output: "narrative_book_spec_v3", key: "release" },
});

async function enqueueStage({ projectId, stepType, inputs, machine = productionMachine, artifactStore = narrativeV3ArtifactStore }) {
  const stage = STAGES[stepType];
  const pointer = await artifactStore.getCurrentPointer(projectId, stage.output);
  return machine.enqueue({
    projectId,
    runKey: `${NARRATIVE_V3_PRODUCTION_RUN_PREFIX}${stage.key}:${canonicalDigest(inputs.map(artifactRef)).slice(0, 48)}`,
    steps: [{
      stepKey: stage.key,
      stepType,
      expectedPointerRevision: Number(pointer?.pointerRevision || 0),
      inputs: inputs.map(artifactRef),
      maxAttempts: 2,
    }],
  });
}

export async function enqueueNarrativeV3ProductionShadow({ project, identity } = {}, dependencies = {}) {
  const eligibility = narrativeV3ProductionShadowEligibility({ project, identity }, dependencies.env || process.env);
  if (!eligibility.eligible) return eligibility;
  const artifactStore = dependencies.artifactStore || narrativeV3ArtifactStore;
  const machine = dependencies.machine || productionMachine;
  const source = buildNarrativeV3ShadowSource(project);
  const intentArtifact = await ensureRootIntent(project.id, source.intent, artifactStore);
  const queued = await enqueueStage({ projectId: project.id, stepType: "parse_story_concept", inputs: [intentArtifact], machine, artifactStore });
  console.info("[narrative-v3-shadow] queued", JSON.stringify({
    version: NARRATIVE_V3_PRODUCTION_SHADOW_VERSION,
    projectId: project.id,
    runId: queued.run.id,
    stage: "story_concept",
    created: queued.created,
  }));
  return Object.freeze({ eligible: true, queued: true, runId: queued.run.id, created: queued.created });
}

async function currentArtifact(projectId, type, artifactStore) {
  const pointer = await artifactStore.getCurrentPointer(projectId, type);
  return pointer ? artifactStore.getArtifact(pointer.artifactId) : null;
}

async function scheduleAfter({ projectId, stepType, artifactStore, machine }) {
  const intent = await currentArtifact(projectId, "creation_intent", artifactStore);
  const concept = await currentArtifact(projectId, "story_concept", artifactStore);
  const graph = await currentArtifact(projectId, "canonical_story_graph", artifactStore);
  const projection = await currentArtifact(projectId, "object_lifecycle_projection", artifactStore);
  if (stepType === "parse_story_concept" && concept) {
    return enqueueStage({ projectId, stepType: "compile_story_graph", inputs: [concept], machine, artifactStore });
  }
  if (stepType === "compile_story_graph" && graph) {
    return enqueueStage({ projectId, stepType: "compile_object_lifecycle", inputs: [graph], machine, artifactStore });
  }
  if (stepType === "compile_object_lifecycle" && intent && graph && projection) {
    return enqueueStage({ projectId, stepType: "release_narrative_book_spec_v3", inputs: [intent, graph, projection], machine, artifactStore });
  }
  return null;
}

export async function recoverNarrativeV3ProductionShadow(dependencies = {}) {
  const runStore = dependencies.runStore || productionRunStore;
  const artifactStore = dependencies.artifactStore || narrativeV3ArtifactStore;
  const machine = dependencies.machine || productionMachine;
  const runs = await runStore.listRunsByPrefix(NARRATIVE_V3_PRODUCTION_RUN_PREFIX);
  const projectIds = [...new Set(runs.map((run) => run.projectId))];
  let scheduled = 0;
  for (const projectId of projectIds) {
    const intent = await currentArtifact(projectId, "creation_intent", artifactStore);
    const concept = await currentArtifact(projectId, "story_concept", artifactStore);
    const graph = await currentArtifact(projectId, "canonical_story_graph", artifactStore);
    const projection = await currentArtifact(projectId, "object_lifecycle_projection", artifactStore);
    const release = await currentArtifact(projectId, "narrative_book_spec_v3", artifactStore);
    let result = null;
    if (!release && intent && graph && projection) {
      result = await enqueueStage({ projectId, stepType: "release_narrative_book_spec_v3", inputs: [intent, graph, projection], machine, artifactStore });
    } else if (!projection && graph) {
      result = await enqueueStage({ projectId, stepType: "compile_object_lifecycle", inputs: [graph], machine, artifactStore });
    } else if (!graph && concept) {
      result = await enqueueStage({ projectId, stepType: "compile_story_graph", inputs: [concept], machine, artifactStore });
    }
    if (result?.created) scheduled += 1;
  }
  return { projects: projectIds.length, scheduled };
}

function backgroundExecutionFor(step, runStore, workerId) {
  return {
    async getCheckpoint() {
      const current = await runStore.getStep(step.id);
      return current?.providerResponseId ? {
        responseId: current.providerResponseId,
        status: "in_progress",
        startedAt: current.createdAt,
        updatedAt: current.updatedAt,
      } : null;
    },
    async saveCheckpoint(checkpoint) {
      if (checkpoint?.responseId) await runStore.checkpointProvider(step.id, workerId, checkpoint.responseId);
    },
  };
}

function boundedErrorCode(error) {
  return canonicalKey(error?.code || error?.name || "shadow_step_failed", "shadow_step_failed").slice(0, 80);
}

async function buildStepPayload(step, { projects, artifactStore, runStore, workerId, conceptAgent }) {
  const inputs = await Promise.all(step.inputs.map((input) => artifactStore.getArtifact(input.artifactId)));
  if (step.stepType === "parse_story_concept") {
    const project = await projects.get(step.projectId);
    if (!project) throw new Error("narrative_v3_shadow_project_missing");
    const source = buildNarrativeV3ShadowSource(project);
    if (source.intent.validation.artifactDigest !== inputs[0].payloadDigest) throw new Error("narrative_v3_shadow_source_changed");
    const wire = await conceptAgent(source.semanticSource, {
      backgroundExecution: backgroundExecutionFor(step, runStore, workerId),
    });
    return parseStoryConceptWire(wire);
  }
  if (step.stepType === "compile_story_graph") {
    const concept = inputs[0].payload;
    const intentParent = await artifactStore.getArtifact(inputs[0].parents[0].artifactId);
    const mechanics = buildCanonicalStoryMechanics({ intent: intentParent.payload, concept });
    return compileCanonicalStoryGraph({ concept, mechanics });
  }
  if (step.stepType === "compile_object_lifecycle") {
    return compileObjectLifecycleProjection({ graph: inputs[0].payload });
  }
  if (step.stepType === "release_narrative_book_spec_v3") {
    const project = await projects.get(step.projectId);
    if (!project) throw new Error("narrative_v3_shadow_project_missing");
    const source = buildNarrativeV3ShadowSource(project);
    return compileNarrativeBookSpecV3({
      intent: inputs[0].payload,
      graph: inputs[1].payload,
      objectProjection: inputs[2].payload,
      profileBindings: source.profileBindings,
    });
  }
  throw new Error("narrative_v3_shadow_step_unsupported");
}

export async function runNextNarrativeV3ProductionShadow(dependencies = {}) {
  const runStore = dependencies.runStore || productionRunStore;
  const artifactStore = dependencies.artifactStore || narrativeV3ArtifactStore;
  const machine = dependencies.machine || productionMachine;
  const projects = dependencies.projects || projectStore;
  const conceptAgent = dependencies.conceptAgent || narrativeV3ConceptAgent;
  const workerId = dependencies.workerId || `v3-shadow-${process.pid}-${crypto.randomUUID()}`;
  const leaseMs = dependencies.leaseMs || 120000;
  const step = await runStore.claimNext({ workerId, leaseMs, runKeyPrefix: NARRATIVE_V3_PRODUCTION_RUN_PREFIX });
  if (!step) {
    await recoverNarrativeV3ProductionShadow({ runStore, artifactStore, machine });
    return null;
  }
  if (!STAGES[step.stepType]) return null;
  const started = Date.now();
  const heartbeat = setInterval(() => runStore.heartbeat(step.id, workerId, leaseMs).catch(() => null), Math.max(10000, Math.floor(leaseMs / 3)));
  heartbeat.unref?.();
  try {
    const payload = await withOpenAICostContext({
      projectId: step.projectId,
      runId: step.runId,
      workflow: "narrative_v3_shadow",
      getStage: () => step.stepType,
      getAttemptKind: () => "shadow",
    }, () => buildStepPayload(step, { projects, artifactStore, runStore, workerId, conceptAgent }));
    await machine.commitArtifact({
      stepId: step.id,
      workerId,
      artifact: {
        payload,
        provenance: {
          producer: "v3_production_shadow",
          producerVersion: "v1",
          runId: step.runId,
          stepId: step.id,
          operationId: STAGES[step.stepType].key,
        },
      },
    });
    await scheduleAfter({ projectId: step.projectId, stepType: step.stepType, artifactStore, machine });
    console.info("[narrative-v3-shadow] stage completed", JSON.stringify({
      projectId: step.projectId,
      runId: step.runId,
      stage: step.stepType,
      elapsedMs: Date.now() - started,
    }));
    return { status: "completed", stepType: step.stepType, projectId: step.projectId };
  } catch (error) {
    await runStore.fail(step.id, workerId, boundedErrorCode(error)).catch(() => null);
    console.error("[narrative-v3-shadow] stage failed", JSON.stringify({
      projectId: step.projectId,
      runId: step.runId,
      stage: step.stepType,
      code: boundedErrorCode(error),
      elapsedMs: Date.now() - started,
    }));
    return { status: "failed", stepType: step.stepType, projectId: step.projectId };
  } finally {
    clearInterval(heartbeat);
  }
}

let workerTimer = null;
let workerRunning = false;

export function startNarrativeV3ProductionShadowWorker() {
  if (process.env.NARRATIVE_V3_SHADOW_WORKER_ENABLED === "false" || workerTimer) return workerTimer;
  const intervalMs = Math.max(1000, Number.parseInt(process.env.NARRATIVE_V3_SHADOW_WORKER_INTERVAL_MS || "2000", 10) || 2000);
  const cycle = async () => {
    if (workerRunning) return;
    workerRunning = true;
    try { await runNextNarrativeV3ProductionShadow(); }
    catch (error) { console.error("[narrative-v3-shadow] worker cycle failed", JSON.stringify({ code: boundedErrorCode(error) })); }
    finally { workerRunning = false; }
  };
  workerTimer = setInterval(cycle, intervalMs);
  workerTimer.unref?.();
  setTimeout(cycle, 500).unref?.();
  return workerTimer;
}
