import { canonicalDigest } from "./narrativeV3Canonical.js";
import { loadNarrativeBookSpecV3 } from "./narrativeBookSpecV3.js";
import { assertNarrativeV3Schema, NarrativeV3ContractError } from "./narrativeV3SchemaRegistry.js";
import { loadVisualStoryboard } from "./visualStoryboardV1.js";

export const VISUAL_CONTINUITY_PLAN_VERSION = 1;
export const VISUAL_CONTINUITY_PLAN_ID = "calitiki.visual-continuity-plan.v1";
export const VISUAL_CONTINUITY_PLAN_COMPILER_VERSION = 1;

const PERMITTED_PREVIOUS_IMAGE_DOMAINS = Object.freeze([
  "identity_continuity",
  "world_detail_continuity",
  "lighting_palette_continuity",
]);
const FORBIDDEN_PREVIOUS_IMAGE_DOMAINS = Object.freeze([
  "cast_cardinality",
  "location",
  "physical_medium",
  "wardrobe",
  "equipment",
  "object_state",
  "main_action",
  "pose",
  "composition",
]);

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

function fail(code, path, message) {
  throw new NarrativeV3ContractError({
    code,
    artifactType: "visual_continuity_plan_v1",
    issues: [{ path, message }],
  });
}

function rootDigest(value) {
  const copy = structuredClone(value);
  delete copy.validation.artifactDigest;
  return canonicalDigest(copy);
}

function itemDigest(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  return canonicalDigest(copy);
}

export function visualContinuityPlanDigest(value) {
  return rootDigest(value);
}

export function visualContinuityStateDigest(value) {
  return itemDigest(value, "stateDigest");
}

export function visualContinuityTransitionDigest(value) {
  return itemDigest(value, "transitionDigest");
}

export function visualContinuityWindowDigest(value) {
  return itemDigest(value, "windowDigest");
}

function stateSnapshot(beat) {
  const snapshot = {
    stateDigest: "",
    physical: structuredClone(beat.physical),
    cast: structuredClone(beat.cast),
    objectStates: structuredClone(beat.objectStates),
    mainAction: structuredClone(beat.mainAction),
  };
  snapshot.stateDigest = visualContinuityStateDigest(snapshot);
  return snapshot;
}

function mapBy(entries, key) {
  return new Map((Array.isArray(entries) ? entries : []).map((entry) => [entry[key], entry]));
}

function changedKeys(leftEntries, rightEntries, key, projection = (value) => value) {
  const left = mapBy(leftEntries, key);
  const right = mapBy(rightEntries, key);
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter((id) => canonicalDigest(projection(left.get(id) || null)) !== canonicalDigest(projection(right.get(id) || null)))
    .sort();
}

function changedSet(left = [], right = []) {
  const before = new Set(left);
  const after = new Set(right);
  return [...new Set([...before, ...after])]
    .filter((id) => before.has(id) !== after.has(id))
    .sort();
}

function wardrobeProjection(entry, domain) {
  if (!entry) return null;
  return domain === "outfit"
    ? { characterId: entry.characterId, outfitStateId: entry.outfitStateId }
    : { characterId: entry.characterId, equipmentStateIds: entry.equipmentStateIds };
}

function transition(fromBeat, fromState, toBeat, toState) {
  const value = {
    fromSceneNumber: fromBeat.sceneNumber,
    toSceneNumber: toBeat.sceneNumber,
    fromBeatDigest: fromBeat.beatDigest,
    toBeatDigest: toBeat.beatDigest,
    fromStateDigest: fromState.stateDigest,
    toStateDigest: toState.stateDigest,
    handoffLocationId: fromBeat.physical.locationAfterId,
    locationChanged: fromState.physical.locationId !== toState.physical.locationId,
    physicalMediumChanged: fromState.physical.physicalMediumId !== toState.physical.physicalMediumId,
    changedVisibleCharacterIds: changedSet(fromState.cast.visibleCharacterIds, toState.cast.visibleCharacterIds),
    changedForbiddenCharacterIds: changedSet(fromState.cast.forbiddenCharacterIds, toState.cast.forbiddenCharacterIds),
    changedOutfitCharacterIds: changedKeys(
      fromState.cast.wardrobeStates,
      toState.cast.wardrobeStates,
      "characterId",
      (entry) => wardrobeProjection(entry, "outfit"),
    ),
    changedEquipmentCharacterIds: changedKeys(
      fromState.cast.wardrobeStates,
      toState.cast.wardrobeStates,
      "characterId",
      (entry) => wardrobeProjection(entry, "equipment"),
    ),
    changedObjectIds: changedKeys(fromState.objectStates, toState.objectStates, "objectId"),
    transitionDigest: "",
  };
  value.transitionDigest = visualContinuityTransitionDigest(value);
  return value;
}

function expectedTransition(fromWindow, toWindow) {
  return transition(
    { sceneNumber: fromWindow.sceneNumber, beatDigest: fromWindow.beatDigest, physical: fromWindow.current.physical },
    fromWindow.current,
    { sceneNumber: toWindow.sceneNumber, beatDigest: toWindow.beatDigest, physical: toWindow.current.physical },
    toWindow.current,
  );
}

function assertInvariants(plan) {
  if (plan.windows.length < 1) fail("visual_continuity_window_missing", "/windows", "At least one current-state window is required.");
  const identityIds = plan.identityAnchors.map((entry) => entry.characterId);
  if (new Set(identityIds).size !== identityIds.length) {
    fail("visual_continuity_identity_duplicate", "/identityAnchors", "Every canonical identity may be anchored exactly once.");
  }
  plan.windows.forEach((window, index) => {
    const path = `/windows/${index}`;
    if (window.sceneNumber !== index + 1) fail("visual_continuity_window_order_invalid", path, "Continuity windows must remain in exact scene order.");
    if (window.current.stateDigest !== visualContinuityStateDigest(window.current)) {
      fail("visual_continuity_state_digest_mismatch", `${path}/current/stateDigest`, "The current visual state digest is stale.");
    }
    if (window.windowDigest !== visualContinuityWindowDigest(window)) {
      fail("visual_continuity_window_digest_mismatch", `${path}/windowDigest`, "The continuity window digest is stale.");
    }
    const previous = plan.windows[index - 1];
    const next = plan.windows[index + 1];
    if (!previous && window.incoming !== null) fail("visual_continuity_incoming_invalid", `${path}/incoming`, "The first scene cannot inherit an earlier scene.");
    if (!next && window.outgoing !== null) fail("visual_continuity_outgoing_invalid", `${path}/outgoing`, "The last scene cannot constrain a later scene.");
    if (previous) {
      const expected = expectedTransition(previous, window);
      if (canonicalDigest(window.incoming) !== canonicalDigest(expected)
        || canonicalDigest(previous.outgoing) !== canonicalDigest(expected)) {
        fail("visual_continuity_incoming_invalid", `${path}/incoming`, "The incoming state must equal the previous scene's exact outgoing transition.");
      }
    }
    if (next) {
      const expected = expectedTransition(window, next);
      if (canonicalDigest(window.outgoing) !== canonicalDigest(expected)
        || canonicalDigest(next.incoming) !== canonicalDigest(expected)) {
        fail("visual_continuity_outgoing_invalid", `${path}/outgoing`, "The outgoing constraints must equal the next scene's exact incoming transition.");
      }
    }
    for (const edge of [window.incoming, window.outgoing].filter(Boolean)) {
      if (edge.transitionDigest !== visualContinuityTransitionDigest(edge)) {
        fail("visual_continuity_transition_digest_mismatch", path, "An adjacent state transition digest is stale.");
      }
    }
  });
}

export function compileVisualContinuityPlan({ spec: rawSpec, storyboard: rawStoryboard, revision = 1 } = {}) {
  const spec = loadNarrativeBookSpecV3(rawSpec);
  const storyboard = loadVisualStoryboard(rawStoryboard);
  if (storyboard.sources.narrativeBookSpec.artifactDigest !== spec.validation.artifactDigest) {
    fail("visual_continuity_source_mismatch", "/sources", "The continuity plan and storyboard must descend from the same exact released spec.");
  }
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1) {
    fail("visual_continuity_revision_invalid", "/revision", "A positive continuity-plan revision is required.");
  }
  const states = storyboard.beats.map(stateSnapshot);
  const transitions = storyboard.beats.slice(0, -1).map((beat, index) => transition(
    beat,
    states[index],
    storyboard.beats[index + 1],
    states[index + 1],
  ));
  const windows = storyboard.beats.map((beat, index) => {
    const window = {
      sceneNumber: beat.sceneNumber,
      beatDigest: beat.beatDigest,
      current: states[index],
      incoming: index ? structuredClone(transitions[index - 1]) : null,
      outgoing: index < transitions.length ? structuredClone(transitions[index]) : null,
      windowDigest: "",
    };
    window.windowDigest = visualContinuityWindowDigest(window);
    return window;
  });
  const plan = {
    schemaVersion: VISUAL_CONTINUITY_PLAN_VERSION,
    contractId: VISUAL_CONTINUITY_PLAN_ID,
    revision: Number(revision),
    sources: {
      narrativeBookSpec: {
        contractId: spec.contractId,
        schemaVersion: spec.schemaVersion,
        artifactDigest: spec.validation.artifactDigest,
      },
      visualStoryboard: {
        contractId: storyboard.contractId,
        schemaVersion: storyboard.schemaVersion,
        artifactDigest: storyboard.validation.artifactDigest,
      },
    },
    identityAnchors: spec.registries.characters.map((character) => ({
      characterId: character.id,
      visualIdentityRef: character.visualIdentityRef,
      visualIdentityDigest: character.visualIdentityDigest,
    })),
    referencePolicy: {
      identityAuthority: "canonical_identity_only",
      sceneAuthority: "current_state_only",
      previousAcceptedImageRole: "secondary_continuity_only",
      nextSceneRole: "prospective_constraints_only",
      permittedPreviousImageDomains: [...PERMITTED_PREVIOUS_IMAGE_DOMAINS],
      forbiddenPreviousImageDomains: [...FORBIDDEN_PREVIOUS_IMAGE_DOMAINS],
    },
    windows,
    validation: { compilerVersion: VISUAL_CONTINUITY_PLAN_COMPILER_VERSION, artifactDigest: "" },
  };
  plan.validation.artifactDigest = visualContinuityPlanDigest(plan);
  assertNarrativeV3Schema("visual_continuity_plan_v1", plan);
  assertInvariants(plan);
  return freeze(structuredClone(plan));
}

export function loadVisualContinuityPlan(value) {
  assertNarrativeV3Schema("visual_continuity_plan_v1", value);
  assertInvariants(value);
  if (value.validation.artifactDigest !== visualContinuityPlanDigest(value)) {
    fail("visual_continuity_plan_digest_mismatch", "/validation/artifactDigest", "The digest does not belong to this exact continuity plan.");
  }
  return freeze(structuredClone(value));
}

export function visualContinuityWindow(planValue, sceneNumber) {
  const plan = loadVisualContinuityPlan(planValue);
  const window = plan.windows.find((entry) => entry.sceneNumber === Number(sceneNumber));
  if (!window) fail("visual_continuity_scene_missing", "/windows", "The requested scene is not part of this continuity plan.");
  return window;
}
