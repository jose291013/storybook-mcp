export const STORY_SCENARIO_VERSION = 1;

const PRESENCE_MODES = new Set(["physical", "thought", "memory", "voice"]);
const TRANSITION_KINDS = new Set(["none", "discover_passage", "cross_passage", "ordinary_travel", "return_travel"]);
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

export function normalizeStoryScenario(candidate = {}, { pagePlan = [], canonicalCharacters = [], creatorClarifications = {} } = {}) {
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
    return {
      name: canonical.name,
      role: canonical.role || "other",
      storyRole: canonical.storyRole || canonical.story_role || "guest",
      initialLocation: text(supplied.initial_location),
      defaultPresenceMode: presenceMode,
    };
  });
  const objects = list(raw?.objects, 20).map((item) => ({
    name: text(item?.name),
      owner: canonicalName(item?.owner, scenarioCharacters) || text(item?.owner),
    initialState: OBJECT_STATES.has(item?.initial_state) ? item.initial_state : "visible",
    trackEveryScene: item?.track_every_scene === true,
  })).filter((item) => item.name);
  const scenes = expectedScenes.map((expected, index) => {
    const supplied = rawScenes.find((item) => Number(item?.scene_number) === Number(expected.scene_number)) || rawScenes[index] || {};
    const transitionKind = TRANSITION_KINDS.has(supplied?.transition?.kind) ? supplied.transition.kind : "none";
    const locationBefore = text(supplied?.location_before);
    const locationAfter = text(supplied?.location_after || supplied?.location_before);
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
      prerequisiteSceneIds: [...new Set(list(supplied?.prerequisite_scene_ids, 10).map(text).filter(Boolean))],
      characterPresences: list(supplied?.character_presences, 15).map((presence) => {
        const name = canonicalName(presence?.name, scenarioCharacters);
        const mode = PRESENCE_MODES.has(presence?.mode) ? presence.mode : "physical";
        return name ? { name, mode, location: mode === "physical" ? locationAfter : "", action: text(presence?.action) } : null;
      }).filter(Boolean),
      transition: {
        kind: transitionKind,
        mechanism: text(supplied?.transition?.mechanism),
        from: text(supplied?.transition?.from || locationBefore),
        to: text(supplied?.transition?.to || locationAfter),
        characters: [...new Set(list(supplied?.transition?.characters, 12).map((name) => canonicalName(name, scenarioCharacters)).filter(Boolean))],
      },
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
    title: text(raw?.title),
    summary: text(raw?.summary),
    clarifications,
    creatorClarifications: Object.fromEntries(Object.entries(creatorClarifications || {}).map(([id, answer]) => [text(id), text(answer)]).filter(([id, answer]) => id && answer)),
    characters,
    objects,
    scenes,
  };
}

export function stabilizeStoryScenario(input = {}) {
  const scenario = structuredClone(input);
  const scenes = list(scenario.scenes, 30);
  const characterLocations = new Map(list(scenario.characters, 20).map((character) => [character.name, character.initialLocation]));
  const trackedObjects = list(scenario.objects, 20).filter((object) => object.trackEveryScene);
  const objectStates = new Map(trackedObjects.map((object) => [key(object.name), {
    name: object.name,
    owner: object.owner,
    state: object.initialState,
    quantity: 1,
    instruction: "Keep exactly one visible state for this object.",
  }]));
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
    scene.transition.from = scene.locationBefore;
    scene.transition.to = scene.locationAfter;
    const nonphysical = new Set(list(scene.characterPresences, 20).filter((presence) => presence.mode !== "physical").map((presence) => presence.name));
    const travelers = new Set(list(scene.transition.characters, 20).filter((name) => !nonphysical.has(name)));
    const changesLocation = key(scene.locationBefore) !== key(scene.locationAfter);
    if (changesLocation && scene.transition.kind !== "none") {
      for (const presence of list(scene.characterPresences, 20).filter((item) => item.mode === "physical")) {
        const knownLocation = characterLocations.get(presence.name);
        if (knownLocation && key(knownLocation) === key(scene.locationBefore)) travelers.add(presence.name);
      }
    }
    scene.transition.characters = [...travelers];
    for (const traveler of travelers) characterLocations.set(traveler, scene.locationAfter);

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
  const characterLocations = new Map(list(scenario.characters, 20).map((character) => [character.name, character.initialLocation]));
  const discoveredPassages = new Set();
  const trackedObjects = list(scenario.objects, 20).filter((object) => object.trackEveryScene);
  let previous = null;

  for (const [index, scene] of scenes.entries()) {
    if (scene.sceneNumber !== index + 1 || scene.id !== sceneId(index + 1)) issues.push(`scene ${index + 1} is out of order`);
    if (!scene.storyRole) issues.push(`${scene.id}.storyRole is required`);
    if (!scene.title) issues.push(`${scene.id}.title is required`);
    if (!scene.action) issues.push(`${scene.id}.action is required`);
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
    if (transition.kind !== "none" && (key(transition.from) !== key(scene.locationBefore) || key(transition.to) !== key(scene.locationAfter))) {
      issues.push(`${scene.id} transition must match its before/after locations`);
    }
    if (transition.kind === "discover_passage") {
      if (!transition.mechanism) issues.push(`${scene.id} passage discovery needs a mechanism`);
      else discoveredPassages.add(key(transition.mechanism));
    }
    if (transition.kind === "cross_passage") {
      if (!transition.mechanism || !discoveredPassages.has(key(transition.mechanism))) issues.push(`${scene.id} crosses a passage before it was discovered`);
      if (!transition.characters.length) issues.push(`${scene.id} passage crossing must name every traveler`);
    }
    for (const name of transition.characters || []) {
      const knownLocation = characterLocations.get(name);
      if (knownLocation && key(knownLocation) !== key(scene.locationBefore)) issues.push(`${scene.id}: ${name} cannot depart from ${scene.locationBefore}`);
      characterLocations.set(name, scene.locationAfter);
    }

    for (const presence of scene.characterPresences || []) {
      if (presence.mode !== "physical") continue;
      const expectedLocation = characterLocations.get(presence.name);
      if (!expectedLocation) issues.push(`${scene.id}: ${presence.name} needs an initial location`);
      else if (key(expectedLocation) !== key(scene.locationAfter)) issues.push(`${scene.id}: ${presence.name} appears in ${scene.locationAfter} without traveling there`);
      if (presence.location && key(presence.location) !== key(scene.locationAfter)) issues.push(`${scene.id}: ${presence.name} has a contradictory physical location`);
    }

    const objectNames = new Set();
    for (const objectState of scene.objectStates || []) {
      const objectKey = key(objectState.name);
      if (objectNames.has(objectKey)) issues.push(`${scene.id}: ${objectState.name} has two simultaneous states`);
      objectNames.add(objectKey);
      if (Number(objectState.quantity) !== 1 && ["worn", "held", "carried"].includes(objectState.state)) {
        issues.push(`${scene.id}: a worn or held personal object must have quantity 1`);
      }
    }
    for (const tracked of trackedObjects) {
      if (!objectNames.has(key(tracked.name))) issues.push(`${scene.id}: tracked object ${tracked.name} needs one explicit state`);
    }
    previous = scene;
  }
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
  return scenario?.version === STORY_SCENARIO_VERSION ? scenario : null;
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
