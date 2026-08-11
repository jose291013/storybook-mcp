import { findUniverse } from "../config/bookOptions.js";

export const PHYSICAL_RENDER_SNAPSHOT_VERSION = 1;

function key(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function list(value, maximum = 30) {
  return (Array.isArray(value) ? value : []).filter(Boolean).slice(0, maximum);
}

function mechanismIds(worldContract = {}) {
  const configured = findUniverse(worldContract?.id)?.storyContract?.requiredMechanisms || [];
  return new Set([
    ...list(worldContract?.requiredMechanisms, 20),
    ...list(configured, 20),
  ].map((item) => key(item?.id)).filter(Boolean));
}

function isConditionalEquipment(state, ids) {
  const name = key(state?.name);
  return ids.has(name)
    || /breathing|respiration|communication bubble|air bubble|oxygen|protective environment/u.test(name);
}

function equipmentRule(item) {
  const identity = `${item.owner || "character"}'s ${item.name}`;
  if (item.state === "worn") {
    return `${identity} appears exactly once and is worn; it is not held, removed, stored or duplicated.`;
  }
  if (item.state === "absent") {
    return `${identity} is absent and must not appear anywhere in the image.`;
  }
  return `${identity} appears at most once in the declared ${item.state} state; it is not worn or duplicated.`;
}

export function compilePhysicalRenderSnapshot({
  contract = {},
  approvedScene = null,
  previousScene = null,
  worldContract = {},
} = {}) {
  const frame = contract?.causal_frame || {};
  const visiblePhase = ["before", "during", "after"].includes(key(frame?.visible_phase))
    ? key(frame.visible_phase)
    : "after";
  const visibleLocation = String(
    frame?.visible_location
      || approvedScene?.locationAfter
      || frame?.after?.location
      || "",
  ).trim();
  const ids = mechanismIds(worldContract);
  const transitionKind = String(
    frame?.during?.transition_kind || approvedScene?.transition?.kind || "none",
  ).trim();
  const travelDuring = visiblePhase === "during"
    && ["cross_passage", "ordinary_travel", "return_travel", "join_travel"].includes(transitionKind);
  const visibleStates = (visiblePhase === "before" || travelDuring) && previousScene?.objectStates
    ? previousScene.objectStates
    : contract?.object_states;
  const equipment = list(visibleStates, 30)
    .filter((state) => isConditionalEquipment(state, ids))
    .map((state) => ({
      id: key(state?.name).replaceAll(" ", "_"),
      name: String(state?.name || "").trim(),
      owner: String(state?.owner || "").trim(),
      state: String(state?.state || "visible").trim(),
      quantity: Math.max(0, Number(state?.quantity ?? 1)),
      instruction: String(state?.instruction || "").trim(),
    }));
  const hasWornBreathingEquipment = equipment.some((item) => item.state === "worn");
  const universeId = key(worldContract?.id);
  const physicalMedium = visiblePhase === "during"
    && ["cross_passage", "ordinary_travel", "return_travel", "join_travel"].includes(transitionKind)
    ? "passage_transition"
    : universeId === "coral ocean" || universeId === "coral_ocean"
      ? (hasWornBreathingEquipment ? "fully_underwater" : "breathable_air")
      : hasWornBreathingEquipment
        ? "protected_environment"
        : "ordinary_environment";
  const forbidden = equipment.map(equipmentRule);
  if (physicalMedium === "breathable_air") {
    forbidden.push("No character wears underwater breathing equipment in this breathable-air instant.");
  }
  if (physicalMedium === "fully_underwater") {
    forbidden.push("Every visible physical person uses exactly their own declared worn breathing equipment.");
  }
  return {
    version: PHYSICAL_RENDER_SNAPSHOT_VERSION,
    visible_phase: visiblePhase,
    location: visibleLocation,
    physical_medium: physicalMedium,
    main_action: {
      subject: String(contract?.main_action?.subject || "").trim(),
      verb: String(contract?.main_action?.verb || "").trim(),
      target: String(contract?.main_action?.target || "").trim(),
    },
    physical_characters: list(contract?.named_characters, 15).map((character) => ({
      name: String(character?.name || "").trim(),
      action: String(character?.action || "").trim(),
    })),
    equipment,
    visible_object_states: list(visibleStates, 30).map((state) => ({
      name: String(state?.name || "").trim(),
      owner: String(state?.owner || "").trim(),
      state: String(state?.state || "visible").trim(),
      quantity: Math.max(0, Number(state?.quantity ?? 1)),
    })),
    forbidden: [...new Set(forbidden)],
  };
}

export function wardrobeForPhysicalSnapshot(outfit = "", owner = "", snapshot = null) {
  const equipment = list(snapshot?.equipment, 20).filter((item) => (
    key(item?.owner) === key(owner) && item?.state !== "worn"
  ));
  if (!equipment.length) return String(outfit || "").trim();
  return String(outfit || "")
    .replace(/\s+(?:and|with)\s+(?:the\s+)?(?:story-established\s+)?(?:transparent\s+)?(?:breathing(?:\s+and\s+communication)?\s+(?:bubble|mechanism)|bubble\s+or\s+helmet)[^,.;]*/giu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}
