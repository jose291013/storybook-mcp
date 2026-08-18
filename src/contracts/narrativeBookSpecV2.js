import { UNIVERSE_OPTIONS } from "../config/bookOptions.js";
import { loadCreationIntent } from "./creationIntent.js";
import {
  canonicalDigest,
  loadCanonicalStoryGraph,
} from "./narrativeV3Canonical.js";
import {
  assertNarrativeV3Schema,
  NarrativeV3ContractError,
} from "./narrativeV3SchemaRegistry.js";

export const NARRATIVE_BOOK_SPEC_V2_VERSION = 2;
export const NARRATIVE_BOOK_SPEC_V2_ID = "calitiki.narrative-book-spec.v2";
export const NARRATIVE_BOOK_SPEC_V2_COMPILER_VERSION = 1;

const DIGEST_RE = /^[a-f0-9]{64}$/;
const REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function releaseError(code, path, message) {
  throw new NarrativeV3ContractError({
    code,
    artifactType: "narrative_book_spec_v2",
    issues: [{ path, message }],
  });
}

function digestProjection(value) {
  const projection = structuredClone(value);
  if (projection.validation) delete projection.validation.artifactDigest;
  return projection;
}

export function narrativeBookSpecV2Digest(spec) {
  return canonicalDigest(digestProjection(spec));
}

function exactKeys(value, allowed, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    releaseError("release_profile_binding_invalid", path, "A strict immutable profile binding is required.");
  }
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) releaseError("release_profile_binding_unknown_field", path, `Unsupported field ${unexpected[0]}.`);
}

function normalizeProfileBinding(value, index) {
  const path = `/profileBindings/${index}`;
  exactKeys(value, [
    "characterKey",
    "profileRef",
    "profileRevision",
    "profileDigest",
    "displayName",
    "visualIdentityRef",
    "visualIdentityDigest",
  ], path);
  const binding = {
    characterKey: String(value.characterKey || "").trim(),
    profileRef: String(value.profileRef || "").trim(),
    profileRevision: Number(value.profileRevision),
    profileDigest: String(value.profileDigest || "").trim(),
    displayName: String(value.displayName || "").trim(),
    visualIdentityRef: String(value.visualIdentityRef || "").trim(),
    visualIdentityDigest: String(value.visualIdentityDigest || "").trim(),
  };
  if (!/^[a-z0-9][a-z0-9_-]{0,119}$/.test(binding.characterKey)) releaseError("release_character_key_invalid", `${path}/characterKey`, "A canonical character key is required.");
  if (!REFERENCE_RE.test(binding.profileRef) || !REFERENCE_RE.test(binding.visualIdentityRef)) releaseError("release_profile_reference_invalid", path, "Private profile and visual identity references must be bounded.");
  if (!Number.isSafeInteger(binding.profileRevision) || binding.profileRevision < 1) releaseError("release_profile_revision_invalid", `${path}/profileRevision`, "A positive immutable profile revision is required.");
  if (!DIGEST_RE.test(binding.profileDigest) || !DIGEST_RE.test(binding.visualIdentityDigest)) releaseError("release_profile_digest_invalid", path, "Profile and visual identity digests must be canonical SHA-256 values.");
  if (!binding.displayName || binding.displayName.length > 120) releaseError("release_display_name_invalid", `${path}/displayName`, "A bounded display name is required.");
  return binding;
}

function universeTopology(universeId) {
  const universe = UNIVERSE_OPTIONS.find((entry) => entry.id === universeId);
  if (!universe?.storyContract?.physicalTopology) releaseError("release_universe_topology_missing", "/book/universeId", "The released universe needs one deterministic physical topology.");
  return universe.storyContract.physicalTopology;
}

function sideForPage(pageNumber) {
  return pageNumber % 2 === 0 ? "left" : "right";
}

function bindingForScene(sceneNumber) {
  const leftPage = 2 + (sceneNumber - 1) * 2;
  const textOnLeft = (sceneNumber - 1) % 2 === 0;
  return {
    spreadNumber: sceneNumber,
    textPageNumber: textOnLeft ? leftPage : leftPage + 1,
    imagePageNumber: textOnLeft ? leftPage + 1 : leftPage,
    textSide: textOnLeft ? "left" : "right",
    imageSide: textOnLeft ? "right" : "left",
  };
}

function locationMedium(location, topology) {
  if (location.kind === "origin") return topology.originMedium;
  if (location.kind === "adventure") return topology.adventureMedium;
  return topology.transitionMedium;
}

function visibleSnapshot(scene, releasedLocations, releasedPassages, topology) {
  const visiblePhase = scene.timeline.visiblePhase;
  const hasTravel = scene.timeline.locationBeforeId !== scene.timeline.locationAfterId;
  const locationId = visiblePhase === "start"
    ? scene.timeline.locationBeforeId
    : scene.timeline.locationAfterId;
  const location = releasedLocations.find((entry) => entry.id === locationId);
  if (!location) releaseError("release_visible_location_missing", `/scenes/${scene.sceneNumber - 1}`, "The illustration instant must resolve to one released location.");
  let physicalMediumId = location.physicalMediumId;
  if (visiblePhase === "during" && hasTravel) {
    const passageId = scene.movements.find((movement) => movement.passageId)?.passageId;
    const passage = releasedPassages.find((entry) => entry.id === passageId);
    physicalMediumId = passage?.transitionMediumId || topology.transitionMedium;
  }
  return {
    visiblePhase,
    locationId,
    physicalMediumId,
    visibleCharacterIds: [...scene.illustration.visibleCharacterIds],
    forbiddenCharacterIds: [...scene.illustration.forbiddenCharacterIds],
    wardrobeStates: structuredClone(scene.wardrobeStates),
    objectEvents: structuredClone(scene.objectEvents),
    mainAction: structuredClone(scene.illustration.mainAction),
  };
}

function assertReleaseInvariants(spec) {
  const characterIds = spec.registries.characters.map((entry) => entry.id);
  const locationIds = new Set(spec.registries.locations.map((entry) => entry.id));
  if (new Set(characterIds).size !== characterIds.length) releaseError("release_character_duplicate", "/registries/characters", "Released character ids must be unique.");
  if (new Set(spec.registries.characters.map((entry) => entry.characterKey)).size !== characterIds.length) releaseError("release_character_key_duplicate", "/registries/characters", "Released character keys must be unique.");
  if (new Set(spec.registries.characters.map((entry) => entry.displayName.toLocaleLowerCase("und"))).size !== characterIds.length) releaseError("release_display_name_ambiguous", "/registries/characters", "Released display names must identify distinct characters.");
  if (spec.pages.length !== spec.book.pageCount || spec.book.closingPageNumber !== spec.book.pageCount) releaseError("release_page_count_mismatch", "/pages", "The released page plan must cover the selected format exactly.");
  spec.pages.forEach((page, index) => {
    if (page.pageNumber !== index + 1) releaseError("release_page_number_non_contiguous", `/pages/${index}/pageNumber`, "Released page numbers must be contiguous.");
    if (page.side !== sideForPage(page.pageNumber)) releaseError("release_page_side_invalid", `/pages/${index}/side`, "Page side must follow physical page parity.");
  });
  const expectedSceneCount = (spec.book.pageCount - 2) / 2;
  if (spec.scenes.length !== expectedSceneCount) releaseError("release_scene_count_mismatch", "/scenes", "Every released spread must bind exactly one canonical scene.");
  spec.scenes.forEach((scene, index) => {
    if (scene.sceneNumber !== index + 1) releaseError("release_scene_number_non_contiguous", `/scenes/${index}/sceneNumber`, "Released scenes must be contiguous.");
    const expectedBinding = bindingForScene(scene.sceneNumber);
    if (canonicalDigest(scene.pageBinding) !== canonicalDigest(expectedBinding)) releaseError("release_page_binding_invalid", `/scenes/${index}/pageBinding`, "Scene page binding is not the server-owned layout binding.");
    if (!locationIds.has(scene.illustrationInstant.locationId)) releaseError("release_illustration_location_unknown", `/scenes/${index}/illustrationInstant/locationId`, "The illustration instant uses an unknown location.");
    const visible = new Set(scene.illustrationInstant.visibleCharacterIds);
    const forbidden = new Set(scene.illustrationInstant.forbiddenCharacterIds);
    if (visible.size + forbidden.size !== characterIds.length || characterIds.some((id) => visible.has(id) === forbidden.has(id))) releaseError("release_cast_partition_invalid", `/scenes/${index}/illustrationInstant`, "Visible and forbidden cast must partition the complete released cast.");
    if (scene.illustrationInstant.wardrobeStates.length !== visible.size || scene.illustrationInstant.wardrobeStates.some((entry) => !visible.has(entry.characterId))) releaseError("release_wardrobe_cardinality_invalid", `/scenes/${index}/illustrationInstant/wardrobeStates`, "Every visible character needs exactly one released wardrobe state.");
  });
}

export function compileNarrativeBookSpecV2({ intent: rawIntent, graph: rawGraph, profileBindings: rawBindings, revision = 1 } = {}) {
  const intent = loadCreationIntent(rawIntent);
  const graph = loadCanonicalStoryGraph(rawGraph);
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1) releaseError("release_revision_invalid", "/revision", "A positive release revision is required.");
  if (!Array.isArray(rawBindings)) releaseError("release_profile_bindings_required", "/profileBindings", "Immutable profile bindings are required.");
  const bindings = rawBindings.map(normalizeProfileBinding);
  if (graph.book.language !== intent.language || graph.book.audienceAge !== intent.audience.age || graph.book.pageCount !== intent.book.pageCount || graph.book.universeId !== intent.book.universeId) {
    releaseError("release_book_contract_mismatch", "/book", "CreationIntent and CanonicalStoryGraph must describe the same book.");
  }
  if (graph.registries.objects.length || graph.scenes.some((scene) => scene.objectEvents.length)) {
    releaseError(
      "release_object_projection_unavailable",
      "/registries/objects",
      "A graph with objects cannot be released until its versioned quantity, ownership and visible-state projection is complete.",
    );
  }
  const intentByKey = new Map(intent.cast.map((entry) => [entry.characterKey, entry]));
  const graphByKey = new Map(graph.registries.characters.map((entry) => [entry.semanticKey, entry]));
  const bindingByKey = new Map(bindings.map((entry) => [entry.characterKey, entry]));
  if (bindingByKey.size !== bindings.length || bindings.length !== intent.cast.length || graphByKey.size !== intent.cast.length) releaseError("release_cast_cardinality_mismatch", "/profileBindings", "Intent, graph and release bindings must contain the same cast exactly once.");
  for (const intentEntry of intent.cast) {
    const graphEntry = graphByKey.get(intentEntry.characterKey);
    const binding = bindingByKey.get(intentEntry.characterKey);
    if (!graphEntry || !binding || graphEntry.role !== intentEntry.role || binding.profileRef !== intentEntry.profileRef) releaseError("release_cast_binding_mismatch", `/profileBindings/${intentEntry.characterKey}`, "Every released identity must match its intent profile and graph character.");
  }
  const topology = universeTopology(intent.book.universeId);
  const releasedLocations = graph.registries.locations.map((location) => ({
    ...structuredClone(location),
    physicalMediumId: locationMedium(location, topology),
  }));
  const releasedPassages = graph.registries.passages.map((passage) => ({
    ...structuredClone(passage),
    transitionMediumId: topology.transitionMedium,
  }));
  const characters = graph.registries.characters.map((character) => {
    const intentEntry = intentByKey.get(character.semanticKey);
    const binding = bindingByKey.get(character.semanticKey);
    return {
      id: character.id,
      characterKey: character.semanticKey,
      displayName: binding.displayName,
      role: intentEntry.role,
      kind: intentEntry.kind,
      initialLocationId: character.initialLocationId,
      profileRef: binding.profileRef,
      profileRevision: binding.profileRevision,
      profileDigest: binding.profileDigest,
      visualIdentityRef: binding.visualIdentityRef,
      visualIdentityDigest: binding.visualIdentityDigest,
    };
  });
  const scenes = graph.scenes.map((scene) => ({
    id: scene.id,
    sceneNumber: scene.sceneNumber,
    act: scene.act,
    sourceSceneDigest: canonicalDigest(scene),
    pageBinding: bindingForScene(scene.sceneNumber),
    semantic: structuredClone(scene.semantic),
    timeline: structuredClone(scene.timeline),
    presences: structuredClone(scene.presences),
    movements: structuredClone(scene.movements),
    objectEvents: structuredClone(scene.objectEvents),
    illustrationInstant: visibleSnapshot(scene, releasedLocations, releasedPassages, topology),
  }));
  const pages = [{ pageNumber: 1, spreadNumber: 0, side: "right", kind: "opening_text" }];
  for (const scene of scenes) {
    const binding = scene.pageBinding;
    pages.push({ pageNumber: binding.textPageNumber, spreadNumber: binding.spreadNumber, side: binding.textSide, kind: "scene_text", sceneId: scene.id, sceneNumber: scene.sceneNumber, sourceSceneDigest: scene.sourceSceneDigest });
    pages.push({ pageNumber: binding.imagePageNumber, spreadNumber: binding.spreadNumber, side: binding.imageSide, kind: "scene_image", sceneId: scene.id, sceneNumber: scene.sceneNumber, sourceSceneDigest: scene.sourceSceneDigest });
  }
  pages.push({ pageNumber: intent.book.pageCount, spreadNumber: scenes.length + 1, side: "left", kind: "closing_text" });
  pages.sort((left, right) => left.pageNumber - right.pageNumber);
  const spec = {
    schemaVersion: NARRATIVE_BOOK_SPEC_V2_VERSION,
    contractId: NARRATIVE_BOOK_SPEC_V2_ID,
    revision: Number(revision),
    sources: {
      creationIntent: { contractId: intent.contractId, schemaVersion: intent.schemaVersion, artifactDigest: intent.validation.artifactDigest },
      canonicalStoryGraph: { contractId: graph.contractId, schemaVersion: graph.schemaVersion, artifactDigest: graph.validation.artifactDigest },
    },
    book: {
      language: graph.book.language,
      audienceAge: graph.book.audienceAge,
      readingBand: intent.audience.readingBand,
      pageCount: graph.book.pageCount,
      universeId: graph.book.universeId,
      openingPageNumber: 1,
      closingPageNumber: graph.book.pageCount,
    },
    title: graph.title,
    premise: graph.premise,
    registries: {
      characters,
      locations: releasedLocations,
      objects: structuredClone(graph.registries.objects),
      passages: releasedPassages,
    },
    scenes,
    pages,
    validation: { compilerVersion: NARRATIVE_BOOK_SPEC_V2_COMPILER_VERSION, artifactDigest: "" },
  };
  spec.validation.artifactDigest = narrativeBookSpecV2Digest(spec);
  assertNarrativeV3Schema("narrative_book_spec_v2", spec);
  assertReleaseInvariants(spec);
  return deepFreeze(structuredClone(spec));
}

export function loadNarrativeBookSpecV2(value) {
  assertNarrativeV3Schema("narrative_book_spec_v2", value);
  assertReleaseInvariants(value);
  const expected = narrativeBookSpecV2Digest(value);
  if (value.validation.artifactDigest !== expected) releaseError("release_spec_digest_mismatch", "/validation/artifactDigest", "The digest does not belong to this exact released spec.");
  return deepFreeze(structuredClone(value));
}
