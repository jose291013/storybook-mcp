import { UNIVERSE_OPTIONS } from "../config/bookOptions.js";
import { worldLawProfileForUniverse } from "../config/worldLawProfiles.js";
import { loadCreationIntent } from "./creationIntent.js";
import { canonicalDigest } from "./narrativeV3Canonical.js";
import { assertNarrativeV3Schema, NarrativeV3ContractError } from "./narrativeV3SchemaRegistry.js";

export const WORLD_LAW_CONTRACT_VERSION = 1;
export const WORLD_LAW_CONTRACT_ID = "calitiki.world-law-contract.v1";
export const WORLD_LAW_CONTRACT_BUILDER_VERSION = 1;

function fail(code, path, message) {
  throw new NarrativeV3ContractError({ code, artifactType: "world_law_contract", issues: [{ path, message }] });
}

function projection(value) {
  const copy = structuredClone(value);
  delete copy.validation.artifactDigest;
  return copy;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

export function worldLawContractDigest(value) {
  return canonicalDigest(projection(value));
}

export function buildWorldLawContractV1(rawIntent) {
  const intent = loadCreationIntent(rawIntent);
  const universe = UNIVERSE_OPTIONS.find((entry) => entry.id === intent.book.universeId);
  const topology = universe?.storyContract?.physicalTopology;
  const profile = worldLawProfileForUniverse(intent.book.universeId);
  if (!universe || !topology || !profile) fail("world_law_universe_unsupported", "/universeId", "The selected universe has no complete structured world-law profile.");
  const survivalMechanisms = profile.survival.map((entry) => ({
    mechanismId: entry.id, scope: entry.scope, activeStateId: entry.activeStateId,
    inactiveStateId: entry.inactiveStateId, requiredMediumIds: [...entry.requiredMediumIds],
  }));
  const requiredFor = (mediumId) => survivalMechanisms.filter((entry) => entry.requiredMediumIds.includes(mediumId)).map((entry) => entry.mechanismId);
  const zones = [
    ["zone_origin", "origin", topology.originZone, profile.media[0]],
    ["zone_adventure", "adventure", topology.adventureZone, profile.media[1]],
    ["zone_boundary", "boundary", topology.transitionZone, profile.media[2]],
  ].map(([zoneId, kind, name, mediumId]) => ({
    zoneId, kind, name, mediumId, gravityModelId: profile.gravity,
    locomotionIds: [...profile.locomotion], allowedPostureIds: [...profile.postures],
    requiredSurvivalMechanismIds: requiredFor(mediumId),
  }));
  const value = {
    schemaVersion: WORLD_LAW_CONTRACT_VERSION,
    contractId: WORLD_LAW_CONTRACT_ID,
    sourceCreationIntent: { artifactDigest: intent.validation.artifactDigest },
    universeId: intent.book.universeId,
    zones,
    passages: [{ passageId: "passage_primary", originZoneId: "zone_origin", adventureZoneId: "zone_adventure", boundaryZoneId: "zone_boundary", direction: "bidirectional", capacity: "declared_travelers", geometryId: topology.entryBoundary, cameraSideRule: "single_ambient_medium_per_scene", revealsOppositeMediumWithoutExposure: true }],
    survivalMechanisms,
    time: { flow: "linear", lightingContinuity: "scene_monotonic" },
    scaleRules: profile.scales.map(([entityClassId, minimumMeters, maximumMeters]) => ({ entityClassId, minimumMeters, maximumMeters })),
    nativeElementIds: [...profile.native], forbiddenElementIds: [...profile.forbidden],
    capabilities: profile.capabilities.map(([capabilityId, kind, limitationId]) => ({ capabilityId, kind, limitationId })),
    landmarks: [],
    validation: { builderVersion: WORLD_LAW_CONTRACT_BUILDER_VERSION, artifactDigest: "" },
  };
  value.validation.artifactDigest = worldLawContractDigest(value);
  assertNarrativeV3Schema("world_law_contract", value);
  return freeze(structuredClone(value));
}

export function loadWorldLawContractV1(value) {
  assertNarrativeV3Schema("world_law_contract", value);
  if (value.validation.artifactDigest !== worldLawContractDigest(value)) fail("world_law_digest_mismatch", "/validation/artifactDigest", "World-law digest mismatch.");
  return freeze(structuredClone(value));
}
