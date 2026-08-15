export const VISUAL_COMPOSITION_PLAN_VERSION = 2;

const COMPOSITIONS = Object.freeze({
  establishing_environment: Object.freeze({
    shot_scale: "wide establishing view",
    viewpoint: "eye-level three-quarter view",
    subject_placement: "main subject on the left third with the destination readable beyond",
    depth_plan: "one foreground anchor, the action in the middle ground and the canonical environment in the background",
    visual_rhythm: "calm opening breadth",
    scale_family: "wide",
    energy_level: 1,
  }),
  character_in_world: Object.freeze({
    shot_scale: "medium-wide environmental portrait",
    viewpoint: "gentle eye-level view",
    subject_placement: "hero off-centre with meaningful space in the direction of attention",
    depth_plan: "personal detail in the foreground and the story world clearly established behind",
    visual_rhythm: "quiet curiosity",
    scale_family: "medium",
    energy_level: 1,
  }),
  reveal_over_shoulder: Object.freeze({
    shot_scale: "medium-wide reveal",
    viewpoint: "over-the-shoulder view from the main observer",
    subject_placement: "observer framing one edge and the discovered subject on the opposite third",
    depth_plan: "observer foreground, discovery middle ground and location context behind",
    visual_rhythm: "progressive discovery",
    scale_family: "medium",
    energy_level: 2,
  }),
  relational_two_shot: Object.freeze({
    shot_scale: "medium two-shot",
    viewpoint: "eye-level relational view",
    subject_placement: "participants on opposing thirds connected by gaze or gesture",
    depth_plan: "clear hands and faces in the middle ground with one restrained location anchor",
    visual_rhythm: "warm connection",
    scale_family: "medium",
    energy_level: 2,
  }),
  object_plan_view: Object.freeze({
    shot_scale: "medium action view",
    viewpoint: "high oblique view, not a flat diagram",
    subject_placement: "hands, actor and planned object form a clear triangle",
    depth_plan: "relevant object foreground, actor middle ground and uncluttered context behind",
    visual_rhythm: "focused preparation",
    scale_family: "detail",
    energy_level: 2,
  }),
  threshold_profile: Object.freeze({
    shot_scale: "wide threshold view",
    viewpoint: "side-on profile across the boundary",
    subject_placement: "travelers and passage form one readable left-to-right movement",
    depth_plan: "departure side, bounded passage and destination side remain spatially distinct",
    visual_rhythm: "decisive transition",
    scale_family: "wide",
    energy_level: 3,
  }),
  threshold_reverse_profile: Object.freeze({
    shot_scale: "wide threshold view",
    viewpoint: "reverse side-on profile across the boundary",
    subject_placement: "travelers and passage form one readable right-to-left movement",
    depth_plan: "departure side, bounded passage and destination side remain spatially distinct",
    visual_rhythm: "decisive return transition",
    scale_family: "wide",
    energy_level: 3,
  }),
  diagonal_action: Object.freeze({
    shot_scale: "medium-wide action view",
    viewpoint: "low three-quarter view",
    subject_placement: "main actor leads a strong diagonal toward the exact target",
    depth_plan: "target foreground, action middle ground and consequence visible behind",
    visual_rhythm: "forward energy",
    scale_family: "medium",
    energy_level: 4,
  }),
  clue_close_context: Object.freeze({
    shot_scale: "close detail with environmental context",
    viewpoint: "eye-level close three-quarter view",
    subject_placement: "the clue and the child's response share the focal area without becoming a collage",
    depth_plan: "clue foreground, readable expression middle ground and softened canonical setting behind",
    visual_rhythm: "attentive discovery",
    scale_family: "detail",
    energy_level: 2,
  }),
  setback_negative_space: Object.freeze({
    shot_scale: "medium-wide consequence view",
    viewpoint: "slightly high eye-line",
    subject_placement: "hero on one third with deliberate empty space around the failed result",
    depth_plan: "failed result foreground, hero middle ground and restrained environment behind",
    visual_rhythm: "pause and reassessment",
    scale_family: "wide",
    energy_level: 2,
  }),
  choice_triangle: Object.freeze({
    shot_scale: "medium decision view",
    viewpoint: "eye-level three-quarter view",
    subject_placement: "hero, choice and consequence form a clean visual triangle",
    depth_plan: "choice foreground, deciding hero middle ground and supporting cast behind",
    visual_rhythm: "held decision",
    scale_family: "medium",
    energy_level: 3,
  }),
  climax_low_action: Object.freeze({
    shot_scale: "medium-close heroic action view",
    viewpoint: "restrained low-angle view",
    subject_placement: "hero and exact target dominate the centre without hiding required companions",
    depth_plan: "decisive gesture foreground, hero middle ground and earned consequence behind",
    visual_rhythm: "peak action",
    scale_family: "close",
    energy_level: 5,
  }),
  intimate_reflection: Object.freeze({
    shot_scale: "medium-close intimate view",
    viewpoint: "quiet eye-level view",
    subject_placement: "hero slightly off-centre with a supporting relationship or meaningful object nearby",
    depth_plan: "emotion and gesture foreground with minimal calm context",
    visual_rhythm: "soft reflection",
    scale_family: "close",
    energy_level: 1,
  }),
  layered_resolution: Object.freeze({
    shot_scale: "medium-wide resolution view",
    viewpoint: "gentle eye-level three-quarter view",
    subject_placement: "resolved action on one third and its visible consequence on the other",
    depth_plan: "earned result foreground, connected characters middle ground and familiar world behind",
    visual_rhythm: "clear release",
    scale_family: "medium",
    energy_level: 2,
  }),
  celebration_wide: Object.freeze({
    shot_scale: "wide ensemble view",
    viewpoint: "slightly low festive view",
    subject_placement: "hero remains the visual anchor while the group forms an open arc",
    depth_plan: "small celebratory details foreground, group middle ground and destination context behind",
    visual_rhythm: "expansive celebration",
    scale_family: "wide",
    energy_level: 3,
  }),
});

const ROLE_COMPOSITION = Object.freeze({
  character_and_desire: "character_in_world",
  world_discovery: "reveal_over_shoulder",
  external_problem: "setback_negative_space",
  internal_problem: "intimate_reflection",
  meeting_the_guide: "relational_two_shot",
  bond_with_the_guide: "relational_two_shot",
  simple_plan: "object_plan_view",
  preparing_the_plan: "object_plan_view",
  call_to_action: "reveal_over_shoulder",
  crossing_the_threshold: "threshold_profile",
  first_attempt: "diagonal_action",
  second_attempt: "setback_negative_space",
  third_attempt: "diagonal_action",
  clue_and_discovery: "clue_close_context",
  setback_and_learning: "setback_negative_space",
  challenge_and_choice: "choice_triangle",
  climax: "climax_low_action",
  quiet_reflection: "intimate_reflection",
  success_and_transformation: "layered_resolution",
  celebration_with_loved_ones: "celebration_wide",
  return_home_and_moral: "intimate_reflection",
});

const FALLBACK_SEQUENCE = Object.freeze([
  "establishing_environment",
  "relational_two_shot",
  "diagonal_action",
  "reveal_over_shoulder",
  "object_plan_view",
  "clue_close_context",
  "layered_resolution",
]);

function selectCompositionId({ sceneNumber, storyRole, transitionKind, previousCompositionId }) {
  const crossesBoundary = transitionKind === "cross_passage" || transitionKind === "return_travel";
  let id = crossesBoundary
    ? transitionKind === "return_travel" || previousCompositionId === "threshold_profile"
      ? "threshold_reverse_profile"
      : "threshold_profile"
    : ROLE_COMPOSITION[String(storyRole || "").trim()]
      || FALLBACK_SEQUENCE[(Math.max(1, Number(sceneNumber) || 1) - 1) % FALLBACK_SEQUENCE.length];
  if (id === previousCompositionId) {
    const start = Math.max(0, FALLBACK_SEQUENCE.indexOf(id));
    const offset = 1 + ((Math.max(1, Number(sceneNumber) || 1) - 1) % (FALLBACK_SEQUENCE.length - 1));
    id = FALLBACK_SEQUENCE[(start + offset) % FALLBACK_SEQUENCE.length];
  }
  return id;
}

export function compileVisualComposition({
  sceneNumber = 1,
  storyRole = "",
  transitionKind = "none",
  visibleCharacterCount = 1,
  previousCompositionId = "",
} = {}) {
  const compositionId = selectCompositionId({ sceneNumber, storyRole, transitionKind, previousCompositionId });
  const template = COMPOSITIONS[compositionId] || COMPOSITIONS.establishing_environment;
  return {
    version: VISUAL_COMPOSITION_PLAN_VERSION,
    composition_id: compositionId,
    story_role: String(storyRole || ""),
    framing: "single square illustration",
    ...template,
    cast_readability: Number(visibleCharacterCount || 0) > 2
      ? "keep every required character complete and separately readable; never crop or merge a group member"
      : "keep every required character complete, separate and readable",
    action_readability: "composition may vary, but the signed main action, physical phase, cast, location and object states may not change",
  };
}

export function visualCompositionPlanIssues(sceneContracts = [], {
  minimumVersion = VISUAL_COMPOSITION_PLAN_VERSION,
} = {}) {
  const issues = [];
  let previous = "";
  for (const contract of Array.isArray(sceneContracts) ? sceneContracts : []) {
    const sceneNumber = Number(contract?.scene_number || 0);
    const composition = contract?.visual_composition;
    if (Number(composition?.version || 0) < Number(minimumVersion || 1)) {
      issues.push(`scene ${sceneNumber} visual composition version is invalid`);
    }
    if (!COMPOSITIONS[composition?.composition_id]) {
      issues.push(`scene ${sceneNumber} visual composition is unknown`);
    }
    if (composition?.composition_id && composition.composition_id === previous) {
      issues.push(`scene ${sceneNumber} repeats the previous visual composition`);
    }
    for (const field of ["shot_scale", "viewpoint", "subject_placement", "depth_plan", "action_readability"]) {
      if (!String(composition?.[field] || "").trim()) issues.push(`scene ${sceneNumber} visual composition ${field} is missing`);
    }
    if (Number(minimumVersion || 1) >= 2) {
      if (!["wide", "medium", "detail", "close"].includes(composition?.scale_family)) {
        issues.push(`scene ${sceneNumber} visual composition scale family is invalid`);
      }
      if (!Number.isInteger(composition?.energy_level)
        || composition.energy_level < 1
        || composition.energy_level > 5) {
        issues.push(`scene ${sceneNumber} visual composition energy is invalid`);
      }
    }
    previous = String(composition?.composition_id || "");
  }
  return [...new Set(issues)];
}

export function wholeBookVisualRhythmIssues(sceneContracts = []) {
  const contracts = (Array.isArray(sceneContracts) ? sceneContracts : [])
    .slice()
    .sort((left, right) => Number(left?.scene_number || 0) - Number(right?.scene_number || 0));
  const issues = visualCompositionPlanIssues(contracts);
  if (!contracts.length) return issues;
  const scales = new Set(contracts.map((contract) => contract?.visual_composition?.scale_family).filter(Boolean));
  if (contracts.length >= 8 && scales.size < 3) issues.push("whole-book visual rhythm needs at least three scale families");
  for (let index = 3; index < contracts.length; index += 1) {
    const run = contracts.slice(index - 3, index + 1)
      .map((contract) => contract?.visual_composition?.scale_family);
    if (run[0] && run.every((scale) => scale === run[0])) {
      issues.push(`scene ${Number(contracts[index]?.scene_number || 0)} repeats one scale family four times`);
    }
  }
  const climaxIndex = contracts.findIndex((contract) => contract?.visual_composition?.story_role === "climax");
  if (climaxIndex >= 0) {
    const climax = contracts[climaxIndex]?.visual_composition;
    if (climax?.energy_level !== 5 || climax?.composition_id !== "climax_low_action") {
      issues.push("whole-book visual climax does not carry the unique peak composition");
    }
    if (climaxIndex > 0 && Number(contracts[climaxIndex - 1]?.visual_composition?.energy_level || 0) >= 5) {
      issues.push("whole-book visual rhythm reaches peak intensity before the climax");
    }
    if (climaxIndex < contracts.length - 1
      && Number(contracts[climaxIndex + 1]?.visual_composition?.energy_level || 0) >= 5) {
      issues.push("whole-book visual rhythm does not release after the climax");
    }
  }
  const attempts = contracts.filter((contract) => ["first_attempt", "second_attempt", "third_attempt"]
    .includes(contract?.visual_composition?.story_role));
  if (attempts.length && !attempts.some((contract) => Number(contract?.visual_composition?.energy_level || 0) >= 4)) {
    issues.push("whole-book attempts never gain visible energy");
  }
  const returnScene = contracts.find((contract) => contract?.visual_composition?.story_role === "return_home_and_moral");
  if (returnScene && Number(returnScene.visual_composition?.energy_level || 0) > 2) {
    issues.push("whole-book return does not settle after the resolution");
  }
  return [...new Set(issues)];
}
