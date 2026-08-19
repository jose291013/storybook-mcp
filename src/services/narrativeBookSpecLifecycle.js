import { compileNarrativeBookSpec } from "../contracts/compileNarrativeBookSpec.js";
import { validateNarrativeBookSpec } from "../contracts/narrativeBookSpec.js";
import {
  canonicalNarrativeV2Safety,
  narrativeV2BookConfiguration,
} from "./narrativeV2Shadow.js";
import { loadNarrativeBookSpecV3 } from "../contracts/narrativeBookSpecV3.js";
import { projectUsesNarrativeV3 } from "./narrativeEngineAssignment.js";

export const NARRATIVE_V2_PIPELINE_VERSION = 2;

export function approveNarrativeBookSpec(
  { project, scenario } = {},
  { compile = compileNarrativeBookSpec, now = () => new Date().toISOString() } = {},
) {
  const spec = compile({
    projectId: project?.id,
    scenario,
    book: narrativeV2BookConfiguration(project),
    safety: canonicalNarrativeV2Safety(project),
  });
  spec.validation.semanticAudit = {
    ...spec.validation.semanticAudit,
    status: "approved",
    auditedAt: now(),
  };
  const validation = validateNarrativeBookSpec(spec);
  if (!validation.valid) {
    const error = new Error("The approved narrative contract is invalid");
    error.code = "narrative_book_spec_invalid";
    error.issues = validation.issues;
    throw error;
  }
  return spec;
}

export function narrativeBookSpecForPreview(project = {}, approvedScenario = null) {
  if (projectUsesNarrativeV3(project)) {
    const spec = project?.continuitySnapshot?.narrativeBookSpecV3 || null;
    const approval = project?.continuitySnapshot?.narrativeV3Approval || null;
    if (!spec || !approvedScenario || Number(project?.continuitySnapshot?.narrativeV3PipelineVersion || 0) !== 3) {
      const error = new Error("The approved Narrative V3 contract is missing");
      error.code = "narrative_v3_spec_missing";
      throw error;
    }
    const loaded = loadNarrativeBookSpecV3(spec);
    if (approval?.artifactDigest !== loaded.validation.artifactDigest
      || approval?.scenarioAuditDigest !== String(approvedScenario?.auditEvidence?.digest || "")) {
      const error = new Error("The approved Narrative V3 contract no longer matches this scenario");
      error.code = "narrative_v3_spec_stale";
      throw error;
    }
    return loaded;
  }
  const version = Number(project?.continuitySnapshot?.narrativeV2PipelineVersion || 0);
  const spec = project?.continuitySnapshot?.narrativeBookSpec || null;
  if (version < NARRATIVE_V2_PIPELINE_VERSION) return null;
  if (!spec || !approvedScenario) {
    const error = new Error("The approved narrative contract is missing");
    error.code = "narrative_book_spec_missing";
    throw error;
  }
  const validation = validateNarrativeBookSpec(spec);
  const expectedScenarioDigest = String(approvedScenario?.auditEvidence?.digest || "");
  if (
    !validation.valid
    || spec?.validation?.semanticAudit?.status !== "approved"
    || !expectedScenarioDigest
    || spec?.sourceScenario?.digest !== expectedScenarioDigest
  ) {
    const error = new Error("The approved narrative contract no longer matches this scenario");
    error.code = "narrative_book_spec_stale";
    error.issues = validation.issues;
    throw error;
  }
  return spec;
}

function selectRegistryEntries(entries = [], ids = new Set()) {
  return entries.filter((entry) => ids.has(entry.id));
}

export function manuscriptContractContext(spec = null) {
  if (!spec) return null;
  return {
    contract_id: spec.contractId,
    schema_version: spec.schemaVersion,
    artifact_digest: spec.validation.artifactDigest,
    book: spec.book,
    safety: spec.safety || null,
    characters: spec.registries.characters.map((character) => ({
      id: character.id,
      canonical_name: character.canonicalName || character.displayName,
      family_address: character.familyAddress || "",
      relationship: character.relationship || "",
      story_role: character.storyRole || character.role,
    })),
    locations: spec.registries.locations,
    objects: spec.registries.objects,
    passages: spec.registries.passages,
  };
}

export function manuscriptSceneContract(spec = null, sceneNumber = 0) {
  if (!spec) return null;
  const scene = spec.scenes.find((entry) => entry.sceneNumber === Number(sceneNumber));
  if (!scene) return null;
  const characterIds = new Set([
    ...scene.presences.map((presence) => presence.characterId),
    ...(scene.transition?.travelerCharacterIds || []),
    ...scene.movements.flatMap((movement) => movement.travelerCharacterIds || []),
  ]);
  const locationIds = new Set([
    scene.timeline.locationBeforeId,
    scene.timeline.locationAfterId,
    ...scene.movements.flatMap((movement) => [movement.fromLocationId, movement.toLocationId]),
  ]);
  const objectIds = new Set(scene.objectStates.map((state) => state.objectId));
  const passageIds = new Set([
    scene.transition?.passageId,
    ...scene.movements.map((movement) => movement.passageId),
  ].filter(Boolean));
  return {
    artifact_digest: spec.validation.artifactDigest,
    scene,
    registry: {
      characters: selectRegistryEntries(spec.registries.characters, characterIds),
      locations: selectRegistryEntries(spec.registries.locations, locationIds),
      objects: selectRegistryEntries(spec.registries.objects, objectIds),
      passages: selectRegistryEntries(spec.registries.passages, passageIds),
      causal_events: (spec.registries.causalEvents || []).filter((event) => event.sceneId === scene.id),
    },
  };
}
