import crypto from "node:crypto";

export const UNIVERSAL_INVARIANT_ENGINE_VERSION = 1;

export const NARRATIVE_INVARIANT_DOMAINS = Object.freeze([
  "narrative_role",
  "physical_topology",
  "cast_cardinality",
  "wardrobe_equipment",
  "object_lifecycle",
  "visual_composition",
]);

const BOUNDARY_TRANSITIONS = new Set(["cross_passage", "return_travel"]);

const ISSUE_CODES = Object.freeze([
  [/visual climax does not carry the unique peak composition/iu, "visual_peak_conflict"],
  [/reaches peak intensity before the climax/iu, "visual_premature_peak"],
  [/does not release after the climax/iu, "visual_peak_release_missing"],
  [/return does not settle after the resolution/iu, "visual_return_not_settled"],
  [/needs at least three scale families/iu, "visual_scale_diversity_missing"],
  [/repeats one scale family four times/iu, "visual_scale_run_repeated"],
  [/repeats the previous visual composition/iu, "visual_composition_repeated"],
  [/visual composition .* is missing/iu, "visual_composition_field_missing"],
  [/visual composition .* is invalid/iu, "visual_composition_field_invalid"],
  [/visual composition is unknown/iu, "visual_composition_unknown"],
  [/(?:named character|visible cast|forbidden cast|cast cardinality|duplicate presence)/iu, "cast_cardinality_conflict"],
  [/(?:wardrobe|outfit|equipment)/iu, "wardrobe_equipment_conflict"],
  [/(?:object state|visual entity|immutable quantity|visible quantity|zero instances|duplicate one visual entity)/iu, "object_lifecycle_conflict"],
  [/(?:location|physical medium|transition|boundary topology|causal frame|handoff)/iu, "physical_topology_conflict"],
]);

function normalizedEnum(value, fallback = "none") {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || fallback;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

export function compileVisualInvariantPolicy({
  sceneNumber = 1,
  storyRole = "",
  transitionKind = "none",
  visiblePhase = "",
  previousCompositionId = "",
  roleCompositionId = "establishing_environment",
} = {}) {
  const role = normalizedEnum(storyRole, "unassigned");
  const transition = normalizedEnum(transitionKind);
  const phase = normalizedEnum(visiblePhase, "during");
  const previous = normalizedEnum(previousCompositionId, "none");
  const isNarrativePeak = role === "climax";
  const isSettledReturn = role === "return_home_and_moral" && phase === "end";
  const crossesBoundary = BOUNDARY_TRANSITIONS.has(transition) && !isSettledReturn;
  const topologyCompositionId = transition === "return_travel" || previous === "threshold_profile"
    ? "threshold_reverse_profile"
    : "threshold_profile";

  // Narrative peak and settled-return constraints are hard invariants. Physical
  // topology is an orthogonal overlay and may not erase their energy contract.
  // A physical transition never replaces narrative intent. It contributes a
  // topology overlay to the narrative composition selected by the role.
  const compositionId = roleCompositionId;
  const constraints = [
    `narrative_role:${role}`,
    `physical_topology:${transition}`,
    `visible_phase:${phase}`,
    ...(isNarrativePeak ? ["unique_peak:energy_5"] : []),
    ...(isSettledReturn ? ["settled_return:energy_max_2"] : []),
    ...(crossesBoundary ? ["boundary_geometry:departure_passage_destination"] : []),
  ];
  const input = {
    sceneNumber: Math.max(1, Number(sceneNumber) || 1),
    storyRole: role,
    transitionKind: transition,
    visiblePhase: phase,
    previousCompositionId: previous,
  };
  return Object.freeze({
    version: UNIVERSAL_INVARIANT_ENGINE_VERSION,
    input: Object.freeze(input),
    inputFingerprint: digest(input),
    constraints: Object.freeze(constraints),
    compositionId,
    topologyCompositionId: crossesBoundary ? topologyCompositionId : null,
    topologyOverlayRequired: crossesBoundary && compositionId !== topologyCompositionId,
    uniquePeakRequired: isNarrativePeak,
    settledReturnRequired: isSettledReturn,
  });
}

export function universalVisualInvariantIssues(composition = {}) {
  const issues = [];
  const engine = composition?.invariant_engine;
  if (!engine) return issues;
  if (Number(engine.version || 0) !== UNIVERSAL_INVARIANT_ENGINE_VERSION) {
    issues.push("visual invariant engine version is invalid");
  }
  if (engine.uniquePeakRequired
    && (composition.composition_id !== "climax_low_action" || Number(composition.energy_level) !== 5)) {
    issues.push("whole-book visual climax does not carry the unique peak composition");
  }
  if (engine.settledReturnRequired && Number(composition.energy_level || 0) > 2) {
    issues.push("whole-book return does not settle after the resolution");
  }
  if (engine.topologyCompositionId) {
    const topology = String(composition.depth_plan || "");
    if (!/departure side/iu.test(topology)
      || !/passage/iu.test(topology)
      || !/destination side/iu.test(topology)) {
      issues.push("visual boundary topology does not expose departure, passage and destination");
    }
  }
  return [...new Set(issues)];
}

export function invariantIssueCode(issue = "") {
  const text = String(issue || "");
  return ISSUE_CODES.find(([pattern]) => pattern.test(text))?.[1] || "visual_invariant_unclassified";
}

function structuralCase(contract = {}) {
  const composition = contract?.visual_composition || {};
  const input = composition?.invariant_engine?.input || {};
  return {
    sceneNumber: Math.max(0, Number(contract?.scene_number || input.sceneNumber || 0)),
    storyRole: normalizedEnum(composition.story_role || input.storyRole, "unassigned"),
    transitionKind: normalizedEnum(input.transitionKind),
    visiblePhase: normalizedEnum(input.visiblePhase, "during"),
    compositionId: normalizedEnum(composition.composition_id, "unknown"),
    energyLevel: Math.max(0, Number(composition.energy_level || 0)),
    visibleCharacterCount: Math.max(0, Number(contract?.named_characters?.length || 0)),
    objectStateCount: Math.max(0, Number(contract?.object_states?.length || 0)),
    visibleObjectQuantity: (contract?.object_states || []).reduce((total, state) => (
      total + (state?.visibility === "forbidden" ? 0 : Math.max(0, Number(state?.quantity || 0)))
    ), 0),
    requiredElementCount: Math.max(0, Number(contract?.required_elements?.length || 0)),
    forbiddenElementCount: Math.max(0, Number(contract?.forbidden_elements?.length || 0)),
    constraintIds: (composition?.invariant_engine?.constraints || []).map((entry) => String(entry)).sort(),
  };
}

export function buildInvariantCounterexampleReport({
  stage = "storyboard_binding",
  issues = [],
  sceneContracts = [],
} = {}) {
  const issueCodes = [...new Set((issues || []).map(invariantIssueCode))].sort();
  const cases = (sceneContracts || [])
    .map(structuralCase)
    .filter((entry) => entry.sceneNumber > 0)
    .sort((left, right) => left.sceneNumber - right.sceneNumber);
  const structuralPayload = {
    engineVersion: UNIVERSAL_INVARIANT_ENGINE_VERSION,
    stage: normalizedEnum(stage, "unknown"),
    issueCodes,
    cases,
  };
  return Object.freeze({
    version: 1,
    privacy: "structural_only_no_story_text_names_or_assets",
    fingerprint: digest(structuralPayload),
    ...structuralPayload,
  });
}
