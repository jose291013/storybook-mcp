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

function passageId(value, fallback = "") {
  return key(value || fallback).replaceAll(" ", "_");
}

function localizedNames(names, language) {
  const values = list(names).map(text).filter(Boolean);
  if (values.length < 2) return values[0] || "";
  const conjunction = String(language || "FR").toUpperCase() === "ES"
    ? " y "
    : String(language || "FR").toUpperCase() === "EN" ? " and " : " et ";
  return `${values.slice(0, -1).join(", ")}${conjunction}${values.at(-1)}`;
}

function discoverySentence({ travelers, mechanism, language }) {
  const names = localizedNames(travelers, language);
  const plural = list(travelers).length > 1;
  if (String(language || "FR").toUpperCase() === "ES") {
    const destination = /^el\s+/i.test(mechanism)
      ? `del ${mechanism.replace(/^el\s+/i, "")}`
      : /^la\s+/i.test(mechanism) ? `de la ${mechanism.replace(/^la\s+/i, "")}` : `de ${mechanism}`;
    return `${names} ${plural ? "descubren" : "descubre"} la entrada ${destination}, sin cruzarla todavía.`;
  }
  if (String(language || "FR").toUpperCase() === "EN") {
    return `${names} ${plural ? "discover" : "discovers"} the entrance to ${mechanism}, without crossing it yet.`;
  }
  const destination = /^le\s+/i.test(mechanism)
    ? `du ${mechanism.replace(/^le\s+/i, "")}`
    : /^la\s+/i.test(mechanism)
      ? `de la ${mechanism.replace(/^la\s+/i, "")}`
      : /^les\s+/i.test(mechanism)
        ? `des ${mechanism.replace(/^les\s+/i, "")}`
        : /^l[’']\s*/i.test(mechanism)
          ? `de l’${mechanism.replace(/^l[’']\s*/i, "")}`
          : `de ${mechanism}`;
  return `${names} ${plural ? "découvrent" : "découvre"} l’entrée ${destination}, sans encore la franchir.`;
}

function safeDiscoveryScene(scenes, crossingScene, travelers = []) {
  const origin = key(crossingScene?.locationBefore);
  const travelerKeys = new Set(list(travelers).map(key));
  return [...scenes]
    .filter((scene) => Number(scene?.sceneNumber) < Number(crossingScene?.sceneNumber))
    .reverse()
    .find((scene) => {
      const physical = new Set(list(scene?.characterPresences)
        .filter((presence) => presence?.mode === "physical")
        .map((presence) => key(presence?.name)));
      return key(scene?.locationBefore) === origin
        && key(scene?.locationAfter) === origin
        && (!scene?.transition?.kind || scene.transition.kind === "none")
        && list(scene?.characterMovements).length === 0
        && [...travelerKeys].every((name) => physical.has(name));
    }) || null;
}

function endOfPreviousSceneDiscovery(scenes, crossingScene, travelers = []) {
  const crossingIndex = scenes.findIndex((scene) => (
    Number(scene?.sceneNumber) === Number(crossingScene?.sceneNumber)
  ));
  if (crossingIndex <= 0) return null;
  const candidate = scenes[crossingIndex - 1];
  const origin = key(crossingScene?.locationBefore);
  if (!origin || key(candidate?.locationAfter) !== origin) return null;
  const physicalAtEnd = new Set(list(candidate?.characterPresences)
    .filter((presence) => (
      presence?.mode === "physical"
      && (!presence?.phase || ["end", "throughout"].includes(presence.phase))
      && key(presence?.location || candidate?.locationAfter) === origin
    ))
    .map((presence) => key(presence?.name)));
  return list(travelers).map(key).every((name) => physicalAtEnd.has(name))
    ? candidate
    : null;
}

function scenePassageEvents(scene) {
  return [
    { ...(scene?.transition || {}), source: "transition" },
    ...list(scene?.characterMovements).map((movement) => ({ ...movement, source: "movement" })),
  ].filter((event) => ["discover_passage", "cross_passage", "return_travel", "ordinary_travel"].includes(event.kind));
}

function passageEventSignature(event) {
  return [
    key(event.kind),
    key(event.from),
    key(event.to),
    key(event.mechanismId || event.mechanism),
  ].join("::");
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

function passageMechanismKey(event = {}) {
  return key(event.mechanismId || event.mechanism);
}

function sameEndpointPair(left, right) {
  return Boolean(left && right && left.key === right.key);
}

export function synchronizeStoryScenarioPassageCoordinates(input = {}) {
  const scenario = structuredClone(input);
  for (const scene of list(scenario?.scenes)) {
    const transition = scene?.transition;
    if (!transition || !["cross_passage", "return_travel"].includes(transition.kind)) continue;
    const mechanism = passageMechanismKey(transition);
    if (!mechanism) continue;
    const matchingMovements = list(scene.characterMovements).filter((movement) => (
      movement
      && movement.kind === transition.kind
      && passageMechanismKey(movement) === mechanism
    ));
    const movementPairs = matchingMovements
      .map((movement) => ({ movement, pair: endpointPair(movement.from, movement.to) }))
      .filter((entry) => entry.pair);
    const distinctMovementPairs = [...new Map(movementPairs.map((entry) => [entry.pair.key, entry.pair])).values()];
    const transitionPair = endpointPair(transition.from, transition.to);

    // One physical ledger route is more precise than a stale scene-level
    // transition. Align the focal transition before passage ids are split.
    if (distinctMovementPairs.length === 1 && !sameEndpointPair(transitionPair, distinctMovementPairs[0])) {
      transition.from = distinctMovementPairs[0].from;
      transition.to = distinctMovementPairs[0].to;
    }

    // When both the focal passage and its physical ledger lost their
    // coordinates, the scene envelope is the only canonical route available.
    // Complete it locally instead of spending a model repair. An ordered scene
    // with another explicit route remains ambiguous: its focal passage may be
    // only one inner leg and must not be guessed from the whole-scene envelope.
    const currentTransitionPair = endpointPair(transition.from, transition.to);
    const sceneEnvelopePair = endpointPair(scene.locationBefore, scene.locationAfter);
    const explicitTravelPairs = list(scene.characterMovements)
      .filter((movement) => ["ordinary_travel", "cross_passage", "return_travel", "join_travel"]
        .includes(movement?.kind))
      .map((movement) => endpointPair(movement.from, movement.to))
      .filter(Boolean);
    const envelopeIsUnambiguous = explicitTravelPairs.every((pair) => (
      sameEndpointPair(pair, sceneEnvelopePair)
    ));
    if (!currentTransitionPair && sceneEnvelopePair && envelopeIsUnambiguous) {
      transition.from = sceneEnvelopePair.from;
      transition.to = sceneEnvelopePair.to;
    }

    const synchronizedTransitionPair = endpointPair(transition.from, transition.to);
    if (!synchronizedTransitionPair) continue;
    for (const movement of matchingMovements) {
      if (!endpointPair(movement.from, movement.to)) {
        movement.from = synchronizedTransitionPair.from;
        movement.to = synchronizedTransitionPair.to;
      }
    }
  }
  return scenario;
}

function orientedLifecyclePair(scene, event, pair) {
  const fromKey = key(event?.from);
  const toKey = key(event?.to);
  const pairFromKey = key(pair?.from);
  const pairToKey = key(pair?.to);
  const beforeKey = key(scene?.locationBefore);
  const afterKey = key(scene?.locationAfter);
  const otherEndpoint = (knownKey) => {
    if (knownKey === pairFromKey) return pair.to;
    if (knownKey === pairToKey) return pair.from;
    return "";
  };

  if (fromKey && !toKey) {
    const to = otherEndpoint(fromKey);
    return to ? { from: text(event.from), to } : null;
  }
  if (!fromKey && toKey) {
    const from = otherEndpoint(toKey);
    return from ? { from, to: text(event.to) } : null;
  }
  if (fromKey && fromKey === toKey && otherEndpoint(fromKey)) {
    if (beforeKey === fromKey && afterKey !== fromKey) {
      return { from: text(event.from), to: otherEndpoint(fromKey) };
    }
    if (afterKey === fromKey && beforeKey !== fromKey) {
      return { from: otherEndpoint(fromKey), to: text(event.to) };
    }
  }
  if (fromKey || toKey) return null;

  if (beforeKey && otherEndpoint(beforeKey)) {
    return { from: text(scene.locationBefore), to: otherEndpoint(beforeKey) };
  }
  if (afterKey && otherEndpoint(afterKey)) {
    return { from: otherEndpoint(afterKey), to: text(scene.locationAfter) };
  }
  return null;
}

export function synchronizeStoryScenarioPassageLifecycleCoordinates(input = {}) {
  const scenario = structuredClone(input);
  const groups = new Map();
  for (const scene of list(scenario?.scenes)) {
    const events = [
      scene?.transition,
      ...list(scene?.characterMovements),
    ].filter((event) => (
      event
      && ["cross_passage", "return_travel"].includes(event.kind)
      && passageMechanismKey(event)
    ));
    for (const event of events) {
      const mechanism = passageMechanismKey(event);
      const records = groups.get(mechanism) || [];
      records.push({ scene, event, pair: endpointPair(event.from, event.to) });
      groups.set(mechanism, records);
    }
  }

  for (const records of groups.values()) {
    const completePairs = [...new Map(records
      .filter((record) => record.pair)
      .map((record) => [record.pair.key, record.pair])).values()];
    if (completePairs.length !== 1) continue;
    const stablePair = completePairs[0];
    for (const record of records.filter((candidate) => !candidate.pair)) {
      const oriented = orientedLifecyclePair(record.scene, record.event, stablePair);
      if (!oriented) continue;
      record.event.from = oriented.from;
      record.event.to = oriented.to;
    }
  }
  return scenario;
}

function splitPassageId(baseId, pair, ordinal) {
  if (ordinal === 0) return baseId;
  const endpoints = [passageId(pair.from), passageId(pair.to)].filter(Boolean).sort();
  return `${baseId}__${endpoints.join("__")}`.slice(0, 160);
}

export function normalizeStoryScenarioPassageEndpoints(input = {}) {
  const scenario = structuredClone(input);
  const scenes = list(scenario?.scenes);
  const records = [];
  const ordinaryReturns = ordinaryReturnEvents(scenes);
  for (const scene of scenes) {
    const events = [
      { event: scene?.transition, source: "transition" },
      ...list(scene?.characterMovements).map((event) => ({ event, source: "movement" })),
    ];
    for (const { event, source } of events) {
      if (!event || !["discover_passage", "cross_passage", "return_travel"].includes(event.kind)) continue;
      if (event.kind === "return_travel" && ordinaryReturns.has(passageEventSignature(event))) continue;
      const baseId = passageId(event.mechanismId, event.mechanism);
      if (!baseId) continue;
      const from = text(event.from || (source === "transition" ? scene.locationBefore : ""));
      const to = text(event.to || (source === "transition" ? scene.locationAfter : ""));
      records.push({ scene, event, baseId, pair: endpointPair(from, to), from });
    }
  }

  const groups = new Map();
  for (const record of records) {
    const group = groups.get(record.baseId) || [];
    group.push(record);
    groups.set(record.baseId, group);
  }
  for (const [baseId, group] of groups) {
    const crossingPairs = [];
    for (const record of group.filter((item) => item.event.kind !== "discover_passage" && item.pair)) {
      if (!crossingPairs.some((pair) => pair.key === record.pair.key)) crossingPairs.push(record.pair);
    }
    if (crossingPairs.length <= 1) continue;
    const idsByPair = new Map(crossingPairs.map((pair, index) => [
      pair.key,
      splitPassageId(baseId, pair, index),
    ]));
    for (const record of group) {
      if (record.pair && record.event.kind !== "discover_passage") {
        record.event.mechanismId = idsByPair.get(record.pair.key);
        continue;
      }
      if (record.event.kind !== "discover_passage") continue;
      const laterPair = group
        .filter((candidate) => (
          candidate.event.kind !== "discover_passage"
          && candidate.pair
          && Number(candidate.scene?.sceneNumber || 0) > Number(record.scene?.sceneNumber || 0)
          && key(candidate.pair.from) === key(record.from)
        ))
        .sort((left, right) => Number(left.scene?.sceneNumber || 0) - Number(right.scene?.sceneNumber || 0))[0]
        ?.pair;
      if (laterPair) record.event.mechanismId = idsByPair.get(laterPair.key);
    }
  }
  return scenario;
}

function ordinaryReturnEvents(scenes) {
  const routes = [];
  const returns = new Set();
  for (const scene of scenes) {
    for (const event of scenePassageEvents(scene)) {
      const signature = {
        from: key(event.from),
        to: key(event.to),
        mechanism: key(event.mechanismId || event.mechanism),
      };
      if (event.kind === "ordinary_travel") {
        routes.push(signature);
      } else if (event.kind === "return_travel" && routes.some((route) => (
        route.from === signature.to
        && route.to === signature.from
        && route.mechanism === signature.mechanism
      ))) {
        returns.add(passageEventSignature(event));
      }
    }
  }
  return returns;
}

function undiscoveredPassageCrossings(scenes) {
  const discoveries = [];
  const crossings = [];
  const ordinaryReturns = ordinaryReturnEvents(scenes);
  for (const scene of scenes) {
    for (const event of scenePassageEvents(scene)) {
      const id = passageId(event.mechanismId, event.mechanism);
      if (!id) continue;
      const record = {
        scene,
        event,
        id,
        mechanismKey: key(event.mechanism),
      };
      if (event.kind === "discover_passage") discoveries.push(record);
      if (event.kind === "cross_passage"
        || (event.kind === "return_travel" && !ordinaryReturns.has(passageEventSignature(event)))) {
        crossings.push(record);
      }
    }
  }
  return crossings
    .filter((crossing) => !discoveries.some((discovery) => (
      discovery.id === crossing.id
      && Number(discovery.scene.sceneNumber) < Number(crossing.scene.sceneNumber)
    )))
    .filter((crossing, index, all) => all.findIndex((candidate) => (
      candidate.scene.sceneNumber === crossing.scene.sceneNumber
      && candidate.id === crossing.id
    )) === index)
    .map((crossing) => ({
      ...crossing,
      compatibleDiscovery: discoveries.find((discovery) => (
        Number(discovery.scene.sceneNumber) < Number(crossing.scene.sceneNumber)
        && discovery.mechanismKey
        && discovery.mechanismKey === crossing.mechanismKey
      )) || null,
    }));
}

function passageRepairDirective({ scenes, crossingScene, crossingEvent, compatibleDiscovery = null }) {
  const travelers = list(crossingEvent.characters).map(text).filter(Boolean);
  const stationaryDiscovery = compatibleDiscovery?.scene
    || safeDiscoveryScene(scenes, crossingScene, travelers);
  const discoveryScene = stationaryDiscovery
    || endOfPreviousSceneDiscovery(scenes, crossingScene, travelers);
  const mechanism = text(crossingEvent.mechanism);
  const mechanismId = compatibleDiscovery?.id
    || passageId(crossingEvent.mechanismId, mechanism);
  if (!mechanism || !mechanismId) return null;
  const instruction = discoveryScene
    ? [
      `Repair this causal defect without asking the creator: scene-${discoveryScene.sceneNumber} must discover`,
      `"${mechanism}" at "${crossingScene.locationBefore}" without crossing it.`,
      `Use transition kind discover_passage and mechanism_id "${mechanismId}".`,
      `Scene-${crossingScene.sceneNumber} must then use that exact already-discovered passage with the same mechanism_id`,
      `and travelers ${travelers.join(", ")}. Preserve every unrelated scene and creator choice.`,
    ].join(" ")
    : [
      `Repair this causal defect without asking the creator: before scene-${crossingScene.sceneNumber}, add the discovery`,
      `of "${mechanism}" at "${crossingScene.locationBefore}" without crossing it.`,
      `Use mechanism_id "${mechanismId}", then keep scene-${crossingScene.sceneNumber} as the later crossing.`,
      "Preserve every unrelated scene and creator choice.",
    ].join(" ");
  return {
    code: "discover_passage_before_crossing",
    discoverySceneNumber: Number(discoveryScene?.sceneNumber || 0),
    discoveryPlacement: stationaryDiscovery ? "scene_transition" : "scene_end_event",
    crossingSceneNumber: Number(crossingScene.sceneNumber),
    crossingKind: crossingEvent.kind === "return_travel" ? "return_travel" : "cross_passage",
    mechanism,
    mechanismId,
    origin: text(crossingEvent.from || crossingScene.locationBefore),
    travelers,
    instruction,
  };
}

export function buildStoryScenarioRepairDirectives(scenario = {}, validation = {}) {
  const scenes = list(scenario?.scenes);
  const directives = [];
  const requestedCrossings = new Set();
  for (const issue of list(validation?.issues).map(text)) {
    const match = issue.match(/scene[- ](\d+)\s+crosses a passage before it was discovered/i);
    if (!match) continue;
    requestedCrossings.add(Number(match[1]));
  }
  const canonicalDiagnostics = list(validation?.diagnostics)
    .filter((diagnostic) => diagnostic?.code === "passage_discovery_missing");
  const canonicalRepairRequested = canonicalDiagnostics.length > 0
    || list(validation?.issues).some((issue) => /passage_discovery_missing/i.test(text(issue)));
  for (const diagnostic of canonicalDiagnostics) {
    if (Number(diagnostic?.sceneNumber) > 0) requestedCrossings.add(Number(diagnostic.sceneNumber));
  }
  const missing = undiscoveredPassageCrossings(scenes);
  const targets = canonicalRepairRequested && requestedCrossings.size === 0
    ? missing
    : missing.filter((crossing) => requestedCrossings.has(Number(crossing.scene.sceneNumber)));
  for (const crossing of targets) {
    const directive = passageRepairDirective({
      scenes,
      crossingScene: crossing.scene,
      crossingEvent: crossing.event,
      compatibleDiscovery: crossing.compatibleDiscovery,
    });
    if (directive) directives.push(directive);
  }
  return directives;
}

export function applyStoryScenarioRepairDirectives(input = {}, directives = [], { language = "FR" } = {}) {
  const scenario = structuredClone(input);
  const scenes = list(scenario?.scenes);
  for (const directive of list(directives)) {
    if (directive?.code !== "discover_passage_before_crossing" || !directive.discoverySceneNumber) continue;
    const crossingIndex = scenes.findIndex((scene) => Number(scene?.sceneNumber) === Number(directive.crossingSceneNumber));
    const crossingScene = scenes[crossingIndex];
    const discoveryScene = scenes.find((scene) => Number(scene?.sceneNumber) === Number(directive.discoverySceneNumber));
    if (crossingIndex < 0 || !discoveryScene) continue;
    const alreadyDiscovered = scenes.slice(0, crossingIndex).some((scene) => (
      (scene?.transition?.kind === "discover_passage"
        && key(scene?.transition?.mechanismId || scene?.transition?.mechanism) === key(directive.mechanismId))
      || list(scene?.characterMovements).some((movement) => (
        movement?.kind === "discover_passage"
        && key(movement?.mechanismId || movement?.mechanism) === key(directive.mechanismId)
      ))
    ));
    crossingScene.transition = {
      kind: directive.crossingKind || "cross_passage",
      mechanism: directive.mechanism,
      mechanismId: directive.mechanismId,
      from: directive.origin,
      to: crossingScene.locationAfter,
      characters: [...directive.travelers],
    };
    const unrelatedMovements = list(crossingScene.characterMovements).filter((movement) => (
      !["cross_passage", "return_travel"].includes(movement?.kind)
      || key(movement?.from) !== key(directive.origin)
      || key(movement?.to) !== key(crossingScene.locationAfter)
    ));
    crossingScene.characterMovements = [...unrelatedMovements, {
      id: "movement-1",
      kind: directive.crossingKind || "cross_passage",
      mechanism: directive.mechanism,
      mechanismId: directive.mechanismId,
      from: directive.origin,
      to: crossingScene.locationAfter,
      characters: [...directive.travelers],
    }];
    if (alreadyDiscovered) continue;

    if (directive.discoveryPlacement === "scene_end_event") {
      const duplicateDiscovery = list(discoveryScene.characterMovements).some((movement) => (
        movement?.kind === "discover_passage"
        && key(movement?.mechanismId || movement?.mechanism) === key(directive.mechanismId)
      ));
      if (!duplicateDiscovery) {
        discoveryScene.characterMovements = [
          ...list(discoveryScene.characterMovements),
          {
            id: `movement-${list(discoveryScene.characterMovements).length + 1}`,
            kind: "discover_passage",
            mechanism: directive.mechanism,
            mechanismId: directive.mechanismId,
            from: directive.origin,
            to: directive.origin,
            characters: [...directive.travelers],
          },
        ];
      }
    } else {
      discoveryScene.locationAfter = directive.origin;
      discoveryScene.characterMovements = [];
      discoveryScene.transition = {
        kind: "discover_passage",
        mechanism: directive.mechanism,
        mechanismId: directive.mechanismId,
        from: directive.origin,
        to: directive.origin,
        characters: [],
      };
    }
    const actionKey = key(discoveryScene.action);
    const mentionsMechanism = actionKey.includes(key(directive.mechanism));
    const mentionsDiscovery = /\b(decouvr|descubr|discover|trouv|encuentr|find)\w*/i.test(actionKey);
    if (!mentionsMechanism || !mentionsDiscovery) {
      discoveryScene.action = [
        text(discoveryScene.action).replace(/[.!?]\s*$/, ""),
        discoverySentence({ travelers: directive.travelers, mechanism: directive.mechanism, language }),
      ].filter(Boolean).join(". ");
    }
    discoveryScene.continuityToNext = discoverySentence({
      travelers: directive.travelers,
      mechanism: directive.mechanism,
      language,
    });
  }
  return scenario;
}

export function precompileStoryScenarioPassageLifecycles(input = {}, { language = "FR" } = {}) {
  const scenario = normalizeStoryScenarioPassageEndpoints(
    synchronizeStoryScenarioPassageCoordinates(
      synchronizeStoryScenarioPassageLifecycleCoordinates(
        synchronizeStoryScenarioPassageCoordinates(input),
      ),
    ),
  );
  const scenes = list(scenario?.scenes);
  const directives = undiscoveredPassageCrossings(scenes)
    .map((crossing) => passageRepairDirective({
      scenes,
      crossingScene: crossing.scene,
      crossingEvent: crossing.event,
      compatibleDiscovery: crossing.compatibleDiscovery,
    }))
    .filter((directive) => directive?.discoverySceneNumber);
  return applyStoryScenarioRepairDirectives(scenario, directives, { language });
}

export function validateStoryScenarioPassageLifecycles(scenario = {}) {
  const missing = undiscoveredPassageCrossings(list(scenario?.scenes));
  return {
    valid: missing.length === 0,
    issues: missing.map((crossing) => (
      `scene-${crossing.scene.sceneNumber} crosses a passage before it was discovered`
    )),
    diagnostics: missing.map((crossing) => ({
      code: "passage_discovery_missing",
      sceneNumber: Number(crossing.scene.sceneNumber),
      path: `scenes[${Math.max(0, Number(crossing.scene.sceneNumber) - 1)}].transition`,
    })),
  };
}
