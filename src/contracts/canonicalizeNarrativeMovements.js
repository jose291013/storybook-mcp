const MOVEMENT_KINDS = new Set([
  "ordinary_travel",
  "return_travel",
  "cross_passage",
  "join_travel",
  "discover_passage",
]);

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

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function canonicalCharacterName(value, characters) {
  const requested = key(value);
  return characters.find((character) => key(character.name) === requested)?.name || text(value);
}

function matchingTransitionMovement(transition, movements, scene) {
  if (!transition || transition.kind === "none" || transition.kind === "discover_passage") return null;
  const mechanism = key(transition.mechanismId || transition.mechanism);
  return movements.find((movement) => (
    movement.kind === transition.kind
    && key(movement.to) === key(transition.to || scene.locationAfter)
    && key(movement.mechanismId || movement.mechanism) === mechanism
  )) || movements.find((movement) => (
    key(movement.from) === key(scene.locationBefore)
    && key(movement.to) === key(scene.locationAfter)
  ));
}

function transitionCoordinates(value = {}) {
  return {
    kind: text(value.kind) || "none",
    mechanism: text(value.mechanism),
    mechanismId: text(value.mechanismId),
    from: text(value.from),
    to: text(value.to),
    characters: list(value.characters).map((name) => text(name)),
  };
}

export function canonicalizeNarrativeMovements(input = {}) {
  const scenario = structuredClone(input);
  const characters = list(scenario.characters);
  const locations = new Map(characters.map((character) => [
    key(character.name),
    text(character.initialLocation),
  ]));
  const report = {
    version: 1,
    changed: false,
    repairedOrigins: 0,
    splitMovements: 0,
    removedRedundantLegs: 0,
    inferredFinalLegs: 0,
    sceneNumbers: [],
  };
  const changedScenes = new Set();

  for (const scene of list(scenario.scenes).sort((left, right) => left.sceneNumber - right.sceneNumber)) {
    const physical = new Set(list(scene.characterPresences)
      .filter((presence) => presence.mode === "physical")
      .map((presence) => key(presence.name)));
    const movedInScene = new Set();
    const canonical = [];

    for (const movement of list(scene.characterMovements)) {
      if (movement.kind === "discover_passage") {
        canonical.push({ ...movement });
        continue;
      }
      const groups = new Map();
      for (const requestedName of list(movement.characters)) {
        const name = canonicalCharacterName(requestedName, characters);
        const nameKey = key(name);
        const origin = text(locations.get(nameKey) || movement.from);
        if (origin && key(origin) === key(movement.to)) {
          report.removedRedundantLegs += 1;
          changedScenes.add(scene.sceneNumber);
          continue;
        }
        const originKey = key(origin);
        const group = groups.get(originKey) || { origin, characters: [], continuing: false };
        group.characters.push(name);
        group.continuing ||= movedInScene.has(nameKey);
        groups.set(originKey, group);
      }
      if (groups.size > 1) {
        report.splitMovements += groups.size - 1;
        changedScenes.add(scene.sceneNumber);
      }
      for (const group of groups.values()) {
        const originChanged = key(group.origin) !== key(movement.from);
        if (originChanged) {
          report.repairedOrigins += group.characters.length;
          changedScenes.add(scene.sceneNumber);
        }
        const followsFocalRoute = key(group.origin) === key(scene.locationBefore);
        const preserveMechanism = !originChanged || followsFocalRoute;
        const repaired = {
          ...movement,
          kind: preserveMechanism && MOVEMENT_KINDS.has(movement.kind)
            ? movement.kind
            : group.continuing ? "ordinary_travel" : "join_travel",
          from: group.origin,
          characters: [...new Set(group.characters)],
          mechanism: preserveMechanism ? text(movement.mechanism) : "",
          mechanismId: preserveMechanism ? text(movement.mechanismId) : "",
        };
        canonical.push(repaired);
        for (const name of repaired.characters) {
          locations.set(key(name), text(repaired.to));
          movedInScene.add(key(name));
        }
      }
    }

    const finalGroups = new Map();
    for (const presence of list(scene.characterPresences)) {
      if (presence.mode !== "physical" || !["end", ""].includes(text(presence.phase))) continue;
      const name = canonicalCharacterName(presence.name, characters);
      const nameKey = key(name);
      if (!physical.has(nameKey)) continue;
      const target = text(presence.location || scene.locationAfter);
      const origin = text(locations.get(nameKey));
      if (!origin || !target || key(origin) === key(target)) continue;
      const groupKey = `${key(origin)}::${key(target)}::${movedInScene.has(nameKey) ? "continuing" : "incoming"}`;
      const group = finalGroups.get(groupKey) || {
        origin,
        target,
        continuing: movedInScene.has(nameKey),
        characters: [],
      };
      group.characters.push(name);
      finalGroups.set(groupKey, group);
    }
    for (const group of finalGroups.values()) {
      canonical.push({
        id: `movement-${canonical.length + 1}`,
        kind: group.continuing || key(group.origin) === key(scene.locationBefore)
          ? "ordinary_travel"
          : "join_travel",
        from: group.origin,
        to: group.target,
        characters: [...new Set(group.characters)],
        mechanism: "",
        mechanismId: "",
      });
      report.inferredFinalLegs += group.characters.length;
      changedScenes.add(scene.sceneNumber);
      for (const name of group.characters) locations.set(key(name), group.target);
    }

    const usedMovementIds = new Set();
    scene.characterMovements = canonical.map((movement, index) => {
      const baseId = text(movement.id) || `movement-${index + 1}`;
      let id = baseId;
      let suffix = 2;
      while (usedMovementIds.has(id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      if (!text(movement.id) || id !== baseId) changedScenes.add(scene.sceneNumber);
      usedMovementIds.add(id);
      return { ...movement, id };
    });
    if (scene.transition?.kind !== "discover_passage") {
      const matching = matchingTransitionMovement(scene.transition, scene.characterMovements, scene);
      const synchronizedTransition = matching ? {
        kind: matching.kind,
        mechanism: matching.mechanism,
        mechanismId: matching.mechanismId,
        from: matching.from,
        to: matching.to,
        characters: [...matching.characters],
      } : {
        kind: "none",
        mechanism: "",
        mechanismId: "",
        from: text(scene.locationBefore),
        to: text(scene.locationAfter),
        characters: [],
      };
      if (JSON.stringify(transitionCoordinates(scene.transition)) !== JSON.stringify(transitionCoordinates(synchronizedTransition))) {
        changedScenes.add(scene.sceneNumber);
      }
      scene.transition = synchronizedTransition;
    }
  }

  report.sceneNumbers = [...changedScenes].sort((left, right) => left - right);
  report.changed = report.sceneNumbers.length > 0;
  return { scenario, report };
}
