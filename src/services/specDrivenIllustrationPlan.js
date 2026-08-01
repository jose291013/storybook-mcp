export const SPEC_DRIVEN_ILLUSTRATION_PLAN_VERSION = 1;

function byId(entries = []) {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

function nameFor(characterMap, id) {
  return characterMap.get(id)?.canonicalName || id || "";
}

function objectStateContract(state, objectMap, characterMap) {
  const object = objectMap.get(state.objectId);
  return {
    name: object?.name || state.objectId,
    owner: state.ownerCharacterId ? nameFor(characterMap, state.ownerCharacterId) : "",
    state: state.state,
    quantity: state.quantity,
    instruction: `Canonical state: ${state.state}; exact quantity: ${state.quantity}.`,
  };
}

export function compileSpecDrivenIllustrationPlan({
  spec,
  blueprint,
  pageTexts = {},
} = {}) {
  if (!spec) return null;
  const characters = byId(spec.registries.characters);
  const objects = byId(spec.registries.objects);
  const locations = byId(spec.registries.locations);
  const passages = byId(spec.registries.passages);
  const imagePages = new Map((blueprint?.pages || [])
    .filter((page) => page.page_type === "image")
    .map((page) => [Number(page.scene_number), page]));
  const textPages = new Map((blueprint?.pages || [])
    .filter((page) => ["text", "opening_text", "closing_text"].includes(page.page_type))
    .map((page) => [Number(page.scene_number), page]));

  const sceneContracts = spec.scenes.map((scene) => {
    const imagePage = imagePages.get(scene.sceneNumber);
    const textPage = textPages.get(scene.sceneNumber);
    const visible = new Set(scene.illustration.visibleCharacterIds);
    const namedCharacters = scene.presences
      .filter((presence) => visible.has(presence.characterId))
      .map((presence) => ({
        name: nameFor(characters, presence.characterId),
        visual_role: presence.characterId === scene.illustration.mainAction.subjectCharacterId
          ? "main actor"
          : "visible supporting character",
        action: presence.action,
      }));
    const mainTarget = objects.get(scene.illustration.mainAction.targetId)?.name
      || passages.get(scene.illustration.mainAction.targetId)?.name
      || scene.illustration.mainAction.targetId
      || "";
    const absentObjects = scene.objectStates
      .filter((state) => state.state === "absent" || state.quantity === 0)
      .map((state) => `${objects.get(state.objectId)?.name || state.objectId} must remain absent`);
    const forbiddenCharacters = scene.illustration.forbiddenCharacterIds
      .map((id) => `${nameFor(characters, id)} must not appear physically`);
    const locationAfter = locations.get(scene.timeline.locationAfterId)?.name
      || scene.timeline.locationAfterId;
    return {
      contract_source: "narrative_book_spec_v1",
      artifact_digest: spec.validation.artifactDigest,
      spread_number: Number(imagePage?.spread_number || scene.sceneNumber),
      scene_number: scene.sceneNumber,
      text_page_number: Number(textPage?.page_number || scene.pageBinding.textPageNumber),
      image_page_number: Number(imagePage?.page_number || scene.pageBinding.imagePageNumber),
      story_beat: scene.narrative.approvedAction,
      source_prose: String(pageTexts[textPage?.page_number || scene.pageBinding.textPageNumber] || ""),
      planned_image_context: scene.timeline.visibleMoment,
      main_action: {
        subject: nameFor(characters, scene.illustration.mainAction.subjectCharacterId),
        verb: scene.illustration.mainAction.verb,
        target: mainTarget,
      },
      named_characters: namedCharacters,
      generic_characters: [],
      required_elements: scene.illustration.requiredElements.map((description) => ({
        description,
        quantity: "",
        scale: "",
      })),
      object_states: scene.objectStates
        .filter((state) => state.state !== "absent" && state.quantity > 0)
        .map((state) => objectStateContract(state, objects, characters)),
      spatial_relationships: [
        `The visible moment takes place at ${locationAfter}.`,
        ...namedCharacters.map((character) => `${character.name}: ${character.action}`),
      ],
      forbidden_elements: [
        ...scene.illustration.forbiddenElements,
        ...absentObjects,
        ...forbiddenCharacters,
      ],
      continuity_from_previous: scene.timeline.prerequisiteSceneIds.length
        ? `Continue only after ${scene.timeline.prerequisiteSceneIds.join(", ")}.`
        : "Opening canonical scene.",
      continuity_to_next: `End with canonical state ${scene.narrative.storyChange}.`,
      quality_policy: {
        blocking: [
          "technical_corruption",
          "identity_fusion_or_duplication",
          "missing_or_substituted_named_character",
          "wrong_main_action_subject_or_target",
          "object_state_or_quantity_contradiction",
          "forbidden_element_present",
        ],
        advisory: [
          "minor_accessory_visibility",
          "wardrobe_detail",
          "lighting_or_composition_preference",
          "ambiguous_likeness",
        ],
      },
    };
  });

  return {
    version: SPEC_DRIVEN_ILLUSTRATION_PLAN_VERSION,
    contractSource: "narrative_book_spec_v1",
    artifactDigest: spec.validation.artifactDigest,
    pageTexts: { ...pageTexts },
    speechSegmentsByPage: {},
    sceneContracts,
    compiler: {
      version: SPEC_DRIVEN_ILLUSTRATION_PLAN_VERSION,
      source: "deterministic",
      replacements: 0,
      changedPages: [],
      issueCount: 0,
    },
  };
}
