import { canonicalDigest } from "./narrativeV3Canonical.js";
import { assertNarrativeV3Schema, NarrativeV3ContractError } from "./narrativeV3SchemaRegistry.js";
import { loadNarrativeBriefV1 } from "./narrativeBriefV1.js";
import { loadVisualIntentV1 } from "./visualIntentV1.js";
import { loadWorldLawContractV1 } from "./worldLawContractV1.js";

export const JOURNEY_LIFECYCLE_VERSION = 1;
export const JOURNEY_LIFECYCLE_ID = "calitiki.journey-lifecycle.v1";
export const JOURNEY_LIFECYCLE_BUILDER_VERSION = 1;

const DISCOVERY_MODE_BY_UNIVERSE = Object.freeze({
  enchanted_forest: "magical_nature_revelation",
  starry_space: "unexpected_signal_revelation",
  coral_ocean: "magical_tide_revelation",
  cloud_castle: "unexpected_sky_route_revelation",
  dinosaur_valley: "accidental_fossil_revelation",
  wonder_city: "accidental_secret_passage_revelation",
});

function fail(code, path, message) {
  throw new NarrativeV3ContractError({ code, artifactType: "journey_lifecycle", issues: [{ path, message }] });
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

export function journeyLifecycleDigest(value) {
  return canonicalDigest(projection(value));
}

function sceneIndex(brief, purpose) {
  return brief.scenePlan.findIndex((scene) => scene.purpose === purpose);
}

function stateForScene({ index, discoveryIndex, preparationIndex, crossingIndex, returnIndex, restorationIndex }) {
  if (index < discoveryIndex) return { phase: "origin_ordinary", events: [], proofs: ["ordinary_clothes_visible", "passage_not_yet_revealed"] };
  if (index === discoveryIndex) return {
    phase: "passage_discovery",
    events: ["passage_revealed", "adventure_outfits_found_beside_passage"],
    proofs: ["revelation_cause_visible", "passage_visible_without_crossing", "one_adventure_outfit_per_traveler_beside_passage"],
  };
  if (index === preparationIndex) return {
    phase: "journey_preparation",
    events: ["ordinary_clothes_stored", "adventure_outfits_donned", "required_equipment_prepared"],
    proofs: ["change_occurs_on_origin_side", "ordinary_clothes_folded_at_boundary", "adventure_outfits_worn_once_per_traveler"],
  };
  if (index === crossingIndex) return {
    phase: "outbound_crossing",
    events: ["passage_opened", "travelers_crossed_outbound"],
    proofs: ["same_passage_outbound_crossing", "all_travelers_in_adventure_outfits", "no_origin_witness_crosses"],
  };
  if (index < returnIndex) return {
    phase: "adventure",
    events: [],
    proofs: ["adventure_outfits_remain_stable", "world_physics_apply"],
  };
  if (index === returnIndex) return {
    phase: "inbound_crossing",
    events: ["travelers_crossed_inbound"],
    proofs: ["same_passage_reverse_crossing", "travelers_still_wear_adventure_outfits"],
  };
  if (index === restorationIndex) return {
    phase: "restoration_and_storage",
    events: ["required_equipment_stored", "adventure_outfits_removed", "ordinary_clothes_retrieved", "ordinary_outfits_donned", "adventure_outfits_stored"],
    proofs: ["restoration_occurs_on_origin_side", "ordinary_clothes_worn_again", "adventure_outfits_folded_at_boundary", "journey_equipment_stored"],
  };
  return { phase: "origin_ordinary", events: [], proofs: ["ordinary_clothes_visible", "journey_is_physically_settled"] };
}

export function buildJourneyLifecycleV1({ narrativeBrief: rawBrief, worldLaw: rawWorldLaw, visualIntent: rawVisualIntent } = {}) {
  const brief = loadNarrativeBriefV1(rawBrief);
  const worldLaw = loadWorldLawContractV1(rawWorldLaw);
  const visual = loadVisualIntentV1(rawVisualIntent);
  if (brief.sources.worldLawDigest !== worldLaw.validation.artifactDigest || brief.sources.creationIntentDigest !== worldLaw.sourceCreationIntent.artifactDigest) {
    fail("journey_lifecycle_brief_source_mismatch", "/sources", "Narrative brief and world law must share the same immutable creation intent.");
  }
  if (visual.sourceCreationIntent.artifactDigest !== brief.sources.creationIntentDigest || visual.universeId !== worldLaw.universeId) {
    fail("journey_lifecycle_visual_source_mismatch", "/sources", "Visual intent must belong to the same creation intent and universe.");
  }
  const preparationIndex = sceneIndex(brief, "preparation");
  const crossingIndex = sceneIndex(brief, "crossing");
  const returnIndex = sceneIndex(brief, "return");
  const restorationIndex = returnIndex + 1;
  const discoveryIndex = preparationIndex - 1;
  if (discoveryIndex < 1 || preparationIndex < 2 || crossingIndex <= preparationIndex || returnIndex <= crossingIndex || restorationIndex >= brief.scenePlan.length) {
    fail("journey_lifecycle_scene_slots_invalid", "/sceneStates", "The story needs distinct discovery, preparation, outbound crossing, inbound crossing and restoration scenes.");
  }
  const visualByKey = new Map(visual.characters.map((entry) => [entry.characterKey, entry]));
  const travelerKeys = [...brief.castPlan.travelerKeys];
  for (const sceneIndexToCheck of [preparationIndex, crossingIndex, returnIndex, restorationIndex]) {
    const scene = brief.scenePlan[sceneIndexToCheck];
    const missingTravelers = travelerKeys.filter((characterKey) => !scene.participantKeys.includes(characterKey));
    if (missingTravelers.length) {
      fail(
        "journey_lifecycle_traveler_presence_missing",
        `/sceneStates/${sceneIndexToCheck}`,
        `Every traveler must be physically present for ${scene.purpose}: ${missingTravelers.join(", ")}.`,
      );
    }
  }
  const outfitBindings = travelerKeys.map((characterKey) => {
    const entry = visualByKey.get(characterKey);
    if (!entry) fail("journey_lifecycle_traveler_visual_missing", "/outfitBindings", `No visual intent exists for ${characterKey}.`);
    return {
      characterKey,
      ordinaryOutfitStateId: entry.ordinaryOutfit.stateId,
      adventureOutfitStateId: entry.adventureOutfit.stateId,
      ordinaryClothesObjectId: `ordinary_clothes_${characterKey}`,
      adventureOutfitObjectId: `adventure_outfit_${characterKey}`,
    };
  });
  const passage = worldLaw.passages[0];
  if (!passage) fail("journey_lifecycle_passage_missing", "/passage", "A portal round trip requires one canonical passage.");
  let passageState = "hidden";
  let travelerOutfitMode = "ordinary";
  let ordinaryClothesLocation = "worn_by_travelers";
  let adventureOutfitsLocation = "stored_at_boundary";
  const sceneStates = brief.scenePlan.map((scene, index) => {
    const state = stateForScene({ index, discoveryIndex, preparationIndex, crossingIndex, returnIndex, restorationIndex });
    const passageStateBefore = passageState;
    if (state.phase === "passage_discovery") passageState = "revealed";
    if (state.phase === "outbound_crossing") passageState = "open";
    if (state.phase === "inbound_crossing") passageState = "returned";
    if (state.phase === "restoration_and_storage") passageState = "settled";
    if (state.phase === "journey_preparation") {
      travelerOutfitMode = "adventure";
      ordinaryClothesLocation = "stored_at_boundary";
      adventureOutfitsLocation = "worn_by_travelers";
    }
    if (state.phase === "restoration_and_storage") {
      travelerOutfitMode = "ordinary";
      ordinaryClothesLocation = "worn_by_travelers";
      adventureOutfitsLocation = "stored_at_boundary";
    }
    return {
      sceneNumber: scene.sceneNumber,
      beatKey: scene.beatKey,
      phase: state.phase,
      eventIds: state.events,
      visualProofIds: state.proofs,
      passageStateBefore,
      passageStateAfter: passageState,
      travelerOutfitModeAfter: travelerOutfitMode,
      ordinaryClothesLocationAfter: ordinaryClothesLocation,
      adventureOutfitsLocationAfter: adventureOutfitsLocation,
    };
  });
  const value = {
    schemaVersion: JOURNEY_LIFECYCLE_VERSION,
    contractId: JOURNEY_LIFECYCLE_ID,
    sources: {
      narrativeBriefDigest: brief.validation.artifactDigest,
      worldLawDigest: worldLaw.validation.artifactDigest,
      visualIntentDigest: visual.validation.artifactDigest,
    },
    mode: "origin_to_adventure_round_trip",
    universeId: worldLaw.universeId,
    passage: {
      passageId: passage.passageId,
      originZoneId: passage.originZoneId,
      boundaryZoneId: passage.boundaryZoneId,
      adventureZoneId: passage.adventureZoneId,
      discoveryModeId: DISCOVERY_MODE_BY_UNIVERSE[worldLaw.universeId] || "unexpected_magical_revelation",
      ordinaryClothesCacheId: "ordinary_clothes_boundary_cache",
      adventureOutfitCacheId: "adventure_outfits_boundary_cache",
    },
    travelerKeys,
    outfitBindings,
    sceneStates,
    validation: { builderVersion: JOURNEY_LIFECYCLE_BUILDER_VERSION, artifactDigest: "" },
  };
  value.validation.artifactDigest = journeyLifecycleDigest(value);
  assertNarrativeV3Schema("journey_lifecycle", value);
  return freeze(structuredClone(value));
}

export function loadJourneyLifecycleV1(value) {
  assertNarrativeV3Schema("journey_lifecycle", value);
  if (value.validation.artifactDigest !== journeyLifecycleDigest(value)) {
    fail("journey_lifecycle_digest_mismatch", "/validation/artifactDigest", "Journey lifecycle digest mismatch.");
  }
  return freeze(structuredClone(value));
}

export function journeyLifecycleForModel(rawLifecycle) {
  const lifecycle = loadJourneyLifecycleV1(rawLifecycle);
  return freeze({
    mode: lifecycle.mode,
    passage: lifecycle.passage,
    traveler_keys: lifecycle.travelerKeys,
    outfit_bindings: lifecycle.outfitBindings,
    scene_states: lifecycle.sceneStates.map((scene) => ({
      scene_number: scene.sceneNumber,
      beat_key: scene.beatKey,
      journey_phase: scene.phase,
      required_event_ids: scene.eventIds,
      required_visual_proof_ids: scene.visualProofIds,
    })),
  });
}

export function assertStoryConceptFollowsJourneyLifecycle(rawLifecycle, rawConcept) {
  const lifecycle = loadJourneyLifecycleV1(rawLifecycle);
  const concept = rawConcept;
  const issues = [];
  lifecycle.sceneStates.forEach((state, index) => {
    const beat = concept?.beats?.[index];
    if (!beat || beat.beatKey !== state.beatKey) return;
    if (beat.journeyPhase !== state.phase) issues.push({ path: `/beats/${index}/journeyPhase`, message: "Journey phase differs from the deterministic round-trip lifecycle." });
  });
  if (issues.length) throw new NarrativeV3ContractError({ code: "story_concept_journey_lifecycle_mismatch", artifactType: "story_concept", issues });
  return true;
}
