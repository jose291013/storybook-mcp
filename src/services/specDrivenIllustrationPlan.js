import crypto from "node:crypto";
import { imageContractProjectionIssues } from "./imageVisualContract.js";
import { compileVisualEntityLedger } from "./visualEntityLedger.js";
import { compilePhysicalRenderSnapshot } from "./physicalRenderSnapshot.js";
import { compileSceneDensityPlan, sceneDensityPlanIssues } from "./sceneDensityPlan.js";
import {
  compileVisualComposition,
  visualCompositionPlanIssues,
  wholeBookVisualRhythmIssues,
} from "./visualCompositionPlan.js";

// Version 15 projects the released cast partition and wardrobe states as
// first-class ids. SceneRenderContract.v1 resolves them once into concrete
// render instructions; they must never be reconstructed from prose or a
// legacy blueprint later in the image path.
export const SPEC_DRIVEN_ILLUSTRATION_PLAN_VERSION = 15;
export const SPEC_DRIVEN_ILLUSTRATION_CONTRACT_SOURCE = "narrative_book_spec_v3_scene_render_contract_v1";
export const STORYBOARD_FIRST_CONTRACT_VERSION = 2;

function byId(entries = []) {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

function nameFor(characterMap, id) {
  const character = characterMap.get(id);
  return character?.canonicalName || character?.displayName || id || "";
}

function objectStateContract(state, objectMap, characterMap) {
  const object = objectMap.get(state.objectId);
  const visibility = state.visibility || (state.quantity > 0 ? "required" : "forbidden");
  const canonicalState = state.state || state.stateId || (visibility === "forbidden" ? "absent" : "visible");
  return {
    entity_id: state.objectId,
    name: object?.name || state.objectId,
    owner: state.ownerCharacterId ? nameFor(characterMap, state.ownerCharacterId) : "",
    state: canonicalState,
    quantity: state.quantity,
    visibility,
    instruction: `Canonical entity ${state.objectId}; state: ${canonicalState}; visibility: ${visibility}; exact whole-image quantity: ${state.quantity}; one location only, never duplicate it to show another moment.`,
  };
}

function sceneProjection(scene = {}, index = 0) {
  const instant = scene.illustration || scene.illustrationInstant || {};
  const semantic = scene.narrative || scene.semantic || {};
  const movement = scene.transition || scene.movements?.[0] || null;
  const mainAction = instant.mainAction || {};
  return {
    illustration: {
      visibleCharacterIds: instant.visibleCharacterIds || [],
      forbiddenCharacterIds: instant.forbiddenCharacterIds || [],
      mainAction: {
        subjectCharacterId: mainAction.subjectCharacterId || "",
        verb: mainAction.verb || mainAction.action || "",
        targetId: mainAction.targetId || "",
      },
      requiredElements: instant.requiredElements || (semantic.distinctiveImage ? [semantic.distinctiveImage] : []),
      forbiddenElements: instant.forbiddenElements || [],
      wardrobeStates: instant.wardrobeStates || [],
      physicalState: instant.physicalState || scene.physicalState || null,
    },
    narrative: {
      approvedAction: semantic.approvedAction || semantic.summary || "",
      function: semantic.function || semantic.purpose || "",
      storyChange: semantic.storyChange || semantic.emotionalShift || semantic.summary || "",
    },
    timeline: {
      ...scene.timeline,
      prerequisiteSceneIds: scene.timeline?.prerequisiteSceneIds || (index ? [`scene-${scene.sceneNumber - 1}`] : []),
      visibleMoment: scene.timeline?.visibleMoment || semantic.distinctiveImage || semantic.summary || "",
    },
    transition: movement ? {
      kind: movement.kind || "none",
      passageId: movement.passageId || "",
      travelerCharacterIds: movement.travelerCharacterIds || [],
    } : { kind: "none", passageId: "", travelerCharacterIds: [] },
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((field) => [field, stableValue(value[field])]));
}

function visualBeatCore(contract = {}) {
  const core = {
    version: STORYBOARD_FIRST_CONTRACT_VERSION,
    artifact_digest: String(contract.artifact_digest || ""),
    spread_number: Number(contract.spread_number || 0),
    scene_number: Number(contract.scene_number || 0),
    text_page_number: Number(contract.text_page_number || 0),
    image_page_number: Number(contract.image_page_number || 0),
    visible_instant: {
      context: String(contract.planned_image_context || ""),
      main_action: structuredClone(contract.main_action || {}),
      named_characters: structuredClone(contract.named_characters || []),
      visible_character_ids: structuredClone(contract.visible_character_ids || []),
      forbidden_character_ids: structuredClone(contract.forbidden_character_ids || []),
      wardrobe_states: structuredClone(contract.wardrobe_states || []),
      required_elements: structuredClone(contract.required_elements || []),
      object_states: structuredClone(contract.object_states || []),
      visual_entity_states: structuredClone(contract.visual_entity_states || []),
      causal_frame: structuredClone(contract.causal_frame || {}),
      render_snapshot: structuredClone(contract.render_snapshot || {}),
      forbidden_elements: structuredClone(contract.forbidden_elements || []),
    },
  };
  if (contract.visual_composition) {
    core.visible_instant.visual_composition = structuredClone(contract.visual_composition);
  }
  if (contract.scene_density) {
    core.visible_instant.scene_density = structuredClone(contract.scene_density);
  }
  return core;
}

function visualBeatDigest(contract = {}) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(stableValue(visualBeatCore(contract))))
    .digest("hex");
}

export function compileSpecDrivenIllustrationPlan({
  spec,
  blueprint,
  pageTexts = {},
  approvedScenario = null,
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
  const travelerCharacterIds = new Set(spec.scenes.flatMap((scene) => ([
    ...scene.movements.flatMap((movement) => movement.travelerCharacterIds || []),
    ...(scene.transition?.travelerCharacterIds || []),
  ])));

  let previousCompositionId = "";
  const sceneContracts = spec.scenes.map((scene, sceneIndex) => {
    const projected = sceneProjection(scene, sceneIndex);
    const illustration = projected.illustration;
    const narrative = projected.narrative;
    const timeline = projected.timeline;
    const transition = projected.transition;
    const imagePage = imagePages.get(scene.sceneNumber);
    const textPage = textPages.get(scene.sceneNumber);
    const visible = new Set(illustration.visibleCharacterIds);
    const namedCharacters = scene.presences
      .filter((presence) => visible.has(presence.characterId))
      .map((presence) => ({
        character_id: presence.characterId,
        name: nameFor(characters, presence.characterId),
        visual_role: presence.characterId === illustration.mainAction.subjectCharacterId
          ? "main actor"
          : travelerCharacterIds.has(presence.characterId)
            ? "visible traveler"
            : "visible local supporter who remains at the departure or arrival location and does not receive traveler equipment",
        action: presence.action || narrative.approvedAction,
      }));
    const mainTarget = objects.get(illustration.mainAction.targetId)?.name
      || passages.get(illustration.mainAction.targetId)?.name
      || illustration.mainAction.targetId
      || "";
    const absentObjects = scene.objectStates
      .filter((state) => state.state === "absent" || state.visibility === "forbidden" || state.quantity === 0)
      .map((state) => `${objects.get(state.objectId)?.name || state.objectId} must remain absent`);
    const forbiddenCharacters = illustration.forbiddenCharacterIds
      .map((id) => `${nameFor(characters, id)} must not appear physically`);
    const locationAfter = locations.get(scene.timeline.locationAfterId)?.name
      || scene.timeline.locationAfterId;
    const locationBefore = locations.get(scene.timeline.locationBeforeId)?.name || scene.timeline.locationBeforeId;
    const transitionMechanism = passages.get(transition.passageId)?.name || transition.passageId || "";
    const visualComposition = compileVisualComposition({
      sceneNumber: scene.sceneNumber,
      storyRole: imagePage?.story_role,
      transitionKind: transition.kind,
      visiblePhase: timeline.visiblePhase,
      visibleCharacterCount: namedCharacters.length,
      previousCompositionId,
    });
    previousCompositionId = visualComposition.composition_id;
    const contract = {
      contract_source: SPEC_DRIVEN_ILLUSTRATION_CONTRACT_SOURCE,
      storyboard_first_version: STORYBOARD_FIRST_CONTRACT_VERSION,
      artifact_digest: spec.validation.artifactDigest,
      universe_id: spec.book.universeId,
      character_registry: spec.registries.characters.map((character) => ({
        character_id: character.id,
        name: nameFor(characters, character.id),
        kind: character.kind,
      })),
      visible_character_ids: [...illustration.visibleCharacterIds],
      forbidden_character_ids: [...illustration.forbiddenCharacterIds],
      wardrobe_states: illustration.wardrobeStates.map((state) => ({
        character_id: state.characterId,
        outfit_state_id: state.outfitStateId,
        equipment_state_ids: [...(state.equipmentStateIds || [])],
      })),
      physical_law_state: illustration.physicalState ? {
        version: illustration.physicalState.version,
        world_law_digest: illustration.physicalState.worldLawDigest,
        visible_location_id: illustration.physicalState.visibleLocationId,
        zone_id: illustration.physicalState.zoneId,
        medium_id: illustration.physicalState.mediumId,
        gravity_model_id: illustration.physicalState.gravityModelId,
        locomotion_ids: [...illustration.physicalState.locomotionIds],
        allowed_posture_ids: [...illustration.physicalState.allowedPostureIds],
        required_survival_mechanism_ids: [...illustration.physicalState.requiredSurvivalMechanismIds],
        forbidden_element_ids: [...illustration.physicalState.forbiddenElementIds],
      } : null,
      spread_number: Number(imagePage?.spread_number || scene.sceneNumber),
      scene_number: scene.sceneNumber,
      text_page_number: Number(textPage?.page_number || scene.pageBinding.textPageNumber),
      image_page_number: Number(imagePage?.page_number || scene.pageBinding.imagePageNumber),
      story_beat: narrative.approvedAction,
      source_prose: String(pageTexts[textPage?.page_number || scene.pageBinding.textPageNumber] || ""),
      planned_image_context: timeline.visibleMoment,
      main_action: {
        subject: nameFor(characters, illustration.mainAction.subjectCharacterId),
        verb: illustration.mainAction.verb,
        target: mainTarget,
      },
      named_characters: namedCharacters,
      generic_characters: [],
      required_elements: [
        ...illustration.requiredElements.map((description) => ({
          description,
          quantity: "",
          scale: "",
        })),
      ],
      object_states: scene.objectStates
        .map((state) => objectStateContract(state, objects, characters)),
      spatial_relationships: [
        `The visible moment takes place at ${locationAfter}.`,
        ...namedCharacters.map((character) => `${character.name}: ${character.action}`),
      ],
      forbidden_elements: [
        ...illustration.forbiddenElements,
        ...absentObjects,
        ...forbiddenCharacters,
      ],
      visual_composition: visualComposition,
      causal_frame: {
        before: { location: locationBefore },
        during: {
          action: narrative.approvedAction,
          transition_kind: transition.kind || "none",
          transition_mechanism: transitionMechanism,
          transition_mechanism_id: transition.passageId || "",
          from: locationBefore,
          to: locationAfter,
        },
        after: { location: locationAfter },
        visible_phase: timeline.visiblePhase === "start"
          ? "before"
          : timeline.visiblePhase === "end" ? "after" : "during",
        visible_location: timeline.visiblePhase === "start" ? locationBefore : locationAfter,
      },
      continuity_from_previous: timeline.prerequisiteSceneIds.length
        ? `Continue only after ${timeline.prerequisiteSceneIds.join(", ")}.`
        : "Opening canonical scene.",
      continuity_to_next: `End with canonical state ${narrative.storyChange}.`,
      quality_policy: {
        blocking: [
          "technical_corruption",
          "identity_fusion_or_duplication",
          "missing_or_substituted_named_character",
          "wrong_main_action_subject_or_target",
          "object_state_or_quantity_contradiction",
          "persistent_entity_identity_or_appearance_contradiction",
          "required_wardrobe_state_contradiction",
          "forbidden_element_present",
        ],
        advisory: [
          "minor_accessory_visibility",
          "minor_wardrobe_detail",
          "lighting_or_composition_preference",
          "ambiguous_likeness",
        ],
      },
    };
    const approvedScene = approvedScenario?.scenes?.find((item) => Number(item?.sceneNumber) === Number(scene.sceneNumber)) || null;
    const previousScene = approvedScenario?.scenes?.find((item) => Number(item?.sceneNumber) === Number(scene.sceneNumber) - 1) || null;
    contract.render_snapshot = compilePhysicalRenderSnapshot({
      contract,
      approvedScene,
      previousScene,
      approvedScenario,
      worldContract: approvedScenario?.worldContract || {},
    });
    contract.scene_density = compileSceneDensityPlan({
      audienceAge: spec.book?.audienceAge,
      mainAction: contract.main_action,
      namedCharacters: contract.named_characters,
      requiredElements: contract.required_elements,
      objectStates: contract.object_states,
    });
    contract.visual_beat_digest = visualBeatDigest(contract);
    return contract;
  });

  const compiled = compileVisualEntityLedger({
    version: SPEC_DRIVEN_ILLUSTRATION_PLAN_VERSION,
    storyboardFirstVersion: STORYBOARD_FIRST_CONTRACT_VERSION,
    contractSource: SPEC_DRIVEN_ILLUSTRATION_CONTRACT_SOURCE,
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
  });
  compiled.sceneContracts = compiled.sceneContracts.map((contract) => ({
    ...contract,
    visual_beat_digest: visualBeatDigest(contract),
  }));
  return compiled;
}

export function bindStoryboardPageTexts(storyboard = {}, pageTexts = {}) {
  const bound = structuredClone(storyboard || {});
  bound.pageTexts = Object.fromEntries(Object.entries(pageTexts || {}).map(([page, text]) => [
    String(Number(page)),
    String(text || ""),
  ]));
  bound.sceneContracts = (Array.isArray(bound.sceneContracts) ? bound.sceneContracts : []).map((contract) => ({
    ...contract,
    source_prose: String(bound.pageTexts[String(Number(contract?.text_page_number))] || ""),
  }));
  return bound;
}

export function isCurrentSpecDrivenIllustrationPlan(plan = null, expectedArtifactDigest = "") {
  return Boolean(plan)
    && Number(plan.version || 0) >= SPEC_DRIVEN_ILLUSTRATION_PLAN_VERSION
    && Number(plan.storyboardFirstVersion || 0) >= STORYBOARD_FIRST_CONTRACT_VERSION
    && (!expectedArtifactDigest || plan.artifactDigest === expectedArtifactDigest)
    && plan.contractSource === SPEC_DRIVEN_ILLUSTRATION_CONTRACT_SOURCE;
}

export function manuscriptVisualBeatForScene(storyboard = null, sceneNumber = 0) {
  const contract = (Array.isArray(storyboard?.sceneContracts) ? storyboard.sceneContracts : [])
    .find((candidate) => Number(candidate?.scene_number) === Number(sceneNumber));
  if (!contract || Number(contract.storyboard_first_version) !== STORYBOARD_FIRST_CONTRACT_VERSION) return null;
  return {
    ...visualBeatCore(contract),
    visual_beat_digest: String(contract.visual_beat_digest || ""),
  };
}

export function storyboardBindingIssues(storyboard = {}, pageTexts = {}, expectedArtifactDigest = "") {
  const issues = [];
  if (Number(storyboard?.storyboardFirstVersion) !== STORYBOARD_FIRST_CONTRACT_VERSION) {
    issues.push("storyboard-first version is invalid");
  }
  if (storyboard?.contractSource !== SPEC_DRIVEN_ILLUSTRATION_CONTRACT_SOURCE) {
    issues.push("storyboard contract source is invalid");
  }
  if (expectedArtifactDigest && storyboard?.artifactDigest !== expectedArtifactDigest) {
    issues.push("storyboard artifact digest is stale");
  }
  const contracts = Array.isArray(storyboard?.sceneContracts) ? storyboard.sceneContracts : [];
  if (!contracts.length) issues.push("storyboard scene contracts are required");
  if (Number(storyboard?.version || 0) >= SPEC_DRIVEN_ILLUSTRATION_PLAN_VERSION) {
    issues.push(...wholeBookVisualRhythmIssues(contracts));
    issues.push(...sceneDensityPlanIssues(contracts));
    for (const contract of contracts) {
      issues.push(...imageContractProjectionIssues(contract)
        .map((issue) => `scene ${Number(contract?.scene_number || 0)} ${issue}`));
    }
  } else if (Number(storyboard?.version || 0) >= 8) {
    issues.push(...visualCompositionPlanIssues(contracts, { minimumVersion: 1 }));
  }
  const scenes = new Set();
  const textPages = new Set();
  const imagePages = new Set();
  for (const contract of contracts) {
    const sceneNumber = Number(contract?.scene_number || 0);
    const textPageNumber = Number(contract?.text_page_number || 0);
    const imagePageNumber = Number(contract?.image_page_number || 0);
    if (!sceneNumber || scenes.has(sceneNumber)) issues.push(`storyboard scene ${sceneNumber || "unknown"} is duplicated or invalid`);
    if (!textPageNumber || textPages.has(textPageNumber)) issues.push(`storyboard text page ${textPageNumber || "unknown"} is duplicated or invalid`);
    if (!imagePageNumber || imagePages.has(imagePageNumber)) issues.push(`storyboard image page ${imagePageNumber || "unknown"} is duplicated or invalid`);
    scenes.add(sceneNumber);
    textPages.add(textPageNumber);
    imagePages.add(imagePageNumber);
    if (Number(contract?.storyboard_first_version) !== STORYBOARD_FIRST_CONTRACT_VERSION) {
      issues.push(`scene ${sceneNumber} storyboard-first version is invalid`);
    }
    if (contract?.artifact_digest !== storyboard?.artifactDigest) {
      issues.push(`scene ${sceneNumber} artifact digest does not match the storyboard`);
    }
    if (contract?.visual_beat_digest !== visualBeatDigest(contract)) {
      issues.push(`scene ${sceneNumber} visual beat integrity failed`);
    }
    const text = String(pageTexts?.[textPageNumber] ?? pageTexts?.[String(textPageNumber)] ?? "");
    if (!text.trim()) issues.push(`scene ${sceneNumber} manuscript text is missing`);
    if (String(contract?.source_prose || "") !== text) {
      issues.push(`scene ${sceneNumber} manuscript binding does not match its text page`);
    }
  }
  return [...new Set(issues)];
}

function sortedIdentitySet(items = [], field = "name") {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item?.[field] || "").trim())
    .filter(Boolean)
    .sort()
    .join("|");
}

export function storyboardAdjacentHandoffIssues(storyboard = {}) {
  const issues = [];
  const contracts = (Array.isArray(storyboard?.sceneContracts) ? storyboard.sceneContracts : [])
    .slice()
    .sort((left, right) => Number(left?.scene_number || 0) - Number(right?.scene_number || 0));
  for (let index = 0; index < contracts.length - 1; index += 1) {
    const current = contracts[index];
    const next = contracts[index + 1];
    const currentNumber = Number(current?.scene_number || 0);
    const nextNumber = Number(next?.scene_number || 0);
    if (nextNumber !== currentNumber + 1) {
      issues.push(`scene ${currentNumber} does not hand off to a contiguous next scene`);
    }
    const currentAfter = String(current?.causal_frame?.after?.location || "").trim();
    const nextBefore = String(next?.causal_frame?.before?.location || "").trim();
    if (!currentAfter || !nextBefore || currentAfter !== nextBefore) {
      issues.push(`scene ${currentNumber} location does not hand off to scene ${nextNumber}`);
    }
    const currentAfterZone = String(current?.render_snapshot?.camera_environment?.after_zone || "").trim();
    const nextBeforeZone = String(next?.render_snapshot?.camera_environment?.before_zone || "").trim();
    if (currentAfterZone && nextBeforeZone && currentAfterZone !== nextBeforeZone) {
      issues.push(`scene ${currentNumber} physical zone does not hand off to scene ${nextNumber}`);
    }
    if (sortedIdentitySet(current?.object_states) !== sortedIdentitySet(next?.object_states)) {
      issues.push(`scene ${currentNumber} object registry does not hand off to scene ${nextNumber}`);
    }
    const currentLastPage = Math.max(Number(current?.text_page_number || 0), Number(current?.image_page_number || 0));
    const nextFirstPage = Math.min(Number(next?.text_page_number || 0), Number(next?.image_page_number || 0));
    if (!currentLastPage || nextFirstPage <= currentLastPage) {
      issues.push(`scene ${currentNumber} page binding overlaps scene ${nextNumber}`);
    }
    const nextFixed = new Map((Array.isArray(next?.render_snapshot?.fixed_entities)
      ? next.render_snapshot.fixed_entities
      : []).map((entity) => [String(entity?.id || ""), entity]));
    for (const entity of String(next?.render_snapshot?.visible_phase || "") === "after"
      && Array.isArray(current?.render_snapshot?.fixed_entities)
      ? current.render_snapshot.fixed_entities
      : []) {
      const expected = (Array.isArray(entity?.adjacent_visibility) ? entity.adjacent_visibility : [])
        .find((entry) => Number(entry?.scene_number) === nextNumber);
      const actual = nextFixed.get(String(entity?.id || ""));
      if (expected && (!actual || String(expected.status || "") !== String(actual.status || ""))) {
        issues.push(`scene ${currentNumber} fixed entity ${entity.id || entity.name} does not hand off to scene ${nextNumber}`);
      }
    }
  }
  return [...new Set(issues)];
}
