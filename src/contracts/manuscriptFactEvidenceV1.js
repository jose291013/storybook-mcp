import { canonicalDigest } from "./narrativeV3Canonical.js";
import { loadNarrativeBookSpecV3 } from "./narrativeBookSpecV3.js";
import { loadManuscript, manuscriptDigest } from "./manuscriptV1.js";
import { assertNarrativeV3Schema, NarrativeV3ContractError } from "./narrativeV3SchemaRegistry.js";

export const MANUSCRIPT_FACT_EVIDENCE_VERSION = 1;
export const MANUSCRIPT_FACT_EVIDENCE_ID = "calitiki.manuscript-fact-evidence.v1";
export const MANUSCRIPT_FACT_EVIDENCE_COMPILER_VERSION = 1;

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

function fail(code, path, message) {
  throw new NarrativeV3ContractError({ code, artifactType: "manuscript_fact_evidence_v1", issues: [{ path, message }] });
}

function withoutDigest(value) {
  const copy = structuredClone(value);
  if (copy.validation) delete copy.validation.artifactDigest;
  return copy;
}

function pageProjection(value) {
  const copy = structuredClone(value);
  delete copy.evidenceDigest;
  return copy;
}

export function manuscriptFactEvidenceDigest(value) {
  return canonicalDigest(withoutDigest(value));
}

export function manuscriptPageEvidenceDigest(value) {
  return canonicalDigest(pageProjection(value));
}

function normalized(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

function exactNamedMention(text, name) {
  const candidate = normalized(name);
  if (!candidate) return false;
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(normalized(text));
}

function mentionedIds(text, registry) {
  return registry.filter((entry) => exactNamedMention(text, entry.displayName || entry.name)).map((entry) => entry.id).sort();
}

function unique(values) {
  return [...new Set(values)].sort();
}

function assertSubset(observed, allowed, code, path, label) {
  const unexpected = observed.filter((id) => !allowed.includes(id));
  if (unexpected.length) fail(code, path, `${label} are not registered for this exact scene: ${unexpected.join(", ")}.`);
}

function sceneEvidence(spec, manuscriptPage, scene, index) {
  const physicalIds = unique(scene.presences.filter((entry) => entry.mode === "physical").map((entry) => entry.characterId));
  const evokedIds = unique(scene.presences.filter((entry) => entry.mode === "evoked").map((entry) => entry.characterId));
  const allowedLocationIds = unique([
    scene.timeline.locationBeforeId,
    scene.illustrationInstant.locationId,
    scene.timeline.locationAfterId,
    ...scene.movements.flatMap((movement) => [movement.fromLocationId, movement.toLocationId]),
  ]);
  const eventObjectIds = scene.objectEvents.map((entry) => entry.objectId);
  const availableObjectIds = unique([
    ...scene.objectStates.filter((entry) => entry.quantity === 1).map((entry) => entry.objectId),
    ...eventObjectIds,
  ]);
  const characterMentions = mentionedIds(manuscriptPage.text, spec.registries.characters);
  const locationMentions = mentionedIds(manuscriptPage.text, spec.registries.locations);
  const objectMentions = mentionedIds(manuscriptPage.text, spec.registries.objects);
  assertSubset(characterMentions, unique([...physicalIds, ...evokedIds]), "manuscript_character_fact_unregistered", `/pages/${index}/observedCharacterMentionIds`, "Named character mentions");
  assertSubset(locationMentions, allowedLocationIds, "manuscript_location_fact_unregistered", `/pages/${index}/observedLocationMentionIds`, "Named location mentions");
  assertSubset(objectMentions, availableObjectIds, "manuscript_object_fact_unregistered", `/pages/${index}/observedObjectMentionIds`, "Named object mentions");
  const evidence = {
    pageNumber: manuscriptPage.pageNumber,
    kind: manuscriptPage.kind,
    sceneNumber: scene.sceneNumber,
    textDigest: canonicalDigest(manuscriptPage.text),
    sourceSceneDigest: scene.sourceSceneDigest,
    allowedPhysicalCharacterIds: physicalIds,
    allowedEvokedCharacterIds: evokedIds,
    allowedLocationIds,
    availableObjectIds,
    observedCharacterMentionIds: characterMentions,
    observedLocationMentionIds: locationMentions,
    observedObjectMentionIds: objectMentions,
    visualRequirements: {
      locationId: scene.illustrationInstant.locationId,
      physicalMediumId: scene.illustrationInstant.physicalMediumId,
      requiredCharacterIds: structuredClone(scene.illustrationInstant.visibleCharacterIds).sort(),
      forbiddenCharacterIds: structuredClone(scene.illustrationInstant.forbiddenCharacterIds).sort(),
      wardrobeStates: structuredClone(scene.illustrationInstant.wardrobeStates).sort((a, b) => a.characterId.localeCompare(b.characterId)),
      requiredObjectIds: scene.objectStates.filter((entry) => entry.quantity === 1 && entry.visibility === "required").map((entry) => entry.objectId).sort(),
      forbiddenObjectIds: scene.objectStates.filter((entry) => entry.quantity === 0 || entry.visibility === "forbidden").map((entry) => entry.objectId).sort(),
      mainAction: structuredClone(scene.illustrationInstant.mainAction),
    },
    checks: { ancestry: "pass", characterMentions: "pass", locationMentions: "pass", objectMentions: "pass", visualProjection: "pass" },
    evidenceDigest: "",
  };
  evidence.evidenceDigest = manuscriptPageEvidenceDigest(evidence);
  return evidence;
}

function nonSceneEvidence(page) {
  const evidence = {
    pageNumber: page.pageNumber,
    kind: page.kind,
    sceneNumber: null,
    textDigest: canonicalDigest(page.text),
    sourceSceneDigest: null,
    allowedPhysicalCharacterIds: [],
    allowedEvokedCharacterIds: [],
    allowedLocationIds: [],
    availableObjectIds: [],
    observedCharacterMentionIds: [],
    observedLocationMentionIds: [],
    observedObjectMentionIds: [],
    visualRequirements: null,
    checks: { ancestry: "pass", characterMentions: "pass", locationMentions: "pass", objectMentions: "pass", visualProjection: "pass" },
    evidenceDigest: "",
  };
  evidence.evidenceDigest = manuscriptPageEvidenceDigest(evidence);
  return evidence;
}

function assertInvariants(evidence) {
  if (evidence.pages.length !== evidence.book.sceneCount + 2) fail("manuscript_fact_page_count_mismatch", "/pages", "Every manuscript page needs exactly one fact-evidence record.");
  evidence.pages.forEach((page, index) => {
    if (page.evidenceDigest !== manuscriptPageEvidenceDigest(page)) fail("manuscript_fact_page_digest_mismatch", `/pages/${index}/evidenceDigest`, "The page evidence digest is stale.");
    if (page.kind === "scene_text" && (!page.sceneNumber || !page.sourceSceneDigest || !page.visualRequirements)) {
      fail("manuscript_fact_scene_binding_missing", `/pages/${index}`, "Scene prose requires canonical scene and visual evidence.");
    }
    if (page.kind !== "scene_text" && (page.sceneNumber !== null || page.sourceSceneDigest !== null || page.visualRequirements !== null)) {
      fail("manuscript_fact_non_scene_binding_invalid", `/pages/${index}`, "Opening and closing prose cannot claim physical scene evidence.");
    }
  });
}

export function compileManuscriptFactEvidence({ spec: rawSpec, manuscript: rawManuscript, revision = 1 } = {}) {
  const spec = loadNarrativeBookSpecV3(rawSpec);
  const manuscript = loadManuscript(rawManuscript);
  if (manuscript.sourceSpec.artifactDigest !== spec.validation.artifactDigest) fail("manuscript_fact_source_mismatch", "/sources", "The evidence sources do not share one released specification.");
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1) fail("manuscript_fact_revision_invalid", "/revision", "A positive evidence revision is required.");
  const pages = manuscript.pages.map((page, index) => {
    if (page.kind !== "scene_text") return nonSceneEvidence(page);
    const scene = spec.scenes[page.sceneNumber - 1];
    if (!scene || page.sourceSceneDigest !== scene.sourceSceneDigest || page.objectStateDigest !== scene.objectStateDigest) {
      fail("manuscript_fact_scene_ancestry_invalid", `/pages/${index}`, "The manuscript page is not bound to the exact released scene and object state.");
    }
    return sceneEvidence(spec, page, scene, index);
  });
  const evidence = {
    schemaVersion: MANUSCRIPT_FACT_EVIDENCE_VERSION,
    contractId: MANUSCRIPT_FACT_EVIDENCE_ID,
    revision: Number(revision),
    sources: {
      narrativeBookSpec: { contractId: spec.contractId, schemaVersion: spec.schemaVersion, artifactDigest: spec.validation.artifactDigest },
      manuscript: { contractId: manuscript.contractId, schemaVersion: manuscript.schemaVersion, artifactDigest: manuscriptDigest(manuscript) },
    },
    book: { language: spec.book.language, pageCount: spec.book.pageCount, sceneCount: spec.scenes.length },
    pages,
    validation: { compilerVersion: MANUSCRIPT_FACT_EVIDENCE_COMPILER_VERSION, artifactDigest: "" },
  };
  evidence.validation.artifactDigest = manuscriptFactEvidenceDigest(evidence);
  assertNarrativeV3Schema("manuscript_fact_evidence_v1", evidence);
  assertInvariants(evidence);
  return freeze(structuredClone(evidence));
}

export function loadManuscriptFactEvidence(value) {
  assertNarrativeV3Schema("manuscript_fact_evidence_v1", value);
  assertInvariants(value);
  if (value.validation.artifactDigest !== manuscriptFactEvidenceDigest(value)) fail("manuscript_fact_digest_mismatch", "/validation/artifactDigest", "The digest does not belong to this exact fact evidence.");
  return freeze(structuredClone(value));
}
