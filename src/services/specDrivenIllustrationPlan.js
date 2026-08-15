import crypto from "node:crypto";
import { compilePhysicalRenderSnapshot } from "./physicalRenderSnapshot.js";

export const SPEC_DRIVEN_ILLUSTRATION_PLAN_VERSION = 7;
export const SPEC_DRIVEN_ILLUSTRATION_CONTRACT_SOURCE = "narrative_book_spec_v1_visible_cast_roles_v1";
export const STORYBOARD_FIRST_CONTRACT_VERSION = 2;

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

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((field) => [field, stableValue(value[field])]));
}

function visualBeatCore(contract = {}) {
  return {
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
      required_elements: structuredClone(contract.required_elements || []),
      object_states: structuredClone(contract.object_states || []),
      causal_frame: structuredClone(contract.causal_frame || {}),
      render_snapshot: structuredClone(contract.render_snapshot || {}),
      forbidden_elements: structuredClone(contract.forbidden_elements || []),
    },
  };
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
          : travelerCharacterIds.has(presence.characterId)
            ? "visible traveler"
            : "visible local supporter who remains at the departure or arrival location and does not receive traveler equipment",
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
    const locationBefore = locations.get(scene.timeline.locationBeforeId)?.name || scene.timeline.locationBeforeId;
    const transitionMechanism = passages.get(scene.transition?.passageId)?.name || scene.transition?.passageId || "";
    const contract = {
      contract_source: SPEC_DRIVEN_ILLUSTRATION_CONTRACT_SOURCE,
      storyboard_first_version: STORYBOARD_FIRST_CONTRACT_VERSION,
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
      causal_frame: {
        before: { location: locationBefore },
        during: {
          action: scene.narrative.approvedAction,
          transition_kind: scene.transition?.kind || "none",
          transition_mechanism: transitionMechanism,
          transition_mechanism_id: scene.transition?.passageId || "",
          from: locationBefore,
          to: locationAfter,
        },
        after: { location: locationAfter },
        visible_phase: scene.timeline.visiblePhase === "start"
          ? "before"
          : scene.timeline.visiblePhase === "end" ? "after" : "during",
        visible_location: scene.timeline.visiblePhase === "start" ? locationBefore : locationAfter,
      },
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
    const approvedScene = approvedScenario?.scenes?.find((item) => Number(item?.sceneNumber) === Number(scene.sceneNumber)) || null;
    const previousScene = approvedScenario?.scenes?.find((item) => Number(item?.sceneNumber) === Number(scene.sceneNumber) - 1) || null;
    contract.render_snapshot = compilePhysicalRenderSnapshot({
      contract,
      approvedScene,
      previousScene,
      approvedScenario,
      worldContract: approvedScenario?.worldContract || {},
    });
    contract.visual_beat_digest = visualBeatDigest(contract);
    return contract;
  });

  return {
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
  };
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
