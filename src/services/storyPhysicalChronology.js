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

function endpointPair(from, to) {
  const endpoints = [key(from), key(to)].filter(Boolean);
  if (endpoints.length !== 2 || endpoints[0] === endpoints[1]) return null;
  return {
    key: [...endpoints].sort().join("::"),
    from: text(from),
    to: text(to),
  };
}

function mechanismKey(event = {}) {
  return key(event.mechanismId || event.mechanism);
}

function sameCharacters(left, right) {
  const leftKeys = [...new Set(list(left).map(key).filter(Boolean))].sort();
  const rightKeys = [...new Set(list(right).map(key).filter(Boolean))].sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((value, index) => value === rightKeys[index]);
}

function uniqueMovementId(scene) {
  const used = new Set(list(scene?.characterMovements).map((movement) => text(movement?.id)));
  let ordinal = list(scene?.characterMovements).length + 1;
  while (used.has(`movement-${ordinal}`)) ordinal += 1;
  return `movement-${ordinal}`;
}

function eventCoordinates(event = {}) {
  return {
    kind: text(event.kind),
    mechanism: text(event.mechanism),
    mechanismId: text(event.mechanismId),
    from: text(event.from),
    to: text(event.to),
    characters: [...list(event.characters)],
  };
}

function normalizeOrderedDiscoveries(scenario, report) {
  for (const scene of list(scenario?.scenes)) {
    const discovery = scene?.transition;
    if (discovery?.kind !== "discover_passage"
      || key(scene.locationBefore) === key(scene.locationAfter)) continue;

    const approaches = list(scene.characterMovements).filter((movement) => (
      movement?.kind === "ordinary_travel"
      && key(movement.from) === key(scene.locationBefore)
      && key(movement.to) === key(scene.locationAfter)
    ));
    if (approaches.length !== 1) continue;
    const approach = approaches[0];
    const discoveryKey = mechanismKey(discovery);
    const matchingDiscoveries = list(scene.characterMovements).filter((movement) => (
      movement?.kind === "discover_passage"
      && mechanismKey(movement) === discoveryKey
      && key(movement.from) === key(scene.locationAfter)
      && key(movement.to) === key(scene.locationAfter)
    ));
    if (matchingDiscoveries.length > 1) continue;

    if (!matchingDiscoveries.length) {
      const discoveryMovement = {
        id: uniqueMovementId(scene),
        ...eventCoordinates(discovery),
        from: text(scene.locationAfter),
        to: text(scene.locationAfter),
      };
      const approachIndex = scene.characterMovements.indexOf(approach);
      scene.characterMovements.splice(approachIndex + 1, 0, discoveryMovement);
    }
    scene.transition = eventCoordinates(approach);
    report.orderedDiscoveries += 1;
    report.sceneNumbers.add(Number(scene.sceneNumber));
  }
}

function ordinaryRoutes(scenes) {
  const routes = [];
  for (const scene of scenes) {
    for (const event of [scene?.transition, ...list(scene?.characterMovements)]) {
      if (event?.kind !== "ordinary_travel") continue;
      const pair = endpointPair(event.from, event.to);
      if (!pair) continue;
      const signature = [
        pair.key,
        mechanismKey(event),
        key(event.mechanism),
      ].join("::");
      if (routes.some((route) => route.signature === signature)) continue;
      routes.push({ event, pair, signature, sceneNumber: Number(scene.sceneNumber) });
    }
  }
  return routes;
}

function stablePassagePairs(scenes) {
  const groups = new Map();
  for (const scene of scenes) {
    for (const event of [scene?.transition, ...list(scene?.characterMovements)]) {
      if (event?.kind !== "cross_passage") continue;
      const mechanism = mechanismKey(event);
      const pair = endpointPair(event.from, event.to);
      if (!mechanism || !pair) continue;
      const group = groups.get(mechanism) || [];
      if (!group.some((entry) => entry.pair.key === pair.key)) {
        group.push({ sceneNumber: Number(scene.sceneNumber), event, pair });
      }
      groups.set(mechanism, group);
    }
  }
  return new Map([...groups]
    .filter(([, entries]) => entries.length === 1)
    .map(([mechanism, entries]) => [mechanism, entries[0]]));
}

function matchingOrdinaryRoute(routes, from, to, maximumSceneNumber) {
  const targetPair = endpointPair(from, to);
  if (!targetPair) return null;
  const matches = routes.filter((route) => (
    route.pair.key === targetPair.key
    && route.sceneNumber <= maximumSceneNumber
  ));
  return matches.length === 1 ? matches[0].event : null;
}

function normalizeCollapsedPassageReturns(scenario, report) {
  const scenes = list(scenario?.scenes).sort((left, right) => (
    Number(left?.sceneNumber) - Number(right?.sceneNumber)
  ));
  const passages = stablePassagePairs(scenes);
  const routes = ordinaryRoutes(scenes);

  for (const scene of scenes) {
    const returns = [scene?.transition, ...list(scene?.characterMovements)]
      .filter((event) => event?.kind === "return_travel" && mechanismKey(event));
    const candidates = [...new Map(returns.map((event) => [
      [mechanismKey(event), key(event.from), key(event.to), ...list(event.characters).map(key).sort()].join("::"),
      event,
    ])).values()];

    for (const collapsed of candidates) {
      const mechanism = mechanismKey(collapsed);
      const stable = passages.get(mechanism);
      if (!stable || Number(scene.sceneNumber) <= stable.sceneNumber) continue;
      const stableEndpoints = [key(stable.pair.from), key(stable.pair.to)];
      const collapsedFrom = key(collapsed.from);
      const collapsedTo = key(collapsed.to);
      if (!stableEndpoints.includes(collapsedFrom)
        || collapsedTo !== key(scene.locationAfter)
        || stableEndpoints.includes(collapsedTo)) continue;

      const passageDestination = collapsedFrom === stableEndpoints[0]
        ? stable.pair.to
        : stable.pair.from;
      const route = matchingOrdinaryRoute(
        routes,
        passageDestination,
        scene.locationAfter,
        Number(scene.sceneNumber),
      );
      if (!route) continue;

      const matchingReturns = returns.filter((event) => (
        mechanismKey(event) === mechanism
        && key(event.from) === collapsedFrom
        && key(event.to) === collapsedTo
        && sameCharacters(event.characters, collapsed.characters)
      ));
      for (const event of matchingReturns) event.to = passageDestination;

      const alreadyCompleted = list(scene.characterMovements).some((movement) => (
        movement?.kind === "ordinary_travel"
        && key(movement.from) === key(passageDestination)
        && key(movement.to) === key(scene.locationAfter)
        && sameCharacters(movement.characters, collapsed.characters)
      ));
      if (!alreadyCompleted) {
        scene.characterMovements.push({
          id: uniqueMovementId(scene),
          kind: "ordinary_travel",
          mechanism: text(route.mechanism),
          mechanismId: text(route.mechanismId),
          from: passageDestination,
          to: text(scene.locationAfter),
          characters: [...list(collapsed.characters)],
        });
        report.addedOrdinaryLegs += 1;
      }
      report.completedPassageReturns += 1;
      report.sceneNumbers.add(Number(scene.sceneNumber));
    }
  }
}

export function canonicalizeStoryScenarioPhysicalChronology(input = {}) {
  const scenario = structuredClone(input);
  const report = {
    version: 1,
    changed: false,
    orderedDiscoveries: 0,
    completedPassageReturns: 0,
    addedOrdinaryLegs: 0,
    sceneNumbers: new Set(),
  };
  normalizeOrderedDiscoveries(scenario, report);
  normalizeCollapsedPassageReturns(scenario, report);
  report.sceneNumbers = [...report.sceneNumbers]
    .filter((number) => Number.isInteger(number) && number > 0)
    .sort((left, right) => left - right);
  report.changed = report.sceneNumbers.length > 0;
  return { scenario, report };
}
