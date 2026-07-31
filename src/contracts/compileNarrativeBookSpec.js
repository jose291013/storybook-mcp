import {
  hasCurrentStoryScenarioAuditEvidence,
  storyScenarioAuditDigest,
  validateStoryScenario,
} from "../services/storyScenario.js";
import { createPagePlan } from "../config/bookStructure.js";
import {
  NARRATIVE_BOOK_SPEC_COMPILER_VERSION,
  NARRATIVE_BOOK_SPEC_ID,
  NARRATIVE_BOOK_SPEC_VALIDATOR_VERSION,
  NARRATIVE_BOOK_SPEC_VERSION,
  narrativeBookSpecDigest,
  validateNarrativeBookSpec,
} from "./narrativeBookSpec.js";

const OBJECT_TERMINAL_STATES = new Set([
  "consumed",
  "transformed",
  "destroyed",
  "used_up",
]);
const OBJECT_POSSESSION_STATES = new Set(["worn", "held", "carried"]);
const PASSAGE_MOVEMENT_KINDS = new Set([
  "discover_passage",
  "cross_passage",
  "return_travel",
]);
const SUPPORTED_LANGUAGES = new Set(["FR", "ES", "EN"]);
const MAX_ISSUES = 20;

function clean(value) {
  return String(value || "").trim();
}

function key(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function identifier(value, fallback = "item") {
  return (key(value) || fallback)
    .replaceAll(" ", "_")
    .slice(0, 120);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function positiveInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function objectIdentity(object = {}) {
  return clean(object.objectId || `${object.name}_${object.owner}`);
}

function addIssue(issues, code, path, message) {
  if (issues.length >= MAX_ISSUES) return;
  issues.push({ code, path, message });
}

function uniqueIds(entries, prefix, issues, {
  aliasesForEntry = () => [],
} = {}) {
  const used = new Set();
  const ids = new Map();
  for (const [index, entry] of entries.entries()) {
    const source = clean(entry?.id || entry?.objectId || entry?.name || entry);
    let id = identifier(source, `${prefix}_${index + 1}`);
    if (used.has(id)) {
      addIssue(
        issues,
        "ambiguous_canonical_id",
        `${prefix}[${index}]`,
        `${source || prefix} collides with another canonical identifier.`,
      );
      id = `${id}_${index + 1}`;
    }
    used.add(id);
    const aliases = [source, ...list(aliasesForEntry(entry))];
    for (const alias of aliases) {
      const aliasKey = key(alias);
      if (!aliasKey) continue;
      const existingId = ids.get(aliasKey);
      if (existingId && existingId !== id) {
        addIssue(
          issues,
          "ambiguous_canonical_alias",
          `${prefix}[${index}]`,
          `${clean(alias)} refers to more than one canonical ${prefix}.`,
        );
        continue;
      }
      ids.set(aliasKey, id);
    }
  }
  return ids;
}

function resolveByName(map, value, issues, path, kind) {
  const resolved = map.get(key(value));
  if (!resolved) {
    addIssue(
      issues,
      `unknown_${kind}`,
      path,
      `${clean(value) || "Empty value"} is not declared in the canonical ${kind} registry.`,
    );
  }
  return resolved || identifier(value, `unknown_${kind}`);
}

function canonicalSafety(input, issues) {
  const safety = structuredClone(input || {});
  const validation = validateNarrativeBookSpec({
    schemaVersion: NARRATIVE_BOOK_SPEC_VERSION,
    contractId: NARRATIVE_BOOK_SPEC_ID,
    revision: 1,
    sourceScenario: {},
    book: {},
    safety,
    registries: {},
    scenes: [],
    validation: {},
  }, { verifyDigest: false });
  for (const issue of validation.issues.filter((entry) => (
    entry.path === "safety"
    || entry.path.startsWith("safety.")
  ))) {
    addIssue(issues, issue.code, issue.path, issue.message);
  }
  return safety;
}

function pageBindings(pageCount, scenes, issues) {
  const plan = createPagePlan(pageCount);
  const bindings = new Map();
  for (const scene of scenes) {
    const pages = plan.filter((page) => Number(page.scene_number) === Number(scene.sceneNumber));
    const textPage = pages.find((page) => page.page_type === "text");
    const imagePage = pages.find((page) => page.page_type === "image");
    if (!textPage || !imagePage) {
      addIssue(
        issues,
        "scene_page_binding_missing",
        `scenes[${scene.sceneNumber - 1}].pageBinding`,
        `Scene ${scene.sceneNumber} has no exact text/image pair in the selected ${pageCount}-page format.`,
      );
      continue;
    }
    bindings.set(scene.sceneNumber, {
      textPageNumber: textPage.page_number,
      imagePageNumber: imagePage.page_number,
    });
  }
  const expectedSceneCount = plan.filter((page) => page.page_type === "image").length;
  if (expectedSceneCount !== scenes.length) {
    addIssue(
      issues,
      "scene_count_format_mismatch",
      "book.pageCount",
      `${pageCount} pages require exactly ${expectedSceneCount} scenes, but the approved scenario contains ${scenes.length}.`,
    );
  }
  return bindings;
}

function ordinaryReturnEvents(scenes) {
  const ordinaryRoutes = [];
  const ordinaryReturns = new WeakSet();
  const eventsForScene = (scene) => [
    scene.transition,
    ...list(scene.characterMovements),
  ].filter(Boolean);

  for (const scene of scenes) {
    for (const event of eventsForScene(scene)) {
      const kind = clean(event.kind);
      if (kind === "ordinary_travel") {
        ordinaryRoutes.push({
          from: key(event.from),
          to: key(event.to),
          mechanism: key(event.mechanismId || event.mechanism),
        });
        continue;
      }
      if (kind !== "return_travel") continue;
      const from = key(event.from);
      const to = key(event.to);
      const mechanism = key(event.mechanismId || event.mechanism);
      const reversesOrdinaryRoute = ordinaryRoutes.some((route) => (
        route.from === to
        && route.to === from
        && route.mechanism === mechanism
      ));
      if (reversesOrdinaryRoute) ordinaryReturns.add(event);
    }
  }
  return ordinaryReturns;
}

function canonicalMovementKind(event, ordinaryReturns) {
  const kind = clean(event?.kind);
  return kind === "return_travel" && ordinaryReturns.has(event)
    ? "ordinary_travel"
    : kind;
}

function passageRegistry(scenes, locationIds, issues, ordinaryReturns) {
  const definitions = new Map();
  function observe(event, path) {
    const {
      mechanism,
      mechanismId,
      from,
      to,
    } = event;
    const kind = canonicalMovementKind(event, ordinaryReturns);
    if (!PASSAGE_MOVEMENT_KINDS.has(kind)) return;
    const id = identifier(mechanismId || mechanism, "");
    if (!id) {
      addIssue(
        issues,
        "passage_id_required",
        path,
        `${kind} requires a stable passage mechanism identifier.`,
      );
      return;
    }
    const current = definitions.get(id) || {
      id,
      name: clean(mechanism) || id.replaceAll("_", " "),
      discoveries: [],
      crossings: [],
    };
    if (kind === "discover_passage") {
      current.discoveries.push({ from: clean(from), to: clean(to), path });
    } else {
      current.crossings.push({ from: clean(from), to: clean(to), path });
    }
    definitions.set(id, current);
  }

  for (const [sceneIndex, scene] of scenes.entries()) {
    observe(scene.transition || {}, `scenes[${sceneIndex}].transition`);
    for (const [movementIndex, movement] of list(scene.characterMovements).entries()) {
      observe(movement, `scenes[${sceneIndex}].characterMovements[${movementIndex}]`);
    }
  }

  const passages = [];
  for (const definition of definitions.values()) {
    if (!definition.discoveries.length) {
      addIssue(
        issues,
        "passage_discovery_missing",
        "registries.passages",
        `${definition.name} is crossed without an explicit approved discovery.`,
      );
    }
    const endpointKeys = [];
    for (const crossing of definition.crossings) {
      for (const location of [crossing.from, crossing.to]) {
        const locationKey = key(location);
        if (locationKey && !endpointKeys.includes(locationKey)) endpointKeys.push(locationKey);
      }
    }
    if (endpointKeys.length !== 2) {
      addIssue(
        issues,
        "ambiguous_passage_endpoints",
        "registries.passages",
        `${definition.name} must have exactly two locations derived from an approved crossing.`,
      );
      continue;
    }
    passages.push({
      id: definition.id,
      name: definition.name,
      sideALocationId: resolveByName(
        locationIds,
        endpointKeys[0],
        issues,
        "registries.passages.sideALocationId",
        "location",
      ),
      sideBLocationId: resolveByName(
        locationIds,
        endpointKeys[1],
        issues,
        "registries.passages.sideBLocationId",
        "location",
      ),
      bidirectional: true,
    });
  }
  return {
    passages,
    passageIds: new Map([...definitions.keys()].map((id) => [key(id), id])),
  };
}

function compileObjectLedger({
  scenario,
  objectEntries,
  objectIds,
  characterIds,
  sceneIds,
  issues,
}) {
  const graph = scenario.causalGraph;
  const graphEvents = list(graph?.events).filter((event) => event?.structurallyValid !== false);
  const objectByGraphId = new Map(objectEntries.map((object, index) => [
    clean(object?.objectId || graph?.entities?.[index]?.id),
    object,
  ]));
  const canonicalObjectIdByGraphId = new Map();
  for (const [index, entity] of list(graph?.entities).entries()) {
    const object = objectByGraphId.get(entity.id) || objectEntries[index];
    const canonicalId = objectIds.get(key(objectIdentity(object)));
    if (canonicalId) canonicalObjectIdByGraphId.set(entity.id, canonicalId);
  }

  const registries = objectEntries.map((object, index) => {
    const graphEntity = list(graph?.entities).find((entity) => (
      entity.id === clean(object?.objectId)
    )) || list(graph?.entities)[index] || {};
    const initialState = clean(graphEntity.initialState || object.initialState || "visible");
    const ownerCharacterId = initialState === "absent" || !clean(object.owner)
      ? null
      : resolveByName(
        characterIds,
        object.owner,
        issues,
        `registries.objects[${index}].initialOwnerCharacterId`,
        "character",
      );
    return {
      id: objectIds.get(key(objectIdentity(object))),
      name: clean(object.name),
      initialState,
      initialQuantity: initialState === "absent" ? 0 : 1,
      initialOwnerCharacterId: ownerCharacterId,
      lifecycleKind: clean(object?.lifecycle?.kind || "persistent"),
    };
  });

  const stateByObject = new Map(registries.map((object) => [object.id, {
    state: object.initialState,
    quantity: object.initialQuantity,
    ownerCharacterId: object.initialOwnerCharacterId,
    terminal: OBJECT_TERMINAL_STATES.has(object.initialState),
  }]));
  const causalEvents = [];
  const snapshotsByScene = new Map();

  for (const [sceneIndex, scene] of scenario.scenes.entries()) {
    const suppliedStates = new Map(list(scene.objectStates).map((state) => {
      const explicit = clean(state.objectId);
      const sourceObject = explicit
        ? objectEntries.find((object) => clean(object.objectId) === explicit)
        : objectEntries.find((object) => (
          key(object.name) === key(state.name)
          && (!clean(state.owner) || key(object.owner) === key(state.owner))
        ));
      return [objectIds.get(key(objectIdentity(sourceObject))), state];
    }).filter(([id]) => id));
    const snapshots = [];

    for (const [objectIndex, object] of registries.entries()) {
      const previous = stateByObject.get(object.id);
      const supplied = suppliedStates.get(object.id);
      const graphId = [...canonicalObjectIdByGraphId.entries()]
        .find(([, canonicalId]) => canonicalId === object.id)?.[0];
      const sourceEvents = graphEvents.filter((event) => (
        Number(event.sceneNumber) === Number(scene.sceneNumber)
        && event.entityId === graphId
      ));
      const resultEvents = graphEvents.filter((event) => (
        Number(event.sceneNumber) === Number(scene.sceneNumber)
        && event.resultEntityId === graphId
      ));
      if (sourceEvents.length > 1 || resultEvents.length > 1 || (sourceEvents.length && resultEvents.length)) {
        addIssue(
          issues,
          "ambiguous_object_events",
          `scenes[${sceneIndex}].objectStates[${objectIndex}]`,
          `${object.name} has more than one causal change in the same scene.`,
        );
      }
      const rawEvent = sourceEvents[0] || resultEvents[0] || null;
      const isProducedResult = Boolean(resultEvents[0]);
      const expectedState = isProducedResult
        ? clean(rawEvent.resultState)
        : sourceEvents[0] ? clean(rawEvent.toState) : previous.state;
      const state = clean(supplied?.state || expectedState);
      const quantity = state === "absent"
        ? 0
        : positiveInteger(supplied?.quantity, previous.quantity > 0 ? previous.quantity : 1);
      const ownerCharacterId = state === "absent" || !clean(supplied?.owner)
        ? null
        : resolveByName(
          characterIds,
          supplied.owner,
          issues,
          `scenes[${sceneIndex}].objectStates[${objectIndex}].ownerCharacterId`,
          "character",
        );
      if (OBJECT_POSSESSION_STATES.has(state) && !ownerCharacterId) {
        addIssue(
          issues,
          "possessed_object_owner_required",
          `scenes[${sceneIndex}].objectStates[${objectIndex}].ownerCharacterId`,
          `${object.name} cannot be ${state} without one canonical owner.`,
        );
      }
      const changed = (
        state !== previous.state
        || quantity !== previous.quantity
        || ownerCharacterId !== previous.ownerCharacterId
      );
      if (previous.terminal && changed) {
        addIssue(
          issues,
          "terminal_object_reappears",
          `scenes[${sceneIndex}].objectStates[${objectIndex}]`,
          `${object.name} changes after its terminal state ${previous.state}.`,
        );
      }
      if (!rawEvent && changed) {
        addIssue(
          issues,
          "object_changed_without_causal_event",
          `scenes[${sceneIndex}].objectStates[${objectIndex}]`,
          `${object.name} changes state, owner or quantity without an approved causal event.`,
        );
      }
      if (rawEvent && state !== expectedState) {
        addIssue(
          issues,
          "object_event_result_mismatch",
          `scenes[${sceneIndex}].objectStates[${objectIndex}]`,
          `${object.name} must end scene ${scene.sceneNumber} in state ${expectedState}.`,
        );
      }

      let eventId = null;
      if (rawEvent) {
        eventId = isProducedResult
          ? identifier(`${rawEvent.id}_result`)
          : identifier(rawEvent.id);
        causalEvents.push({
          id: eventId,
          sceneId: sceneIds.get(scene.sceneNumber),
          type: isProducedResult ? "introduce" : clean(rawEvent.type),
          objectId: object.id,
          fromState: previous.state,
          toState: state,
          fromOwnerCharacterId: previous.ownerCharacterId,
          toOwnerCharacterId: ownerCharacterId,
          fromQuantity: previous.quantity,
          toQuantity: quantity,
          resultObjectId: isProducedResult
            ? null
            : canonicalObjectIdByGraphId.get(rawEvent.resultEntityId) || null,
        });
      }
      const snapshot = {
        objectId: object.id,
        state,
        quantity,
        ownerCharacterId,
        eventId,
      };
      snapshots.push(snapshot);
      stateByObject.set(object.id, {
        state,
        quantity,
        ownerCharacterId,
        terminal: OBJECT_TERMINAL_STATES.has(state),
      });
    }
    snapshotsByScene.set(scene.sceneNumber, snapshots);
  }

  return { objects: registries, causalEvents, snapshotsByScene };
}

function throwIfIssues(issues) {
  if (issues.length) throw new NarrativeBookSpecCompileError(issues);
}

export class NarrativeBookSpecCompileError extends Error {
  constructor(issues = []) {
    const summary = issues
      .slice(0, 3)
      .map((issue) => `${issue.code}: ${issue.message}`)
      .join(" | ");
    super(`Narrative Book Spec compilation failed with ${issues.length} issue(s).${summary ? ` ${summary}` : ""}`);
    this.name = "NarrativeBookSpecCompileError";
    this.code = "narrative_book_spec_compile_failed";
    this.issues = issues.slice(0, MAX_ISSUES);
  }
}

export function compileNarrativeBookSpec({
  projectId,
  scenario,
  book,
  safety,
  revision = 1,
  semanticAuditPolicyVersion = 1,
  semanticValidatorVersion = 1,
} = {}) {
  const issues = [];
  if (!scenario || scenario.status !== "approved") {
    addIssue(issues, "scenario_not_approved", "scenario.status", "Only an explicitly approved scenario may be compiled.");
  }
  if (Number(scenario?.version) !== 2) {
    addIssue(issues, "unsupported_scenario_version", "scenario.version", "Approved scenario version 2 is required.");
  }
  if (Number(scenario?.movementLedgerVersion) !== 1) {
    addIssue(issues, "movement_ledger_required", "scenario.movementLedgerVersion", "Character movement ledger version 1 is required.");
  }
  if (!scenario?.causalGraphRequired || Number(scenario?.causalGraph?.version) !== 1) {
    addIssue(issues, "causal_graph_required", "scenario.causalGraph", "Causal graph version 1 is required.");
  }
  if (!hasCurrentStoryScenarioAuditEvidence(scenario)) {
    addIssue(issues, "stale_scenario_audit", "scenario.auditEvidence", "The final scenario audit must belong to this exact approved scenario.");
  }
  const scenarioValidation = validateStoryScenario(scenario || {});
  for (const message of scenarioValidation.issues.slice(0, MAX_ISSUES)) {
    addIssue(issues, "invalid_approved_scenario", "scenario", message);
  }
  const canonicalProjectId = clean(projectId);
  if (!canonicalProjectId) addIssue(issues, "project_id_required", "projectId", "A project identifier is required.");
  const scenarioRevision = positiveInteger(scenario?.revision);
  if (!scenarioRevision) addIssue(issues, "scenario_revision_required", "scenario.revision", "Approved scenario revision is required.");
  if (!clean(scenario?.approvedAt)) addIssue(issues, "scenario_approval_time_required", "scenario.approvedAt", "Approved scenario timestamp is required.");

  const language = clean(book?.language || scenario?.language).toUpperCase();
  const audienceAge = positiveInteger(book?.audienceAge);
  const pageCount = positiveInteger(book?.pageCount);
  const universeId = identifier(book?.universeId, "");
  if (!SUPPORTED_LANGUAGES.has(language)) addIssue(issues, "unsupported_book_language", "book.language", "Book language must be FR, ES or EN.");
  if (!audienceAge) addIssue(issues, "audience_age_required", "book.audienceAge", "A positive audience age is required.");
  if (![24, 28, 32, 36, 40, 44].includes(pageCount)) addIssue(issues, "unsupported_page_count", "book.pageCount", "Page count must be one of the supported book formats.");
  if (!universeId) addIssue(issues, "universe_id_required", "book.universeId", "A canonical universe identifier is required.");
  if (!positiveInteger(revision)) addIssue(issues, "invalid_revision", "revision", "A positive contract revision is required.");

  const canonicalSafetyValue = canonicalSafety(safety, issues);
  const scenes = list(scenario?.scenes);
  const sceneIds = new Map(scenes.map((scene) => [scene.sceneNumber, identifier(scene.id, `scene_${scene.sceneNumber}`)]));
  const bindings = pageCount ? pageBindings(pageCount, scenes, issues) : new Map();

  const locationNames = [];
  function addLocation(value) {
    const name = clean(value);
    if (name && !locationNames.some((candidate) => key(candidate) === key(name))) locationNames.push(name);
  }
  for (const character of list(scenario?.characters)) addLocation(character.initialLocation);
  for (const scene of scenes) {
    addLocation(scene.locationBefore);
    addLocation(scene.locationAfter);
    addLocation(scene.transition?.from);
    addLocation(scene.transition?.to);
    for (const movement of list(scene.characterMovements)) {
      addLocation(movement.from);
      addLocation(movement.to);
    }
  }
  const locationIds = uniqueIds(locationNames, "location", issues);
  const locations = locationNames.map((name) => ({
    id: locationIds.get(key(name)),
    name,
  }));

  const characterEntries = list(scenario?.characters);
  const characterIds = uniqueIds(characterEntries, "character", issues, {
    aliasesForEntry: (character) => [character?.id, character?.name],
  });
  const wardrobeByCharacter = new Map(list(scenario?.wardrobePlan).map((item) => [key(item.characterName), item]));
  const characters = characterEntries.map((character, index) => {
    if (!clean(character.initialLocation)) {
      addIssue(
        issues,
        "character_initial_location_required",
        `scenario.characters[${index}].initialLocation`,
        `${clean(character.name) || "Character"} needs one canonical initial location.`,
      );
    }
    const wardrobe = wardrobeByCharacter.get(key(character.name)) || {};
    return {
      id: characterIds.get(key(character.name)),
      canonicalName: clean(character.name),
      relationship: clean(character.relationship || character.role || "story_character"),
      storyRole: clean(character.storyRole || "guest"),
      initialLocationId: resolveByName(
        locationIds,
        character.initialLocation,
        issues,
        `registries.characters[${index}].initialLocationId`,
        "location",
      ),
      familyAddress: clean(character.familyAddress),
      visualIdentityId: "",
      outfitContractId: identifier(wardrobe.outfitId || wardrobe.adventureDescription, ""),
    };
  });

  const ordinaryReturns = ordinaryReturnEvents(scenes);
  const { passages, passageIds } = passageRegistry(
    scenes,
    locationIds,
    issues,
    ordinaryReturns,
  );
  const declaredObjects = list(scenario?.objects);
  for (const [objectIndex, object] of declaredObjects.entries()) {
    if (!object.trackEveryScene) {
      addIssue(
        issues,
        "untracked_scenario_object",
        `scenario.objects[${objectIndex}].trackEveryScene`,
        `${clean(object.name) || "Every scenario object"} must be tracked in every scene before canonical compilation.`,
      );
    }
    if (!clean(object.objectId)) {
      addIssue(
        issues,
        "scenario_object_id_required",
        `scenario.objects[${objectIndex}].objectId`,
        `${clean(object.name) || "Every scenario object"} needs a stable causal object identifier.`,
      );
    }
    if (!list(scenario?.causalGraph?.entities).some((entity) => entity.id === object.objectId)) {
      addIssue(
        issues,
        "scenario_object_graph_entity_required",
        `scenario.objects[${objectIndex}].objectId`,
        `${clean(object.name) || object.objectId} has no matching causal graph entity.`,
      );
    }
  }
  const objectEntries = declaredObjects;
  const objectIds = uniqueIds(objectEntries.map((object) => ({
    ...object,
    id: object.objectId || `${object.name}_${object.owner}`,
  })), "object", issues);
  const {
    objects,
    causalEvents,
    snapshotsByScene,
  } = compileObjectLedger({
    scenario,
    objectEntries,
    objectIds,
    characterIds,
    sceneIds,
    issues,
  });

  const compiledScenes = scenes.map((scene, sceneIndex) => {
    const scenePath = `scenes[${sceneIndex}]`;
    const presences = list(scene.characterPresences).map((presence, presenceIndex) => {
      const mode = clean(presence.mode);
      const physical = mode === "physical";
      if (!clean(presence.action)) {
        addIssue(issues, "presence_action_required", `${scenePath}.presences[${presenceIndex}].action`, "Every presence needs an approved action.");
      }
      return {
        characterId: resolveByName(
          characterIds,
          presence.name,
          issues,
          `${scenePath}.presences[${presenceIndex}].characterId`,
          "character",
        ),
        mode,
        phase: physical ? clean(presence.phase || "end") : "",
        locationId: physical
          ? resolveByName(
            locationIds,
            presence.location,
            issues,
            `${scenePath}.presences[${presenceIndex}].locationId`,
            "location",
          )
          : "",
        action: clean(presence.action),
      };
    });
    const visible = presences
      .filter((presence) => presence.mode === "physical" && ["end", "throughout"].includes(presence.phase))
      .map((presence) => presence.characterId);
    const evoked = presences
      .filter((presence) => presence.mode !== "physical")
      .map((presence) => presence.characterId);
    if (!visible.length) {
      addIssue(issues, "visible_character_required", `${scenePath}.illustration`, "The approved end-of-scene moment has no visible physical character.");
    }
    const forbidden = characters
      .map((character) => character.id)
      .filter((id) => !visible.includes(id) && !evoked.includes(id));

    const movements = list(scene.characterMovements).map((movement, movementIndex) => {
      const movementKind = canonicalMovementKind(movement, ordinaryReturns);
      const passageId = ["cross_passage", "return_travel"].includes(movementKind)
        ? passageIds.get(key(movement.mechanismId || movement.mechanism)) || null
        : null;
      return {
        id: identifier(`${scene.id}_${movement.id || `movement_${movementIndex + 1}`}`),
        sequence: movementIndex + 1,
        kind: movementKind,
        fromLocationId: resolveByName(locationIds, movement.from, issues, `${scenePath}.movements[${movementIndex}].fromLocationId`, "location"),
        toLocationId: resolveByName(locationIds, movement.to, issues, `${scenePath}.movements[${movementIndex}].toLocationId`, "location"),
        travelerCharacterIds: list(movement.characters).map((name) => resolveByName(
          characterIds,
          name,
          issues,
          `${scenePath}.movements[${movementIndex}].travelerCharacterIds`,
          "character",
        )),
        passageId,
      };
    });
    if (scene.transition?.kind === "discover_passage") {
      const travelers = list(scene.transition.characters).length
        ? list(scene.transition.characters)
        : list(scene.characterPresences)
          .filter((presence) => presence.mode === "physical" && ["end", "throughout"].includes(presence.phase))
          .map((presence) => presence.name);
      movements.unshift({
        id: identifier(`${scene.id}_discover_${scene.transition.mechanismId || scene.transition.mechanism}`),
        sequence: 1,
        kind: "discover_passage",
        fromLocationId: resolveByName(locationIds, scene.locationAfter, issues, `${scenePath}.movements.discovery.fromLocationId`, "location"),
        toLocationId: resolveByName(locationIds, scene.locationAfter, issues, `${scenePath}.movements.discovery.toLocationId`, "location"),
        travelerCharacterIds: travelers.map((name) => resolveByName(
          characterIds,
          name,
          issues,
          `${scenePath}.movements.discovery.travelerCharacterIds`,
          "character",
        )),
        passageId: passageIds.get(key(scene.transition.mechanismId || scene.transition.mechanism)) || null,
      });
      for (let index = 1; index < movements.length; index += 1) movements[index].sequence = index + 1;
    }

    const transitionKind = canonicalMovementKind(
      scene.transition || { kind: "none" },
      ordinaryReturns,
    );
    const transitionPassageId = PASSAGE_MOVEMENT_KINDS.has(transitionKind)
      ? passageIds.get(key(scene.transition?.mechanismId || scene.transition?.mechanism)) || null
      : null;
    const visiblePresences = presences.filter((presence) => visible.includes(presence.characterId));
    const mainPresence = visiblePresences.find((presence) => clean(presence.action));
    const actionSearch = key(mainPresence?.action);
    const objectTarget = objects.find((object) => actionSearch.includes(key(object.name)));
    const passageTarget = passages.find((passage) => actionSearch.includes(key(passage.name)));
    const snapshots = snapshotsByScene.get(scene.sceneNumber) || [];
    const requiredElements = snapshots
      .filter((snapshot) => snapshot.state !== "absent")
      .map((snapshot) => {
        const object = objects.find((candidate) => candidate.id === snapshot.objectId);
        return `${snapshot.quantity} × ${object?.name || snapshot.objectId} (${snapshot.state})`;
      });
    const forbiddenElements = snapshots
      .filter((snapshot) => snapshot.state === "absent")
      .map((snapshot) => {
        const object = objects.find((candidate) => candidate.id === snapshot.objectId);
        return `${object?.name || snapshot.objectId} absent`;
      });

    for (const field of [
      ["title", scene.title],
      ["narrativeFunction", scene.narrativeFunction],
      ["purpose", scene.purpose],
      ["action", scene.action],
      ["dominantEmotion", scene.dominantEmotion],
      ["emotionalShift", scene.emotionalShift],
      ["storyChange", scene.storyChange],
    ]) {
      if (!clean(field[1])) addIssue(issues, "scene_editorial_field_required", `${scenePath}.${field[0]}`, `${field[0]} is required.`);
    }

    return {
      id: sceneIds.get(scene.sceneNumber),
      sceneNumber: scene.sceneNumber,
      act: scene.act,
      pageBinding: bindings.get(scene.sceneNumber) || { textPageNumber: 1, imagePageNumber: 1 },
      narrative: {
        title: clean(scene.title),
        function: clean(scene.narrativeFunction),
        purpose: clean(scene.purpose),
        approvedAction: clean(scene.action),
        dominantEmotion: clean(scene.dominantEmotion),
        emotionalShift: clean(scene.emotionalShift),
        storyChange: clean(scene.storyChange),
        symbolIds: [...new Set(list(scene.symbolUse).map((symbol) => {
          const object = objects.find((candidate) => key(candidate.name) === key(symbol.name));
          return object?.id || identifier(symbol.name, "symbol");
        }))],
      },
      timeline: {
        locationBeforeId: resolveByName(locationIds, scene.locationBefore, issues, `${scenePath}.timeline.locationBeforeId`, "location"),
        locationAfterId: resolveByName(locationIds, scene.locationAfter, issues, `${scenePath}.timeline.locationAfterId`, "location"),
        prerequisiteSceneIds: list(scene.prerequisiteSceneIds).map((id) => (
          sceneIds.get(Number(String(id).replace("scene-", ""))) || identifier(id)
        )),
        visiblePhase: "end",
        visibleMoment: clean(scene.action),
      },
      presences,
      movements,
      objectStates: snapshots,
      transition: {
        kind: transitionKind,
        fromLocationId: resolveByName(locationIds, scene.transition?.from || scene.locationBefore, issues, `${scenePath}.transition.fromLocationId`, "location"),
        toLocationId: resolveByName(locationIds, scene.transition?.to || scene.locationAfter, issues, `${scenePath}.transition.toLocationId`, "location"),
        travelerCharacterIds: list(scene.transition?.characters).map((name) => resolveByName(
          characterIds,
          name,
          issues,
          `${scenePath}.transition.travelerCharacterIds`,
          "character",
        )),
        passageId: transitionPassageId,
      },
      illustration: {
        visibleCharacterIds: visible,
        evokedCharacterIds: evoked,
        mainAction: {
          subjectCharacterId: mainPresence?.characterId || characters[0]?.id || "unknown_character",
          verb: clean(mainPresence?.action || scene.action),
          targetId: objectTarget?.id || passageTarget?.id || null,
        },
        requiredElements,
        forbiddenElements,
        forbiddenCharacterIds: forbidden,
      },
    };
  });

  throwIfIssues(issues);
  const artifact = {
    schemaVersion: NARRATIVE_BOOK_SPEC_VERSION,
    contractId: NARRATIVE_BOOK_SPEC_ID,
    revision: positiveInteger(revision),
    sourceScenario: {
      projectId: canonicalProjectId,
      scenarioVersion: Number(scenario.version),
      revision: scenarioRevision,
      digest: storyScenarioAuditDigest(scenario),
      auditEvidenceDigest: clean(scenario.auditEvidence.digest),
      approvedAt: clean(scenario.approvedAt),
    },
    book: {
      language,
      audienceAge,
      pageCount,
      universeId,
    },
    safety: canonicalSafetyValue,
    registries: {
      characters,
      locations,
      objects,
      passages,
      causalEvents,
    },
    scenes: compiledScenes,
    validation: {
      compilerVersion: NARRATIVE_BOOK_SPEC_COMPILER_VERSION,
      mechanicalValidatorVersion: NARRATIVE_BOOK_SPEC_VALIDATOR_VERSION,
      artifactDigest: "0".repeat(64),
      semanticAudit: {
        validatorVersion: positiveInteger(semanticValidatorVersion, 1),
        policyVersion: positiveInteger(semanticAuditPolicyVersion, 1),
        artifactDigest: "0".repeat(64),
        status: "pending",
        auditedAt: null,
      },
    },
  };
  const digest = narrativeBookSpecDigest(artifact);
  artifact.validation.artifactDigest = digest;
  artifact.validation.semanticAudit.artifactDigest = digest;
  const mechanical = validateNarrativeBookSpec(artifact);
  if (!mechanical.valid) {
    throw new NarrativeBookSpecCompileError(mechanical.issues);
  }
  return artifact;
}
