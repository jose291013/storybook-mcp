import { createPagePlan, createStoryRoles } from "../config/bookStructure.js";
import { createAgeIntentionContract } from "../services/ageIntentionContract.js";
import { loadCreationIntent } from "./creationIntent.js";
import { canonicalDigest, loadStoryConcept } from "./narrativeV3Canonical.js";
import { assertNarrativeV3Schema, NarrativeV3ContractError } from "./narrativeV3SchemaRegistry.js";
import { loadWorldLawContractV1 } from "./worldLawContractV1.js";

export const NARRATIVE_BRIEF_VERSION = 1;
export const NARRATIVE_BRIEF_ID = "calitiki.narrative-brief.v1";
// Version 2 adds the exact participant promise selected in the adventure card
// to the authoritative traveler set. Version 3 keeps every traveler physically
// present for the post-return clothing restoration. Older artifacts remain
// readable but are never rewritten.
export const NARRATIVE_BRIEF_BUILDER_VERSION = 3;

const AUTHORITY_FIELDS = Object.freeze([
  ["situation", ["creator_situation", "message", "challenge"]],
  ["understanding", ["story_intent_understanding", "story_intent_message", "message"]],
  ["desiredChange", ["story_intent_desired_change", "dream", "story_intent_message", "message"]],
  ["protectiveDoubt", ["story_intent_protective_doubt", "challenge", "creator_situation"]],
  ["accessibleFirstStep", ["story_intent_first_step", "story_seed_first_step", "story_seed_starting_point", "challenge"]],
  ["motivation", ["story_intent_motivation", "story_seed_emotional_tone", "dream"]],
  ["earnedReward", ["story_intent_reward", "story_seed_reward", "story_seed_resolution", "dream"]],
  ["message", ["story_intent_message", "story_seed_message", "message", "story_intent_understanding"]],
  ["storyStartingPoint", ["story_seed_starting_point", "creator_situation", "challenge"]],
  ["progressiveEffort", ["story_seed_effort", "story_seed_first_step", "story_intent_first_step", "challenge"]],
  ["childOwnedAction", ["story_seed_active_role", "story_seed_moment", "story_seed_effort", "story_intent_first_step", "challenge", "dream"]],
  ["adventureAdaptation", ["story_seed_adaptation", "story_seed_approach", "universe_instructions", "story_seed_starting_point"]],
  ["peakMoment", ["story_seed_moment", "story_seed_active_role", "story_seed_resolution", "story_seed_effort", "challenge", "dream"]],
  ["resolution", ["story_seed_resolution", "story_seed_reward", "story_intent_reward", "story_intent_desired_change", "dream", "message"]],
  ["transformation", ["story_seed_transformation", "story_intent_desired_change", "story_seed_resolution", "story_intent_message", "dream", "message"]],
  ["emotionalTone", ["story_seed_emotional_tone", "story_intent_motivation", "personality", "story_intent_message"]],
]);

const MILESTONE_AUTHORITY = Object.freeze([
  ["desired_change", "desiredChange"],
  ["protective_doubt", "protectiveDoubt"],
  ["positive_anticipation", "motivation"],
  ["accessible_first_step", "accessibleFirstStep"],
  ["progressive_attempts", "progressiveEffort"],
  ["child_owned_choice", "childOwnedAction"],
  ["earned_reward", "earnedReward"],
  ["inner_realization", "message"],
]);

function fail(code, path, message) {
  throw new NarrativeV3ContractError({ code, artifactType: "narrative_brief", issues: [{ path, message }] });
}

function clean(value, maximum = 1600) {
  return String(value || "").trim().slice(0, maximum);
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

function projection(value) {
  const copy = structuredClone(value);
  delete copy.validation.artifactDigest;
  return copy;
}

export function narrativeBriefDigest(value) {
  return canonicalDigest(projection(value));
}

function resolveAuthority(answers, fields) {
  for (const sourceField of fields) {
    const text = clean(answers?.[sourceField]);
    if (text) return { text, sourceField };
  }
  fail("narrative_brief_authority_missing", `/narrativeAuthority/${fields[0]}`, `No usable source was supplied for ${fields[0]}.`);
}

function purposePlan(storyRoles) {
  const crossingIndex = Math.max(1, storyRoles.indexOf("crossing_the_threshold") >= 0
    ? storyRoles.indexOf("crossing_the_threshold")
    : storyRoles.indexOf("first_attempt"));
  const preparationCandidates = ["call_to_action", "preparing_the_plan", "simple_plan"]
    .map((role) => storyRoles.indexOf(role))
    .filter((index) => index >= 0 && index < crossingIndex);
  const preparationIndex = Math.max(1, ...preparationCandidates);
  const climaxIndex = storyRoles.indexOf("climax");
  const returnIndex = storyRoles.indexOf("success_and_transformation");
  const resolutionIndex = storyRoles.indexOf("return_home_and_moral");
  const choiceIndex = storyRoles.indexOf("challenge_and_choice");
  return storyRoles.map((role, index) => {
    if (index === 0) return "opening";
    if (index === preparationIndex) return "preparation";
    if (index === crossingIndex) return "crossing";
    if (index === choiceIndex) return "choice";
    if (index === climaxIndex) return "climax";
    if (index === returnIndex) return "return";
    if (index === resolutionIndex) return "resolution";
    if (["external_problem", "internal_problem", "setback_and_learning"].includes(role)) return "setback";
    if (["character_and_desire", "world_discovery", "meeting_the_guide", "bond_with_the_guide", "simple_plan", "preparing_the_plan", "call_to_action"].includes(role)) return "desire";
    return "attempt";
  });
}

function castPlan(intent, semanticCast, age, scenePurposes, promisedTravelerKeys = []) {
  const byKey = new Map((semanticCast || []).map((entry) => [entry.key, entry]));
  const hero = intent.cast.find((entry) => entry.role === "hero");
  const naturalTravelers = intent.cast.filter((entry) => ["hero", "companion", "peer"].includes(entry.role));
  for (const characterKey of promisedTravelerKeys) {
    const promised = intent.cast.find((entry) => entry.characterKey === characterKey);
    if (!promised) fail("narrative_brief_promised_traveler_unknown", "/castPlan/travelerKeys", "A promised traveler is not part of the creation-intent cast.");
    if (!naturalTravelers.some((entry) => entry.characterKey === promised.characterKey)) naturalTravelers.push(promised);
  }
  if (naturalTravelers.length === 1 && age <= 7) {
    const adultSupport = intent.cast.find((entry) => ["guide", "family"].includes(entry.role));
    if (adultSupport) naturalTravelers.push(adultSupport);
  }
  const travelerKeys = [...new Set(naturalTravelers.map((entry) => entry.characterKey))];
  const originWitnessKeys = intent.cast.map((entry) => entry.characterKey).filter((key) => !travelerKeys.includes(key));
  const participation = new Map([
    ...travelerKeys.map((key) => [key, "traveler"]),
    ...originWitnessKeys.map((key) => [key, "origin_witness"]),
  ]);
  const characters = intent.cast.map((entry) => {
    const semantic = byKey.get(entry.characterKey) || {};
    return {
      characterKey: entry.characterKey,
      name: clean(semantic.name || entry.characterKey, 160),
      role: entry.role,
      kind: entry.kind,
      relationship: clean(semantic.relationship || entry.role, 160),
      participation: participation.get(entry.characterKey),
    };
  });
  let originCursor = 0;
  const returnIndex = scenePurposes.lastIndexOf("return");
  const participants = scenePurposes.map((purpose, index) => {
    if (["crossing", "attempt", "setback", "choice", "climax", "return"].includes(purpose)) return [...travelerKeys];
    if (purpose === "preparation") {
      const witness = originWitnessKeys[originCursor++ % Math.max(1, originWitnessKeys.length)];
      return [...new Set([...travelerKeys, ...(witness ? [witness] : [])])];
    }
    // The first origin scene after the return is the deterministic restoration
    // scene: every traveler must be physically present to recover ordinary
    // clothes and store the adventure equipment they actually carried.
    if (returnIndex >= 0 && index === returnIndex + 1) {
      const witness = originWitnessKeys[originCursor++ % Math.max(1, originWitnessKeys.length)];
      return [...new Set([...travelerKeys, ...(witness ? [witness] : [])])];
    }
    const witnessPool = originWitnessKeys.length ? originWitnessKeys : travelerKeys.filter((key) => key !== hero.characterKey);
    const witness = witnessPool[originCursor++ % Math.max(1, witnessPool.length)];
    return [...new Set([hero.characterKey, ...(witness ? [witness] : [])])];
  });
  return { characters, travelerKeys, originWitnessKeys, localAdventureKeys: [], participants };
}

function milestoneScenes(scenePurposes) {
  const indexes = (purpose) => scenePurposes.map((value, index) => value === purpose ? index + 1 : 0).filter(Boolean);
  const first = (purpose, fallback) => indexes(purpose)[0] || fallback;
  return {
    desired_change: [Math.min(2, scenePurposes.length)],
    protective_doubt: [first("setback", Math.min(3, scenePurposes.length))],
    positive_anticipation: [first("preparation", 1)],
    accessible_first_step: [first("crossing", 1)],
    progressive_attempts: indexes("attempt").slice(0, 3).length ? indexes("attempt").slice(0, 3) : [first("choice", 1)],
    child_owned_choice: [first("choice", first("climax", 1)), first("climax", 1)].filter((value, index, list) => list.indexOf(value) === index),
    earned_reward: [first("return", scenePurposes.length - 1)],
    inner_realization: [first("resolution", scenePurposes.length)],
  };
}

function zone(worldLaw, kind) {
  const value = worldLaw.zones.find((entry) => entry.kind === kind);
  if (!value) fail("narrative_brief_world_zone_missing", "/worldRules", `The ${kind} world zone is missing.`);
  return {
    zoneId: value.zoneId,
    name: value.name,
    mediumId: value.mediumId,
    gravityModelId: value.gravityModelId,
    locomotionIds: [...value.locomotionIds],
    allowedPostureIds: [...value.allowedPostureIds],
    requiredSurvivalMechanismIds: [...value.requiredSurvivalMechanismIds],
  };
}

export function buildNarrativeBriefV1({ creationIntent: rawIntent, worldLaw: rawWorldLaw, normalized, semanticSource } = {}) {
  const intent = loadCreationIntent(rawIntent);
  const worldLaw = loadWorldLawContractV1(rawWorldLaw);
  if (worldLaw.sourceCreationIntent.artifactDigest !== intent.validation.artifactDigest) {
    fail("narrative_brief_world_law_mismatch", "/sources", "World law does not belong to this creation intent.");
  }
  const answers = normalized?.answers || {};
  const resolved = new Map(AUTHORITY_FIELDS.map(([key, fields]) => [key, resolveAuthority(answers, fields)]));
  const authority = Object.fromEntries([...resolved].map(([key, value]) => [key, value.text]));
  const storyRoles = createStoryRoles(intent.book.pageCount);
  const scenePurposes = purposePlan(storyRoles);
  const plannedCast = castPlan(
    intent,
    semanticSource?.cast || [],
    intent.audience.age,
    scenePurposes,
    semanticSource?.storySeed?.promisedTravelerKeys || [],
  );
  const assignedMilestoneScenes = milestoneScenes(scenePurposes);
  const milestones = MILESTONE_AUTHORITY.map(([milestoneId, authorityKey]) => ({
    milestoneId,
    sourceText: authority[authorityKey],
    sourceField: resolved.get(authorityKey).sourceField,
    sceneNumbers: assignedMilestoneScenes[milestoneId],
  }));
  const ageContract = createAgeIntentionContract(answers, createPagePlan(intent.book.pageCount));
  const milestoneByScene = new Map();
  for (const milestone of milestones) {
    for (const sceneNumber of milestone.sceneNumbers) {
      const values = milestoneByScene.get(sceneNumber) || [];
      values.push(milestone.milestoneId);
      milestoneByScene.set(sceneNumber, values);
    }
  }
  const passage = worldLaw.passages[0];
  const heroSemantic = semanticSource?.hero || {};
  const value = {
    schemaVersion: NARRATIVE_BRIEF_VERSION,
    contractId: NARRATIVE_BRIEF_ID,
    sources: {
      creationIntentDigest: intent.validation.artifactDigest,
      worldLawDigest: worldLaw.validation.artifactDigest,
      questionnaireDigest: intent.sourceRefs.questionnaireDigest,
    },
    language: intent.language,
    audienceAge: intent.audience.age,
    sceneCount: storyRoles.length,
    hero: {
      characterKey: intent.cast.find((entry) => entry.role === "hero").characterKey,
      name: clean(heroSemantic.name || answers.hero_name || "hero", 160),
      personality: clean(heroSemantic.personality || answers.personality || authority.emotionalTone),
      interests: clean(heroSemantic.interests || answers.favorite_activities || authority.storyStartingPoint),
      dream: clean(heroSemantic.dream || answers.dream || authority.desiredChange),
      challenge: clean(heroSemantic.challenge || answers.challenge || authority.protectiveDoubt),
    },
    narrativeAuthority: authority,
    ageProfile: {
      id: ageContract.ageProfile.id,
      conceptualComplexity: ageContract.ageProfile.conceptualComplexity,
      metaphorMode: ageContract.ageProfile.metaphorMode,
      emotionalReasoning: ageContract.ageProfile.emotionalReasoning,
      maximumConcurrentGoals: ageContract.ageProfile.maximumConcurrentGoals,
      maximumCausalStepsPerScene: ageContract.ageProfile.maximumCausalStepsPerScene,
      guideMay: [...ageContract.childAgency.guideMay],
      guideMustNot: [...ageContract.childAgency.guideMustNot],
      demonstrateMessageBeforeStatement: true,
      maximumExplicitMessageFormulations: 1,
    },
    worldRules: {
      universeId: worldLaw.universeId,
      origin: zone(worldLaw, "origin"),
      adventure: zone(worldLaw, "adventure"),
      boundary: zone(worldLaw, "boundary"),
      passage: {
        passageId: passage.passageId,
        originZoneId: passage.originZoneId,
        adventureZoneId: passage.adventureZoneId,
        boundaryZoneId: passage.boundaryZoneId,
        geometryId: passage.geometryId,
        cameraSideRule: passage.cameraSideRule,
      },
      survivalMechanisms: worldLaw.survivalMechanisms.map((entry) => ({
        mechanismId: entry.mechanismId,
        scope: entry.scope,
        activeStateId: entry.activeStateId,
        requiredMediumIds: [...entry.requiredMediumIds],
      })),
      nativeElementIds: [...worldLaw.nativeElementIds],
      forbiddenElementIds: [...worldLaw.forbiddenElementIds],
      capabilities: worldLaw.capabilities.map((entry) => ({ ...entry })),
    },
    castPlan: {
      characters: plannedCast.characters,
      travelerKeys: plannedCast.travelerKeys,
      originWitnessKeys: plannedCast.originWitnessKeys,
      localAdventureKeys: plannedCast.localAdventureKeys,
    },
    milestones,
    scenePlan: storyRoles.map((storyRole, index) => ({
      sceneNumber: index + 1,
      beatKey: `scene_${String(index + 1).padStart(2, "0")}_${scenePurposes[index]}`,
      storyRole,
      purpose: scenePurposes[index],
      participantKeys: plannedCast.participants[index],
      milestoneIds: milestoneByScene.get(index + 1) || [],
    })),
    provenance: AUTHORITY_FIELDS.map(([authorityKey]) => ({
      authorityKey: authorityKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      sourceField: resolved.get(authorityKey).sourceField,
    })),
    validation: { builderVersion: NARRATIVE_BRIEF_BUILDER_VERSION, artifactDigest: "" },
  };
  value.validation.artifactDigest = narrativeBriefDigest(value);
  assertNarrativeV3Schema("narrative_brief", value);
  return freeze(structuredClone(value));
}

export function loadNarrativeBriefV1(value) {
  assertNarrativeV3Schema("narrative_brief", value);
  if (value.validation.artifactDigest !== narrativeBriefDigest(value)) {
    fail("narrative_brief_digest_mismatch", "/validation/artifactDigest", "Narrative brief digest mismatch.");
  }
  if (value.scenePlan.length !== value.sceneCount) {
    fail("narrative_brief_scene_count_mismatch", "/scenePlan", "The scene plan must exactly cover the requested book.");
  }
  const sceneNumbers = value.scenePlan.map((scene) => scene.sceneNumber);
  if (sceneNumbers.some((sceneNumber, index) => sceneNumber !== index + 1)) {
    fail("narrative_brief_scene_order_invalid", "/scenePlan", "Scene numbers must be complete and ordered.");
  }
  const castKeys = new Set(value.castPlan.characters.map((entry) => entry.characterKey));
  const covered = new Set(value.scenePlan.flatMap((scene) => scene.participantKeys));
  if (value.scenePlan.some((scene) => !scene.participantKeys.includes(value.hero.characterKey))) {
    fail("narrative_brief_hero_missing", "/scenePlan", "The hero must participate in every scene.");
  }
  if ([...castKeys].some((key) => !covered.has(key))) {
    fail("narrative_brief_cast_uncovered", "/scenePlan", "Every supplied cast member must have one planned scene.");
  }
  return freeze(structuredClone(value));
}

export function narrativeBriefForModel(rawBrief) {
  const brief = loadNarrativeBriefV1(rawBrief);
  return freeze({
    contract_id: brief.contractId,
    language: brief.language,
    audience_age: brief.audienceAge,
    scene_count: brief.sceneCount,
    hero: brief.hero,
    narrative_authority: brief.narrativeAuthority,
    age_profile: brief.ageProfile,
    world_rules: brief.worldRules,
    cast_plan: brief.castPlan,
    milestones: brief.milestones,
    scene_plan: brief.scenePlan,
  });
}

function sameSet(left, right) {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

export function assertStoryConceptFollowsNarrativeBrief(rawBrief, rawConcept) {
  const brief = loadNarrativeBriefV1(rawBrief);
  const concept = loadStoryConcept(rawConcept);
  const issues = [];
  if (concept.language !== brief.language) issues.push({ path: "/language", message: "Concept language differs from the narrative brief." });
  if (concept.beats.length !== brief.scenePlan.length) issues.push({ path: "/beats", message: "Concept scene count differs from the narrative brief." });
  const expectedArc = {
    desire: brief.narrativeAuthority.desiredChange,
    initialDoubt: brief.narrativeAuthority.protectiveDoubt,
    decisiveChoice: brief.narrativeAuthority.childOwnedAction,
    earnedChange: brief.narrativeAuthority.transformation,
  };
  for (const [key, expected] of Object.entries(expectedArc)) {
    if (concept.heroArc[key] !== expected) issues.push({ path: `/heroArc/${key}`, message: "The authoritative selected intention was reinterpreted or lost." });
  }
  brief.scenePlan.forEach((planned, index) => {
    const beat = concept.beats[index];
    if (!beat) return;
    if (beat.beatKey !== planned.beatKey) issues.push({ path: `/beats/${index}/beatKey`, message: "Beat key is not bound to the deterministic scene slot." });
    if (beat.purpose !== planned.purpose) issues.push({ path: `/beats/${index}/purpose`, message: "Beat purpose differs from the deterministic narrative spine." });
    if (!sameSet(beat.participantKeys, planned.participantKeys)) issues.push({ path: `/beats/${index}/participantKeys`, message: "Beat cast differs from the authoritative participation plan." });
  });
  if (issues.length) {
    throw new NarrativeV3ContractError({
      code: "story_concept_narrative_brief_mismatch",
      artifactType: "story_concept",
      issues: issues.slice(0, 20),
    });
  }
  return true;
}
