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
  const scenario = structuredClone(input);
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
