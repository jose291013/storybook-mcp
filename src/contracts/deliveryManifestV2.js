import { canonicalDigest } from "./narrativeV3Canonical.js";
import { loadNarrativeBookSpecV3 } from "./narrativeBookSpecV3.js";
import { loadManuscript } from "./manuscriptV1.js";
import { loadManuscriptFactEvidence } from "./manuscriptFactEvidenceV1.js";
import { loadVisualStoryboard } from "./visualStoryboardV1.js";
import { loadIllustrationDecisionSetV2, STRICT_ILLUSTRATION_DOMAINS } from "./illustrationEvidenceV2.js";
import { assertNarrativeV3Schema, NarrativeV3ContractError } from "./narrativeV3SchemaRegistry.js";

export const DELIVERY_MANIFEST_V2_VERSION = 2;
export const DELIVERY_MANIFEST_V2_ID = "calitiki.delivery-manifest.v2";
export const DELIVERY_MANIFEST_V2_COMPILER_VERSION = 2;

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

function fail(code, path, message) {
  throw new NarrativeV3ContractError({ code, artifactType: "delivery_manifest_v2", issues: [{ path, message }] });
}

function source(value) {
  return { contractId: value.contractId, schemaVersion: value.schemaVersion, artifactDigest: value.validation.artifactDigest };
}

export function deliveryManifestV2Digest(value) {
  const copy = structuredClone(value);
  delete copy.validation.artifactDigest;
  return canonicalDigest(copy);
}

export function deliveryPageV2Digest(value) {
  const copy = structuredClone(value);
  delete copy.pageDigest;
  return canonicalDigest(copy);
}

function assertSources(spec, manuscript, facts, storyboard, decisions) {
  const specDigest = spec.validation.artifactDigest;
  const manuscriptDigest = manuscript.validation.artifactDigest;
  const factDigest = facts.validation.artifactDigest;
  const storyboardDigest = storyboard.validation.artifactDigest;
  if (
    manuscript.sourceSpec.artifactDigest !== specDigest
    || facts.sources.narrativeBookSpec.artifactDigest !== specDigest
    || facts.sources.manuscript.artifactDigest !== manuscriptDigest
    || storyboard.sources.narrativeBookSpec.artifactDigest !== specDigest
    || storyboard.sources.manuscript.artifactDigest !== manuscriptDigest
    || storyboard.sources.manuscriptFactEvidence?.artifactDigest !== factDigest
    || decisions.sources.visualStoryboard.artifactDigest !== storyboardDigest
  ) {
    fail("strict_delivery_source_mismatch", "/sources", "Every delivery source must descend from the same exact released V3 lineage.");
  }
}

function assertStrictDecisions(storyboard, decisions) {
  if (
    decisions.validation.rejectedCount !== 0
    || decisions.validation.quarantinedCount !== 0
    || decisions.validation.acceptedCount !== storyboard.beats.length
  ) {
    fail("strict_delivery_illustrations_incomplete", "/sources/illustrationDecisions", "Delivery requires one fully verified strict decision for every storyboard beat.");
  }
  decisions.decisions.forEach((decision, index) => {
    const allVerified = STRICT_ILLUSTRATION_DOMAINS.every(([, canonicalKey]) => (
      decision.domains[canonicalKey]?.status === "pass" && decision.domains[canonicalKey]?.evidenceCode === "verified"
    ));
    if (decision.outcome !== "accepted" || !decision.acceptedAsset || !allVerified) {
      fail("strict_delivery_evidence_incomplete", `/sources/illustrationDecisions/decisions/${index}`, "Every objective domain must contain explicit passing evidence before delivery.");
    }
  });
}

function assertInvariants(value) {
  if (value.pages.length !== value.book.pageCount) fail("strict_delivery_page_count_mismatch", "/pages", "The manifest must cover every physical page exactly once.");
  value.pages.forEach((page, index) => {
    if (page.pageNumber !== index + 1) fail("strict_delivery_page_order_invalid", `/pages/${index}`, "Delivery pages must be unique and physically ordered.");
    const image = page.kind === "scene_image";
    if (image !== Boolean(page.privateAsset) || image !== Boolean(page.strictDecisionDigest)) {
      fail("strict_delivery_page_asset_invalid", `/pages/${index}`, "Only a strictly accepted image page may expose an asset and decision digest.");
    }
    if (page.pageDigest !== deliveryPageV2Digest(page)) fail("strict_delivery_page_digest_mismatch", `/pages/${index}/pageDigest`, "The delivery page digest is stale.");
  });
}

export function compileDeliveryManifestV2({ spec: rawSpec, manuscript: rawManuscript, factEvidence: rawFacts, storyboard: rawStoryboard, decisions: rawDecisions, revision = 1 } = {}) {
  const spec = loadNarrativeBookSpecV3(rawSpec);
  const manuscript = loadManuscript(rawManuscript);
  const facts = loadManuscriptFactEvidence(rawFacts);
  const storyboard = loadVisualStoryboard(rawStoryboard);
  const decisions = loadIllustrationDecisionSetV2(rawDecisions);
  assertSources(spec, manuscript, facts, storyboard, decisions);
  assertStrictDecisions(storyboard, decisions);
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1) fail("strict_delivery_revision_invalid", "/revision", "A positive delivery revision is required.");
  const manuscriptByPage = new Map(manuscript.pages.map((page) => [page.pageNumber, page]));
  const factsByPage = new Map(facts.pages.map((page) => [page.pageNumber, page]));
  const factsByScene = new Map(facts.pages.filter((page) => page.sceneNumber).map((page) => [page.sceneNumber, page]));
  const decisionsByScene = new Map(decisions.decisions.map((entry) => [entry.sceneNumber, entry]));
  const pages = spec.pages.map((page, index) => {
    const image = page.kind === "scene_image";
    const fact = image ? factsByScene.get(page.sceneNumber) : factsByPage.get(page.pageNumber);
    if (!fact || fact.sceneNumber !== (page.sceneNumber || null)) {
      fail("strict_delivery_fact_binding_mismatch", `/pages/${index}`, "The physical page is not backed by its exact manuscript fact evidence.");
    }
    let sourceItemDigest;
    let strictDecisionDigest = null;
    let privateAsset = null;
    if (image) {
      const beat = storyboard.beats[page.sceneNumber - 1];
      const decision = decisionsByScene.get(page.sceneNumber);
      if (!beat || !decision || beat.imagePageNumber !== page.pageNumber || decision.beatDigest !== beat.beatDigest || decision.outcome !== "accepted") {
        fail("strict_delivery_image_binding_mismatch", `/pages/${index}`, "The image is not backed by the strict decision for its exact storyboard beat.");
      }
      sourceItemDigest = decision.decisionDigest;
      strictDecisionDigest = decision.decisionDigest;
      privateAsset = structuredClone(decision.acceptedAsset);
    } else {
      const manuscriptPage = manuscriptByPage.get(page.pageNumber);
      if (!manuscriptPage || manuscriptPage.kind !== page.kind || manuscriptPage.sceneNumber !== (page.sceneNumber || null) || fact.textDigest !== canonicalDigest(manuscriptPage.text)) {
        fail("strict_delivery_text_binding_mismatch", `/pages/${index}`, "The text page is not backed by its exact manuscript page and fact digest.");
      }
      sourceItemDigest = canonicalDigest(manuscriptPage);
    }
    const entry = {
      pageNumber: page.pageNumber,
      kind: page.kind,
      sceneNumber: page.sceneNumber || null,
      sourceItemDigest,
      factEvidenceDigest: fact.evidenceDigest,
      strictDecisionDigest,
      privateAsset,
      pageDigest: "",
    };
    entry.pageDigest = deliveryPageV2Digest(entry);
    return entry;
  });
  const value = {
    schemaVersion: DELIVERY_MANIFEST_V2_VERSION,
    contractId: DELIVERY_MANIFEST_V2_ID,
    revision: Number(revision),
    sources: {
      narrativeBookSpec: source(spec),
      manuscript: source(manuscript),
      manuscriptFactEvidence: source(facts),
      visualStoryboard: source(storyboard),
      illustrationDecisions: source(decisions),
    },
    book: { language: spec.book.language, pageCount: spec.book.pageCount, ready: true },
    pages,
    validation: { compilerVersion: DELIVERY_MANIFEST_V2_COMPILER_VERSION, strictEvidenceVersion: 2, artifactDigest: "" },
  };
  value.validation.artifactDigest = deliveryManifestV2Digest(value);
  assertNarrativeV3Schema("delivery_manifest_v2", value);
  assertInvariants(value);
  return freeze(structuredClone(value));
}

export function loadDeliveryManifestV2(value) {
  assertNarrativeV3Schema("delivery_manifest_v2", value);
  assertInvariants(value);
  if (value.validation.artifactDigest !== deliveryManifestV2Digest(value)) fail("strict_delivery_manifest_digest_mismatch", "/validation/artifactDigest", "The digest does not belong to this exact delivery manifest.");
  return freeze(structuredClone(value));
}
