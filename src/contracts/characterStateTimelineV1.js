import { loadCreationIntent } from "./creationIntent.js";
import { canonicalDigest, loadStoryConcept } from "./narrativeV3Canonical.js";
import { assertNarrativeV3Schema, NarrativeV3ContractError } from "./narrativeV3SchemaRegistry.js";
import { loadVisualIntentV1 } from "./visualIntentV1.js";

export const CHARACTER_STATE_TIMELINE_VERSION = 1;
export const CHARACTER_STATE_TIMELINE_ID = "calitiki.character-state-timeline.v1";
export const CHARACTER_STATE_TIMELINE_BUILDER_VERSION = 1;

function fail(code, path, message) {
  throw new NarrativeV3ContractError({ code, artifactType: "character_state_timeline", issues: [{ path, message }] });
}

function projection(value) {
  const copy = structuredClone(value);
  delete copy.validation.artifactDigest;
  return copy;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

export function characterStateTimelineDigest(value) {
  return canonicalDigest(projection(value));
}

function event(sceneNumber, characterId, kind, fromStateId, toStateId, cause, ordinal) {
  const suffix = canonicalDigest({ sceneNumber, characterId, kind, ordinal }).slice(0, 16);
  return { eventId: `state_${String(sceneNumber).padStart(2, "0")}_${suffix}`, characterId, kind, fromStateId, toStateId, cause };
}

export function buildCharacterStateTimelineV1({ creationIntent: rawIntent, visualIntent: rawVisual, concept: rawConcept } = {}) {
  const intent = loadCreationIntent(rawIntent);
  const visual = loadVisualIntentV1(rawVisual);
  const concept = loadStoryConcept(rawConcept);
  if (visual.sourceCreationIntent.artifactDigest !== intent.validation.artifactDigest) {
    fail("character_timeline_visual_source_mismatch", "/sources", "Visual intent does not belong to this creation intent.");
  }
  const crossingIndex = concept.beats.findIndex((beat) => beat.purpose === "crossing");
  const returnIndex = concept.beats.findIndex((beat) => beat.purpose === "return");
  const preparationIndexes = concept.beats.map((beat, index) => (beat.purpose === "preparation" && index < crossingIndex ? index : -1)).filter((index) => index >= 0);
  const preparationIndex = crossingIndex < 0 ? -1 : (preparationIndexes.at(-1) ?? crossingIndex);
  if ((crossingIndex < 0) !== (returnIndex < 0)) fail("character_timeline_passage_pair", "/scenes", "Crossing and return must be paired.");
  const travelerKeys = new Set(crossingIndex < 0 ? [] : concept.beats[crossingIndex].participantKeys);
  const visualByKey = new Map(visual.characters.map((entry) => [entry.characterKey, entry]));
  const heroKey = intent.cast.find((entry) => entry.role === "hero")?.characterKey;

  const characters = intent.cast.map((entry) => {
    const visualEntry = visualByKey.get(entry.characterKey);
    if (!visualEntry) fail("character_timeline_visual_character_missing", "/characters", "Every character needs visual intent.");
    const participantIndexes = concept.beats.map((beat, index) => beat.participantKeys.includes(entry.characterKey) ? index : -1).filter((index) => index >= 0);
    const adventureResident = crossingIndex < 0 || (participantIndexes[0] > crossingIndex && participantIndexes[0] < returnIndex);
    const initialOutfit = entry.kind === "human" && adventureResident
      ? visualEntry.adventureOutfit.stateId
      : visualEntry.ordinaryOutfit.stateId;
    const initialEquipment = intent.book.universeId === "coral_ocean" && adventureResident
      ? ["breathing_voice_bubble_worn"]
      : [];
    return {
      characterId: `character_${entry.characterKey}`,
      characterKey: entry.characterKey,
      adventureOutfitId: visualEntry.adventureOutfit.stateId,
      initialState: { outfitStateId: initialOutfit, equipmentStateIds: initialEquipment, knowledgeStateId: "knowledge_initial", emotionStateId: "emotion_initial" },
    };
  });
  const current = new Map(characters.map((entry) => [entry.characterId, structuredClone(entry.initialState)]));
  const scenes = concept.beats.map((beat, index) => {
    const sceneNumber = index + 1;
    const events = [];
    for (const character of characters) {
      const state = current.get(character.characterId);
      let ordinal = 1;
      if (index === preparationIndex && travelerKeys.has(character.characterKey) && state.outfitStateId !== character.adventureOutfitId) {
        events.push(event(sceneNumber, character.characterId, "don_outfit", state.outfitStateId, character.adventureOutfitId, "story_preparation", ordinal++));
        state.outfitStateId = character.adventureOutfitId;
      }
      if (index === crossingIndex && travelerKeys.has(character.characterKey) && intent.book.universeId === "coral_ocean" && !state.equipmentStateIds.includes("breathing_voice_bubble_worn")) {
        events.push(event(sceneNumber, character.characterId, "equip", "equipment_absent", "breathing_voice_bubble_worn", "medium_entry", ordinal++));
        state.equipmentStateIds = ["breathing_voice_bubble_worn"];
      }
      if (index === returnIndex && travelerKeys.has(character.characterKey)) {
        if (state.equipmentStateIds.includes("breathing_voice_bubble_worn")) {
          events.push(event(sceneNumber, character.characterId, "unequip", "breathing_voice_bubble_worn", "equipment_absent", "medium_exit", ordinal++));
          state.equipmentStateIds = [];
        }
        const ordinary = visualByKey.get(character.characterKey).ordinaryOutfit.stateId;
        if (state.outfitStateId !== ordinary) {
          events.push(event(sceneNumber, character.characterId, "remove_outfit", state.outfitStateId, ordinary, "medium_exit", ordinal++));
          state.outfitStateId = ordinary;
        }
      }
      if (character.characterKey === heroKey) {
        const knowledge = `knowledge_after_scene_${String(sceneNumber).padStart(2, "0")}`;
        const emotion = `emotion_after_scene_${String(sceneNumber).padStart(2, "0")}`;
        events.push(event(sceneNumber, character.characterId, "knowledge_change", state.knowledgeStateId, knowledge, "semantic_beat", ordinal++));
        events.push(event(sceneNumber, character.characterId, "emotion_change", state.emotionStateId, emotion, "semantic_beat", ordinal++));
        state.knowledgeStateId = knowledge;
        state.emotionStateId = emotion;
      }
    }
    return { sceneNumber, beatKey: beat.beatKey, events, statesAfter: characters.map((entry) => ({ characterId: entry.characterId, ...structuredClone(current.get(entry.characterId)) })) };
  });
  const value = {
    schemaVersion: CHARACTER_STATE_TIMELINE_VERSION,
    contractId: CHARACTER_STATE_TIMELINE_ID,
    sources: {
      creationIntentDigest: intent.validation.artifactDigest,
      visualIntentDigest: visual.validation.artifactDigest,
      storyConceptDigest: concept.validation.artifactDigest,
    },
    characters: characters.map(({ characterId, characterKey, initialState }) => ({ characterId, characterKey, initialState })),
    scenes,
    validation: { builderVersion: CHARACTER_STATE_TIMELINE_BUILDER_VERSION, artifactDigest: "" },
  };
  value.validation.artifactDigest = characterStateTimelineDigest(value);
  assertNarrativeV3Schema("character_state_timeline", value);
  return freeze(structuredClone(value));
}

export function loadCharacterStateTimelineV1(value) {
  assertNarrativeV3Schema("character_state_timeline", value);
  if (value.validation.artifactDigest !== characterStateTimelineDigest(value)) fail("character_timeline_digest_mismatch", "/validation/artifactDigest", "Character timeline digest mismatch.");
  return freeze(structuredClone(value));
}
