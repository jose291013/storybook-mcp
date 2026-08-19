export const NARRATIVE_ENGINE_ASSIGNMENT_VERSION = 1;
export const NARRATIVE_ENGINE_V2 = 2;
export const NARRATIVE_ENGINE_V3 = 3;

function configuredDefault(value = process.env.NARRATIVE_DEFAULT_ENGINE) {
  const normalized = String(value || "v3").trim().toLowerCase();
  return ["2", "v2", "legacy"].includes(normalized)
    ? NARRATIVE_ENGINE_V2
    : NARRATIVE_ENGINE_V3;
}

export function createNarrativeEngineAssignment({
  engine = configuredDefault(),
  assignedAt = new Date().toISOString(),
  reason = "new_project_default",
} = {}) {
  const version = Number(engine) === NARRATIVE_ENGINE_V2
    ? NARRATIVE_ENGINE_V2
    : NARRATIVE_ENGINE_V3;
  return Object.freeze({
    version: NARRATIVE_ENGINE_ASSIGNMENT_VERSION,
    engine: version,
    reason: String(reason || "new_project_default").slice(0, 80),
    assignedAt,
  });
}

export function narrativeEngineAssignment(project = {}) {
  const stored = project?.continuitySnapshot?.narrativeEngine;
  if (Number(stored?.version) === NARRATIVE_ENGINE_ASSIGNMENT_VERSION
    && [NARRATIVE_ENGINE_V2, NARRATIVE_ENGINE_V3].includes(Number(stored?.engine))) {
    return stored;
  }
  // Projects created before the V3 customer cutover remain on their original
  // pipeline. This fallback is deliberately independent from current env vars.
  return Object.freeze({
    version: NARRATIVE_ENGINE_ASSIGNMENT_VERSION,
    engine: NARRATIVE_ENGINE_V2,
    reason: "legacy_project",
    assignedAt: project?.createdAt || null,
  });
}

export function projectUsesNarrativeV3(project = {}) {
  return narrativeEngineAssignment(project).engine === NARRATIVE_ENGINE_V3;
}
