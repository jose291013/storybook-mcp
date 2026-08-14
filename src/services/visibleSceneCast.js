function key(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function list(value, maximum = 30) {
  return (Array.isArray(value) ? value : []).filter(Boolean).slice(0, maximum);
}

export function canonicalSceneVisiblePhase(scene = {}) {
  const physical = list(scene?.characterPresences)
    .filter((presence) => presence?.mode === "physical");
  if (physical.some((presence) => ["end", "throughout"].includes(presence?.phase))) return "after";
  if (physical.some((presence) => presence?.phase === "start")) return "before";
  return "after";
}

export function physicalPresencesForVisibleInstant(scene = {}, visiblePhase = "") {
  const phase = ["before", "during", "after"].includes(key(visiblePhase))
    ? key(visiblePhase)
    : canonicalSceneVisiblePhase(scene);
  const physical = list(scene?.characterPresences)
    .filter((presence) => presence?.mode === "physical");
  const phaseName = phase === "before" ? "start" : phase === "after" ? "end" : "";
  const travelerNames = new Set([
    ...list(scene?.transition?.characters),
    ...list(scene?.characterMovements).flatMap((movement) => list(movement?.characters)),
  ].map(key).filter(Boolean));
  const visible = physical.filter((presence) => (
    presence?.phase === "throughout"
    || (phaseName && presence?.phase === phaseName)
    || (phase === "during" && travelerNames.has(key(presence?.name)))
  ));
  return visible.length ? visible : physical.filter((presence) => (
    presence?.phase === "throughout" || presence?.phase === "end" || !presence?.phase
  ));
}

export function scenarioTravelerNames(scenario = {}) {
  return new Set(list(scenario?.scenes).flatMap((scene) => ([
    ...list(scene?.transition?.characters),
    ...list(scene?.characterMovements).flatMap((movement) => list(movement?.characters)),
  ])).map(key).filter(Boolean));
}

export function characterTravelsInScenario(scenario = {}, characterName = "") {
  const name = key(characterName);
  return Boolean(name && scenarioTravelerNames(scenario).has(name));
}
