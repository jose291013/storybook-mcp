import { UNIVERSE_OPTIONS } from "../config/bookOptions.js";
import { outfitOptionsForUniverse } from "../config/outfitOptions.js";
import { loadCreationIntent } from "./creationIntent.js";
import { loadStoryConcept } from "./narrativeV3Canonical.js";
import {
  assertNarrativeV3Schema,
  NarrativeV3ContractError,
} from "./narrativeV3SchemaRegistry.js";

export const CANONICAL_STORY_MECHANICS_VERSION = 1;
export const CANONICAL_STORY_MECHANICS_ID = "calitiki.canonical-story-mechanics.v1";
export const CANONICAL_STORY_MECHANICS_BUILDER_VERSION = 1;

const CANONICAL_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,119}$/;

function mechanicsError(code, path, message) {
  throw new NarrativeV3ContractError({
    code,
    artifactType: "canonical_story_mechanics",
    issues: [{ path, message }],
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function expectedSceneCount(pageCount) {
  return (pageCount - 2) / 2;
}

function actForIndex(index, total) {
  const actOneCount = Math.max(1, Math.floor(total * 0.3));
  const actTwoEnd = Math.max(actOneCount + 1, Math.min(total - 1, Math.floor(total * 0.75)));
  if (index < actOneCount) return 1;
  if (index < actTwoEnd) return 2;
  return 3;
}

function indexOfPurpose(beats, purpose) {
  const indexes = beats
    .map((beat, index) => (beat.purpose === purpose ? index : -1))
    .filter((index) => index >= 0);
  if (indexes.length > 1) mechanicsError("mechanics_purpose_cardinality", "/concept/beats", `Purpose ${purpose} may appear at most once.`);
  return indexes[0] ?? -1;
}

function validateConceptShape(intent, concept) {
  const beats = concept.beats;
  const sceneCount = expectedSceneCount(intent.book.pageCount);
  if (beats.length !== sceneCount) {
    mechanicsError(
      "mechanics_scene_count_mismatch",
      "/concept/beats",
      `This format requires exactly ${sceneCount} semantic beats.`,
    );
  }
  if (concept.language !== intent.language) {
    mechanicsError("mechanics_language_mismatch", "/concept/language", "Concept language must equal the creation intent language.");
  }
  if (beats[0]?.purpose !== "opening" || beats.at(-1)?.purpose !== "resolution") {
    mechanicsError("mechanics_story_endpoints_invalid", "/concept/beats", "The first beat must open the story and the last must resolve it.");
  }
  const crossingIndex = indexOfPurpose(beats, "crossing");
  const returnIndex = indexOfPurpose(beats, "return");
  const climaxIndex = indexOfPurpose(beats, "climax");
  if (climaxIndex < 0 || actForIndex(climaxIndex, sceneCount) !== 3) {
    mechanicsError("mechanics_climax_invalid", "/concept/beats", "Exactly one climax must occur in act 3.");
  }
  if ((crossingIndex < 0) !== (returnIndex < 0)) {
    mechanicsError("mechanics_passage_pair_incomplete", "/concept/beats", "A crossing and its return must either both exist or both be absent.");
  }
  if (crossingIndex >= 0) {
    if (actForIndex(crossingIndex, sceneCount) !== 2) {
      mechanicsError("mechanics_crossing_act_invalid", `/concept/beats/${crossingIndex}`, "The unique crossing must occur in act 2.");
    }
    if (returnIndex <= crossingIndex || actForIndex(returnIndex, sceneCount) !== 3 || returnIndex <= climaxIndex) {
      mechanicsError("mechanics_return_invalid", `/concept/beats/${returnIndex}`, "The unique return must occur in act 3 after the climax.");
    }
  }
  const castKeys = new Set(intent.cast.map((entry) => entry.characterKey));
  const heroKey = intent.cast.find((entry) => entry.role === "hero")?.characterKey;
  beats.forEach((beat, index) => {
    if (!beat.participantKeys.includes(heroKey)) {
      mechanicsError("mechanics_hero_missing", `/concept/beats/${index}/participantKeys`, "The hero must participate in every semantic beat.");
    }
    const unknown = beat.participantKeys.find((key) => !castKeys.has(key));
    if (unknown) mechanicsError("mechanics_unknown_participant", `/concept/beats/${index}/participantKeys`, `${unknown} is not present in the CreationIntent cast.`);
  });
  return { crossingIndex, returnIndex, climaxIndex };
}

function universeConfiguration(universeId) {
  const universe = UNIVERSE_OPTIONS.find((entry) => entry.id === universeId);
  if (!universe?.storyContract?.physicalTopology) {
    mechanicsError("mechanics_universe_unsupported", "/intent/book/universeId", "The universe has no deterministic physical topology.");
  }
  return universe;
}

function characterId(characterKey) {
  if (!CANONICAL_KEY_RE.test(characterKey)) {
    mechanicsError("mechanics_character_key_invalid", "/intent/cast", "Character keys must already use the canonical lowercase identifier alphabet.");
  }
  return `character_${characterKey}`;
}

function participantIndexes(beats, characterKey) {
  return beats
    .map((beat, index) => (beat.participantKeys.includes(characterKey) ? index : -1))
    .filter((index) => index >= 0);
}

function initialLocationFor({ indexes, crossingIndex, returnIndex }) {
  if (crossingIndex < 0) return "location_adventure";
  const first = indexes[0] ?? Number.POSITIVE_INFINITY;
  if (first <= crossingIndex) return "location_origin";
  if (first < returnIndex) return "location_adventure";
  return "location_origin";
}

function adventureOutfit(intentEntry, universeId) {
  if (intentEntry.kind !== "human") return "natural_appearance";
  return outfitOptionsForUniverse(universeId)[0]?.id || "universe_outfit";
}

function wardrobeFor({ intentEntry, universeId, index, crossingIndex, returnIndex }) {
  if (intentEntry.kind !== "human") {
    return { outfitStateId: "natural_appearance", equipmentStateIds: [] };
  }
  const adventureWindow = crossingIndex < 0
    || (index >= Math.max(0, crossingIndex - 1) && index <= returnIndex);
  const underwaterEquipment = universeId === "coral_ocean"
    && crossingIndex >= 0
    && index >= crossingIndex
    && index <= returnIndex;
  return {
    outfitStateId: adventureWindow ? adventureOutfit(intentEntry, universeId) : "ordinary_outfit",
    equipmentStateIds: underwaterEquipment ? ["breathing_voice_bubble_worn"] : [],
  };
}

function sceneTimeline(index, crossingIndex, returnIndex) {
  if (crossingIndex < 0) {
    return { locationBeforeId: "location_adventure", locationAfterId: "location_adventure", visiblePhase: "end" };
  }
  if (index < crossingIndex) {
    return { locationBeforeId: "location_origin", locationAfterId: "location_origin", visiblePhase: "end" };
  }
  if (index === crossingIndex) {
    return { locationBeforeId: "location_origin", locationAfterId: "location_adventure", visiblePhase: "end" };
  }
  if (index < returnIndex) {
    return { locationBeforeId: "location_adventure", locationAfterId: "location_adventure", visiblePhase: "end" };
  }
  if (index === returnIndex) {
    return { locationBeforeId: "location_adventure", locationAfterId: "location_origin", visiblePhase: "end" };
  }
  return { locationBeforeId: "location_origin", locationAfterId: "location_origin", visiblePhase: "end" };
}

export function buildCanonicalStoryMechanics({ intent: rawIntent, concept: rawConcept } = {}) {
  const intent = loadCreationIntent(rawIntent);
  const concept = loadStoryConcept(rawConcept);
  const { crossingIndex, returnIndex } = validateConceptShape(intent, concept);
  const universe = universeConfiguration(intent.book.universeId);
  const cast = intent.cast.map((entry) => ({
    ...entry,
    id: characterId(entry.characterKey),
    indexes: participantIndexes(concept.beats, entry.characterKey),
  }));
  const idSet = new Set(cast.map((entry) => entry.id));
  if (idSet.size !== cast.length) mechanicsError("mechanics_character_id_collision", "/intent/cast", "Character keys collide after canonical id construction.");

  const initialLocations = new Map(cast.map((entry) => [
    entry.id,
    initialLocationFor({ indexes: entry.indexes, crossingIndex, returnIndex }),
  ]));
  const currentLocations = new Map(initialLocations);
  const crossingTravelers = new Set();
  const scenes = [];

  concept.beats.forEach((beat, index) => {
    const timeline = sceneTimeline(index, crossingIndex, returnIndex);
    let movementKind = "";
    let travelerIds = [];
    if (index === crossingIndex) {
      movementKind = "cross_passage";
      travelerIds = cast
        .filter((entry) => beat.participantKeys.includes(entry.characterKey) && currentLocations.get(entry.id) === "location_origin")
        .map((entry) => entry.id);
      travelerIds.forEach((id) => crossingTravelers.add(id));
    } else if (index === returnIndex) {
      movementKind = "return_travel";
      travelerIds = cast
        .filter((entry) => currentLocations.get(entry.id) === "location_adventure"
          && (crossingTravelers.has(entry.id) || entry.indexes.some((participantIndex) => participantIndex >= returnIndex)))
        .map((entry) => entry.id);
    }
    travelerIds.forEach((id) => currentLocations.set(id, timeline.locationAfterId));

    const visibleIds = cast
      .filter((entry) => beat.participantKeys.includes(entry.characterKey) || travelerIds.includes(entry.id))
      .map((entry) => entry.id);
    const wrongLocation = visibleIds.find((id) => currentLocations.get(id) !== timeline.locationAfterId);
    if (wrongLocation) {
      mechanicsError(
        "mechanics_participant_location_ambiguous",
        `/concept/beats/${index}/participantKeys`,
        `${wrongLocation} is not on the focal side of this scene and has no deterministic movement.`,
      );
    }
    const visibleSet = new Set(visibleIds);
    const movements = movementKind ? [{
      sequence: 1,
      kind: movementKind,
      travelerCharacterIds: travelerIds,
      fromLocationId: timeline.locationBeforeId,
      toLocationId: timeline.locationAfterId,
      passageId: "passage_primary",
    }] : [];
    if (movementKind && !travelerIds.length) {
      mechanicsError("mechanics_empty_passage_movement", `/concept/beats/${index}`, "A passage movement requires at least one physical traveler.");
    }
    const mainSubject = cast.find((entry) => entry.role === "hero")?.id;
    scenes.push({
      id: `scene_${String(index + 1).padStart(2, "0")}`,
      beatKey: beat.beatKey,
      act: actForIndex(index, concept.beats.length),
      timeline,
      presences: visibleIds.map((id) => ({
        characterId: id,
        mode: "physical",
        phase: "throughout",
        locationId: currentLocations.get(id),
      })),
      movements,
      objectEvents: [],
      wardrobeStates: visibleIds.map((id) => {
        const entry = cast.find((character) => character.id === id);
        return { characterId: id, ...wardrobeFor({ intentEntry: entry, universeId: intent.book.universeId, index, crossingIndex, returnIndex }) };
      }),
      illustration: {
        visibleCharacterIds: visibleIds,
        forbiddenCharacterIds: cast.filter((entry) => !visibleSet.has(entry.id)).map((entry) => entry.id),
        mainAction: {
          subjectCharacterId: mainSubject,
          action: String(beat.summary || `perform_${beat.purpose}`).slice(0, 240),
          targetId: "",
        },
      },
    });
  });

  const mechanics = {
    schemaVersion: CANONICAL_STORY_MECHANICS_VERSION,
    contractId: CANONICAL_STORY_MECHANICS_ID,
    book: {
      audienceAge: intent.audience.age,
      pageCount: intent.book.pageCount,
      universeId: intent.book.universeId,
    },
    registries: {
      characters: cast.map((entry) => ({
        id: entry.id,
        semanticKey: entry.characterKey,
        canonicalName: entry.characterKey,
        role: entry.role,
        initialLocationId: initialLocations.get(entry.id),
      })),
      locations: [
        { id: "location_origin", name: universe.storyContract.physicalTopology.originZone, kind: "origin" },
        { id: "location_adventure", name: universe.storyContract.physicalTopology.adventureZone, kind: "adventure" },
      ],
      objects: [],
      passages: crossingIndex < 0 ? [] : [{
        id: "passage_primary",
        name: universe.storyContract.physicalTopology.transitionZone,
        sideALocationId: "location_origin",
        sideBLocationId: "location_adventure",
      }],
    },
    scenes,
  };
  assertNarrativeV3Schema("canonical_story_mechanics", mechanics);
  return deepFreeze(structuredClone(mechanics));
}
