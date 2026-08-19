import crypto from "node:crypto";

export const VISUAL_ENTITY_LEDGER_VERSION = 1;

const PRESENT_STATES = new Set([
  "created", "present", "visible", "held", "carried", "worn", "placed", "installed", "transformed",
]);

const HIDDEN_CAUSAL_STATES = new Set([
  "absent", "consumed", "destroyed", "hidden", "removed", "stored", "used_up",
]);

function clean(value, maximum = 500) {
  return String(value || "").trim().slice(0, maximum);
}

function list(value, maximum = 50) {
  return (Array.isArray(value) ? value : []).filter(Boolean).slice(0, maximum);
}

function key(value) {
  return clean(value, 160)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function quantity(value, fallback = 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 50 ? parsed : fallback;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((field) => [field, stableValue(value[field])]));
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function appearance(raw = {}) {
  return {
    size: clean(raw?.size),
    colors: [...new Set(list(raw?.colors, 8).map((item) => clean(item, 80)).filter(Boolean))],
    material: clean(raw?.material),
    distinguishing_features: [...new Set(list(raw?.distinguishing_features, 8).map((item) => clean(item, 160)).filter(Boolean))],
  };
}

function proposalRegistry(plan = {}) {
  const entries = new Map();
  for (const raw of list(plan.visualEntityRegistry || plan.visual_entity_registry || plan.visualEntityLedger?.entities, 40)) {
    const semanticKey = key(raw?.semantic_key || raw?.entity_id || raw?.name);
    const name = clean(raw?.name);
    if (!semanticKey || !name || entries.has(semanticKey)) continue;
    const exactQuantity = Math.max(1, quantity(raw?.quantity ?? raw?.exact_quantity, 1));
    entries.set(semanticKey, {
      entity_id: `visual_entity_${semanticKey}`,
      semantic_key: semanticKey,
      name,
      kind: clean(raw?.kind || "object", 80),
      exact_quantity: exactQuantity,
      quantity_policy: "immutable",
      appearance_lock: appearance(raw?.appearance || raw?.appearance_lock),
      created_scene_number: Math.max(1, Number(raw?.created_scene_number || 1)),
      source: "whole_book_semantic_proposal",
      semantic_aliases: [semanticKey],
    });
  }
  return entries;
}

function causalRegistry(sceneContracts = [], entries) {
  for (const contract of sceneContracts) {
    for (const state of list(contract?.object_states, 30)) {
      const entityId = clean(state?.entity_id || state?.object_id || state?.objectId, 120);
      const name = clean(state?.name);
      if (!entityId || !name) continue;
      const semanticKey = key(entityId);
      const matchingProposal = [...entries.values()].find((entry) => key(entry.name) === key(name));
      const existing = entries.get(semanticKey) || matchingProposal;
      if (matchingProposal && matchingProposal.semantic_key !== semanticKey) entries.delete(matchingProposal.semantic_key);
      const exactQuantity = Math.max(1, quantity(state?.quantity, 1), existing?.exact_quantity || 1);
      entries.set(semanticKey, {
        entity_id: entityId,
        semantic_key: semanticKey,
        name,
        kind: existing?.kind || "canonical_story_object",
        exact_quantity: exactQuantity,
        quantity_policy: "causal_state",
        appearance_lock: existing?.appearance_lock || appearance(),
        created_scene_number: existing?.created_scene_number || 1,
        source: "canonical_causal_object",
        semantic_aliases: [...new Set([semanticKey, ...(existing?.semantic_aliases || [])])],
      });
    }
  }
}

function proposedStateMap(contract = {}) {
  const states = new Map();
  for (const raw of list(contract?.visual_entity_states, 50)) {
    for (const candidate of [raw?.semantic_key, raw?.entity_id, raw?.name]) {
      const semanticKey = key(candidate);
      if (semanticKey) states.set(semanticKey, raw);
    }
  }
  return states;
}

function causalStateMap(contract = {}) {
  return new Map(list(contract?.object_states, 30).map((raw) => [
    key(raw?.entity_id || raw?.object_id || raw?.objectId),
    raw,
  ]).filter(([semanticKey]) => semanticKey));
}

function stateInstruction(entity, state) {
  if (state.visibility === "forbidden") {
    return `${entity.name} [${entity.entity_id}] is not visible in this scene while its canonical state is ${state.state}: render zero instances.`;
  }
  const group = state.exact_quantity === 1
    ? "one and only one instance"
    : `one persistent group containing exactly ${state.exact_quantity} members`;
  return `${entity.name} [${entity.entity_id}] is ${group}. Render the exact total only once in one physical state and one location; never add a second copy, motion-trail copy or alternate-position copy. Preserve its locked size, colors, material and distinguishing features.`;
}

function causalVisibility(state = {}, rawState = "") {
  return quantity(state?.quantity, 0) > 0 && !HIDDEN_CAUSAL_STATES.has(rawState);
}

export function compileVisualEntityLedger(plan = {}) {
  const sceneContracts = list(plan?.sceneContracts, 40).map((contract) => structuredClone(contract));
  const entries = proposalRegistry(plan);
  causalRegistry(sceneContracts, entries);
  const orderedEntities = [...entries.values()].sort((left, right) => left.entity_id.localeCompare(right.entity_id));

  const compiledContracts = sceneContracts.map((contract) => {
    const sceneNumber = Math.max(1, Number(contract?.scene_number || 1));
    const proposed = proposedStateMap(contract);
    const causal = causalStateMap(contract);
    const visibleLocation = clean(contract?.causal_frame?.visible_location || contract?.render_snapshot?.location);
    const visualEntityStates = orderedEntities.map((entity) => {
      const semantic = proposed.get(entity.semantic_key)
        || entity.semantic_aliases?.map((alias) => proposed.get(alias)).find(Boolean)
        || proposed.get(key(entity.name))
        || {};
      const causalState = causal.get(entity.semantic_key) || null;
      const rawState = clean(causalState?.state || semantic?.state || "absent", 60).toLowerCase();
      const visible = causalState
        ? causalVisibility(causalState, rawState)
        : PRESENT_STATES.has(rawState) && sceneNumber >= entity.created_scene_number;
      const exactQuantity = visible
        ? entity.quantity_policy === "causal_state"
          ? quantity(causalState?.quantity, entity.exact_quantity)
          : entity.exact_quantity
        : 0;
      const state = {
        entity_id: entity.entity_id,
        semantic_key: entity.semantic_key,
        name: entity.name,
        state: rawState || "absent",
        visibility: visible ? "required" : "forbidden",
        exact_quantity: exactQuantity,
        owner: clean(causalState?.owner || semantic?.owner),
        location: clean(semantic?.location || visibleLocation),
        appearance_lock: structuredClone(entity.appearance_lock),
      };
      return { ...state, instruction: stateInstruction(entity, state) };
    });
    return { ...contract, visual_entity_states: visualEntityStates };
  });

  const ledgerCore = {
    version: VISUAL_ENTITY_LEDGER_VERSION,
    entities: orderedEntities,
    scene_states: compiledContracts.map((contract) => ({
      scene_number: Number(contract.scene_number),
      states: contract.visual_entity_states,
    })),
  };
  return {
    ...plan,
    sceneContracts: compiledContracts,
    visualEntityLedger: { ...ledgerCore, digest: digest(ledgerCore) },
  };
}

export function visualEntityLedgerIssues(plan = {}) {
  const ledger = plan?.visualEntityLedger;
  if (Number(ledger?.version) !== VISUAL_ENTITY_LEDGER_VERSION) return ["visual entity ledger is missing"];
  const issues = [];
  const ids = new Set();
  for (const entity of list(ledger.entities, 50)) {
    if (!entity?.entity_id || ids.has(entity.entity_id)) issues.push("visual entity ids must be unique");
    ids.add(entity?.entity_id);
    if (!(Number.isInteger(entity?.exact_quantity) && entity.exact_quantity > 0)) issues.push(`${entity?.entity_id || "entity"} needs one positive registered quantity`);
    if (!["immutable", "causal_state"].includes(entity?.quantity_policy)) issues.push(`${entity?.entity_id || "entity"} needs an explicit quantity policy`);
  }
  for (const scene of list(ledger.scene_states, 50)) {
    const stateIds = new Set();
    for (const state of list(scene?.states, 60)) {
      if (stateIds.has(state.entity_id)) issues.push(`${state.entity_id} has more than one state in scene ${scene.scene_number}`);
      stateIds.add(state.entity_id);
      const entity = ledger.entities.find((candidate) => candidate.entity_id === state.entity_id);
      if (!entity) issues.push(`${state.entity_id} has no registry entry`);
      if (state.visibility === "required" && entity?.quantity_policy === "immutable" && state.exact_quantity !== entity?.exact_quantity) issues.push(`${state.entity_id} changes immutable quantity in scene ${scene.scene_number}`);
      if (state.visibility === "required" && !(Number.isInteger(state.exact_quantity) && state.exact_quantity > 0)) issues.push(`${state.entity_id} needs one positive visible quantity in scene ${scene.scene_number}`);
      if (state.visibility === "forbidden" && state.exact_quantity !== 0) issues.push(`${state.entity_id} must have zero instances while forbidden`);
    }
  }
  return [...new Set(issues)];
}
