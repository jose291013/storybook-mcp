import { canonicalDigest } from "./narrativeV3Canonical.js";
import { loadNarrativeBookSpecV3 } from "./narrativeBookSpecV3.js";
import { loadManuscript } from "./manuscriptV1.js";
import { loadVisualStoryboard } from "./visualStoryboardV1.js";
import { loadIllustrationDecisionSet } from "./illustrationEvidenceV1.js";
import { assertNarrativeV3Schema, NarrativeV3ContractError } from "./narrativeV3SchemaRegistry.js";

export const DELIVERY_MANIFEST_VERSION = 1;
export const DELIVERY_MANIFEST_ID = "calitiki.delivery-manifest.v1";
export const DELIVERY_MANIFEST_COMPILER_VERSION = 1;

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

function fail(code, path, message) {
  throw new NarrativeV3ContractError({ code, artifactType: "delivery_manifest_v1", issues: [{ path, message }] });
}

function itemDigest(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  return canonicalDigest(copy);
}

export function deliveryManifestDigest(value) {
  const copy = structuredClone(value);
  delete copy.validation.artifactDigest;
  return canonicalDigest(copy);
}

export function deliveryPageDigest(value) {
  return itemDigest(value, "pageDigest");
}

function assertInvariants(value) {
  if (value.pages.length !== value.book.pageCount) fail("delivery_page_count_mismatch", "/pages", "The manifest must cover every physical page exactly once.");
  value.pages.forEach((page, index) => {
    if (page.pageNumber !== index + 1) fail("delivery_page_order_invalid", `/pages/${index}`, "Delivery pages must be unique and physically ordered.");
    if ((page.kind === "scene_image") !== Boolean(page.privateAsset)) fail("delivery_page_asset_invalid", `/pages/${index}/privateAsset`, "Only image pages may expose one exact private asset.");
    if (page.pageDigest !== deliveryPageDigest(page)) fail("delivery_page_digest_mismatch", `/pages/${index}/pageDigest`, "The delivery page digest is stale.");
  });
}

function assertSources(spec, manuscript, storyboard, decisions) {
  if (manuscript.sourceSpec.artifactDigest !== spec.validation.artifactDigest
    || storyboard.sources.narrativeBookSpec.artifactDigest !== spec.validation.artifactDigest
    || storyboard.sources.manuscript.artifactDigest !== manuscript.validation.artifactDigest
    || decisions.sources.visualStoryboard.artifactDigest !== storyboard.validation.artifactDigest) {
    fail("delivery_source_mismatch", "/sources", "Every delivery source must descend from the same exact V3 book lineage.");
  }
  if (decisions.validation.rejectedCount !== 0 || decisions.validation.acceptedCount !== storyboard.beats.length) {
    fail("delivery_illustrations_incomplete", "/sources/illustrationDecisions", "Delivery requires one accepted illustration for every storyboard beat.");
  }
}

export function compileDeliveryManifest({ spec: rawSpec, manuscript: rawManuscript, storyboard: rawStoryboard, decisions: rawDecisions, revision = 1 } = {}) {
  const spec = loadNarrativeBookSpecV3(rawSpec);
  const manuscript = loadManuscript(rawManuscript);
  const storyboard = loadVisualStoryboard(rawStoryboard);
  const decisions = loadIllustrationDecisionSet(rawDecisions);
  assertSources(spec, manuscript, storyboard, decisions);
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1) fail("delivery_revision_invalid", "/revision", "A positive delivery revision is required.");
  const manuscriptPages = new Map(manuscript.pages.map((page) => [page.pageNumber, page]));
  const decisionByScene = new Map(decisions.decisions.map((decision) => [decision.sceneNumber, decision]));
  const pages = spec.pages.map((page, index) => {
    let sourceItemDigest;
    let privateAsset = null;
    if (page.kind === "scene_image") {
      const beat = storyboard.beats[page.sceneNumber - 1];
      const decision = decisionByScene.get(page.sceneNumber);
      if (!beat || !decision || beat.imagePageNumber !== page.pageNumber || decision.beatDigest !== beat.beatDigest || decision.outcome !== "accepted") {
        fail("delivery_image_binding_mismatch", `/pages/${index}`, "The image page is not backed by the accepted decision for its exact storyboard beat.");
      }
      sourceItemDigest = decision.decisionDigest;
      privateAsset = structuredClone(decision.acceptedAsset);
    } else {
      const manuscriptPage = manuscriptPages.get(page.pageNumber);
      if (!manuscriptPage || manuscriptPage.kind !== page.kind || manuscriptPage.sceneNumber !== (page.sceneNumber || null)) {
        fail("delivery_text_binding_mismatch", `/pages/${index}`, "The text page is not backed by its exact canonical manuscript page.");
      }
      sourceItemDigest = canonicalDigest(manuscriptPage);
    }
    const entry = {
      pageNumber: page.pageNumber,
      kind: page.kind,
      sceneNumber: page.sceneNumber || null,
      sourceItemDigest,
      privateAsset,
      pageDigest: "",
    };
    entry.pageDigest = deliveryPageDigest(entry);
    return entry;
  });
  const value = {
    schemaVersion: DELIVERY_MANIFEST_VERSION,
    contractId: DELIVERY_MANIFEST_ID,
    revision: Number(revision),
    sources: {
      narrativeBookSpec: { contractId: spec.contractId, schemaVersion: spec.schemaVersion, artifactDigest: spec.validation.artifactDigest },
      manuscript: { contractId: manuscript.contractId, schemaVersion: manuscript.schemaVersion, artifactDigest: manuscript.validation.artifactDigest },
      visualStoryboard: { contractId: storyboard.contractId, schemaVersion: storyboard.schemaVersion, artifactDigest: storyboard.validation.artifactDigest },
      illustrationDecisions: { contractId: decisions.contractId, schemaVersion: decisions.schemaVersion, artifactDigest: decisions.validation.artifactDigest },
    },
    book: { language: spec.book.language, pageCount: spec.book.pageCount, ready: true },
    pages,
    validation: { compilerVersion: DELIVERY_MANIFEST_COMPILER_VERSION, artifactDigest: "" },
  };
  value.validation.artifactDigest = deliveryManifestDigest(value);
  assertNarrativeV3Schema("delivery_manifest_v1", value);
  assertInvariants(value);
  return freeze(structuredClone(value));
}

export function loadDeliveryManifest(value) {
  assertNarrativeV3Schema("delivery_manifest_v1", value);
  assertInvariants(value);
  if (value.validation.artifactDigest !== deliveryManifestDigest(value)) fail("delivery_manifest_digest_mismatch", "/validation/artifactDigest", "The digest does not belong to this exact delivery manifest.");
  return freeze(structuredClone(value));
}
