import { enrichFamilyAddress } from "./characterRelationships.js";
import {
  CHARACTER_MOVEMENT_LEDGER_VERSION,
  normalizeCharacterMovements,
  stabilizeSceneCharacterMovements,
  validateCharacterMovementLedger,
} from "./characterMovementLedger.js";

export const STORY_SCENARIO_VERSION = 2;
const PRESENCE_MODES = new Set(["physical", "thought", "memory", "voice"]);
const PRESENCE_PHASES = new Set(["start", "throughout", "end"]);
const TRANSITION_KINDS = new Set(["none", "discover_passage", "cross_passage", "ordinary_travel", "return_travel", "join_travel"]);
const OBJECT_STATES = new Set(["worn", "held", "carried", "stored", "visible", "absent", "left_behind"]);

function text(value) {
  return String(value || "").trim();
}

function key(value) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function list(value, maximum = 50) {
  return (Array.isArray(value) ? value : []).filter(Boolean).slice(0, maximum);
}

function canonicalName(value, characters) {
  const requested = key(value);
  return characters.find((character) => key(character.name) === requested)?.name || "";
}

function sceneId(sceneNumber) {
  return `scene-${Number(sceneNumber)}`;
}

function passageId(value, fallback = "") {
  return key(value || fallback).replaceAll(" ", "_");
}

function normalizeSymbol(item = {}, { primary = false } = {}) {
  const name = text(item?.name);
  if (!name) return null;
  return primary ? {
    name,
    initialMeaning: text(item?.initial_meaning || item?.initialMeaning),
    evolvedMeaning: text(item?.evolved_meaning || item?.evolvedMeaning),
  } : {
    name,
    purpose: text(item?.purpose),
  };
}

export function scenarioCharacterRegistry(normalized = {}) {
  const answers = normalized.answers || {};
  const photos = normalized.photos || [];
  const registry = [{
    name: answers.hero_name,
    role: "child",
    storyRole: "hero",
    relationship: "hero",
  }, ...photos.filter((photo) => photo.role !== "child").map((photo) => ({
    name: photo.name,
    role: photo.role,
    storyRole: photo.story_role,
    relationship: photo.relationship,
  }))].filter((character) => character.name);
  return registry.filter((character, index, all) => all.findIndex((candidate) => key(candidate.name) === key(character.name)) === index);
}

export function normalizeStoryScenario(candidate = {}, {
  pagePlan = [],
  canonicalCharacters = [],
  creatorClarifications = {},
  worldContract = {},
  language = "FR",
} = {}) {
  const raw = candidate?.scenario || candidate;
  const expectedScenes = pagePlan.filter((page) => page.page_type === "image");
  const rawScenes = list(raw?.scenes, 30);
  const answeredIds = new Set(Object.keys(creatorClarifications || {}).filter((id) => text(creatorClarifications[id])));
  const clarifications = list(raw?.clarifications, 5).map((item, index) => ({
    id: text(item?.id || `clarification_${index + 1}`).replace(/[^a-z0-9_-]/gi, "_").toLowerCase(),
    question: text(item?.question),
    reason: text(item?.reason),
    suggestedAnswer: text(item?.suggested_answer || item?.suggestedAnswer),
  })).filter((item) => item.question && !answeredIds.has(item.id)).slice(0, 3);
  const suppliedCharacters = list(raw?.characters, 20);
  const scenarioCharacters = [...canonicalCharacters, ...suppliedCharacters.map((item) => ({
    name: text(item?.name), role: text(item?.role || "story_character"), storyRole: text(item?.story_role || "guest"), relationship: text(item?.relationship),
  }))].filter((character, index, all) => character.name && all.findIndex((candidateCharacter) => key(candidateCharacter.name) === key(character.name)) === index);
  const characters = scenarioCharacters.map((canonical) => {
    const supplied = list(raw?.characters, 12).find((item) => key(item?.name) === key(canonical.name)) || {};
    const presenceMode = PRESENCE_MODES.has(supplied.default_presence_mode) ? supplied.default_presence_mode : "physical";
    return enrichFamilyAddress({
      name: canonical.name,
      role: canonical.role || "other",
      storyRole: canonical.storyRole || canonical.story_role || "guest",
      relationship: canonical.relationship || supplied.relationship || "",
      initialLocation: text(supplied.initial_location),
      defaultPresenceMode: presenceMode,
    }, language);
  });
  const objects = list(raw?.objects, 20).map((item) => ({
    name: text(item?.name),
      owner: canonicalName(item?.owner, scenarioCharacters) || text(item?.owner),
    initialState: OBJECT_STATES.has(item?.initial_state) ? item.initial_state : "visible",
    trackEveryScene: item?.track_every_scene === true,
  })).filter((item) => item.name);
  const rawNarrativeContract = raw?.narrative_contract || raw?.narrativeContract || {};
  const narrativeContract = Number(rawNarrativeContract?.version) === 1 ? {
    version: 1,
    privacyMode: "implicit_personal_depth",
    moralDelivery: "action_before_words",
    primarySymbol: normalizeSymbol(rawNarrativeContract?.primary_symbol || rawNarrativeContract?.primarySymbol, { primary: true }),
    secondarySymbols: list(rawNarrativeContract?.secondary_symbols || rawNarrativeContract?.secondarySymbols, 10)
      .map((item) => normalizeSymbol(item))
      .filter(Boolean),
  } : null;
  const scenes = expectedScenes.map((expected, index) => {
    const supplied = rawScenes.find((item) => Number(item?.scene_number) === Number(expected.scene_number)) || rawScenes[index] || {};
    const transitionKind = TRANSITION_KINDS.has(supplied?.transition?.kind) ? supplied.transition.kind : "none";
    const locationBefore = text(supplied?.location_before);
    const locationAfter = text(supplied?.location_after || supplied?.location_before);
    const characterPresences = list(supplied?.character_presences, 15).map((presence) => {
      const name = canonicalName(presence?.name, scenarioCharacters);
      const mode = PRESENCE_MODES.has(presence?.mode) ? presence.mode : "physical";
      const phase = PRESENCE_PHASES.has(presence?.phase) ? presence.phase : "end";
      const location = phase === "start" ? locationBefore : locationAfter;
      return name ? {
        name,
        mode,
        phase: mode === "physical" ? phase : "",
        location: mode === "physical" ? location : "",
        action: text(presence?.action),
      } : null;
    }).filter(Boolean);
    return {
      id: sceneId(expected.scene_number),
      sceneNumber: Number(expected.scene_number),
      storyRole: expected.story_role,
      act: Math.max(1, Math.min(3, Number(supplied?.act || (index < expectedScenes.length / 3 ? 1 : index < expectedScenes.length * 2 / 3 ? 2 : 3)))),
      title: text(supplied?.title),
      locationBefore,
      locationAfter,
      action: text(supplied?.action),
      purpose: text(supplied?.purpose),
      narrativeFunction: text(supplied?.narrative_function || supplied?.narrativeFunction),
      dominantEmotion: text(supplied?.dominant_emotion || supplied?.dominantEmotion),
      emotionalShift: text(supplied?.emotional_shift || supplied?.emotionalShift),
      storyChange: text(supplied?.story_change || supplied?.storyChange),
      symbolUse: list(supplied?.symbol_use || supplied?.symbolUse, 3).map((item) => ({
        name: text(item?.name),
        role: text(item?.role),
      })).filter((item) => item.name),
      prerequisiteSceneIds: [...new Set(list(supplied?.prerequisite_scene_ids, 10).map(text).filter(Boolean))],
      characterPresences,
      transition: {
        kind: transitionKind,
        mechanism: text(supplied?.transition?.mechanism),
        mechanismId: passageId(supplied?.transition?.mechanism_id || supplied?.transition?.mechanismId, supplied?.transition?.mechanism),
        from: text(supplied?.transition?.from || locationBefore),
        to: text(supplied?.transition?.to || locationAfter),
        characters: [...new Set(list(supplied?.transition?.characters, 12).map((name) => canonicalName(name, scenarioCharacters)).filter(Boolean))],
      },
      characterMovements: normalizeCharacterMovements(
        supplied?.character_movements || supplied?.characterMovements,
        {
          characters: scenarioCharacters,
          focalBefore: locationBefore,
          focalAfter: locationAfter,
        },
      ),
      objectStates: list(supplied?.object_states, 20).map((item) => ({
        name: text(item?.name),
        owner: canonicalName(item?.owner, scenarioCharacters) || text(item?.owner),
        state: OBJECT_STATES.has(item?.state) ? item.state : "visible",
        quantity: Math.max(1, Number(item?.quantity || 1)),
        instruction: text(item?.instruction),
      })).filter((item) => item.name),
      continuityToNext: text(supplied?.continuity_to_next),
    };
  });
  return {
    version: STORY_SCENARIO_VERSION,
    movementLedgerVersion: CHARACTER_MOVEMENT_LEDGER_VERSION,
    title: text(raw?.title),
    summary: text(raw?.summary),
    ...(narrativeContract ? { narrativeContract } : {}),
    clarifications,
    creatorClarifications: Object.fromEntries(Object.entries(creatorClarifications || {}).map(([id, answer]) => [text(id), text(answer)]).filter(([id, answer]) => id && answer)),
    worldContract: worldContract && typeof worldContract === "object" && !Array.isArray(worldContract)
      ? structuredClone(worldContract)
      : {},
    characters,
    objects,
    scenes,
  };
}

export function clarificationAnswersForApproval(scenario = {}) {
  const existing = scenario?.creatorClarifications && typeof scenario.creatorClarifications === "object"
    ? scenario.creatorClarifications
    : {};
  const answers = {};
  for (const clarification of list(scenario?.clarifications, 3)) {
    const id = text(clarification?.id);
    const answer = text(existing[id] || clarification?.suggestedAnswer || clarification?.suggested_answer);
    if (!id || !answer) return null;
    answers[id] = answer;
  }
  return answers;
}

export function applyCreatorStoryScenarioEdits(input = {}, { sceneEdits = [], addedCharacters = [] } = {}) {
  const scenario = structuredClone(input);
  scenario.characters ||= [];
  for (const added of list(addedCharacters, 10)) {
    const name = text(added?.name || added);
    if (!name || canonicalName(name, scenario.characters)) continue;
    scenario.characters.push({
      name,
      role: "story_character",
      storyRole: "guest",
      initialLocation: "",
      defaultPresenceMode: "physical",
    });
  }

  const editsByScene = new Map(list(sceneEdits, 24).map((edit) => [Number(edit?.scene_number), edit]));
  for (const scene of list(scenario.scenes, 30)) {
    const edit = editsByScene.get(Number(scene.sceneNumber));
    if (!edit) continue;
    if (Object.hasOwn(edit, "title")) scene.title = text(edit.title);
    if (Object.hasOwn(edit, "action")) scene.action = text(edit.action);
    if (Object.hasOwn(edit, "location")) {
      const previousLocation = scene.locationAfter;
      const location = text(edit.location);
      if (location) {
        scene.locationAfter = location;
        if (scene.transition?.kind === "none" && key(scene.locationBefore) === key(previousLocation)) scene.locationBefore = location;
      }
    }
    if (Array.isArray(edit.character_presences)) {
      const previousPresences = new Map(list(scene.characterPresences, 30).map((presence) => [key(presence.name), presence]));
      const selected = new Map();
      for (const requested of list(edit.character_presences, 30)) {
        const name = canonicalName(requested?.name, scenario.characters);
        const mode = text(requested?.mode);
        if (!name || (!PRESENCE_MODES.has(mode) && mode !== "absent")) continue;
        selected.set(key(name), { name, mode });
      }
      scene.characterPresences = [...selected.values()].filter(({ mode }) => mode !== "absent").map(({ name, mode }) => ({
        name,
        mode,
        phase: mode === "physical" ? text(previousPresences.get(key(name))?.phase || "end") : "",
        location: mode === "physical" ? scene.locationAfter : "",
        action: text(previousPresences.get(key(name))?.action),
      }));
    }
  }
  return scenario;
}

export function stabilizeStoryScenario(input = {}) {
  const scenario = structuredClone(input);
  const scenes = list(scenario.scenes, 30);
  for (const character of list(scenario.characters, 20)) {
    if (character.initialLocation) continue;
    const firstPhysicalScene = scenes.find((scene) => list(scene.characterPresences, 20).some((presence) => presence.name === character.name && presence.mode === "physical"));
    if (!firstPhysicalScene) continue;
    const changesLocation = key(firstPhysicalScene.locationBefore) !== key(firstPhysicalScene.locationAfter);
    character.initialLocation = changesLocation ? firstPhysicalScene.locationBefore : firstPhysicalScene.locationAfter;
  }
  const characterLocations = new Map(list(scenario.characters, 20).map((character) => [character.name, character.initialLocation]));
  const trackedObjects = list(scenario.objects, 20).filter((object) => object.trackEveryScene);
  const objectStates = new Map(trackedObjects.map((object) => [key(object.name), {
    name: object.name,
    owner: object.owner,
    state: object.initialState,
    quantity: 1,
    instruction: "Keep exactly one visible state for this object.",
  }]));
  const availablePassages = new Map();
  let previous = null;

  for (const scene of scenes) {
    if (previous) {
      scene.locationBefore = previous.locationAfter;
      scene.prerequisiteSceneIds = [...new Set([
        previous.id,
        ...list(scene.prerequisiteSceneIds, 10).filter((id) => {
          const number = Number(String(id).replace("scene-", ""));
          return Number.isInteger(number) && number < scene.sceneNumber;
        }),
      ])];
    } else {
      scene.prerequisiteSceneIds = [];
    }

    scene.transition ||= { kind: "none", mechanism: "", characters: [] };
    scene.transition.mechanismId = passageId(scene.transition.mechanismId, scene.transition.mechanism);
    const changesLocation = key(scene.locationBefore) !== key(scene.locationAfter);
    for (const presence of list(scene.characterPresences, 30)) {
      if (presence.mode !== "physical") {
        presence.phase = "";
        presence.location = "";
        continue;
      }
      presence.phase = PRESENCE_PHASES.has(presence.phase) ? presence.phase : "end";
      presence.location = presence.phase === "start"
        ? scene.locationBefore
        : scene.locationAfter;
    }
    scene.transition.from = scene.locationBefore;
    scene.transition.to = scene.locationAfter;
    if (scene.transition.kind === "discover_passage" && scene.transition.mechanismId) {
      availablePassages.set(scene.transition.mechanismId, {
        mechanismId: scene.transition.mechanismId,
        mechanism: scene.transition.mechanism,
      });
    }
    if (changesLocation && scene.transition.kind === "none") {
      const discovered = [...availablePassages.values()].at(-1);
      if (discovered) {
        scene.transition.kind = "cross_passage";
        scene.transition.mechanismId = discovered.mechanismId;
        scene.transition.mechanism = discovered.mechanism;
      } else {
        scene.transition.kind = "ordinary_travel";
        scene.transition.mechanismId = "";
      }
    }
    scene.characterMovements = stabilizeSceneCharacterMovements(scene, {
      characters: list(scenario.characters, 20),
      characterLocations,
    });
    const focalMovements = scene.characterMovements.filter((movement) => (
      key(movement.from) === key(scene.locationBefore)
      && key(movement.to) === key(scene.locationAfter)
    ));
    if (changesLocation && focalMovements.length) {
      const primaryMovement = focalMovements[0];
      scene.transition.kind = primaryMovement.kind;
      scene.transition.mechanism = primaryMovement.mechanism;
      scene.transition.mechanismId = primaryMovement.mechanismId;
      scene.transition.characters = [...new Set(focalMovements.flatMap((movement) => movement.characters))];
    } else if (!changesLocation && scene.transition.kind !== "discover_passage") {
      if (
        scene.characterMovements.length === 1
        && key(scene.characterMovements[0].to) === key(scene.locationAfter)
      ) {
        const [movement] = scene.characterMovements;
        scene.transition = {
          kind: movement.kind,
          mechanism: movement.mechanism,
          mechanismId: movement.mechanismId,
          from: movement.from,
          to: movement.to,
          characters: [...movement.characters],
        };
      } else {
        scene.transition = {
          kind: "none",
          mechanism: "",
          mechanismId: "",
          from: scene.locationBefore,
          to: scene.locationAfter,
          characters: [],
        };
      }
    }
    for (const movement of scene.characterMovements) {
      if (movement.kind === "cross_passage" && movement.mechanismId) {
        availablePassages.delete(movement.mechanismId);
      }
    }

    scene.objectStates ||= [];
    const explicitObjectKeys = new Set(list(scene.objectStates, 30).map((item) => key(item.name)));
    for (const tracked of trackedObjects) {
      const objectKey = key(tracked.name);
      if (!explicitObjectKeys.has(objectKey) && objectStates.has(objectKey)) scene.objectStates.push({ ...objectStates.get(objectKey) });
    }
    for (const state of list(scene.objectStates, 30)) objectStates.set(key(state.name), { ...state });
    previous = scene;
  }
  return scenario;
}

export function validateStoryScenario(scenario = {}) {
  const issues = [];
  const scenes = list(scenario.scenes, 30);
  if (!scenario.title) issues.push("scenario.title is required");
  if (!scenario.summary) issues.push("scenario.summary is required");
  if (!scenes.length) issues.push("scenario.scenes are required");
  const trackedObjects = list(scenario.objects, 20).filter((object) => object.trackEveryScene);
  const narrativeContract = scenario.narrativeContract?.version === 1 ? scenario.narrativeContract : null;
  const declaredSymbols = new Set();
  const storyChanges = new Map();
  const narrativeFunctions = new Map();
  if (narrativeContract) {
    if (narrativeContract.privacyMode !== "implicit_personal_depth") issues.push("scenario privacy mode must keep personal depth implicit");
    if (narrativeContract.moralDelivery !== "action_before_words") issues.push("scenario moral must be shown through action before words");
    if (narrativeContract.primarySymbol?.name) declaredSymbols.add(key(narrativeContract.primarySymbol.name));
    if (list(narrativeContract.secondarySymbols, 10).length > 2) issues.push("scenario may use at most two secondary symbols");
    for (const symbol of list(narrativeContract.secondarySymbols, 2)) {
      if (symbol?.name) declaredSymbols.add(key(symbol.name));
    }
    if (declaredSymbols.size > 3) issues.push("scenario may use at most three recurring symbols");
  }
  let previous = null;

  for (const [index, scene] of scenes.entries()) {
    if (scene.sceneNumber !== index + 1 || scene.id !== sceneId(index + 1)) issues.push(`scene ${index + 1} is out of order`);
    if (!scene.storyRole) issues.push(`${scene.id}.storyRole is required`);
    if (!scene.title) issues.push(`${scene.id}.title is required`);
    if (!scene.action) issues.push(`${scene.id}.action is required`);
    if (narrativeContract) {
      if (!scene.narrativeFunction) issues.push(`${scene.id}.narrativeFunction is required for progression`);
      if (!scene.dominantEmotion) issues.push(`${scene.id}.dominantEmotion is required`);
      if (!scene.emotionalShift) issues.push(`${scene.id}.emotionalShift is required`);
      if (!scene.storyChange) issues.push(`${scene.id}.storyChange is required for progression`);
      const functionKey = key(scene.narrativeFunction);
      const changeKey = key(scene.storyChange);
      if (functionKey && narrativeFunctions.has(functionKey)) {
        issues.push(`${scene.id} duplicates narrative function from ${narrativeFunctions.get(functionKey)}`);
      } else if (functionKey) narrativeFunctions.set(functionKey, scene.id);
      if (changeKey && storyChanges.has(changeKey)) {
        issues.push(`${scene.id} duplicates story change from ${storyChanges.get(changeKey)}`);
      } else if (changeKey) storyChanges.set(changeKey, scene.id);
      for (const symbol of list(scene.symbolUse, 3)) {
        if (!declaredSymbols.has(key(symbol?.name))) issues.push(`${scene.id}: symbol ${text(symbol?.name)} is not declared in narrative contract`);
      }
    }
    if (!scene.locationBefore || !scene.locationAfter) issues.push(`${scene.id} requires locationBefore and locationAfter`);
    if (previous) {
      if (key(scene.locationBefore) !== key(previous.locationAfter)) issues.push(`${scene.id} must start in ${previous.locationAfter}`);
      if (!scene.prerequisiteSceneIds.includes(previous.id)) issues.push(`${scene.id} must depend on ${previous.id}`);
    }
    for (const prerequisite of scene.prerequisiteSceneIds) {
      const number = Number(String(prerequisite).replace("scene-", ""));
      if (!Number.isInteger(number) || number >= scene.sceneNumber) issues.push(`${scene.id} has a non-prior prerequisite ${prerequisite}`);
    }

    const transition = scene.transition || { kind: "none", characters: [] };
    const changesLocation = key(scene.locationBefore) !== key(scene.locationAfter);
    if (changesLocation && transition.kind === "none") issues.push(`${scene.id} changes location without a transition`);
    if (transition.kind !== "none" && transition.kind !== "join_travel" && (key(transition.from) !== key(scene.locationBefore) || key(transition.to) !== key(scene.locationAfter))) {
      issues.push(`${scene.id} transition must match its before/after locations`);
    }
    if (!changesLocation && ["ordinary_travel", "return_travel"].includes(transition.kind)) {
      issues.push(`${scene.id} incoming traveler requires a join_travel transition`);
    }
    if (transition.kind === "join_travel") {
      if (changesLocation) issues.push(`${scene.id} join_travel must keep the focal scene at its destination`);
      if (!transition.from || key(transition.from) === key(transition.to)) issues.push(`${scene.id} join_travel requires a distinct origin`);
      if (key(transition.to) !== key(scene.locationAfter)) issues.push(`${scene.id} join_travel must arrive at the scene location`);
      if (!transition.characters?.length) issues.push(`${scene.id} join_travel must name each incoming traveler`);
    }
    if (transition.kind === "discover_passage" && !transition.mechanism) {
      issues.push(`${scene.id} passage discovery needs a mechanism`);
    }

    const objectNames = new Set();
    for (const objectState of scene.objectStates || []) {
      const objectKey = key(objectState.name);
      if (objectNames.has(objectKey)) issues.push(`${scene.id}: ${objectState.name} has two simultaneous states`);
      objectNames.add(objectKey);
      if (Number(objectState.quantity) !== 1 && ["worn", "held", "carried"].includes(objectState.state)) {
        issues.push(`${scene.id}: a worn or held personal object must have quantity 1`);
      }
      if (objectState.owner && ["worn", "held", "carried"].includes(objectState.state)) {
        const physicalNames = new Set((scene.characterPresences || [])
          .filter((presence) => presence.mode === "physical")
          .map((presence) => presence.name));
        if (!physicalNames.has(objectState.owner)) {
          issues.push(`${scene.id}: ${objectState.owner} cannot ${objectState.state} ${objectState.name} while not physically present`);
        }
      }
    }
    for (const tracked of trackedObjects) {
      if (!objectNames.has(key(tracked.name))) issues.push(`${scene.id}: tracked object ${tracked.name} needs one explicit state`);
    }
    previous = scene;
  }
  const movementValidation = validateCharacterMovementLedger(scenario);
  issues.push(...movementValidation.issues);
  return { valid: issues.length === 0, issues };
}

export function summarizeStoryScenarioValidation(validation = {}) {
  const categories = new Set();
  const sceneNumbers = new Set();
  const categoryScenes = new Map();
  for (const issue of list(validation.issues, 100).map(text)) {
    const sceneMatch = issue.match(/scene[- ](\d+)/i);
    const sceneNumber = sceneMatch ? Number(sceneMatch[1]) : 0;
    if (sceneNumber) sceneNumbers.add(sceneNumber);
    let category = "incomplete";
    if (/passage|crosses/i.test(issue)) category = "passage";
    else if (/privacy/i.test(issue)) category = "privacy";
    else if (/symbol/i.test(issue)) category = "symbol";
    else if (/emotion/i.test(issue)) category = "emotion";
    else if (/narrativefunction|storychange|progression|duplicates narrative|duplicates story/i.test(issue)) category = "progression";
    else if (/moral|repeat/i.test(issue)) category = "repetition";
    else if (/age|vocabulary|abstraction/i.test(issue)) category = "age";
    else if (/object|states|quantity|worn|held/i.test(issue)) category = "object";
    else if (/location|transition|depart|travel|appears|physical/i.test(issue)) category = "travel";
    else if (/order|depend|prerequisite|storyrole/i.test(issue)) category = "order";
    categories.add(category);
    if (sceneNumber) {
      const numbers = categoryScenes.get(category) || new Set();
      numbers.add(sceneNumber);
      categoryScenes.set(category, numbers);
    }
  }
  return {
    valid: validation.valid === true,
    issueCount: Number(validation.issues?.length || 0),
    categories: [...categories],
    sceneNumbers: [...sceneNumbers].sort((left, right) => left - right),
    categoryScenes: Object.fromEntries([...categoryScenes].map(([category, numbers]) => [category, [...numbers].sort((left, right) => left - right)])),
  };
}

export function storyScenarioSnapshot(project) {
  const scenario = project?.continuitySnapshot?.storyScenario;
  return [1, STORY_SCENARIO_VERSION].includes(Number(scenario?.version)) ? scenario : null;
}

export function approvedStoryScenario(project, fingerprint = "") {
  const scenario = storyScenarioSnapshot(project);
  if (!scenario || scenario.status !== "approved") return null;
  if (fingerprint && scenario.fingerprint !== fingerprint) return null;
  return scenario;
}

export function storyScenarioRequired(project) {
  return project?.continuitySnapshot?.storyScenarioWorkflow?.required === true;
}
