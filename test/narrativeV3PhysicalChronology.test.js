import assert from "node:assert/strict";
import test from "node:test";

import { buildCanonicalStoryMechanics } from "../src/contracts/buildCanonicalStoryMechanics.js";
import { buildCharacterStateTimelineV1 } from "../src/contracts/characterStateTimelineV1.js";
import { buildCreationIntent } from "../src/contracts/creationIntent.js";
import {
  canonicalDigest,
  compileCanonicalStoryGraph,
  parseStoryConceptWire,
} from "../src/contracts/narrativeV3Canonical.js";
import { compileNarrativeBookSpecV3 } from "../src/contracts/narrativeBookSpecV3.js";
import { compileObjectLifecycleProjection } from "../src/contracts/objectLifecycleProjection.js";
import { buildVisualIntentV1 } from "../src/contracts/visualIntentV1.js";
import { buildWorldLawContractV1 } from "../src/contracts/worldLawContractV1.js";
import { compilePhysicalRenderSnapshot } from "../src/services/physicalRenderSnapshot.js";
import { wardrobePlanFromNarrativeV3Spec } from "../src/services/narrativeV3Scenario.js";

function source() {
  const cast = [
    ["hero", "hero"],
    ["brother", "companion"],
    ["mother", "family"],
    ["father", "family"],
  ];
  const intent = buildCreationIntent({
    language: "FR", audienceAge: 8, pageCount: 32, universeId: "coral_ocean",
    intentionId: "share_errors", approachId: "try_together", sensitivityLevel: 1,
    castRefs: cast.map(([characterKey, role]) => ({
      characterKey, profileRef: `profile:${characterKey}`, role, kind: "human",
    })),
    questionnaireDigest: "a".repeat(64), safetyAssessmentDigest: "b".repeat(64),
  });
  const purposes = ["opening", "desire", "attempt", "preparation", "crossing", "attempt", "setback", "attempt", "choice", "attempt", "attempt", "climax", "return", "attempt", "resolution"];
  const concept = parseStoryConceptWire({
    schema_version: 1, contract_id: "calitiki.story-concept-wire.v1", language: "FR",
    title: "Les bulles partagées", premise: "Deux frères apprennent à recommencer ensemble.",
    theme_proof: "Leur seconde tentative réussit parce qu'ils partagent leur erreur.",
    hero_arc: { desire: "Réussir", initial_doubt: "Se tromper", decisive_choice: "Partager", earned_change: "Recommencer" },
    beats: purposes.map((purpose, index) => ({
      beat_key: `beat_${String(index + 1).padStart(2, "0")}`,
      purpose,
      summary: purpose === "preparation"
        ? "Les deux frères enfilent leur tenue et préparent chacun leur bulle avant de plonger."
        : purpose === "return"
          ? "Les deux frères retraversent le passage, rangent leurs bulles et retrouvent leurs parents."
          : `Action cohérente ${index + 1}.`,
      emotional_shift: `Émotion ${index + 1}`,
      distinctive_image: `Image ${index + 1}`,
      participant_keys: ["hero", "brother", ...([0, 3, 12, 14].includes(index) ? ["mother", "father"] : [])],
    })),
  });
  const visualIntent = buildVisualIntentV1({
    creationIntent: intent,
    characters: cast.map(([characterKey]) => ({
      characterKey,
      profileRef: `profile:${characterKey}`,
      kind: "human",
      outfitPreference: "selected",
      ordinaryOutfitDescription: `${characterKey} exact photo clothing`,
      adventureOutfitId: "reef_explorer",
    })),
  });
  const worldLaw = buildWorldLawContractV1(intent);
  const timeline = buildCharacterStateTimelineV1({ creationIntent: intent, visualIntent, concept, worldLaw });
  const mechanics = buildCanonicalStoryMechanics({ intent, concept, visualIntent, characterStateTimeline: timeline, worldLaw });
  const graph = compileCanonicalStoryGraph({ concept, mechanics });
  const projection = compileObjectLifecycleProjection({ graph });
  const profileBindings = cast.map(([characterKey], index) => ({
    characterKey,
    profileRef: `profile:${characterKey}`,
    profileRevision: 1,
    profileDigest: canonicalDigest({ characterKey, kind: "profile" }),
    displayName: ["Mathéo", "Nolan", "Alexandra", "Jérôme"][index],
    visualIdentityRef: `identity:${characterKey}`,
    visualIdentityDigest: canonicalDigest({ characterKey, kind: "identity" }),
  }));
  const spec = compileNarrativeBookSpecV3({ intent, graph, objectProjection: projection, profileBindings });
  return { mechanics, spec, worldLaw };
}

test("V3 seals one physical chronology for wardrobe, passage equipment and underwater laws", () => {
  const { mechanics, spec } = source();
  const preparation = mechanics.scenes.find((scene) => scene.beatKey === "beat_04");
  const crossing = mechanics.scenes.find((scene) => scene.movements[0]?.kind === "cross_passage");
  const returning = mechanics.scenes.find((scene) => scene.movements[0]?.kind === "return_travel");

  assert.equal(preparation.wardrobeStates.find((entry) => entry.characterId === "character_mother").outfitStateId, "ordinary_outfit");
  assert.equal(preparation.wardrobeStates.find((entry) => entry.characterId === "character_hero").outfitStateId, "reef_explorer");
  assert.equal(crossing.physicalState.mediumId, "fully_underwater");
  assert.equal(crossing.physicalState.gravityModelId, "underwater_buoyancy");
  assert.ok(crossing.wardrobeStates.every((entry) => entry.equipmentStateIds.includes("breathing_voice_bubble_worn")));
  assert.equal(returning.physicalState.mediumId, "breathable_air");
  assert.ok(returning.wardrobeStates.every((entry) => entry.outfitStateId === "ordinary_outfit"));
  assert.equal(spec.validation.compilerVersion, 3);
  assert.deepEqual(spec.scenes[4].physicalState, spec.scenes[4].illustrationInstant.physicalState);
  assert.equal(spec.scenes[4].illustrationInstant.physicalMediumId, "fully_underwater");
});

test("the image snapshot turns the sealed underwater law into explicit render prohibitions", () => {
  const { spec } = source();
  const physical = spec.scenes[4].physicalState;
  const snapshot = compilePhysicalRenderSnapshot({
    contract: {
      causal_frame: { visible_phase: "after", visible_location: "Le jardin de corail", during: { transition_kind: "cross_passage" } },
      physical_law_state: {
        world_law_digest: physical.worldLawDigest,
        medium_id: physical.mediumId,
        gravity_model_id: physical.gravityModelId,
        locomotion_ids: physical.locomotionIds,
        allowed_posture_ids: physical.allowedPostureIds,
        required_survival_mechanism_ids: physical.requiredSurvivalMechanismIds,
        forbidden_element_ids: physical.forbiddenElementIds,
      },
      object_states: [], named_characters: [], main_action: {},
    },
  });
  assert.equal(snapshot.physical_medium, "fully_underwater");
  assert.equal(snapshot.gravity_model, "underwater_buoyancy");
  assert.ok(snapshot.forbidden.some((rule) => rule.includes("visibly buoyant")));
  assert.ok(snapshot.forbidden.some((rule) => rule.includes("Allowed locomotion only")));
});

test("the creator review surface preserves exact traveler wardrobe intervals", () => {
  const { spec } = source();
  const wardrobePlan = wardrobePlanFromNarrativeV3Spec(spec);
  const hero = wardrobePlan.find((entry) => entry.character_name === "Mathéo");
  const mother = wardrobePlan.find((entry) => entry.character_name === "Alexandra");

  assert.equal(hero.activation_mode, "sealed_scene_interval");
  assert.deepEqual(hero.active_scene_numbers, [4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(hero.deactivation_scene_number, 13);
  assert.equal(mother.activation_mode, "never_activate");
  assert.equal(mother.never_activate, true);
  assert.deepEqual(mother.active_scene_numbers, []);
});
