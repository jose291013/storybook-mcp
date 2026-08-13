export const CHARACTER_MOVEMENT_LEDGER_VERSION = 1;

const MOVEMENT_KINDS = new Set([
  "ordinary_travel",
  "return_travel",
  "cross_passage",
  "join_travel",
  "discover_passage",
]);
const PRESENCE_PHASES = new Set(["start", "throughout", "end"]);

function text(value) {
  return String(value || "").trim();
}

function key(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function list(value, maximum = 50) {
  return (Array.isArray(value) ? value : []).filter(Boolean).slice(0, maximum);
}

function canonicalName(value, characters) {
  const requested = key(value);
  return characters.find((character) => key(character.name) === requested)?.name || "";
}

function passageId(value, fallback = "") {
  return key(value || fallback).replaceAll(" ", "_");
}

function movementKind(value, { from = "", to = "", focalBefore = "", focalAfter = "" } = {}) {
  if (MOVEMENT_KINDS.has(value)) return value;
  if (key(to) === key(focalAfter) && key(from) !== key(focalBefore)) return "join_travel";
  return "ordinary_travel";
}

export function normalizeCharacterMovements(value, {
  characters = [],
  focalBefore = "",
  focalAfter = "",
} = {}) {
  return list(value, 30).map((movement, index) => {
    const from = text(movement?.from);
    const to = text(movement?.to);
    const mechanism = text(movement?.mechanism);
    return {
      id: text(movement?.id || `movement-${index + 1}`).replace(/[^a-z0-9_-]/gi, "_").toLowerCase(),
      kind: movementKind(movement?.kind, { from, to, focalBefore, focalAfter }),
      from,
      to,
      characters: [...new Set(list(movement?.characters, 20)
        .map((name) => canonicalName(name, characters))
        .filter(Boolean))],
      mechanism,
      mechanismId: passageId(movement?.mechanism_id || movement?.mechanismId, mechanism),
    };
  }).filter((movement) => movement.from && movement.to && movement.characters.length);
}

function legacyTransitionMovements(scene, characters, characterLocations, { repairOrigins = false } = {}) {
  const transition = scene?.transition || {};
  if (transition.kind === "discover_passage") return [];
  if (!MOVEMENT_KINDS.has(transition.kind) || !list(transition.characters).length) return [];
  const destination = text(transition.to || scene.locationAfter);
  const byOrigin = new Map();
  for (const requestedName of list(transition.characters, 20)) {
    const name = canonicalName(requestedName, characters);
    if (!name) continue;
    const knownOrigin = text(characterLocations.get(name));
    if (repairOrigins && knownOrigin && key(knownOrigin) === key(destination)) continue;
    const origin = repairOrigins
      ? knownOrigin || text(transition.from || scene.locationBefore)
      : text(transition.from || scene.locationBefore);
    const originKey = key(origin);
    const group = byOrigin.get(originKey) || { origin, characters: [] };
    group.characters.push(name);
    byOrigin.set(originKey, group);
  }
  return [...byOrigin.values()].map((group, index) => ({
    id: `movement-${index + 1}`,
    kind: key(group.origin) === key(scene.locationBefore)
      ? transition.kind
      : "join_travel",
    from: group.origin,
    to: destination,
    characters: [...new Set(group.characters)],
    mechanism: text(transition.mechanism),
    mechanismId: passageId(transition.mechanismId, transition.mechanism),
  }));
}

function appendInferredArrivals({
  movements,
  scene,
  characters,
  characterLocations,
}) {
  const physicalNames = list(scene.characterPresences, 30)
    .filter((presence) => (
      presence?.mode === "physical"
      && (!presence?.phase || presence.phase === "end")
      && key(presence?.location || scene.locationAfter) === key(scene.locationAfter)
    ))
    .map((presence) => canonicalName(presence?.name, characters))
    .filter(Boolean);
  const explicitlyMoved = new Set(movements
    .filter((movement) => movement.kind !== "discover_passage")
    .flatMap((movement) => movement.characters));
  // Project the explicit ledger in order before deciding who still needs an
  // arrival. Merely participating in an earlier movement does not prove that
  // a character reached the scene's final location.
  const projectedLocations = new Map(characterLocations);
  applyMovementsToLocations(movements, projectedLocations);
  const byOrigin = new Map();
  for (const name of physicalNames) {
    const origin = text(projectedLocations.get(name));
    if (!origin || key(origin) === key(scene.locationAfter)) continue;
    const continuing = explicitlyMoved.has(name);
    const originKey = `${key(origin)}::${continuing ? "continuing" : "incoming"}`;
    const group = byOrigin.get(originKey) || { origin, characters: [], continuing };
    group.characters.push(name);
    byOrigin.set(originKey, group);
  }
  for (const group of byOrigin.values()) {
    const isFocalTravel = key(group.origin) === key(scene.locationBefore)
      && key(scene.locationBefore) !== key(scene.locationAfter);
    const transition = scene.transition || {};
    movements.push({
      id: `movement-${movements.length + 1}`,
      kind: group.continuing
        ? "ordinary_travel"
        : isFocalTravel && MOVEMENT_KINDS.has(transition.kind)
        ? transition.kind
        : isFocalTravel ? "ordinary_travel" : "join_travel",
      from: group.origin,
      to: text(scene.locationAfter),
      characters: [...new Set(group.characters)],
      mechanism: isFocalTravel ? text(transition.mechanism) : "",
      mechanismId: isFocalTravel ? passageId(transition.mechanismId, transition.mechanism) : "",
    });
  }
}

function applyMovementsToLocations(movements, characterLocations) {
  for (const movement of movements) {
    if (movement.kind === "discover_passage") continue;
    for (const name of movement.characters) characterLocations.set(name, movement.to);
  }
}

export function stabilizeSceneCharacterMovements(scene, {
  characters = [],
  characterLocations = new Map(),
} = {}) {
  const explicit = normalizeCharacterMovements(
    scene.characterMovements || scene.character_movements,
    {
      characters,
      focalBefore: scene.locationBefore,
      focalAfter: scene.locationAfter,
    },
  );
  const movements = explicit.length
    ? explicit
    : legacyTransitionMovements(scene, characters, characterLocations, { repairOrigins: true });
  appendInferredArrivals({
    movements,
    scene,
    characters,
    characterLocations,
  });
  applyMovementsToLocations(movements, characterLocations);
  return movements.map((movement, index) => ({
    ...movement,
    id: `movement-${index + 1}`,
  }));
}

function movementIssuesForScene({
  scene,
  movements,
  characters,
  characterLocations,
  discoveredPassages,
}) {
  const issues = [];
  const physicalPresences = list(scene.characterPresences, 30)
    .filter((presence) => presence?.mode === "physical");
  const physicalNames = new Set(physicalPresences.map((presence) => presence?.name));
  const nonphysicalNames = new Set(list(scene.characterPresences, 30)
    .filter((presence) => presence?.mode !== "physical")
    .map((presence) => presence?.name));
  const visitedLocations = new Map(characters.map((character) => [
    character.name,
    [text(characterLocations.get(character.name))].filter(Boolean),
  ]));

  for (const movement of movements) {
    if (!MOVEMENT_KINDS.has(movement.kind)) {
      issues.push(`${scene.id}: movement ${movement.id} has an unknown kind`);
    }
    if (!movement.from || !movement.to || (
      movement.kind !== "discover_passage" && key(movement.from) === key(movement.to)
    )) {
      issues.push(`${scene.id}: movement ${movement.id} requires distinct origin and destination`);
    }
    if (!movement.characters.length) issues.push(`${scene.id}: movement ${movement.id} requires travelers`);
    if (movement.kind === "discover_passage") {
      const mechanismId = passageId(movement.mechanismId, movement.mechanism);
      if (!movement.mechanism || !mechanismId || key(movement.from) !== key(movement.to)) {
        issues.push(`${scene.id}: passage discovery needs one named mechanism at the current location`);
      } else {
        discoveredPassages.add(mechanismId);
      }
    }
    if (movement.kind === "cross_passage") {
      const mechanismId = passageId(movement.mechanismId, movement.mechanism);
      if (!movement.mechanism || !mechanismId || !discoveredPassages.has(mechanismId)) {
        issues.push(`${scene.id} crosses a passage before it was discovered`);
      }
    }
    for (const name of movement.characters) {
      if (nonphysicalNames.has(name)) {
        issues.push(`${scene.id}: ${name} cannot travel as a nonphysical presence`);
      }
      if (!physicalNames.has(name)) {
        issues.push(`${scene.id}: ${name} travels without being physically present`);
      }
      const knownLocation = text(characterLocations.get(name));
      if (!knownLocation) {
        issues.push(`${scene.id}: ${name} needs an initial location`);
      } else if (key(knownLocation) !== key(movement.from)) {
        issues.push(`${scene.id}: ${name} cannot depart from ${movement.from}`);
      }
      if (movement.kind !== "discover_passage") characterLocations.set(name, movement.to);
      const visited = visitedLocations.get(name) || [];
      visited.push(movement.to);
      visitedLocations.set(name, visited);
    }
  }

  for (const presence of physicalPresences) {
    const presenceLocation = text(presence.location || scene.locationAfter);
    const phase = PRESENCE_PHASES.has(presence.phase) ? presence.phase : "end";
    const visited = visitedLocations.get(presence.name) || [];
    if (!visited.some((location) => key(location) === key(presenceLocation))) {
      issues.push(`${scene.id}: ${presence.name} appears in ${presenceLocation} without traveling there`);
    }
    if (phase === "start" && key(visited[0]) !== key(presenceLocation)) {
      issues.push(`${scene.id}: ${presence.name} is not at ${presenceLocation} at scene start`);
    }
    if (phase === "end" && key(characterLocations.get(presence.name)) !== key(presenceLocation)) {
      issues.push(`${scene.id}: ${presence.name} is not at ${presenceLocation} at scene end`);
    }
    if (phase === "throughout") {
      const stayedThere = visited.length > 0 && visited.every((location) => key(location) === key(presenceLocation));
      if (!stayedThere) issues.push(`${scene.id}: ${presence.name} does not remain at ${presenceLocation} throughout`);
    }
  }

  return issues;
}

export function validateCharacterMovementLedger(scenario = {}) {
  const characters = list(scenario.characters, 30);
  const characterLocations = new Map(characters.map((character) => [
    character.name,
    text(character.initialLocation),
  ]));
  const discoveredPassages = new Set();
  const snapshots = [];
  const issues = [];

  for (const scene of list(scenario.scenes, 40)) {
    const startLocations = Object.fromEntries(characterLocations);
    const movements = normalizeCharacterMovements(
      scene.characterMovements?.length
        ? scene.characterMovements
        : legacyTransitionMovements(scene, characters, characterLocations),
      {
        characters,
        focalBefore: scene.locationBefore,
        focalAfter: scene.locationAfter,
      },
    );
    issues.push(...movementIssuesForScene({
      scene,
      movements,
      characters,
      characterLocations,
      discoveredPassages,
    }));
    if (scene.transition?.kind === "discover_passage") {
      const mechanismId = passageId(scene.transition.mechanismId, scene.transition.mechanism);
      if (mechanismId) discoveredPassages.add(mechanismId);
    }
    snapshots.push({
      sceneNumber: Number(scene.sceneNumber),
      startLocations,
      movements,
      endLocations: Object.fromEntries(characterLocations),
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    snapshots,
    finalLocations: Object.fromEntries(characterLocations),
  };
}
