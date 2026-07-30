import crypto from "node:crypto";

export const NARRATIVE_BOOK_SPEC_VERSION = 1;
export const NARRATIVE_BOOK_SPEC_ID = "calitiki.narrative-book-spec.v1";
export const NARRATIVE_BOOK_SPEC_COMPILER_VERSION = 1;
export const NARRATIVE_BOOK_SPEC_VALIDATOR_VERSION = 1;

const PRESENCE_MODES = new Set(["physical", "thought", "memory", "voice"]);
const PHYSICAL_PHASES = new Set(["start", "throughout", "end"]);
const PASSAGE_MOVEMENTS = new Set(["discover_passage", "cross_passage", "return_travel"]);
const NON_TERMINAL_OBJECT_STATES = new Set([
  "worn",
  "held",
  "carried",
  "stored",
  "visible",
  "left_behind",
  "planted",
  "installed",
]);
const TERMINAL_OBJECT_STATES = new Set(["consumed", "transformed", "destroyed", "used_up"]);
const OBJECT_STATES = new Set(["absent", ...NON_TERMINAL_OBJECT_STATES, ...TERMINAL_OBJECT_STATES]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

function digestProjection(input = {}) {
  const copy = structuredClone(input);
  const compilerVersion = copy?.validation?.compilerVersion;
  delete copy.validation;
  delete copy.revision;
  if (copy.sourceScenario) {
    delete copy.sourceScenario.projectId;
    delete copy.sourceScenario.revision;
    delete copy.sourceScenario.approvedAt;
  }
  copy.compilerVersion = compilerVersion;
  return stableValue(copy);
}

export function narrativeBookSpecDigest(input = {}) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(digestProjection(input)))
    .digest("hex");
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function idSet(value) {
  return new Set(list(value).map((item) => String(item)));
}

function equalSets(left, right) {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

function addIssue(issues, code, path, message) {
  issues.push({ code, path, message });
}

function duplicateIds(entries = []) {
  const seen = new Set();
  const duplicates = new Set();
  for (const entry of entries) {
    const id = String(entry?.id || "");
    if (!id) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

function validateSafety(spec, issues) {
  const childSafety = spec?.safety?.childSafety;
  const sensitivity = spec?.safety?.sensitivity;
  if (!childSafety || childSafety.action !== "allow" || childSafety.restricted !== false) {
    addIssue(
      issues,
      "unsafe_contract_compilation",
      "safety.childSafety",
      "A canonical narrative contract may exist only after an allowed, unrestricted Child Safety decision.",
    );
  }
  if (!sensitivity || sensitivity.restricted !== false || ![1, 2, 3].includes(Number(sensitivity.level))) {
    addIssue(
      issues,
      "restricted_sensitivity_contract",
      "safety.sensitivity",
      "Restricted or invalid sensitivity input must stop before canonical compilation.",
    );
  }
  const serialized = JSON.stringify(spec?.safety || {});
  for (const forbidden of ["rationale", "submittedText", "questionnaireText", "unsafeWording"]) {
    if (serialized.includes(`"${forbidden}"`)) {
      addIssue(
        issues,
        "private_safety_text_forbidden",
        "safety",
        `${forbidden} must not be copied into the canonical contract.`,
      );
    }
  }
}

export function validateNarrativeBookSpec(spec = {}, { verifyDigest = true } = {}) {
  const issues = [];
  if (Number(spec?.schemaVersion) !== NARRATIVE_BOOK_SPEC_VERSION) {
    addIssue(issues, "unsupported_schema_version", "schemaVersion", "Narrative Book Spec version 1 is required.");
  }
  if (spec?.contractId !== NARRATIVE_BOOK_SPEC_ID) {
    addIssue(issues, "invalid_contract_id", "contractId", `${NARRATIVE_BOOK_SPEC_ID} is required.`);
  }
  if (!Number.isInteger(spec?.revision) || spec.revision < 1) {
    addIssue(issues, "invalid_revision", "revision", "A positive immutable revision is required.");
  }

  validateSafety(spec, issues);

  const registries = spec?.registries || {};
  const characters = list(registries.characters);
  const locations = list(registries.locations);
  const objects = list(registries.objects);
  const passages = list(registries.passages);
  const causalEvents = list(registries.causalEvents);
  const scenes = list(spec?.scenes);

  for (const [name, entries] of Object.entries({
    characters,
    locations,
    objects,
    passages,
    causalEvents,
    scenes,
  })) {
    for (const id of duplicateIds(entries)) {
      addIssue(issues, "duplicate_registry_id", `registries.${name}`, `${id} is declared more than once.`);
    }
  }

  const characterIds = idSet(characters.map(({ id }) => id));
  const locationIds = idSet(locations.map(({ id }) => id));
  const objectIds = idSet(objects.map(({ id }) => id));
  const passageIds = idSet(passages.map(({ id }) => id));
  const eventIds = idSet(causalEvents.map(({ id }) => id));
  const sceneIds = idSet(scenes.map(({ id }) => id));

  for (const [index, character] of characters.entries()) {
    if (!locationIds.has(character?.initialLocationId)) {
      addIssue(
        issues,
        "unknown_initial_location",
        `registries.characters[${index}].initialLocationId`,
        `${character?.id || "character"} references an unknown initial location.`,
      );
    }
  }
  for (const [index, passage] of passages.entries()) {
    for (const field of ["sideALocationId", "sideBLocationId"]) {
      if (!locationIds.has(passage?.[field])) {
        addIssue(
          issues,
          "unknown_passage_location",
          `registries.passages[${index}].${field}`,
          `${passage?.id || "passage"} references an unknown location.`,
        );
      }
    }
  }
  for (const [index, object] of objects.entries()) {
    if (!OBJECT_STATES.has(object?.initialState)) {
      addIssue(
        issues,
        "invalid_object_state",
        `registries.objects[${index}].initialState`,
        `${object?.id || "object"} has an unsupported initial state.`,
      );
    }
    const expectedQuantityIsZero = object?.initialState === "absent";
    if ((expectedQuantityIsZero && object?.initialQuantity !== 0)
      || (!expectedQuantityIsZero && !(Number(object?.initialQuantity) > 0))) {
      addIssue(
        issues,
        "object_quantity_state_mismatch",
        `registries.objects[${index}].initialQuantity`,
        "Absent objects require quantity 0; present objects require a positive quantity.",
      );
    }
    if (object?.initialOwnerCharacterId && !characterIds.has(object.initialOwnerCharacterId)) {
      addIssue(
        issues,
        "unknown_object_owner",
        `registries.objects[${index}].initialOwnerCharacterId`,
        `${object.initialOwnerCharacterId} is not a canonical character.`,
      );
    }
  }

  const eventsById = new Map(causalEvents.map((event) => [event?.id, event]));
  for (const [index, event] of causalEvents.entries()) {
    if (!sceneIds.has(event?.sceneId)) {
      addIssue(issues, "unknown_event_scene", `registries.causalEvents[${index}].sceneId`, "Causal event scene is unknown.");
    }
    if (!objectIds.has(event?.objectId)) {
      addIssue(issues, "unknown_event_object", `registries.causalEvents[${index}].objectId`, "Causal event object is unknown.");
    }
    if (event?.resultObjectId && !objectIds.has(event.resultObjectId)) {
      addIssue(issues, "unknown_result_object", `registries.causalEvents[${index}].resultObjectId`, "Result object is unknown.");
    }
  }

  const sceneNumbers = new Set();
  const pageNumbers = new Set();
  const discoveredPassages = new Set();
  const characterLocations = new Map(characters.map((character) => [character.id, character.initialLocationId]));
  const objectState = new Map(objects.map((object) => [object.id, {
    state: object.initialState,
    quantity: object.initialQuantity,
    ownerCharacterId: object.initialOwnerCharacterId || null,
    terminal: TERMINAL_OBJECT_STATES.has(object.initialState),
  }]));
  let previousSceneNumber = 0;

  for (const [sceneIndex, scene] of scenes.entries()) {
    const path = `scenes[${sceneIndex}]`;
    if (!Number.isInteger(scene?.sceneNumber) || scene.sceneNumber <= previousSceneNumber) {
      addIssue(issues, "scene_order_invalid", `${path}.sceneNumber`, "Scene numbers must be strictly increasing.");
    }
    previousSceneNumber = Number(scene?.sceneNumber || previousSceneNumber);
    if (sceneNumbers.has(scene?.sceneNumber)) {
      addIssue(issues, "duplicate_scene_number", `${path}.sceneNumber`, "Scene number is already used.");
    }
    sceneNumbers.add(scene?.sceneNumber);

    for (const field of ["textPageNumber", "imagePageNumber"]) {
      const pageNumber = scene?.pageBinding?.[field];
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > Number(spec?.book?.pageCount || 0)) {
        addIssue(issues, "invalid_page_binding", `${path}.pageBinding.${field}`, "Page is outside the selected book format.");
      } else if (pageNumbers.has(pageNumber)) {
        addIssue(issues, "duplicate_page_binding", `${path}.pageBinding.${field}`, `Page ${pageNumber} is already assigned.`);
      }
      pageNumbers.add(pageNumber);
    }

    for (const field of ["locationBeforeId", "locationAfterId"]) {
      if (!locationIds.has(scene?.timeline?.[field])) {
        addIssue(issues, "unknown_scene_location", `${path}.timeline.${field}`, "Scene timeline references an unknown location.");
      }
    }
    for (const prerequisiteId of list(scene?.timeline?.prerequisiteSceneIds)) {
      const prerequisite = scenes.find((candidate) => candidate?.id === prerequisiteId);
      if (!prerequisite || Number(prerequisite.sceneNumber) >= Number(scene.sceneNumber)) {
        addIssue(
          issues,
          "invalid_scene_prerequisite",
          `${path}.timeline.prerequisiteSceneIds`,
          `${prerequisiteId} must reference an earlier canonical scene.`,
        );
      }
    }

    const presences = list(scene?.presences);
    const presenceCharacterIds = presences.map((presence) => presence?.characterId);
    if (new Set(presenceCharacterIds).size !== presenceCharacterIds.length) {
      addIssue(issues, "duplicate_scene_presence", `${path}.presences`, "A character may have only one presence mode per scene.");
    }
    const physical = new Set();
    const nonphysical = new Set();
    for (const [presenceIndex, presence] of presences.entries()) {
      const presencePath = `${path}.presences[${presenceIndex}]`;
      if (!characterIds.has(presence?.characterId)) {
        addIssue(issues, "unknown_scene_character", `${presencePath}.characterId`, "Presence references an unknown character.");
      }
      if (!PRESENCE_MODES.has(presence?.mode)) {
        addIssue(issues, "invalid_presence_mode", `${presencePath}.mode`, "Presence mode is unsupported.");
      } else if (presence.mode === "physical") {
        physical.add(presence.characterId);
        if (!PHYSICAL_PHASES.has(presence?.phase) || !locationIds.has(presence?.locationId)) {
          addIssue(
            issues,
            "invalid_physical_presence",
            presencePath,
            "A physical presence requires one phase and one canonical location.",
          );
        }
      } else {
        nonphysical.add(presence.characterId);
        if (presence?.phase || presence?.locationId) {
          addIssue(
            issues,
            "nonphysical_location_forbidden",
            presencePath,
            "Thought, memory and voice presences have no physical phase or location.",
          );
        }
      }
    }

    const visible = idSet(scene?.illustration?.visibleCharacterIds);
    const evoked = idSet(scene?.illustration?.evokedCharacterIds);
    const forbidden = idSet(scene?.illustration?.forbiddenCharacterIds);
    const expectedForbidden = new Set([...characterIds].filter((id) => !physical.has(id) && !nonphysical.has(id)));
    if (!equalSets(visible, physical)) {
      addIssue(
        issues,
        "visible_cast_mismatch",
        `${path}.illustration.visibleCharacterIds`,
        "Visible illustration cast must equal physical scene presences exactly.",
      );
    }
    if (!equalSets(evoked, nonphysical)) {
      addIssue(
        issues,
        "evoked_cast_mismatch",
        `${path}.illustration.evokedCharacterIds`,
        "Evoked illustration cast must equal thought, memory and voice presences exactly.",
      );
    }
    if (!equalSets(forbidden, expectedForbidden)) {
      addIssue(
        issues,
        "forbidden_cast_mismatch",
        `${path}.illustration.forbiddenCharacterIds`,
        "Every absent canonical character must be explicitly forbidden from the visible moment.",
      );
    }
    if (!visible.has(scene?.illustration?.mainAction?.subjectCharacterId)) {
      addIssue(
        issues,
        "main_action_subject_not_visible",
        `${path}.illustration.mainAction.subjectCharacterId`,
        "The visible main action subject must be physically present.",
      );
    }

    const movements = list(scene?.movements).slice().sort((left, right) => left.sequence - right.sequence);
    for (const [movementIndex, movement] of movements.entries()) {
      const movementPath = `${path}.movements[${movementIndex}]`;
      if (!locationIds.has(movement?.fromLocationId) || !locationIds.has(movement?.toLocationId)) {
        addIssue(issues, "unknown_movement_location", movementPath, "Movement references an unknown location.");
      }
      if (PASSAGE_MOVEMENTS.has(movement?.kind) && !passageIds.has(movement?.passageId)) {
        addIssue(issues, "unknown_movement_passage", `${movementPath}.passageId`, "Passage movement requires a canonical passage.");
      }
      if (movement?.kind === "discover_passage") {
        discoveredPassages.add(movement.passageId);
      }
      if (["cross_passage", "return_travel"].includes(movement?.kind) && !discoveredPassages.has(movement?.passageId)) {
        addIssue(
          issues,
          "passage_crossed_before_discovery",
          movementPath,
          `${movement?.passageId || "passage"} is crossed before its canonical discovery.`,
        );
      }
      for (const travelerId of list(movement?.travelerCharacterIds)) {
        if (!physical.has(travelerId)) {
          addIssue(
            issues,
            "nonphysical_traveler",
            `${movementPath}.travelerCharacterIds`,
            `${travelerId} cannot move without a physical scene presence.`,
          );
          continue;
        }
        const currentLocation = characterLocations.get(travelerId);
        if (currentLocation !== movement.fromLocationId) {
          addIssue(
            issues,
            "traveler_origin_mismatch",
            `${movementPath}.fromLocationId`,
            `${travelerId} is at ${currentLocation || "an unknown location"}, not ${movement.fromLocationId}.`,
          );
        }
        characterLocations.set(travelerId, movement.toLocationId);
      }
    }

    if (scene?.transition?.kind !== "none") {
      const matching = movements.some((movement) => (
        movement.kind === scene.transition.kind
        && movement.fromLocationId === scene.transition.fromLocationId
        && movement.toLocationId === scene.transition.toLocationId
      ));
      if (!matching) {
        addIssue(
          issues,
          "transition_movement_mismatch",
          `${path}.transition`,
          "The focal transition must be backed by an ordered canonical movement.",
        );
      }
    }

    const snapshots = list(scene?.objectStates);
    const snapshotIds = snapshots.map((snapshot) => snapshot?.objectId);
    if (!equalSets(new Set(snapshotIds), objectIds) || snapshotIds.length !== objectIds.size) {
      addIssue(
        issues,
        "incomplete_object_ledger",
        `${path}.objectStates`,
        "Every registered object must have exactly one state snapshot in every scene.",
      );
    }
    for (const [snapshotIndex, snapshot] of snapshots.entries()) {
      const snapshotPath = `${path}.objectStates[${snapshotIndex}]`;
      if (!objectIds.has(snapshot?.objectId) || !OBJECT_STATES.has(snapshot?.state)) {
        addIssue(issues, "invalid_object_snapshot", snapshotPath, "Object snapshot references an unknown object or state.");
        continue;
      }
      if ((snapshot.state === "absent" && snapshot.quantity !== 0)
        || (snapshot.state !== "absent" && !(Number(snapshot.quantity) > 0))) {
        addIssue(
          issues,
          "object_quantity_state_mismatch",
          `${snapshotPath}.quantity`,
          "Absent objects require quantity 0; present objects require a positive quantity.",
        );
      }
      if (snapshot.ownerCharacterId && !characterIds.has(snapshot.ownerCharacterId)) {
        addIssue(issues, "unknown_object_owner", `${snapshotPath}.ownerCharacterId`, "Object owner is not canonical.");
      }
      const previous = objectState.get(snapshot.objectId);
      const event = snapshot.eventId ? eventsById.get(snapshot.eventId) : null;
      if (snapshot.eventId && (!event || event.sceneId !== scene.id || event.objectId !== snapshot.objectId)) {
        addIssue(
          issues,
          "invalid_object_event",
          `${snapshotPath}.eventId`,
          "Object event must belong to this scene and object.",
        );
      } else if (event) {
        if (previous?.state !== event.fromState || snapshot.state !== event.toState) {
          addIssue(
            issues,
            "object_event_state_mismatch",
            snapshotPath,
            `Event ${event.id} does not match the previous and resulting object states.`,
          );
        }
      } else if (previous && previous.state !== snapshot.state) {
        addIssue(
          issues,
          "object_changed_without_event",
          snapshotPath,
          `${snapshot.objectId} changes from ${previous.state} to ${snapshot.state} without a causal event.`,
        );
      }
      if (previous?.terminal && snapshot.state !== previous.state) {
        addIssue(
          issues,
          "terminal_object_reappears",
          snapshotPath,
          `${snapshot.objectId} changes after a terminal state.`,
        );
      }
      objectState.set(snapshot.objectId, {
        state: snapshot.state,
        quantity: snapshot.quantity,
        ownerCharacterId: snapshot.ownerCharacterId || null,
        terminal: TERMINAL_OBJECT_STATES.has(snapshot.state),
      });
    }
  }

  if (verifyDigest) {
    const expectedDigest = narrativeBookSpecDigest(spec);
    if (spec?.validation?.artifactDigest !== expectedDigest) {
      addIssue(
        issues,
        "artifact_digest_mismatch",
        "validation.artifactDigest",
        "Validation evidence does not belong to this exact canonical artifact.",
      );
    }
    if (spec?.validation?.semanticAudit?.artifactDigest !== expectedDigest) {
      addIssue(
        issues,
        "semantic_audit_digest_mismatch",
        "validation.semanticAudit.artifactDigest",
        "Semantic audit evidence must be keyed to the exact canonical artifact digest.",
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    digest: narrativeBookSpecDigest(spec),
  };
}
