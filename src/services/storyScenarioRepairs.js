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

function safeDiscoveryScene(scenes, crossingScene) {
  const origin = key(crossingScene?.locationBefore);
  const travelers = new Set(list(crossingScene?.transition?.characters).map(key));
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
        && [...travelers].every((name) => physical.has(name));
    }) || null;
}

export function buildStoryScenarioRepairDirectives(scenario = {}, validation = {}) {
  const scenes = list(scenario?.scenes);
  const directives = [];
  for (const issue of list(validation?.issues).map(text)) {
    const match = issue.match(/scene[- ](\d+)\s+crosses a passage before it was discovered/i);
    if (!match) continue;
    const crossingScene = scenes.find((scene) => Number(scene?.sceneNumber) === Number(match[1]));
    if (!crossingScene?.transition?.mechanism) continue;
    const discoveryScene = safeDiscoveryScene(scenes, crossingScene);
    const mechanismId = text(crossingScene.transition.mechanismId)
      || key(crossingScene.transition.mechanism).replaceAll(" ", "_");
    const instruction = discoveryScene
      ? [
        `Repair this causal defect without asking the creator: scene-${discoveryScene.sceneNumber} must discover`,
        `"${crossingScene.transition.mechanism}" at "${crossingScene.locationBefore}" without crossing it.`,
        `Use transition kind discover_passage and mechanism_id "${mechanismId}".`,
        `Scene-${crossingScene.sceneNumber} must then cross that exact already-discovered passage with the same mechanism_id`,
        `and travelers ${list(crossingScene.transition.characters).join(", ")}. Preserve every unrelated scene and creator choice.`,
      ].join(" ")
      : [
        `Repair this causal defect without asking the creator: before scene-${crossingScene.sceneNumber}, add the discovery`,
        `of "${crossingScene.transition.mechanism}" at "${crossingScene.locationBefore}" without crossing it.`,
        `Use mechanism_id "${mechanismId}", then keep scene-${crossingScene.sceneNumber} as the later crossing.`,
        "Preserve every unrelated scene and creator choice.",
      ].join(" ");
    directives.push({
      code: "discover_passage_before_crossing",
      discoverySceneNumber: Number(discoveryScene?.sceneNumber || 0),
      crossingSceneNumber: Number(crossingScene.sceneNumber),
      mechanism: text(crossingScene.transition.mechanism),
      mechanismId,
      origin: text(crossingScene.locationBefore),
      travelers: list(crossingScene.transition.characters).map(text).filter(Boolean),
      instruction,
    });
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
      scene?.transition?.kind === "discover_passage"
      && key(scene?.transition?.mechanismId || scene?.transition?.mechanism) === key(directive.mechanismId)
    ));
    crossingScene.transition = {
      kind: "cross_passage",
      mechanism: directive.mechanism,
      mechanismId: directive.mechanismId,
      from: directive.origin,
      to: crossingScene.locationAfter,
      characters: [...directive.travelers],
    };
    if (alreadyDiscovered) continue;

    discoveryScene.locationAfter = directive.origin;
    discoveryScene.transition = {
      kind: "discover_passage",
      mechanism: directive.mechanism,
      mechanismId: directive.mechanismId,
      from: directive.origin,
      to: directive.origin,
      characters: [],
    };
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
