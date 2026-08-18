import { loadManuscript, manuscriptDigest } from "./manuscriptV1.js";
import { canonicalDigest } from "./narrativeV3Canonical.js";
import { loadNarrativeBookSpecV3 } from "./narrativeBookSpecV3.js";
import { assertNarrativeV3Schema, NarrativeV3ContractError } from "./narrativeV3SchemaRegistry.js";
import { compileVisualComposition, wholeBookVisualRhythmIssues } from "../services/visualCompositionPlan.js";

export const VISUAL_STORYBOARD_VERSION = 1;
export const VISUAL_STORYBOARD_ID = "calitiki.visual-storyboard.v1";
export const VISUAL_STORYBOARD_COMPILER_VERSION = 1;

const ROLE_BY_PURPOSE = Object.freeze({
  opening: "character_and_desire",
  desire: "world_discovery",
  preparation: "preparing_the_plan",
  crossing: "crossing_the_threshold",
  attempt: "first_attempt",
  setback: "setback_and_learning",
  choice: "challenge_and_choice",
  climax: "climax",
  return: "return_home_and_moral",
  resolution: "success_and_transformation",
});
const ROLE_SEQUENCE_BY_PURPOSE = Object.freeze({
  desire: Object.freeze(["world_discovery", "internal_problem", "simple_plan"]),
  attempt: Object.freeze(["first_attempt", "setback_and_learning", "clue_and_discovery", "challenge_and_choice"]),
});

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

function fail(code, path, message) {
  throw new NarrativeV3ContractError({ code, artifactType: "visual_storyboard_v1", issues: [{ path, message }] });
}

function withoutDigest(value) {
  const copy = structuredClone(value);
  if (copy.validation) delete copy.validation.artifactDigest;
  return copy;
}

function beatProjection(beat) {
  const copy = structuredClone(beat);
  delete copy.beatDigest;
  copy.handoff.previousBeatDigest = null;
  copy.handoff.nextBeatDigest = null;
  return copy;
}

export function visualStoryboardDigest(value) {
  return canonicalDigest(withoutDigest(value));
}

export function visualStoryboardBeatDigest(value) {
  return canonicalDigest(beatProjection(value));
}

function transitionKind(scene) {
  return scene.movements.find((movement) => ["cross_passage", "return_travel"].includes(movement.kind))?.kind || "none";
}

function manuscriptPageByScene(manuscript, sceneNumber) {
  return manuscript.pages.find((page) => page.sceneNumber === sceneNumber);
}

function compileComposition(scene, previousCompositionId) {
  const sequence = ROLE_SEQUENCE_BY_PURPOSE[scene.semantic.purpose];
  const storyRole = sequence
    ? sequence[(scene.sceneNumber - 1) % sequence.length]
    : ROLE_BY_PURPOSE[scene.semantic.purpose];
  const raw = compileVisualComposition({
    sceneNumber: scene.sceneNumber,
    storyRole,
    transitionKind: transitionKind(scene),
    visiblePhase: scene.illustrationInstant.visiblePhase,
    visibleCharacterCount: scene.illustrationInstant.visibleCharacterIds.length,
    previousCompositionId,
  });
  return {
    version: raw.version,
    compositionId: raw.composition_id,
    storyRole: raw.story_role,
    shotScale: raw.shot_scale,
    viewpoint: raw.viewpoint,
    subjectPlacement: raw.subject_placement,
    depthPlan: raw.depth_plan,
    scaleFamily: raw.scale_family,
    energyLevel: raw.energy_level,
  };
}

function assertSources(spec, manuscript) {
  if (manuscript.sourceSpec.artifactDigest !== spec.validation.artifactDigest) {
    fail("storyboard_manuscript_spec_mismatch", "/sources", "The manuscript and visual storyboard must descend from the same exact released spec.");
  }
}

function assertInvariants(storyboard) {
  if (storyboard.beats.length !== storyboard.book.sceneCount || storyboard.book.sceneCount !== (storyboard.book.pageCount - 2) / 2) {
    fail("storyboard_scene_count_mismatch", "/beats", "Every released scene needs exactly one visual beat.");
  }
  storyboard.beats.forEach((beat, index) => {
    if (beat.sceneNumber !== index + 1) fail("storyboard_scene_order_invalid", `/beats/${index}`, "Visual beats must remain in exact scene order.");
    if (beat.beatDigest !== visualStoryboardBeatDigest(beat)) fail("storyboard_beat_digest_mismatch", `/beats/${index}/beatDigest`, "The beat digest is stale.");
    if (index > 0) {
      const previous = storyboard.beats[index - 1];
      if (beat.physical.locationBeforeId !== previous.physical.locationAfterId
        || beat.handoff.previousLocationId !== previous.physical.locationAfterId
        || beat.handoff.previousBeatDigest !== previous.beatDigest
        || previous.handoff.nextLocationId !== beat.physical.locationBeforeId
        || previous.handoff.nextBeatDigest !== beat.beatDigest) {
        fail("storyboard_handoff_invalid", `/beats/${index}/handoff`, "Adjacent beats do not share one exact physical handoff.");
      }
    }
  });
  const rhythms = wholeBookVisualRhythmIssues(storyboard.beats.map((beat) => ({
    scene_number: beat.sceneNumber,
    visual_composition: {
      version: beat.composition.version,
      composition_id: beat.composition.compositionId,
      story_role: beat.composition.storyRole,
      shot_scale: beat.composition.shotScale,
      viewpoint: beat.composition.viewpoint,
      subject_placement: beat.composition.subjectPlacement,
      depth_plan: beat.composition.depthPlan,
      scale_family: beat.composition.scaleFamily,
      energy_level: beat.composition.energyLevel,
      action_readability: "locked",
    },
  })));
  if (rhythms.length) fail("storyboard_visual_rhythm_invalid", "/beats", rhythms[0]);
}

export function compileVisualStoryboard({ spec: rawSpec, manuscript: rawManuscript, revision = 1 } = {}) {
  const spec = loadNarrativeBookSpecV3(rawSpec);
  const manuscript = loadManuscript(rawManuscript);
  assertSources(spec, manuscript);
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1) fail("storyboard_revision_invalid", "/revision", "A positive storyboard revision is required.");
  let previousCompositionId = "";
  const beats = spec.scenes.map((scene) => {
    const page = manuscriptPageByScene(manuscript, scene.sceneNumber);
    if (!page || page.pageNumber !== scene.pageBinding.textPageNumber || page.sourceSceneDigest !== scene.sourceSceneDigest || page.objectStateDigest !== scene.objectStateDigest) {
      fail("storyboard_manuscript_page_mismatch", `/beats/${scene.sceneNumber - 1}`, "The paired prose page is not bound to this exact scene and object state.");
    }
    const composition = compileComposition(scene, previousCompositionId);
    previousCompositionId = composition.compositionId;
    return {
      sceneNumber: scene.sceneNumber,
      act: scene.act,
      spreadNumber: scene.pageBinding.spreadNumber,
      textPageNumber: scene.pageBinding.textPageNumber,
      imagePageNumber: scene.pageBinding.imagePageNumber,
      sourceSceneDigest: scene.sourceSceneDigest,
      objectStateDigest: scene.objectStateDigest,
      manuscriptPageDigest: canonicalDigest(page),
      physical: {
        visiblePhase: scene.illustrationInstant.visiblePhase,
        locationBeforeId: scene.timeline.locationBeforeId,
        locationId: scene.illustrationInstant.locationId,
        locationAfterId: scene.timeline.locationAfterId,
        physicalMediumId: scene.illustrationInstant.physicalMediumId,
      },
      cast: {
        visibleCharacterIds: structuredClone(scene.illustrationInstant.visibleCharacterIds),
        forbiddenCharacterIds: structuredClone(scene.illustrationInstant.forbiddenCharacterIds),
        wardrobeStates: structuredClone(scene.illustrationInstant.wardrobeStates),
      },
      objectStates: structuredClone(scene.objectStates),
      mainAction: structuredClone(scene.illustrationInstant.mainAction),
      composition,
      handoff: { previousBeatDigest: null, nextBeatDigest: null, previousLocationId: null, nextLocationId: null },
      beatDigest: "",
    };
  });
  beats.forEach((beat, index) => {
    beat.handoff.previousLocationId = index ? beats[index - 1].physical.locationAfterId : null;
    beat.handoff.nextLocationId = index < beats.length - 1 ? beats[index + 1].physical.locationBeforeId : null;
    beat.beatDigest = visualStoryboardBeatDigest(beat);
  });
  beats.forEach((beat, index) => {
    beat.handoff.previousBeatDigest = index ? beats[index - 1].beatDigest : null;
    beat.handoff.nextBeatDigest = index < beats.length - 1 ? beats[index + 1].beatDigest : null;
  });
  const storyboard = {
    schemaVersion: VISUAL_STORYBOARD_VERSION,
    contractId: VISUAL_STORYBOARD_ID,
    revision: Number(revision),
    sources: {
      narrativeBookSpec: { contractId: spec.contractId, schemaVersion: spec.schemaVersion, artifactDigest: spec.validation.artifactDigest },
      manuscript: { contractId: manuscript.contractId, schemaVersion: manuscript.schemaVersion, artifactDigest: manuscriptDigest(manuscript) },
    },
    book: { language: spec.book.language, pageCount: spec.book.pageCount, sceneCount: spec.scenes.length },
    beats,
    validation: { compilerVersion: VISUAL_STORYBOARD_COMPILER_VERSION, artifactDigest: "" },
  };
  storyboard.validation.artifactDigest = visualStoryboardDigest(storyboard);
  assertNarrativeV3Schema("visual_storyboard_v1", storyboard);
  assertInvariants(storyboard);
  return freeze(structuredClone(storyboard));
}

export function loadVisualStoryboard(value) {
  assertNarrativeV3Schema("visual_storyboard_v1", value);
  assertInvariants(value);
  if (value.validation.artifactDigest !== visualStoryboardDigest(value)) fail("storyboard_digest_mismatch", "/validation/artifactDigest", "The digest does not belong to this exact storyboard.");
  return freeze(structuredClone(value));
}
